from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Sequence

ROOT = Path(__file__).resolve().parents[1]

ZERO_SHA = "0000000000000000000000000000000000000000"

ROOT_DOCS_AND_CONFIG = {
    "AGENTS.md",
    "CLAUDE.md",
    "PROTECTED_ZONES.md",
    "CHANGELOG.md",
    "CHANGES.md",
    "TEST_RUN.md",
    "algoritmi-verifica.md",
    "pyproject.toml",
    "requirements-test.txt",
    "render.yaml",
    "start-app.ps1",
    "start-backend.ps1",
    "start-frontend.ps1",
}

FRONTEND_CONFIG_FILES = {
    "frontend/app.json",
    "frontend/babel.config.js",
    "frontend/eslint.config.js",
    "frontend/metro.config.js",
    "frontend/package-lock.json",
    "frontend/package.json",
    "frontend/tsconfig.json",
}

BACKEND_CONFIG_FILES = {
    "backend/requirements.txt",
}

AUTOMATION_FILES = {
    "tools/checks.py",
    "tools/startup_smoke.py",
    "tests/test_checks_runner.py",
    ".githooks/_run-checks.sh",
    ".githooks/pre-commit",
    ".githooks/pre-push",
    ".github/workflows/automated-checks.yml",
}

E2E_SMOKE_FILES = {
    "start-app.ps1",
    "start-backend.ps1",
    "start-frontend.ps1",
    ".claude/launch.json",
    ".claude/preview-backend.ps1",
    ".claude/preview-frontend.ps1",
    "frontend/metro.config.js",
    "frontend/package.json",
    "frontend/package-lock.json",
    "frontend/app.json",
    "frontend/babel.config.js",
    "backend/server.py",
    "tests/conftest.py",
    "tests/test_e2e.py",
    "tools/startup_smoke.py",
}

ALWAYS_REQUIRED_RULES: dict[str, frozenset[str]] = {
    "pre-commit": frozenset({"backend_unit_api"}),
    "pre-push": frozenset({"backend_unit_api"}),
    "ci": frozenset({"backend_unit_api", "e2e_smoke", "e2e", "visual"}),
}


@dataclass(frozen=True)
class CheckRule:
    name: str
    description: str
    modes: frozenset[str]
    command: tuple[str, ...]
    cwd: str
    matcher: Callable[[str], bool]
    requires_playwright: bool = False


@dataclass(frozen=True)
class PlannedCheck:
    name: str
    description: str
    cwd: str
    command: list[str]
    reason: str
    requires_playwright: bool = False


@dataclass(frozen=True)
class CheckPlan:
    mode: str
    base_sha: str | None
    changed_files: list[str]
    checks: list[PlannedCheck]

    @property
    def requires_playwright(self) -> bool:
        return any(check.requires_playwright for check in self.checks)

    def to_dict(self) -> dict[str, object]:
        return {
            "mode": self.mode,
            "base_sha": self.base_sha,
            "changed_files": self.changed_files,
            "requires_playwright": self.requires_playwright,
            "checks": [
                {
                    "name": check.name,
                    "description": check.description,
                    "cwd": check.cwd,
                    "command": check.command,
                    "reason": check.reason,
                    "requires_playwright": check.requires_playwright,
                }
                for check in self.checks
            ],
        }


def normalize_path(raw_path: str) -> str:
    path = raw_path.strip().replace("\\", "/")
    if path.startswith("./"):
        path = path[2:]
    return path


def is_under(path: str, prefix: str) -> bool:
    prefix = prefix.rstrip("/") + "/"
    return path.startswith(prefix)


def any_match(path: str, prefixes: Iterable[str]) -> bool:
    for candidate in prefixes:
        if candidate.endswith("/"):
            if is_under(path, candidate):
                return True
        elif path == candidate:
            return True
    return False


def match_docs_config(path: str) -> bool:
    if path in ROOT_DOCS_AND_CONFIG or path in FRONTEND_CONFIG_FILES or path in BACKEND_CONFIG_FILES:
        return True
    if path in AUTOMATION_FILES:
        return True
    if path.endswith(".md"):
        return True
    if path.startswith(".claude/") or path.startswith(".githooks/") or path.startswith(".github/"):
        return True
    if path.startswith("memory/") or path.startswith("agents/"):
        return True
    if path == "tests/test_docs_config.py" or path == "tests/test_checks_runner.py":
        return True
    return False


