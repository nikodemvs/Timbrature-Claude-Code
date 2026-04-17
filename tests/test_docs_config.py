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


def test_required_governance_files_exist():
    """I file di governance consolidati dopo F1.3 devono esistere."""
    required = [
        "README.md",
        "CONTRIBUTING.md",
        "PROTECTED_ZONES.md",
        "CHANGELOG.md",
        "AGENTS.md",
        "CLAUDE.md",
        "backend/AGENTS.md",
        "backend/CLAUDE.md",
        "frontend/AGENTS.md",
        "frontend/CLAUDE.md",
        "memory/MEMORY.md",
        "agents/README.md",
    ]
    for relative_path in required:
        assert (ROOT / relative_path).is_file(), f"file richiesto mancante: {relative_path}"


def test_legacy_rotate_files_are_gone():
    """CHANGES.md e TEST_RUN.md sono stati rimossi in F1.4."""
    assert not (ROOT / "CHANGES.md").exists(), "CHANGES.md doveva essere rimosso"
    assert not (ROOT / "TEST_RUN.md").exists(), "TEST_RUN.md doveva essere rimosso"


def test_thin_pointer_files_reference_contributing():
    """AGENTS.md, CLAUDE.md root e le varianti backend/frontend rinviano a CONTRIBUTING.md."""
    for path in ("AGENTS.md", "CLAUDE.md", "backend/AGENTS.md", "backend/CLAUDE.md", "frontend/AGENTS.md", "frontend/CLAUDE.md"):
        text = read_text(path)
        assert "CONTRIBUTING.md" in text, f"{path} deve riferire CONTRIBUTING.md"


def test_thin_pointer_files_reference_protected_zones():
    """Tutti i pointer governance rinviano a PROTECTED_ZONES.md."""
    for path in ("AGENTS.md", "CLAUDE.md", "backend/AGENTS.md", "frontend/AGENTS.md", "agents/README.md"):
        text = read_text(path)
        assert "PROTECTED_ZONES.md" in text, f"{path} deve riferire PROTECTED_ZONES.md"


def test_contributing_has_core_sections():
    """CONTRIBUTING.md deve contenere le sezioni operative fondamentali."""
    text = read_text("CONTRIBUTING.md")
    required_sections = [
        "Principi",
        "Zona protetta",
        "Testing",
        "Convenzioni backend",
        "Convenzioni frontend",
        "Commit",
    ]
    for heading in required_sections:
        assert heading in text, f"CONTRIBUTING.md deve contenere la sezione '{heading}'"

    # Regole test devono comparire almeno una volta
    assert 'pytest -m "unit or api"' in text
    assert "pytest -m e2e_smoke" in text or "e2e_smoke" in text
    assert "pytest -m visual" in text
    assert "tsc --noEmit" in text


def test_contributing_documents_key_endpoints():
    """La mappa endpoint deve documentare le rotte critiche."""
    text = read_text("CONTRIBUTING.md")
    endpoints = [
        "/api/health",
        "/api/settings",
        "/api/settings/verify-pin",
        "/api/timbrature",
        "/api/timbrature/{data}",
        "/api/dashboard",
        "/api/ferie/saldo",
        "/api/malattia/comporto",
        "/api/reperibilita",
        "/api/buste-paga",
        "/api/confronto-timbrature",
        "/api/statistiche/mensili",
        "/api/chat",
    ]
    for endpoint in endpoints:
        assert endpoint in text, f"endpoint {endpoint} non documentato in CONTRIBUTING.md"


def test_protected_zones_references_real_paths():
    """PROTECTED_ZONES.md punta a file che esistono davvero."""
    text = read_text("PROTECTED_ZONES.md")
    expected_paths = [
        "backend/server.py",
        "backend/server_nas.py",
        "backend/sometime_parser.py",
        "backend/zucchetti_parser.py",
        "frontend/src/utils/helpers.ts",
        "frontend/src/algorithms/calcoli.ts",
    ]
    for relative_path in expected_paths:
        assert relative_path in text, f"PROTECTED_ZONES.md deve menzionare {relative_path}"
        assert (ROOT / relative_path).is_file(), f"path protetto inesistente: {relative_path}"


def test_protected_zones_names_key_pure_functions():
    """I simboli chiave di algoritmo compaiono in PROTECTED_ZONES.md."""
    text = read_text("PROTECTED_ZONES.md")
    symbols = [
        "arrotonda_quarti_ora",
        "arrotonda_quarti_ora_difetto",
        "calcola_ore_lavorate",
        "calcola_straordinario",
        "calcola_ticket",
        "calcola_reperibilita_passiva",
        "calcola_reperibilita_attiva",
        "calcola_ore_da_marcature",
        "arrotondaQuartiOra",
        "calcolaOreLavorate",
    ]
    for symbol in symbols:
        assert symbol in text, f"PROTECTED_ZONES.md deve menzionare il simbolo {symbol}"


def test_memory_file_is_readable():
    """memory/MEMORY.md contiene almeno le sezioni base."""
    text = read_text("memory/MEMORY.md")
    assert "Controlli" in text or "controlli" in text.lower()
