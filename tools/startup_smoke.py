from __future__ import annotations

import argparse
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen(1)
        return int(sock.getsockname()[1])


def wait_url(url: str, timeout_seconds: float) -> None:
    deadline = time.time() + timeout_seconds
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            with urlopen(url, timeout=5) as response:
                status = int(getattr(response, "status", 200))
                if status < 500:
                    return
        except URLError as error:
            last_error = error
        except Exception as error:  # pragma: no cover - defensive branch
            last_error = error
        time.sleep(1.5)
    raise RuntimeError(f"Timeout in attesa di {url}. Ultimo errore: {last_error}")


def run_ps(script: Path, args: list[str], timeout_seconds: int) -> None:
    command = [
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(script),
        *args,
    ]
    completed = subprocess.run(
        command,
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore",
        timeout=timeout_seconds,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            "Comando fallito.\n"
            f"CMD: {' '.join(command)}\n"
            f"STDOUT:\n{completed.stdout}\n"
            f"STDERR:\n{completed.stderr}"
        )


def stop_from_pid_file(pid_file: Path) -> None:
    if not pid_file.exists():
        return

    pid_text = pid_file.read_text(encoding="utf-8", errors="ignore").strip()
    if not pid_text.isdigit():
        pid_file.unlink(missing_ok=True)
        return

    subprocess.run(
        ["taskkill", "/PID", pid_text, "/T", "/F"],
        check=False,
        capture_output=True,
        text=True,
    )
    pid_file.unlink(missing_ok=True)


def tail(path: Path, lines: int = 80) -> str:
    if not path.exists():
        return ""
    content = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    return "\n".join(content[-lines:])


def run_browser_smoke(frontend_url: str, timeout_seconds: float) -> None:
    try:
        from playwright.sync_api import sync_playwright
    except Exception as error:  # pragma: no cover - import guard
        raise RuntimeError(f"Playwright non disponibile: {error}") from error

    page_errors: list[str] = []
    timeout_ms = int(timeout_seconds * 1000)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 390, "height": 844})
        page = context.new_page()
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.goto(frontend_url, wait_until="domcontentloaded", timeout=timeout_ms)
        page.get_by_test_id("dashboard-screen").wait_for(timeout=timeout_ms)
        page.get_by_test_id("dashboard-clock-in-button").wait_for(timeout=timeout_ms)
        page.wait_for_timeout(400)
        context.close()
        browser.close()

    if page_errors:
        raise RuntimeError(f"Errori runtime browser: {page_errors}")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Smoke rapido di avvio stack locale.")
    parser.add_argument("--backend-port", type=int, default=0, help="Porta backend; 0 = auto.")
    parser.add_argument("--frontend-port", type=int, default=0, help="Porta frontend; 0 = auto.")
    parser.add_argument("--backend-timeout", type=float, default=90.0, help="Timeout health backend.")
    parser.add_argument("--frontend-timeout", type=float, default=210.0, help="Timeout readiness frontend.")
    parser.add_argument("--browser-timeout", type=float, default=90.0, help="Timeout smoke browser.")
    parser.add_argument("--script-timeout", type=int, default=300, help="Timeout singolo script PowerShell.")
    parser.add_argument("--keep-runtime", action="store_true", help="Non eliminare la cartella runtime temporanea.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    if os.name != "nt":
        print("startup_smoke: skip su piattaforma non Windows.")
        return 0

    args = parse_args(argv)
    backend_port = args.backend_port or free_port()
    frontend_port = args.frontend_port or free_port()
    runtime_dir = Path(tempfile.mkdtemp(prefix="timbrature-startup-smoke-"))
    backend_pid = runtime_dir / "backend.pid"
    frontend_pid = runtime_dir / "frontend.pid"
    backend_log = runtime_dir / "backend.log"
    backend_err = runtime_dir / "backend.err.log"
    frontend_log = runtime_dir / "frontend.log"
    frontend_err = runtime_dir / "frontend.err.log"

    backend_url = f"http://127.0.0.1:{backend_port}/api/health"
    frontend_url = f"http://127.0.0.1:{frontend_port}"

    backend_script = ROOT / "start-backend.ps1"
    frontend_script = ROOT / "start-frontend.ps1"

    try:
        run_ps(
            backend_script,
            [
                "-Port",
                str(backend_port),
                "-WaitForReady",
                "-ForceRestart",
                "-RuntimeDir",
                str(runtime_dir),
            ],
            timeout_seconds=args.script_timeout,
        )
        wait_url(backend_url, timeout_seconds=args.backend_timeout)

        run_ps(
            frontend_script,
            [
                "-Port",
                str(frontend_port),
                "-BackendPort",
                str(backend_port),
                "-WaitForReady",
                "-ForceRestart",
                "-NoResponsively",
                "-NoClearCache",
                "-RuntimeDir",
                str(runtime_dir),
            ],
            timeout_seconds=args.script_timeout,
        )
        wait_url(frontend_url, timeout_seconds=args.frontend_timeout)
        run_browser_smoke(frontend_url, timeout_seconds=args.browser_timeout)

        print(
            "startup_smoke: ok | "
            f"backend={backend_url} frontend={frontend_url} runtime={runtime_dir}"
        )
        return 0
    except Exception as error:
        print(f"startup_smoke: fail | {error}", file=sys.stderr)
        if backend_log.exists():
            print("\n--- backend.log (tail) ---", file=sys.stderr)
            print(tail(backend_log), file=sys.stderr)
        if backend_err.exists():
            print("\n--- backend.err.log (tail) ---", file=sys.stderr)
            print(tail(backend_err), file=sys.stderr)
        if frontend_log.exists():
            print("\n--- frontend.log (tail) ---", file=sys.stderr)
            print(tail(frontend_log), file=sys.stderr)
        if frontend_err.exists():
            print("\n--- frontend.err.log (tail) ---", file=sys.stderr)
            print(tail(frontend_err), file=sys.stderr)
        print(f"\nRuntime dir: {runtime_dir}", file=sys.stderr)
        return 1
    finally:
        stop_from_pid_file(frontend_pid)
        stop_from_pid_file(backend_pid)
        if not args.keep_runtime:
            shutil.rmtree(runtime_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
