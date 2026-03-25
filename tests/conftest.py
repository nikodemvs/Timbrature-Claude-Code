from __future__ import annotations

import os
import shutil
import socket
import subprocess
import sys
import time
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

import aiosqlite
import httpx
import pytest
import pytest_asyncio

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"
OUTPUT_DIR = ROOT_DIR / "output" / "playwright" / "pytest"

def applica_filtri_warning() -> None:
    warnings.filterwarnings(
        "ignore",
        message=r"Please use `import python_multipart` instead\.",
        category=PendingDeprecationWarning,
        module=r"starlette\.formparsers",
    )
    warnings.filterwarnings(
        "ignore",
        message=r"'_UnionGenericAlias' is deprecated and slated for removal in Python 3\.17",
        category=DeprecationWarning,
        module=r"google\.genai\.types",
    )


applica_filtri_warning()

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import server as server_module


def pytest_configure(config: pytest.Config) -> None:
    applica_filtri_warning()
    if not config.option.markexpr:
        config.option.markexpr = "unit or api"


@dataclass
class StackApplicazione:
    backend_url: str
    frontend_url: str
    output_dir: Path
    backend_log: Path
    frontend_log: Path


@dataclass
class StackFrontend:
    frontend_url: str
    output_dir: Path
    frontend_log: Path


def trova_porta_libera() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen(1)
        return int(sock.getsockname()[1])


def attendi_url(url: str, timeout: float = 180.0) -> None:
    deadline = time.time() + timeout
    ultimo_errore: Exception | None = None
    while time.time() < deadline:
        try:
            response = httpx.get(url, timeout=5.0)
            if response.status_code < 500:
                return
        except Exception as error:  # pragma: no cover - solo polling
            ultimo_errore = error
        time.sleep(2)
    raise RuntimeError(f"Timeout in attesa di {url}: {ultimo_errore}")


def termina_processo_da_pid_file(pid_file: Path) -> None:
    if not pid_file.exists():
        return
    try:
        pid_text = pid_file.read_text(encoding="utf-8").strip()
        if not pid_text:
            return
        pid = int(pid_text)
    except (ValueError, OSError):
        pid_file.unlink(missing_ok=True)
        return

    subprocess.run(
        ["taskkill", "/PID", str(pid), "/T", "/F"],
        check=False,
        capture_output=True,
        text=True,
    )
    pid_file.unlink(missing_ok=True)


@pytest.fixture(scope="session")
def repo_root() -> Path:
    return ROOT_DIR


@pytest.fixture(scope="session")
def modulo_backend():
    return server_module


@pytest_asyncio.fixture
async def db_temporaneo(modulo_backend):
    conn = await aiosqlite.connect(":memory:")
    conn.row_factory = aiosqlite.Row
    modulo_backend._db = conn
    modulo_backend._gemini_client = None
    await modulo_backend.init_db()
    try:
        yield conn
    finally:
        await conn.close()
        modulo_backend._db = None
        modulo_backend._gemini_client = None


@pytest_asyncio.fixture
async def client_api(db_temporaneo):
    transport = httpx.ASGITransport(app=server_module.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


@pytest.fixture(scope="session")
def stack_frontend_mock(tmp_path_factory: pytest.TempPathFactory) -> Iterator[StackFrontend]:
    """Avvia solo il frontend (nessun backend). Usata per test e2e-smoke."""
    base_dir = tmp_path_factory.mktemp("stack-smoke")
    runtime_dir = base_dir / "runtime"
    runtime_dir.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    frontend_port = trova_porta_libera()
    fake_backend_port = trova_porta_libera()
    frontend_log = runtime_dir / "frontend.log"
    frontend_pid = runtime_dir / "frontend.pid"
    frontend_script = ROOT_DIR / "start-frontend.ps1"

    try:
        subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(frontend_script),
                "-Port",
                str(frontend_port),
                "-BackendPort",
                str(fake_backend_port),
                "-WaitForReady",
                "-ForceRestart",
                "-NoClearCache",
                "-NoResponsively",
                "-RuntimeDir",
                str(runtime_dir),
                "-FrontendDir",
                str(FRONTEND_DIR),
            ],
            cwd=ROOT_DIR,
            env=os.environ.copy(),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="ignore",
            check=True,
        )
        attendi_url(f"http://127.0.0.1:{frontend_port}", timeout=120.0)
        yield StackFrontend(
            frontend_url=f"http://127.0.0.1:{frontend_port}",
            output_dir=OUTPUT_DIR,
            frontend_log=frontend_log,
        )
    finally:
        termina_processo_da_pid_file(frontend_pid)


@pytest.fixture(scope="session")
def stack_applicazione(tmp_path_factory: pytest.TempPathFactory) -> Iterator[StackApplicazione]:
    base_dir = tmp_path_factory.mktemp("stack-e2e")
    backend_copy = base_dir / "backend"
    runtime_dir = base_dir / "runtime"
    runtime_dir.mkdir(parents=True, exist_ok=True)

    shutil.copytree(
        BACKEND_DIR,
        backend_copy,
        dirs_exist_ok=True,
        ignore=shutil.ignore_patterns("__pycache__", "*.db", "*.db-shm", "*.db-wal"),
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    backend_port = trova_porta_libera()
    frontend_port = trova_porta_libera()

    backend_log = runtime_dir / "backend.log"
    frontend_log = runtime_dir / "frontend.log"
    backend_pid = runtime_dir / "backend.pid"
    frontend_pid = runtime_dir / "frontend.pid"
    backend_script = ROOT_DIR / "start-backend.ps1"
    frontend_script = ROOT_DIR / "start-frontend.ps1"

    env_backend = os.environ.copy()
    env_backend.setdefault("PYTHONUTF8", "1")

    try:
        subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(backend_script),
                "-Port",
                str(backend_port),
                "-WaitForReady",
                "-ForceRestart",
                "-BackendDir",
                str(backend_copy),
                "-RuntimeDir",
                str(runtime_dir),
            ],
            cwd=ROOT_DIR,
            env=env_backend,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="ignore",
            check=True,
        )
        attendi_url(f"http://127.0.0.1:{backend_port}/api/health", timeout=90.0)

        subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(frontend_script),
                "-Port",
                str(frontend_port),
                "-BackendPort",
                str(backend_port),
                "-WaitForReady",
                "-ForceRestart",
                "-NoResponsively",
                "-RuntimeDir",
                str(runtime_dir),
                "-FrontendDir",
                str(FRONTEND_DIR),
            ],
            cwd=ROOT_DIR,
            env=os.environ.copy(),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="ignore",
            check=True,
        )

        attendi_url(f"http://127.0.0.1:{frontend_port}", timeout=240.0)

        yield StackApplicazione(
            backend_url=f"http://127.0.0.1:{backend_port}",
            frontend_url=f"http://127.0.0.1:{frontend_port}",
            output_dir=OUTPUT_DIR,
            backend_log=backend_log,
            frontend_log=frontend_log,
        )
    finally:
        termina_processo_da_pid_file(frontend_pid)
        termina_processo_da_pid_file(backend_pid)


@pytest.fixture(scope="session")
def stack_full_integration(stack_applicazione: StackApplicazione) -> StackApplicazione:
    """Alias semantico di stack_applicazione — usa questo nei test che richiedono backend reale."""
    return stack_applicazione
