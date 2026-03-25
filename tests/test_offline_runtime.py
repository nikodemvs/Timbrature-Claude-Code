from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.unit

ROOT = Path(__file__).resolve().parents[1]


def read_text(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def test_offline_queue_replay_is_implemented_and_triggered():
    offline_api = read_text("frontend/src/services/offlineApi.ts")
    network_hook = read_text("frontend/src/hooks/useNetworkStatus.ts")

    assert "export async function syncOfflineQueue" in offline_api
    assert "replayQueuedOperation" in offline_api
    assert "case 'timbra'" in offline_api or "if (entry.operation === 'timbra')" in offline_api
    assert "updateSettings" in offline_api
    assert "timbratura: timbraturaLocale" in offline_api
    assert "void syncOfflineQueue();" in offline_api
    assert "syncOfflineQueue()" in network_hook
    assert "cloudEnabled" in network_hook


def test_local_storage_and_types_are_path_based():
    local_db = read_text("frontend/src/db/localDb.ts")
    types = read_text("frontend/src/types/index.ts")

    assert "isWebRuntime" in local_db
    assert "createMemoryDb" in local_db
    assert "Platform.OS === 'web'" in local_db
    assert "type SQLiteModule = typeof import('expo-sqlite');" in local_db
    assert "import * as SQLite from 'expo-sqlite';" not in local_db
    assert "_sqliteModulePromise" in local_db
    assert "getSQLiteModule()" in local_db
    assert "journal_mode=WAL" in local_db
    assert "if (isWebRuntime())" in local_db
    assert "livello INTEGER DEFAULT 0" in local_db
    assert "DELETE FROM settings;" in local_db
    clear_account_block = local_db.split("export async function clearAccount()", 1)[1]
    assert "DELETE FROM timbrature;" not in clear_account_block
    assert "DELETE FROM assenze;" not in clear_account_block
    assert "DELETE FROM offline_queue;" not in clear_account_block

    assert "certificato_path" in types
    assert "pdf_path" in types
    assert "file_path: string" in types
    assert "certificato_base64" not in types
    assert "pdf_base64" not in types
    assert "file_base64" not in types