def match_backend_unit_api(path: str) -> bool:
    if path == "tests/test_api.py" or path == "tests/conftest.py":
        return True
    return path.startswith("backend/") and path.endswith(".py")


def match_offline_runtime(path: str) -> bool:
    if path == "tests/test_offline_runtime.py":
        return True
    offline_prefixes = (
        "frontend/src/db/",
        "frontend/src/hooks/useNetworkStatus.ts",
        "frontend/src/services/api.ts",
        "frontend/src/services/offlineApi.ts",
        "frontend/src/storage/",
        "frontend/src/store/",
        "frontend/src/types/index.ts",
        "frontend/src/algorithms/",
    )
    return any_match(path, offline_prefixes)


def match_frontend_tsc(path: str) -> bool:
    if path.startswith("frontend/app/") or path.startswith("frontend/src/"):
        return path.endswith((".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".d.ts"))
    return False


def match_frontend_ui(path: str) -> bool:
    ui_prefixes = (
        "frontend/app/",
        "frontend/src/components/",
        "frontend/src/hooks/useAppTheme.ts",
        "frontend/src/utils/colors.ts",
        "frontend/src/utils/shadows.ts",
    )
    return any_match(path, ui_prefixes) or path == "tests/test_e2e.py"


def match_e2e_smoke(path: str) -> bool:
    if path in E2E_SMOKE_FILES:
        return True
    smoke_prefixes = (
        "frontend/app/",
        "frontend/src/components/",
        "frontend/src/db/",
        "frontend/src/services/",
        "frontend/src/storage/",
        "frontend/src/store/",
        ".claude/",
    )
    return any_match(path, smoke_prefixes)


RULES: tuple[CheckRule, ...] = (
    CheckRule(
        name="docs_config",
        description="Documentazione, configurazione e controllo runner",
        modes=frozenset({"ci"}),
        command=("python", "-m", "pytest", "-q", "tests/test_docs_config.py", "tests/test_checks_runner.py"),
        cwd=".",
        matcher=match_docs_config,
    ),
    CheckRule(
        name="backend_unit_api",
        description="Backend unit e API",
        modes=frozenset({"pre-commit", "pre-push", "ci"}),
        command=("python", "-m", "pytest", "-q", "-m", "unit or api"),
        cwd=".",
        matcher=match_backend_unit_api,
    ),
    CheckRule(
        name="offline_runtime",
        description="Layer offline locale e coda sync",
        modes=frozenset({"ci"}),
        command=("python", "-m", "pytest", "-q", "tests/test_offline_runtime.py"),
        cwd=".",
        matcher=match_offline_runtime,
    ),
    CheckRule(
        name="tsc",
        description="TypeScript frontend rilevante",
        modes=frozenset({"ci"}),
        command=("npm", "exec", "--", "tsc", "--noEmit"),
        cwd="frontend",
        matcher=match_frontend_tsc,
    ),
    CheckRule(
        name="e2e_smoke",
        description="Smoke browser rapido su avvio frontend",
        modes=frozenset({"ci"}),
        command=("python", "-m", "pytest", "-q", "-m", "e2e_smoke", "--maxfail=1"),
        cwd=".",
        matcher=match_e2e_smoke,
        requires_playwright=True,
    ),
    CheckRule(
        name="e2e",
        description="Flussi browser Playwright",
        modes=frozenset({"ci"}),
        command=("python", "-m", "pytest", "-q", "-m", "e2e and not e2e_smoke", "--maxfail=1"),
        cwd=".",
        matcher=match_frontend_ui,
        requires_playwright=True,
    ),
    CheckRule(
        name="visual",
        description="Verifiche visuali Playwright",
        modes=frozenset({"ci"}),
        command=("python", "-m", "pytest", "-q", "-m", "visual"),
        cwd=".",
        matcher=match_frontend_ui,
        requires_playwright=True,
    ),
)


def run_git(args: Sequence[str]) -> list[str]:
    completed = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return [normalize_path(line) for line in completed.stdout.splitlines() if line.strip()]


def resolve_base_sha(mode: str, explicit_base_sha: str | None = None) -> str | None:
    if mode == "pre-commit":
        return None

    if explicit_base_sha:
        return explicit_base_sha

    env_candidates = [
        os.getenv("CHECK_BASE_SHA"),
        os.getenv("GITHUB_BASE_SHA"),
        os.getenv("GITHUB_EVENT_BEFORE"),
    ]
    for candidate in env_candidates:
        if candidate and candidate != ZERO_SHA:
            return candidate

    if mode == "pre-push":
        try:
            return run_git(["merge-base", "HEAD", "@{u}"])[0]
        except Exception:
            pass

    default_branch = os.getenv("GITHUB_DEFAULT_BRANCH", "main")
    try:
        return run_git(["merge-base", "HEAD", f"origin/{default_branch}"])[0]
    except Exception:
        pass

    try:
        return run_git(["rev-list", "--max-parents=0", "HEAD"])[0]
    except Exception:
        return None


def discover_changed_files(mode: str, base_sha: str | None = None) -> list[str]:
    if mode == "pre-commit":
        return run_git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])

    effective_base_sha = resolve_base_sha(mode, base_sha)
    if not effective_base_sha:
        return []
    return run_git(["diff", "--name-only", "--diff-filter=ACMR", f"{effective_base_sha}..HEAD"])


