from __future__ import annotations

import os
import shutil
import socket
import subprocess
import sys
import time
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

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import server as server_module


def pytest_configure(config: pytest.Config) -> None:
    if not config.option.markexpr:
        config.option.markexpr = "unit or api"


@dataclass
class StackApplicazione:
    backend_url: str
    frontend_url: str
    output_dir: Path
    backend_log: Path
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


def termina_albero_processo(processo: subprocess.Popen[str] | None) -> None:
    if not processo or processo.poll() is not None:
        return
    subprocess.run(
        ["taskkill", "/PID", str(processo.pid), "/T", "/F"],
        check=False,
        capture_output=True,
        text=True,
    )


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
def stack_applicazione(tmp_path_factory: pytest.TempPathFactory) -> Iterator[StackApplicazione]:
    base_dir = tmp_path_factory.mktemp("stack-e2e")
    backend_copy = base_dir / "backend"
    shutil.copytree(
        BACKEND_DIR,
        backend_copy,
        dirs_exist_ok=True,
        ignore=shutil.ignore_patterns("__pycache__", "*.db", "*.db-shm", "*.db-wal"),
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    backend_port = trova_porta_libera()
    frontend_port = trova_porta_libera()

    backend_log = base_dir / "backend.log"
    frontend_log = base_dir / "frontend.log"

    backend_handle = backend_log.open("w", encoding="utf-8", errors="ignore")
    frontend_handle = frontend_log.open("w", encoding="utf-8", errors="ignore")

    env_backend = os.environ.copy()
    env_backend.setdefault("PYTHONUTF8", "1")
    env_frontend = os.environ.copy()
    env_frontend["CI"] = "1"
    env_frontend["EXPO_PUBLIC_BACKEND_URL"] = f"http://127.0.0.1:{backend_port}"

    backend_proc = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "server:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(backend_port),
        ],
        cwd=backend_copy,
        env=env_backend,
        stdout=backend_handle,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="ignore",
    )

    frontend_proc = None

    try:
        attendi_url(f"http://127.0.0.1:{backend_port}/api/health", timeout=90.0)

        frontend_proc = subprocess.Popen(
            [
                "cmd.exe",
                "/c",
                f"npx expo start --web --port {frontend_port} --clear --non-interactive",
            ],
            cwd=FRONTEND_DIR,
            env=env_frontend,
            stdout=frontend_handle,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="ignore",
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
        termina_albero_processo(frontend_proc)
        termina_albero_processo(backend_proc)
        backend_handle.close()
        frontend_handle.close()
