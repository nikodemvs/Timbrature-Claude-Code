from __future__ import annotations

import json

import pytest

from tools import checks

pytestmark = pytest.mark.unit


def test_git_discovery_uses_cached_diff_for_pre_commit(monkeypatch):
    calls: list[list[str]] = []

    def fake_run(args, cwd, check, capture_output, text):
        calls.append(list(args))

        class Result:
            stdout = "backend/server.py\nfrontend/src/db/localDb.ts\n"

        return Result()

    monkeypatch.setattr(checks.subprocess, "run", fake_run)

    files = checks.discover_changed_files("pre-commit")

    assert files == ["backend/server.py", "frontend/src/db/localDb.ts"]
    assert calls == [["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR"]]


def test_git_discovery_uses_base_sha_for_ci(monkeypatch):
    calls: list[list[str]] = []

    def fake_run(args, cwd, check, capture_output, text):
        calls.append(list(args))

        class Result:
            stdout = "frontend/app/(tabs)/index.tsx\n"

        return Result()

    monkeypatch.setattr(checks.subprocess, "run", fake_run)

    files = checks.discover_changed_files("ci", base_sha="abc123")

    assert files == ["frontend/app/(tabs)/index.tsx"]
    assert calls == [["git", "diff", "--name-only", "--diff-filter=ACMR", "abc123..HEAD"]]


def test_pre_commit_plan_is_minimal_and_ordered():
    plan = checks.build_plan(
        "pre-commit",
        [
            "backend/server.py",
            "frontend/src/db/localDb.ts",
            "frontend/src/components/Button.tsx",
            "AGENTS.md",
        ],
        base_sha=None,
    )

    assert plan.mode == "pre-commit"
    assert plan.requires_playwright is False
    assert [check.name for check in plan.checks] == [
        "backend_unit_api",
    ]


def test_pre_commit_always_runs_backend_gate_even_if_only_frontend_files_changed():
    plan = checks.build_plan(
        "pre-commit",
        [
            "frontend/src/services/api.ts",
        ],
        base_sha=None,
    )

    assert [check.name for check in plan.checks] == [
        "backend_unit_api",
    ]
    assert plan.requires_playwright is False


def test_pre_push_plan_keeps_only_backend_gate_even_on_ui_paths():
    plan = checks.build_plan(
        "pre-push",
        [
            "frontend/app/(tabs)/index.tsx",
            "frontend/src/utils/colors.ts",
            "frontend/src/services/offlineApi.ts",
        ],
        base_sha="deadbeef",
    )

    assert [check.name for check in plan.checks] == [
        "backend_unit_api",
    ]
    assert plan.requires_playwright is False


def test_pre_push_startup_files_do_not_trigger_browser_gates():
    plan = checks.build_plan(
        "pre-push",
        [
            ".claude/launch.json",
            "start-frontend.ps1",
        ],
        base_sha="deadbeef",
    )

    assert [check.name for check in plan.checks] == [
        "backend_unit_api",
    ]


def test_docs_config_captures_automation_files():
    plan = checks.build_plan(
        "ci",
        [
            "tools/checks.py",
            ".githooks/pre-commit",
            ".github/workflows/automated-checks.yml",
        ],
        base_sha="abc123",
    )

    assert [check.name for check in plan.checks] == [
        "docs_config",
        "backend_unit_api",
        "e2e_smoke",
        "e2e",
        "visual",
    ]
    assert "tests/test_checks_runner.py" in plan.checks[0].command
    assert plan.checks[1].reason == "gate rapido CI sempre attivo"


def test_ci_always_runs_backend_gate_even_for_docs_only_changes():
    plan = checks.build_plan(
        "ci",
        [
            "CHANGELOG.md",
        ],
        base_sha="abc123",
    )

    assert [check.name for check in plan.checks] == [
        "docs_config",
        "backend_unit_api",
        "e2e_smoke",
        "e2e",
        "visual",
    ]
    assert plan.checks[1].reason == "gate rapido CI sempre attivo"


def test_json_plan_is_serializable():
    plan = checks.build_plan(
        "ci",
        [
            "frontend/src/components/Button.tsx",
            "frontend/src/db/localDb.ts",
        ],
        base_sha="abc123",
    )

    payload = plan.to_dict()
    encoded = json.dumps(payload, ensure_ascii=False)
    decoded = json.loads(encoded)

    assert decoded["mode"] == "ci"
    assert decoded["requires_playwright"] is True
    assert [item["name"] for item in decoded["checks"]] == [
        "backend_unit_api",
        "offline_runtime",
        "tsc",
        "e2e_smoke",
        "e2e",
        "visual",
    ]
