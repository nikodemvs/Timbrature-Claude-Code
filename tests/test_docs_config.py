from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]

pytestmark = pytest.mark.unit


def read_text(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def test_preview_config_is_aligned():
    launch = json.loads(read_text(".claude/launch.json"))
    backend = next(item for item in launch["configurations"] if item["name"] == "backend")
    frontend = next(item for item in launch["configurations"] if item["name"] == "frontend")

    # Check strutturali: i campi esistono e sono del tipo corretto
    assert isinstance(backend["port"], int), "backend port deve essere un intero"
    assert isinstance(frontend["port"], int), "frontend port deve essere un intero"
    assert isinstance(backend.get("runtimeExecutable"), str), "runtimeExecutable deve essere presente"
    assert isinstance(frontend.get("runtimeExecutable"), str), "runtimeExecutable deve essere presente"

    # Check di coerenza: la porta backend deve comparire in EXPO_PUBLIC_BACKEND_URL
    backend_port = backend["port"]
    expo_url = frontend.get("env", {}).get("EXPO_PUBLIC_BACKEND_URL", "")
    assert str(backend_port) in expo_url, (
        f"EXPO_PUBLIC_BACKEND_URL ({expo_url}) deve contenere la porta backend ({backend_port})"
    )

    # Check strutturali sugli script di avvio (se presenti)
    if (ROOT / "start-backend.ps1").exists():
        assert "node_modules/expo/bin/cli" in read_text("start-frontend.ps1")
    assert "start-backend.ps1" in read_text("tests/conftest.py")
    assert "start-frontend.ps1" in read_text("tests/conftest.py")
    assert "uvicorn" not in read_text("tests/conftest.py")
    assert "node_modules/expo/bin/cli" not in read_text("tests/conftest.py")
    checks_text = read_text("tools/checks.py")
    assert '"pre-push": frozenset({"backend_unit_api"})' in checks_text
    assert "e2e_smoke" in checks_text
    assert "e2e and not e2e_smoke" in checks_text


def test_docs_cover_gemini_memory_and_offline_first():
    agents = read_text("AGENTS.md")
    backend_agents = read_text("backend/AGENTS.md")
    frontend_agents = read_text("frontend/AGENTS.md")
    claude = read_text("CLAUDE.md")
    backend_claude = read_text("backend/CLAUDE.md")
    frontend_claude = read_text("frontend/CLAUDE.md")
    protected_zones = read_text("PROTECTED_ZONES.md")

    assert "Gemini può leggere i dati e i file utente necessari a rispondere" in agents
    assert "Mai loggare dati personali o contesto superfluo" in agents
    assert "### Flusso automatico dei test" in agents
    assert "pre-commit" in agents
    assert "pre-push" in agents
    assert "CI" in agents
    assert '`pre-push` esegue solo `pytest -m "unit or api"`.' in agents
    assert "`pytest -m e2e_smoke` solo in `CI`" in agents
    assert "anti-duplicazione" in agents
    assert "### Skill raccomandate (non vincolanti)" in agents
    assert "non definisce gate" in agents
    assert "/api/settings/verify-pin" in backend_agents
    assert "/api/timbrature/{data}" in backend_agents
    assert "SQLite e file storage" in frontend_agents
    assert "IndexedDB" not in frontend_agents
    assert "localStorage" not in frontend_agents
    assert "memory/MEMORY.md" in claude
    assert (ROOT / "memory" / "MEMORY.md").exists()
    assert "PROTECTED_ZONES.md" in agents
    assert "PROTECTED_ZONES.md" in claude
    assert "backend/server.py" in protected_zones
    assert "frontend/src/algorithms/calcoli.ts" in protected_zones
    assert "## Flusso Automatico Dei Test" in claude
    assert "pre-commit" in claude
    assert "pre-push" in claude
    assert "CI" in claude
    assert '`pre-push` esegue solo `pytest -m "unit or api"`.' in claude
    assert "`pytest -m e2e_smoke` solo in `CI`" in claude
    assert "anti-duplicazione" in claude
    assert 'pytest -m "unit or api"' in claude
    assert "pytest -m e2e_smoke" in claude
    assert 'pytest -m "e2e and not e2e_smoke"' in claude
    assert "pytest -m visual" in claude
    assert "tsc --noEmit" in claude
    assert "Claude Preview MCP" in claude
    assert "Chrome MCP" in claude
    assert "sorgente unica del metodo di avvio locale" in claude
    assert "## Skill Utili (non vincolanti)" in claude
    assert "non vincolanti" in claude
    assert "`playwright`" in claude
    assert "`playwright-interactive`" in claude
    assert "`screenshot`" in claude
    assert "`pdf`" in claude
    assert "`frontend-skill`" in claude
    assert "`figma`" in claude
    assert "`figma-implement-design`" in claude
    assert "`render-deploy`" in claude
    assert "`sentry`" in claude
    assert "`spreadsheet`" in claude
    assert "`security-best-practices`" in claude
    assert "`security-threat-model`" in claude
    assert "`openai-docs`" in claude
    assert "`skill-installer`" in claude
    assert "`skill-creator`" in claude
    assert "Flusso automatico dei test" in frontend_claude
    assert "pre-commit" in frontend_claude
    assert "pre-push" in frontend_claude
    assert "CI" in frontend_claude
    assert "anti-duplicazione" in frontend_claude
    assert "pytest -m e2e" in frontend_claude
    assert "pytest -m visual" in frontend_claude
    assert "tsc --noEmit" in frontend_claude
    assert "playwright-interactive" in frontend_claude
    assert "pdf" in frontend_claude
    assert "frontend-skill" in frontend_claude
    assert "Flusso automatico dei test" in backend_claude
    assert "pre-commit" in backend_claude
    assert "pre-push" in backend_claude
    assert "CI" in backend_claude
    assert "anti-duplicazione" in backend_claude
    assert "pytest -m unit" in backend_claude
    assert "pytest -m api" in backend_claude
    assert "pdf" in backend_claude
    assert "sentry" in backend_claude
    assert "security-threat-model" in backend_claude
    assert "render-deploy" in backend_claude
    assert "non vincolanti" in read_text("AGENTS.md")
    assert "## Controlli" in read_text("memory/MEMORY.md")
    assert "## Skill Utili (non vincolanti)" in read_text("memory/MEMORY.md")