def render_reason(files: Sequence[str]) -> str:
    if not files:
        return "nessun file rilevante"
    if len(files) <= 3:
        return ", ".join(files)
    return ", ".join(files[:3]) + ", ..."


def resolve_command(command: Sequence[str]) -> list[str]:
    resolved = list(command)
    if resolved and resolved[0] == "python":
        resolved[0] = sys.executable
    return resolved


def select_rules(mode: str, changed_files: Sequence[str]) -> list[PlannedCheck]:
    normalized = list(dict.fromkeys(normalize_path(path) for path in changed_files if path.strip()))
    planned: list[PlannedCheck] = []
    always_required = ALWAYS_REQUIRED_RULES.get(mode, frozenset())
    for rule in RULES:
        if mode not in rule.modes:
            continue
        matches = [path for path in normalized if rule.matcher(path)]
        if not matches and rule.name not in always_required:
            continue
        planned.append(
            PlannedCheck(
                name=rule.name,
                description=rule.description,
                cwd=rule.cwd,
                command=list(rule.command),
                reason=render_reason(matches) if matches else "gate rapido CI sempre attivo",
                requires_playwright=rule.requires_playwright,
            )
        )
    return planned


def build_plan(mode: str, changed_files: Sequence[str], base_sha: str | None = None) -> CheckPlan:
    normalized = list(dict.fromkeys(normalize_path(path) for path in changed_files if path.strip()))
    return CheckPlan(
        mode=mode,
        base_sha=base_sha,
        changed_files=normalized,
        checks=select_rules(mode, normalized),
    )


def print_human_plan(plan: CheckPlan) -> None:
    print(f"Modalita: {plan.mode}")
    if plan.base_sha:
        print(f"Base SHA: {plan.base_sha}")
    if not plan.changed_files:
        print("Nessun file cambiato rilevante.")
        return
    print("File rilevanti:")
    for path in plan.changed_files:
        print(f"  - {path}")
    if not plan.checks:
        print("Nessun check richiesto.")
        return
    print("Check pianificati:")
    for index, check in enumerate(plan.checks, start=1):
        command = " ".join(check.command)
        print(f"  {index}. {check.name} -> {command}")
        print(f"     motivo: {check.reason}")


def run_plan(plan: CheckPlan) -> int:
    if not plan.checks:
        return 0

    for check in plan.checks:
        cwd = ROOT if check.cwd == "." else ROOT / check.cwd
        command = resolve_command(check.command)
        print(f"\n==> {check.name}: {check.reason}")
        print(f"    cwd: {cwd}")
        print(f"    cmd: {' '.join(command)}")
        completed = subprocess.run(command, cwd=cwd)
        if completed.returncode != 0:
            return completed.returncode
    return 0


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Runner unico path-aware per i check automatici.")
    parser.add_argument("mode", choices=["pre-commit", "pre-push", "ci"], help="Modalita di esecuzione.")
    parser.add_argument("--base-sha", dest="base_sha", help="SHA base da usare per il diff.")
    parser.add_argument("--json", action="store_true", help="Stampa solo il piano in JSON.")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    changed_files = discover_changed_files(args.mode, args.base_sha)
    effective_base_sha = args.base_sha if args.mode == "pre-commit" else resolve_base_sha(args.mode, args.base_sha)
    plan = build_plan(args.mode, changed_files, effective_base_sha)

    if args.json:
        print(json.dumps(plan.to_dict(), indent=2, ensure_ascii=False))
        return 0

    print_human_plan(plan)
    if not plan.checks:
        return 0
    return run_plan(plan)


if __name__ == "__main__":
    raise SystemExit(main())
