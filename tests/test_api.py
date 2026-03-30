from __future__ import annotations

import base64
from datetime import datetime, timedelta
from types import SimpleNamespace
from io import BytesIO

import aiosqlite
import pytest

import server

pytestmark = [pytest.mark.api, pytest.mark.asyncio]


class FintaSessioneChat:
    async def send_message(self, messaggio: str):
        return SimpleNamespace(text=f"Risposta sintetica a: {messaggio}")


class FintiChats:
    def create(self, **_kwargs):
        return FintaSessioneChat()


class FintoGemini:
    aio = SimpleNamespace(chats=FintiChats())


async def _semina_dati_operativi_e_personali(db_temporaneo):
    timestamp = "2026-03-21T10:00:00+00:00"
    await db_temporaneo.execute(
        """
        INSERT INTO timbrature (
            id, data, ora_entrata, ora_uscita, marcature,
            ore_lavorate, ore_arrotondate, ore_reperibilita,
            is_reperibilita_attiva, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            "timbr-1",
            "2026-03-20",
            "08:00",
            "17:00",
            "[]",
            8.0,
            8.0,
            0.0,
            0,
            "Timbratura di test",
            timestamp,
        ],
    )
    await db_temporaneo.execute(
        """
        INSERT INTO timbrature_aziendali (
            id, data, ora_entrata, ora_uscita, ore_lavorate,
            descrizione, fonte_pdf, mese_riferimento, anno_riferimento, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            "timbr-aziendale-1",
            "2026-03-21",
            "08:00",
            "17:00",
            8.0,
            "Report aziendale",
            "report-mese.pdf",
            3,
            2026,
            timestamp,
        ],
    )
    await db_temporaneo.execute(
        """
        INSERT INTO buste_paga (
            id, mese, anno, pdf_base64, pdf_nome,
            lordo, netto, straordinari_ore, straordinari_importo,
            trattenute_totali, netto_calcolato, differenza,
            has_discrepancy, note_confronto, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            "busta-1",
            3,
            2026,
            base64.b64encode(b"%PDF-busta").decode("ascii"),
            "marzo-2026.pdf",
            2400.0,
            1800.0,
            4.0,
            120.0,
            500.0,
            1800.0,
            0.0,
            0,
            "Confronto di test",
            timestamp,
        ],
    )
    await db_temporaneo.execute(
        """
        INSERT INTO documenti (
            id, tipo, titolo, descrizione, sottotipo,
            file_base64, file_nome, file_tipo, data_riferimento, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            "doc-1",
            "busta_paga",
            "Cedolino marzo 2026",
            "Documento personale",
            "ordinaria",
            base64.b64encode(b"%PDF-doc").decode("ascii"),
            "cedolino-marzo-2026.pdf",
            "pdf",
            "2026-03",
            timestamp,
        ],
    )
    await db_temporaneo.execute(
        """
        INSERT INTO assenze (
            id, tipo, data_inizio, data_fine, ore_totali,
            note, certificato_base64, certificato_nome, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            "assenza-1",
            "ferie",
            "2026-03-10",
            "2026-03-11",
            16.0,
            "Assenza di test",
            None,
            None,
            timestamp,
        ],
    )
    await db_temporaneo.execute(
        """
        INSERT INTO reperibilita (
            id, data, ora_inizio, ora_fine, tipo,
            ore_totali, interventi, compenso_calcolato, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            "rep-1",
            "2026-03-18",
            "22:00",
            "02:00",
            "passiva",
            4.0,
            0,
            0.0,
            "Reperibilità di test",
            timestamp,
        ],
    )
    await db_temporaneo.execute(
        """
        INSERT INTO chat_history (
            id, session_id, role, content, timestamp
        ) VALUES (?, ?, ?, ?, ?)
        """,
        [
            "chat-1",
            "sessione-1",
            "user",
            "Ho bisogno dei miei dati",
            timestamp,
        ],
    )
    await db_temporaneo.execute(
        """
        INSERT INTO alerts (
            id, tipo, titolo, messaggio, data_scadenza, letto, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        [
            "alert-1",
            "promemoria",
            "Scadenza",
            "Messaggio personale",
            "2026-04-01",
            0,
            timestamp,
        ],
    )
    await db_temporaneo.commit()


async def test_api_root_e_health_espongono_stato_app(client_api):
    risposta_root = await client_api.get("/api/")
    risposta_health = await client_api.get("/api/health")
    errore_root = await client_api.post("/api/")
    errore_health = await client_api.post("/api/health")

    assert risposta_root.status_code == 200
    assert risposta_root.json()["status"] == "online"
    assert risposta_health.status_code == 200
    assert risposta_health.json()["status"] == "healthy"
    assert "timestamp" in risposta_health.json()
    assert errore_root.status_code == 405
    assert errore_health.status_code == 405


async def test_api_settings_get_put_errore_e_caso_edge(client_api):
    iniziale = await client_api.get("/api/settings")
    aggiornata = await client_api.put(
        "/api/settings",
        json={
            "nome": "Mario",
            "cognome": "Rossi",
            "matricola": "1234",
            "numero_badge": "B-77",
            "use_biometric": False,
        },
    )
    errore = await client_api.put("/api/settings", json={"livello": "alto"})
    edge = await client_api.put("/api/settings", json={"pin_hash": ""})

    assert iniziale.status_code == 200
    assert iniziale.json()["nome"] == ""
    assert iniziale.json()["cognome"] == ""
    assert iniziale.json()["matricola"] == ""
    assert iniziale.json()["numero_badge"] == ""
    assert iniziale.json()["azienda"] == ""
    assert iniziale.json()["paga_base"] == 0
    assert iniziale.json()["use_biometric"] is False
    assert aggiornata.status_code == 200
    assert aggiornata.json()["nome"] == "Mario"
    assert aggiornata.json()["cognome"] == "Rossi"
    assert aggiornata.json()["matricola"] == "1234"
    assert aggiornata.json()["numero_badge"] == "B-77"
    assert aggiornata.json()["use_biometric"] is False
    assert errore.status_code == 422
    assert edge.status_code == 200


async def test_api_settings_migra_schema_legacy_e_normalizza_nome(modulo_backend):
    conn = await aiosqlite.connect(":memory:")
    conn.row_factory = aiosqlite.Row
    modulo_backend._db = conn
    modulo_backend._gemini_client = None
    await conn.execute(
        """
        CREATE TABLE settings (
            id TEXT PRIMARY KEY,
            nome TEXT DEFAULT '',
            qualifica TEXT DEFAULT '',
            livello INTEGER DEFAULT 0,
            azienda TEXT DEFAULT '',
            sede TEXT DEFAULT '',
            ccnl TEXT DEFAULT '',
            data_assunzione TEXT DEFAULT '',
            orario_tipo TEXT DEFAULT '',
            ore_giornaliere INTEGER DEFAULT 0,
            paga_base REAL DEFAULT 0,
            scatti_anzianita REAL DEFAULT 0,
            superminimo REAL DEFAULT 0,
            premio_incarico REAL DEFAULT 0,
            divisore_orario INTEGER DEFAULT 0,
            divisore_giornaliero INTEGER DEFAULT 0,
            ticket_valore REAL DEFAULT 0,
            pin_hash TEXT,
            use_biometric INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TEXT
        )
        """
    )
    await conn.execute(
        """
        INSERT INTO settings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        [
            "legacy-settings",
            "Mario Rossi",
            "Impiegato",
            3,
            "Azienda Srl",
            "Milano",
            "CCNL Metalmeccanici",
            "2015-07-11",
            "Full-time",
            8,
            2000.0,
            66.88,
            469.41,
            56.9,
            173,
            22,
            8.5,
            None,
            0,
            "2026-03-21T10:00:00+00:00",
            "2026-03-21T10:00:00+00:00",
        ],
    )
    await conn.commit()

    try:
        await modulo_backend.init_db()
        risposta = await server._db.execute("SELECT * FROM settings LIMIT 1")
        row = dict(await risposta.fetchone())
        assert row["nome"] == "Mario"
        assert row["cognome"] == "Rossi"
        assert row["matricola"] == ""
        assert row["numero_badge"] == ""
    finally:
        await conn.close()
        modulo_backend._db = None
        modulo_backend._gemini_client = None


async def test_api_timbrature_lista_creazione_duplicato_ed_edge_notturno(client_api):
    vuota = await client_api.get("/api/timbrature")
    creata = await client_api.post(
        "/api/timbrature",
        json={"data": "2026-03-19", "ora_entrata": "23:50", "ora_uscita": "01:10", "note": "Turno notte"},
    )
    lista = await client_api.get("/api/timbrature", params={"mese": 3, "anno": 2026})
    duplicata = await client_api.post(
        "/api/timbrature",
        json={"data": "2026-03-19", "ora_entrata": "08:00", "ora_uscita": "17:00"},
    )
    errore = await client_api.get("/api/timbrature", params={"anno": "errore"})

    assert vuota.status_code == 200
    assert vuota.json() == []
    assert creata.status_code == 200
    assert creata.json()["ore_lavorate"] == 1.33
    assert creata.json()["ore_arrotondate"] == 1.0
    assert len(lista.json()) == 1
    assert duplicata.status_code == 400
    assert duplicata.json()["detail"] == "Timbratura già esistente per questa data"
    assert errore.status_code == 422


async def test_api_timbrature_eliminazione_positiva_errore_ed_edge_vuoto(client_api):
    await client_api.post(
        "/api/timbrature",
        json={"data": "2026-03-20", "ora_entrata": "08:00", "ora_uscita": "17:00"},
    )

    eliminata = await client_api.delete("/api/timbrature/2026-03-20")
    dettaglio = await client_api.get("/api/timbrature/2026-03-20")
    errore = await client_api.delete("/api/timbrature/2026-03-20")

    assert eliminata.status_code == 200
    assert eliminata.json()["message"] == "Timbratura eliminata"
    assert dettaglio.status_code == 404
    assert errore.status_code == 404
    assert errore.json()["detail"] == "Timbratura non trovata"


async def test_api_timbra_registra_flusso_completo_errore_e_reperibilita(client_api):
    errore = await client_api.post("/api/timbrature/timbra", params={"tipo": "uscita"})
    entrata = await client_api.post("/api/timbrature/timbra", params={"tipo": "entrata", "is_reperibilita": True})
    doppia_entrata = await client_api.post("/api/timbrature/timbra", params={"tipo": "entrata"})
    uscita = await client_api.post("/api/timbrature/timbra", params={"tipo": "uscita"})

    assert errore.status_code == 400
    assert "uscita senza un'entrata" in errore.json()["detail"]
    assert entrata.status_code == 200
    assert entrata.json()["is_reperibilita_attiva"] is True
    assert doppia_entrata.status_code == 400
    assert "Sequenza non valida" in doppia_entrata.json()["detail"]
    assert uscita.status_code == 200
    assert uscita.json()["ora_entrata"] is not None
    assert uscita.json()["ora_uscita"] is not None


async def test_api_settimana_restituisce_riepilogo_errore_e_caso_vuoto(client_api):
    vuota = await client_api.get("/api/timbrature/settimana/2026-03-19")
    await client_api.post(
        "/api/timbrature",
        json={"data": "2026-03-19", "ora_entrata": "08:00", "ora_uscita": "17:00"},
    )
    piena = await client_api.get("/api/timbrature/settimana/2026-03-19")
    errore = await client_api.get("/api/timbrature/settimana/non-valida")

    assert vuota.status_code == 200
    assert vuota.json()["ore_totali"] == 0
    assert piena.status_code == 200
    assert piena.json()["ore_totali"] == 9.0
    assert piena.json()["giorni_lavorati"] == 1
    assert errore.status_code == 422


async def test_api_assenze_lista_creazione_errore_ed_edge_calcolato(client_api):
    vuota = await client_api.get("/api/assenze")
    creata = await client_api.post(
        "/api/assenze",
        json={"tipo": "ferie", "data_inizio": "2026-03-10", "data_fine": "2026-03-11"},
    )
    lista = await client_api.get("/api/assenze", params={"tipo": "ferie", "anno": 2026})
    errore = await client_api.post("/api/assenze", json={"data_inizio": "2026-03-10", "data_fine": "2026-03-11"})
    filtro_errato = await client_api.get("/api/assenze", params={"anno": "x"})

    assert vuota.status_code == 200
    assert vuota.json() == []
    assert creata.status_code == 200
    assert creata.json()["ore_totali"] == 16
    assert len(lista.json()) == 1
    assert errore.status_code == 422
    assert filtro_errato.status_code == 422


async def test_api_ferie_saldo_positivo_errore_ed_edge_senza_dati(client_api):
    anno_corrente = datetime.now().year
    await client_api.post(
        "/api/assenze",
        json={"tipo": "ferie", "data_inizio": f"{anno_corrente}-03-01", "data_fine": f"{anno_corrente}-03-01", "ore_totali": 8},
    )

    positiva = await client_api.get("/api/ferie/saldo", params={"anno": anno_corrente})
    errore = await client_api.get("/api/ferie/saldo", params={"anno": "anno"})
    edge = await client_api.get("/api/ferie/saldo", params={"anno": anno_corrente - 1})

    assert positiva.status_code == 200
    assert positiva.json()["ore_godute"] == 8
    assert errore.status_code == 422
    assert edge.status_code == 200
    assert edge.json()["ore_godute"] == 0


async def test_api_comporto_positivo_errore_ed_edge_vuoto(client_api):
    vuoto = await client_api.get("/api/malattia/comporto")
    oggi = datetime.now().date()
    await client_api.post(
        "/api/assenze",
        json={
            "tipo": "malattia",
            "data_inizio": (oggi - timedelta(days=5)).strftime("%Y-%m-%d"),
            "data_fine": (oggi - timedelta(days=3)).strftime("%Y-%m-%d"),
        },
    )
    pieno = await client_api.get("/api/malattia/comporto")
    errore = await client_api.post("/api/malattia/comporto")

    assert vuoto.status_code == 200
    assert vuoto.json()["giorni_malattia_3_anni"] == 0
    assert pieno.status_code == 200
    assert pieno.json()["giorni_malattia_3_anni"] == 3
    assert errore.status_code == 405


async def test_api_reperibilita_lista_creazione_errore_ed_edge_notturno(client_api):
    vuota = await client_api.get("/api/reperibilita")
    creata = await client_api.post(
        "/api/reperibilita",
        json={"data": "2026-03-18", "ora_inizio": "22:00", "ora_fine": "02:00", "tipo": "passiva"},
    )
    lista = await client_api.get("/api/reperibilita", params={"mese": 3, "anno": 2026})
    errore = await client_api.post("/api/reperibilita", json={"data": "2026-03-18", "ora_fine": "02:00"})
    filtro_errato = await client_api.get("/api/reperibilita", params={"mese": "marzo"})

    assert vuota.status_code == 200
    assert vuota.json() == []
    assert creata.status_code == 200
    assert creata.json()["ore_totali"] == 4.0
    assert creata.json()["compenso_calcolato"] == 16.0
    assert len(lista.json()) == 1
    assert errore.status_code == 422
    assert filtro_errato.status_code == 422


async def test_api_buste_paga_lista_creazione_errore_ed_edge_zero(client_api):
    vuota = await client_api.get("/api/buste-paga")
    creata = await client_api.post("/api/buste-paga", json={"mese": 3, "anno": 2026})
    lista = await client_api.get("/api/buste-paga", params={"anno": 2026})
    duplicata = await client_api.post("/api/buste-paga", json={"mese": 3, "anno": 2026})
    errore = await client_api.get("/api/buste-paga", params={"anno": "anno"})

    assert vuota.status_code == 200
    assert vuota.json() == []
    assert creata.status_code == 200
    assert creata.json()["lordo"] == 0.0
    assert creata.json()["netto"] == 0.0
    assert len(lista.json()) == 1
    assert duplicata.status_code == 400
    assert errore.status_code == 422


async def test_api_update_busta_paga_positivo_errore_ed_edge(client_api):
    await client_api.put(
        "/api/settings",
        json={
            "paga_base": 2000.0,
            "scatti_anzianita": 50.0,
            "superminimo": 100.0,
            "premio_incarico": 25.0,
        },
    )
    await client_api.post("/api/buste-paga", json={"mese": 4, "anno": 2026, "netto": 1500.0})

    positiva = await client_api.put("/api/buste-paga/2026/4", json={"netto": 1800.0})
    edge = await client_api.put("/api/buste-paga/2026/4", json={"lordo": 2500.0})
    errore = await client_api.put("/api/buste-paga/2026/5", json={"netto": 1800.0})

    assert positiva.status_code == 200
    assert positiva.json()["netto"] == 1800.0
    assert positiva.json()["netto_calcolato"] == 1631.25
    assert positiva.json()["has_discrepancy"] is True
    assert edge.status_code == 200
    assert edge.json()["lordo"] == 2500.0
    assert errore.status_code == 404


async def test_api_upload_busta_paga_importa_valori_e_allega_pdf(client_api, monkeypatch):
    monkeypatch.setattr(
        server,
        "parse_sometime_pdf",
        lambda _content, filename: {
            "success": False,
            "filename": filename,
            "timbrature": [],
            "errors": [],
        },
    )
    monkeypatch.setattr(
        server,
        "parse_zucchetti_pdf",
        lambda _content, filename: {
            "success": True,
            "filename": filename,
            "dipendente": {
                "nome": "Mario Rossi",
                "matricola": "1234",
                "livello": 4,
                "data_assunzione": "11-07-2015",
            },
            "azienda": {"nome": "Plastiape S.p.A."},
            "elementi_retributivi": {
                "paga_base": 2026.64,
                "scatti_anzianita": 66.88,
                "superminimo": 469.41,
                "premio_incarico": 56.90,
            },
            "netto": 1450.0,
            "ore": {"straordinarie": 12.5},
            "totali": {"competenze": 2400.0, "trattenute": 500.0},
        },
    )

    upload = await client_api.post(
        "/api/buste-paga/2026/3/upload",
        files={"file": ("marzo-2026.pdf", BytesIO(b"%PDF-busta"), "application/pdf")},
    )
    dettaglio = await client_api.get("/api/buste-paga/2026/3")
    settings = await client_api.get("/api/settings")

    assert upload.status_code == 200
    assert upload.json()["parse_success"] is True
    assert dettaglio.status_code == 200
    assert dettaglio.json()["pdf_nome"] == "marzo-2026.pdf"
    assert dettaglio.json()["lordo"] == 2400.0
    assert dettaglio.json()["netto"] == 1450.0
    assert dettaglio.json()["straordinari_ore"] == 12.5
    assert dettaglio.json()["trattenute_totali"] == 500.0
    assert settings.status_code == 200
    assert settings.json()["nome"] == "Mario"
    assert settings.json()["cognome"] == "Rossi"
    assert settings.json()["matricola"] == "1234"
    assert settings.json()["numero_badge"] == ""
    assert settings.json()["livello"] == 4
    assert settings.json()["azienda"] == "Plastiape S.p.A."
    assert settings.json()["data_assunzione"] == "2015-07-11"
    assert settings.json()["paga_base"] == 2026.64
    assert settings.json()["scatti_anzianita"] == 66.88
    assert settings.json()["superminimo"] == 469.41
    assert settings.json()["premio_incarico"] == 56.9


async def test_api_upload_busta_paga_popola_nome_e_cognome_da_raw_text_zucchetti(client_api, monkeypatch):
    monkeypatch.setattr(
        server,
        "parse_sometime_pdf",
        lambda _content, filename: {
            "success": False,
            "filename": filename,
            "timbrature": [],
            "errors": [],
        },
    )
    monkeypatch.setattr(
        server,
        "parse_zucchetti_pdf",
        lambda _content, filename: {
            "success": True,
            "filename": filename,
            "dipendente": {"livello": 5},
            "azienda": {"nome": "Plastiape S.p.A."},
            "raw_text": "0000345 ZAMBARA MARCO ZMBMRC88C24I625I 629 Operaio Livello 5",
            "elementi_retributivi": {},
        },
    )

    upload = await client_api.post(
        "/api/buste-paga/2026/3/upload",
        files={"file": ("marzo-2026.pdf", BytesIO(b"%PDF-busta"), "application/pdf")},
    )
    settings = await client_api.get("/api/settings")
    dashboard = await client_api.get("/api/dashboard")

    assert upload.status_code == 200
    assert upload.json()["parse_success"] is True
    assert settings.status_code == 200
    assert dashboard.status_code == 200
    assert settings.json()["nome"] == "Marco"
    assert settings.json()["cognome"] == "Zambara"
    assert settings.json()["matricola"] == "629"
    assert settings.json()["numero_badge"] == ""
    assert dashboard.json()["settings"]["nome"] == "Marco"
    assert dashboard.json()["settings"]["cognome"] == "Zambara"


async def test_api_dashboard_ripara_identita_e_matricola_da_ultima_busta_gia_archiviata(client_api, monkeypatch):
    await client_api.put(
        "/api/settings",
        json={
            "nome": "",
            "cognome": "",
            "matricola": "",
            "numero_badge": "",
        },
    )

    await server._db.execute(
        """
        INSERT INTO buste_paga VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        [
            "busta-repair",
            2,
            2026,
            base64.b64encode(b"%PDF-cedolino").decode(),
            "2026_02_febbraio.pdf",
            0.0,
            1590.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0,
            None,
            "2026-03-21T16:22:29.825195+00:00",
        ],
    )
    await server._db.commit()

    monkeypatch.setattr(
        server,
        "parse_zucchetti_pdf",
        lambda _content, filename: {
            "success": True,
            "filename": filename,
            "dipendente": {"livello": 5},
            "azienda": {"nome": "Plastiape S.p.A."},
            "raw_text": "0000345 ZAMBARA MARCO ZMBMRC88C24I625I 629 Operaio Livello 5",
            "elementi_retributivi": {},
        },
    )

    dashboard = await client_api.get("/api/dashboard")
    settings = await client_api.get("/api/settings")

    assert dashboard.status_code == 200
    assert dashboard.json()["settings"]["nome"] == "Marco"
    assert dashboard.json()["settings"]["cognome"] == "Zambara"
    assert dashboard.json()["settings"]["matricola"] == "629"
    assert settings.status_code == 200
    assert settings.json()["nome"] == "Marco"
    assert settings.json()["cognome"] == "Zambara"
    assert settings.json()["matricola"] == "629"


async def test_api_upload_busta_paga_rifiuta_report_timbrature(client_api, monkeypatch):
    monkeypatch.setattr(
        server,
        "parse_sometime_pdf",
        lambda _content, filename: {
            "success": True,
            "filename": filename,
            "timbrature": [{"data": "2026-03-10", "ora_entrata": "08:00", "ora_uscita": "17:00"}],
            "errors": [],
        },
    )
    monkeypatch.setattr(
        server,
        "parse_zucchetti_pdf",
        lambda _content, filename: {
            "success": False,
            "filename": filename,
            "errors": [],
        },
    )

    upload = await client_api.post(
        "/api/buste-paga/2026/3/upload",
        files={"file": ("CART_2026-03-01_2026-03-31_0001_Mario Rossi.pdf", BytesIO(b"%PDF-timbrature"), "application/pdf")},
    )
    lista = await client_api.get("/api/buste-paga", params={"anno": 2026})

    assert upload.status_code == 400
    assert "sembra un report timbrature" in upload.json()["detail"]
    assert lista.status_code == 200
    assert lista.json() == []


async def test_api_upload_busta_paga_auto_rileva_periodo_e_chiede_sovrascrittura(client_api, monkeypatch):
    monkeypatch.setattr(
        server,
        "parse_sometime_pdf",
        lambda _content, filename: {
            "success": False,
            "filename": filename,
            "timbrature": [],
            "errors": [],
        },
    )
    parser_state = {
        "filename": "marzo-2026.pdf",
        "mese": 3,
        "anno": 2026,
        "dipendente": {
            "nome": "Mario Rossi",
            "livello": 4,
            "data_assunzione": "11-07-2015",
        },
        "azienda": {"nome": "Plastiape S.p.A."},
        "elementi_retributivi": {
            "paga_base": 2026.64,
            "scatti_anzianita": 66.88,
            "superminimo": 469.41,
            "premio_incarico": 56.90,
        },
        "netto": 1450.0,
        "ore": {"straordinarie": 8.5},
        "totali": {"competenze": 2400.0, "trattenute": 500.0},
    }

    def finto_parse_zucchetti(_content: bytes, filename: str):
        return {
            "success": True,
            "filename": filename,
            **parser_state,
        }

    monkeypatch.setattr(server, "parse_zucchetti_pdf", finto_parse_zucchetti)

    prima = await client_api.post(
        "/api/buste-paga/upload",
        files={"file": ("marzo-2026.pdf", BytesIO(b"%PDF-busta-1"), "application/pdf")},
    )
    duplicata = await client_api.post(
        "/api/buste-paga/upload",
        files={"file": ("marzo-2026-v2.pdf", BytesIO(b"%PDF-busta-2"), "application/pdf")},
    )

    parser_state["netto"] = 1525.0
    parser_state["totali"] = {"competenze": 2500.0, "trattenute": 520.0}
    parser_state["dipendente"]["livello"] = 5
    parser_state["elementi_retributivi"]["paga_base"] = 2100.0
    sovrascritta = await client_api.post(
        "/api/buste-paga/upload",
        data={"force_overwrite": "true"},
        files={"file": ("marzo-2026-v2.pdf", BytesIO(b"%PDF-busta-3"), "application/pdf")},
    )
    dettaglio = await client_api.get("/api/buste-paga/2026/3")
    settings = await client_api.get("/api/settings")

    assert prima.status_code == 200
    assert prima.json()["mese"] == 3
    assert prima.json()["anno"] == 2026
    assert duplicata.status_code == 409
    assert duplicata.json()["detail"]["code"] == "duplicato_busta_paga"
    assert sovrascritta.status_code == 200
    assert dettaglio.status_code == 200
    assert dettaglio.json()["pdf_nome"] == "marzo-2026-v2.pdf"
    assert dettaglio.json()["netto"] == 1525.0
    assert dettaglio.json()["lordo"] == 2500.0
    assert settings.status_code == 200
    assert settings.json()["livello"] == 5
    assert settings.json()["paga_base"] == 2100.0


async def test_api_upload_busta_paga_archivia_tredicesima_separata_dalla_ordinaria(client_api, db_temporaneo, monkeypatch):
    monkeypatch.setattr(
        server,
        "parse_sometime_pdf",
        lambda _content, filename: {
            "success": False,
            "filename": filename,
            "timbrature": [],
            "errors": [],
        },
    )
    monkeypatch.setattr(
        server,
        "parse_zucchetti_pdf",
        lambda _content, filename: {
            "success": True,
            "filename": filename,
            "mese": 12,
            "anno": 2026,
            "netto": 1600.0,
            "ore": {"straordinarie": 6.0},
            "totali": {"competenze": 2600.0, "trattenute": 550.0},
        },
    )

    ordinaria = await client_api.post(
        "/api/buste-paga/upload",
        files={"file": ("dicembre-2026.pdf", BytesIO(b"%PDF-ordinaria"), "application/pdf")},
    )
    tredicesima = await client_api.post(
        "/api/buste-paga/upload",
        files={"file": ("tredicesima-2026.pdf", BytesIO(b"%PDF-tredicesima"), "application/pdf")},
    )
    cur_ordinaria = await db_temporaneo.execute(
        "SELECT * FROM documenti WHERE tipo = 'busta_paga' AND sottotipo = 'ordinaria' ORDER BY created_at DESC LIMIT 1"
    )
    riga_ordinaria = dict(await cur_ordinaria.fetchone())
    cur_tredicesima = await db_temporaneo.execute(
        "SELECT * FROM documenti WHERE tipo = 'busta_paga' AND sottotipo = 'tredicesima' ORDER BY created_at DESC LIMIT 1"
    )
    riga_tredicesima = dict(await cur_tredicesima.fetchone())
    dettaglio = await client_api.get("/api/buste-paga/2026/12")
    documenti = await client_api.get("/api/documenti", params={"tipo": "busta_paga"})
    sole_tredicesime = await client_api.get("/api/documenti", params={"tipo": "busta_paga", "sottotipo": "tredicesima"})

    assert ordinaria.status_code == 200
    assert tredicesima.status_code == 200
    assert tredicesima.json()["sottotipo"] == "tredicesima"
    assert tredicesima.json()["busta"] is None
    assert riga_ordinaria["file_nome"] == "dicembre-2026.pdf"
    assert riga_ordinaria["file_tipo"] == "pdf"
    assert riga_ordinaria["data_riferimento"] == "2026-12"
    assert riga_ordinaria["sottotipo"] == "ordinaria"
    assert riga_tredicesima["file_nome"] == "tredicesima-2026.pdf"
    assert riga_tredicesima["file_tipo"] == "pdf"
    assert riga_tredicesima["data_riferimento"] == "2026-12"
    assert riga_tredicesima["sottotipo"] == "tredicesima"
    assert dettaglio.status_code == 200
    assert dettaglio.json()["pdf_nome"] == "dicembre-2026.pdf"
    assert documenti.status_code == 200
    assert len(documenti.json()) == 2
    assert sole_tredicesime.status_code == 200
    assert len(sole_tredicesime.json()) == 1
    assert sole_tredicesime.json()[0]["file_nome"] == "tredicesima-2026.pdf"


async def test_api_upload_cud_archivia_file_e_gestisce_sovrascrittura(client_api, db_temporaneo):
    primo = await client_api.post(
        "/api/cud/upload",
        files={"file": ("CUD 2025.pdf", BytesIO(b"%PDF-CUD-1"), "application/pdf")},
    )
    duplicato = await client_api.post(
        "/api/cud/upload",
        files={"file": ("CUD 2025 v2.pdf", BytesIO(b"%PDF-CUD-2"), "application/pdf")},
    )
    sovrascritto = await client_api.post(
        "/api/cud/upload",
        data={"force_overwrite": "true"},
        files={"file": ("CUD 2025 v2.pdf", BytesIO(b"%PDF-CUD-3"), "application/pdf")},
    )
    cur_riga = await db_temporaneo.execute("SELECT * FROM documenti WHERE tipo = 'cud' ORDER BY created_at DESC LIMIT 1")
    riga = dict(await cur_riga.fetchone())
    documenti = await client_api.get("/api/documenti", params={"tipo": "cud"})

    assert primo.status_code == 200
    assert primo.json()["anno"] == 2025
    assert duplicato.status_code == 409
    assert duplicato.json()["detail"]["code"] == "duplicato_cud"
    assert sovrascritto.status_code == 200
    assert riga["file_nome"] == "CUD 2025 v2.pdf"
    assert riga["file_tipo"] == "pdf"
    assert riga["data_riferimento"] == "2025"
    assert riga["sottotipo"] == "certificazione_unica"
    assert documenti.status_code == 200
    assert len(documenti.json()) == 1
    assert documenti.json()[0]["file_nome"] == "CUD 2025 v2.pdf"


async def test_api_documenti_generici_salvano_colonne_corrette(client_api, db_temporaneo):
    risposta = await client_api.post(
        "/api/documenti",
        data={
            "tipo": "nota",
            "titolo": "Documento base",
            "descrizione": "Verifica archivio documenti",
            "sottotipo": "allegato",
            "data_riferimento": "2026-03",
        },
        files={"file": ("documento-base.pdf", BytesIO(b"%PDF-documento-base"), "application/pdf")},
    )

    cur = await db_temporaneo.execute("SELECT * FROM documenti WHERE id = ?", [risposta.json()["id"]])
    riga = await cur.fetchone()
    riga = dict(riga) if riga else None

    assert risposta.status_code == 200
    assert risposta.json()["file_nome"] == "documento-base.pdf"
    assert riga is not None
    assert riga["tipo"] == "nota"
    assert riga["titolo"] == "Documento base"
    assert riga["file_base64"] == base64.b64encode(b"%PDF-documento-base").decode()
    assert riga["file_nome"] == "documento-base.pdf"
    assert riga["file_tipo"] == "pdf"
    assert riga["data_riferimento"] == "2026-03"
    assert riga["sottotipo"] == "allegato"


async def test_api_documenti_ripara_righe_corrotte_senza_crash(client_api, db_temporaneo):
    await db_temporaneo.execute(
        """
        INSERT INTO documenti (
            id, tipo, titolo, descrizione, file_base64, file_nome,
            file_tipo, data_riferimento, created_at, sottotipo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            "doc-corrotto-1",
            "busta_paga",
            "Busta paga 03/2026",
            "Cedolino ordinario mensile.",
            "ordinaria",
            "JVBERi0xLjQKcorrotto",
            "marzo-2026.pdf",
            "pdf",
            "2026-03",
            "2026-03-21T10:00:00+00:00",
        ],
    )
    await db_temporaneo.commit()

    lista = await client_api.get("/api/documenti", params={"tipo": "busta_paga"})
    cur = await db_temporaneo.execute("SELECT * FROM documenti WHERE id = ?", ["doc-corrotto-1"])
    riga = await cur.fetchone()
    riga = dict(riga) if riga else None

    assert lista.status_code == 200
    assert len(lista.json()) == 1
    assert lista.json()[0]["sottotipo"] == "ordinaria"
    assert lista.json()[0]["file_nome"] == "marzo-2026.pdf"
    assert lista.json()[0]["file_tipo"] == "pdf"
    assert lista.json()[0]["data_riferimento"] == "2026-03"
    assert riga is not None
    assert riga["file_base64"] == "JVBERi0xLjQKcorrotto"
    assert riga["file_nome"] == "marzo-2026.pdf"
    assert riga["file_tipo"] == "pdf"
    assert riga["data_riferimento"] == "2026-03"
    assert riga["created_at"] == "2026-03-21T10:00:00+00:00"
    assert riga["sottotipo"] == "ordinaria"


async def test_api_cancella_dati_personali_svuota_solo_i_dati_operativi(client_api, db_temporaneo):
    await client_api.put(
        "/api/settings",
        json={
            "nome": "Mario",
            "cognome": "Rossi",
            "matricola": "1234",
            "numero_badge": "B-77",
            "qualifica": "Impiegato",
            "azienda": "Azienda Srl",
            "sede": "Milano",
            "paga_base": 2400.0,
            "ticket_valore": 8.5,
            "pin_hash": "1234",
            "use_biometric": False,
        },
    )
    await _semina_dati_operativi_e_personali(db_temporaneo)

    rifiutata = await client_api.post("/api/dati-personali/cancella", json={"conferma": False})
    cancellata = await client_api.post("/api/dati-personali/cancella", json={"conferma": True})

    assert rifiutata.status_code == 400
    assert rifiutata.json()["detail"] == "Conferma richiesta per cancellare i dati personali operativi."
    assert cancellata.status_code == 200
    assert cancellata.json()["message"] == "Dati personali operativi cancellati."
    assert cancellata.json()["cancellati"]["timbrature"] == 1
    assert cancellata.json()["cancellati"]["timbrature_aziendali"] == 1
    assert cancellata.json()["cancellati"]["buste_paga"] == 1
    assert cancellata.json()["cancellati"]["documenti"] == 1

    endpoint_checks = {
        "/api/timbrature": [],
        "/api/timbrature-aziendali": [],
        "/api/buste-paga": [],
        "/api/documenti": [],
    }
    for path, expected in endpoint_checks.items():
        risposta = await client_api.get(path)
        assert risposta.status_code == 200
        assert risposta.json() == expected

    settings = await client_api.get("/api/settings")
    dashboard = await client_api.get("/api/dashboard")
    assert settings.status_code == 200
    assert settings.json()["nome"] == "Mario"
    assert settings.json()["cognome"] == "Rossi"
    assert settings.json()["matricola"] == "1234"
    assert settings.json()["numero_badge"] == "B-77"
    assert settings.json()["azienda"] == "Azienda Srl"
    assert settings.json()["paga_base"] == 2400.0
    assert settings.json()["use_biometric"] is False
    assert dashboard.status_code == 200
    assert dashboard.json()["stime"]["metadati"]["ha_dati_contrattuali"] is True
    assert dashboard.json()["stime"]["metadati"]["ha_dati_operativi_mese"] is False
    assert dashboard.json()["stime"]["fonte"] == "solo_dati_contrattuali"
    assert dashboard.json()["stime"]["fonte_stima"] == "Stima basata solo sui dati contrattuali."

    for tabella in [
        "timbrature",
        "timbrature_aziendali",
        "buste_paga",
        "documenti",
        "assenze",
        "reperibilita",
        "chat_history",
        "alerts",
    ]:
        cur = await db_temporaneo.execute(f"SELECT COUNT(1) AS totale FROM {tabella}")
        totale = int((await cur.fetchone())["totale"])
        if tabella in {"timbrature", "timbrature_aziendali", "buste_paga", "documenti"}:
            assert totale == 0
        else:
            assert totale == 1

    cur = await db_temporaneo.execute("SELECT COUNT(1) AS totale FROM settings")
    assert int((await cur.fetchone())["totale"]) == 1


async def test_api_elimina_account_azzera_identita_e_sicurezza_ma_conserva_contratto_e_operativita(client_api, db_temporaneo):
    await client_api.put(
        "/api/settings",
        json={
            "nome": "Mario",
            "cognome": "Rossi",
            "matricola": "1234",
            "numero_badge": "B-77",
            "qualifica": "Impiegato",
            "livello": 4,
            "azienda": "Azienda Srl",
            "sede": "Milano",
            "ccnl": "Metalmeccanico",
            "data_assunzione": "2020-01-10",
            "orario_tipo": "Fisso",
            "ore_giornaliere": 8,
            "paga_base": 2400.0,
            "scatti_anzianita": 30.0,
            "superminimo": 120.0,
            "premio_incarico": 50.0,
            "divisore_orario": 173,
            "divisore_giornaliero": 8,
            "ticket_valore": 8.5,
            "pin_hash": "1234",
            "use_biometric": True,
        },
    )
    await db_temporaneo.execute(
        "UPDATE settings SET pin_hash = ?, use_biometric = ? WHERE id = (SELECT id FROM settings LIMIT 1)",
        ["1234", 1],
    )
    await db_temporaneo.commit()
    await _semina_dati_operativi_e_personali(db_temporaneo)

    rifiutata = await client_api.post("/api/account/elimina", json={"conferma": False})
    eliminata = await client_api.post("/api/account/elimina", json={"conferma": True})

    assert rifiutata.status_code == 400
    assert rifiutata.json()["detail"] == "Conferma richiesta per eliminare l'account."
    assert eliminata.status_code == 200
    assert eliminata.json()["message"] == "Account eliminato e dati di accesso azzerati."
    assert eliminata.json()["dati_contrattuali_conservati"] is True
    assert eliminata.json()["settings_reset"] is True

    settings = await client_api.get("/api/settings")
    assert settings.status_code == 200
    assert settings.json()["nome"] == ""
    assert settings.json()["cognome"] == ""
    assert settings.json()["matricola"] == ""
    assert settings.json()["numero_badge"] == ""
    assert settings.json()["qualifica"] == "Impiegato"
    assert settings.json()["azienda"] == "Azienda Srl"
    assert settings.json()["sede"] == "Milano"
    assert settings.json()["paga_base"] == 2400.0
    assert settings.json()["ticket_valore"] == 8.5
    assert settings.json()["pin_hash"] is None
    assert settings.json()["use_biometric"] is False

    dashboard = await client_api.get("/api/dashboard")
    assert dashboard.status_code == 200
    assert dashboard.json()["stime"]["metadati"]["ha_dati_contrattuali"] is True
    assert dashboard.json()["stime"]["metadati"]["ha_dati_operativi_mese"] is True
    assert dashboard.json()["stime"]["metadati"]["sorgente"] == "dati_contrattuali_e_operativi_mese"

    for tabella in [
        "timbrature",
        "timbrature_aziendali",
        "buste_paga",
        "documenti",
        "assenze",
        "reperibilita",
        "chat_history",
        "alerts",
    ]:
        cur = await db_temporaneo.execute(f"SELECT COUNT(1) AS totale FROM {tabella}")
        assert int((await cur.fetchone())["totale"]) == 1


async def test_api_dashboard_positivo_errore_ed_edge_vuoto(client_api):
    now = datetime.now()
    pagamento_mese = now.month + 1 if now.month < 12 else 1
    pagamento_anno = now.year if now.month < 12 else now.year + 1
    vuota = await client_api.get("/api/dashboard")
    await client_api.put("/api/settings", json={"paga_base": 2000.0, "ticket_valore": 8.0})
    await client_api.post(
        "/api/timbrature",
        json={"data": datetime.now().strftime("%Y-%m-%d"), "ora_entrata": "08:00", "ora_uscita": "17:00"},
    )
    piena = await client_api.get("/api/dashboard")
    errore = await client_api.post("/api/dashboard")

    assert vuota.status_code == 200
    assert vuota.json()["mese_corrente"]["ore_lavorate"] == 0
    assert vuota.json()["stime"]["lordo_stimato"] == 0
    assert vuota.json()["stime"]["netto_stimato"] == 0
    assert vuota.json()["stime"]["ticket_totale"] == 0
    assert vuota.json()["stime"]["metadati"]["ha_dati_contrattuali"] is False
    assert vuota.json()["stime"]["metadati"]["ha_dati_operativi_mese"] is False
    assert vuota.json()["stime"]["metadati"]["sorgente"] == "nessun_dato_utile"
    assert vuota.json()["stime"]["competenza_mese"] == now.month
    assert vuota.json()["stime"]["competenza_anno"] == now.year
    assert vuota.json()["stime"]["pagamento_previsto_giorno"] == 27
    assert vuota.json()["stime"]["pagamento_previsto_mese"] == pagamento_mese
    assert vuota.json()["stime"]["pagamento_previsto_anno"] == pagamento_anno
    assert piena.status_code == 200
    assert piena.json()["mese_corrente"]["ore_lavorate"] == 9.0
    assert piena.json()["mese_corrente"]["ticket_maturati"] == 1
    assert piena.json()["stime"]["ticket_totale"] == 8.0
    assert piena.json()["stime"]["metadati"]["ha_dati_contrattuali"] is True
    assert piena.json()["stime"]["metadati"]["ha_dati_operativi_mese"] is True
    assert piena.json()["stime"]["metadati"]["sorgente"] == "dati_contrattuali_e_operativi_mese"
    assert errore.status_code == 405


async def test_api_upload_timbrature_aziendali_importa_e_rende_visibili_i_dati(client_api, monkeypatch):
    def finto_parse_sometime_pdf(_content: bytes, filename: str):
        return {
            "success": True,
            "filename": filename,
            "mese": 3,
            "anno": 2026,
            "timbrature": [
                {
                    "data": "2026-03-10",
                    "ora_entrata": "08:00",
                    "ora_uscita": "17:00",
                    "ore_lavorate": 9.0,
                    "descrizione": "Turno regolare",
                },
                {
                    "data": "2026-03-11",
                    "ora_entrata": "08:15",
                    "ora_uscita": "17:30",
                    "ore_lavorate": 9.25,
                    "descrizione": "Tkt Mensa",
                },
            ],
            "totali": {"ore_lavorate": 18.25},
            "errors": [],
        }

    monkeypatch.setattr(server, "parse_sometime_pdf", finto_parse_sometime_pdf)

    upload = await client_api.post(
        "/api/timbrature-aziendali/upload",
        files={"file": ("CART_2026-03-01_2026-03-31_0001_Mario Rossi.pdf", BytesIO(b"%PDF-finto"), "application/pdf")},
        data={"mese": "3", "anno": "2026"},
    )
    lista = await client_api.get("/api/timbrature-aziendali", params={"mese": 3, "anno": 2026})

    assert upload.status_code == 200
    assert upload.json()["timbrature_importate"] == 2
    assert upload.json()["parse_success"] is True
    assert lista.status_code == 200
    assert len(lista.json()) == 2
    assert lista.json()[0]["data"] == "2026-03-11"
    assert lista.json()[1]["data"] == "2026-03-10"
    assert lista.json()[0]["descrizione"] == "Tkt Mensa"


async def test_api_upload_timbrature_aziendali_rifiuta_busta_paga_e_non_salva_documenti(client_api, monkeypatch):
    monkeypatch.setattr(
        server,
        "parse_sometime_pdf",
        lambda _content, filename: {
            "success": False,
            "filename": filename,
            "mese": None,
            "anno": None,
            "timbrature": [],
            "totali": {},
            "errors": [],
        },
    )
    monkeypatch.setattr(
        server,
        "parse_zucchetti_pdf",
        lambda _content, filename: {
            "success": True,
            "filename": filename,
            "totali": {"competenze": 2500.0},
        },
    )

    upload = await client_api.post(
        "/api/timbrature-aziendali/upload",
        files={"file": ("2021_10_ottobre.pdf", BytesIO(b"%PDF-busta"), "application/pdf")},
        data={"mese": "3", "anno": "2026"},
    )
    lista = await client_api.get("/api/timbrature-aziendali", params={"mese": 3, "anno": 2026})
    documenti = await client_api.get("/api/documenti", params={"tipo": "timbrature_report"})

    assert upload.status_code == 400
    assert "sembra una busta paga" in upload.json()["detail"]
    assert lista.status_code == 200
    assert lista.json() == []
    assert documenti.status_code == 200
    assert documenti.json() == []


async def test_api_upload_timbrature_aziendali_rileva_periodo_reale_e_filtra_per_mese(client_api, monkeypatch):
    def finto_parse_sometime_pdf(_content: bytes, filename: str):
        return {
            "success": True,
            "filename": filename,
            "mese": None,
            "anno": None,
            "timbrature": [
                {
                    "data": "2026-01-10",
                    "ora_entrata": "08:00",
                    "ora_uscita": "17:00",
                    "ore_lavorate": 9.0,
                    "descrizione": "Turno regolare",
                },
                {
                    "data": "2026-01-11",
                    "ora_entrata": "08:10",
                    "ora_uscita": "16:40",
                    "ore_lavorate": 8.5,
                    "descrizione": "Turno ridotto",
                },
            ],
            "totali": {"ore_lavorate": 17.5},
            "errors": [],
        }

    monkeypatch.setattr(server, "parse_sometime_pdf", finto_parse_sometime_pdf)

    await client_api.post(
        "/api/timbrature",
        json={"data": "2026-01-10", "ora_entrata": "08:00", "ora_uscita": "17:00"},
    )
    upload = await client_api.post(
        "/api/timbrature-aziendali/upload",
        files={"file": ("report-gennaio.pdf", BytesIO(b"%PDF-gennaio"), "application/pdf")},
        data={"mese": "3", "anno": "2026"},
    )
    gennaio = await client_api.get("/api/timbrature-aziendali", params={"mese": 1, "anno": 2026})
    marzo = await client_api.get("/api/timbrature-aziendali", params={"mese": 3, "anno": 2026})
    confronto_gennaio = await client_api.get("/api/confronto-timbrature", params={"mese": 1, "anno": 2026})
    confronto_marzo = await client_api.get("/api/confronto-timbrature", params={"mese": 3, "anno": 2026})

    assert upload.status_code == 200
    assert upload.json()["mese"] == 1
    assert upload.json()["anno"] == 2026
    assert gennaio.status_code == 200
    assert len(gennaio.json()) == 2
    assert marzo.status_code == 200
    assert marzo.json() == []
    assert confronto_gennaio.status_code == 200
    assert len(confronto_gennaio.json()["confronti"]) == 2
    assert confronto_marzo.status_code == 200
    assert confronto_marzo.json()["confronti"] == []


async def test_api_timbrature_aziendali_sincronizza_metadati_gia_sporchi(client_api):
    await server._db.execute(
        "INSERT INTO timbrature_aziendali VALUES (?,?,?,?,?,?,?,?,?,?)",
        [
            "timbratura-azienda-sporca",
            "2026-01-05",
            "08:00",
            "17:00",
            9.0,
            "Import storico",
            "storico.pdf",
            3,
            2026,
            datetime.now().isoformat(),
        ],
    )
    await server._db.commit()

    gennaio = await client_api.get("/api/timbrature-aziendali", params={"mese": 1, "anno": 2026})
    marzo = await client_api.get("/api/timbrature-aziendali", params={"mese": 3, "anno": 2026})

    assert gennaio.status_code == 200
    assert len(gennaio.json()) == 1
    assert gennaio.json()[0]["data"] == "2026-01-05"
    assert marzo.status_code == 200
    assert marzo.json() == []


async def test_api_upload_timbrature_aziendali_chiede_sovrascrittura_su_duplicato(client_api, monkeypatch):
    parser_state = {
        "filename": "report-marzo.pdf",
        "timbrature": [
            {
                "data": "2026-03-10",
                "ora_entrata": "08:00",
                "ora_uscita": "17:00",
                "ore_lavorate": 9.0,
                "descrizione": "Prima versione",
            }
        ],
    }

    def finto_parse_sometime_pdf(_content: bytes, filename: str):
        return {
            "success": True,
            "filename": filename,
            "mese": 3,
            "anno": 2026,
            "timbrature": parser_state["timbrature"],
            "totali": {"ore_lavorate": 9.0},
            "errors": [],
        }

    monkeypatch.setattr(server, "parse_sometime_pdf", finto_parse_sometime_pdf)

    prima = await client_api.post(
        "/api/timbrature-aziendali/upload",
        files={"file": ("report-marzo.pdf", BytesIO(b"%PDF-marzo-1"), "application/pdf")},
    )
    duplicata = await client_api.post(
        "/api/timbrature-aziendali/upload",
        files={"file": ("report-marzo-v2.pdf", BytesIO(b"%PDF-marzo-2"), "application/pdf")},
    )

    parser_state["timbrature"] = [
        {
            "data": "2026-03-10",
            "ora_entrata": "07:45",
            "ora_uscita": "17:15",
            "ore_lavorate": 9.5,
            "descrizione": "Versione aggiornata",
        }
    ]
    sovrascritta = await client_api.post(
        "/api/timbrature-aziendali/upload",
        data={"force_overwrite": "true"},
        files={"file": ("report-marzo-v2.pdf", BytesIO(b"%PDF-marzo-3"), "application/pdf")},
    )
    lista = await client_api.get("/api/timbrature-aziendali", params={"mese": 3, "anno": 2026})

    assert prima.status_code == 200
    assert duplicata.status_code == 409
    assert duplicata.json()["detail"]["code"] == "duplicato_timbrature_report"
    assert sovrascritta.status_code == 200
    assert lista.status_code == 200
    assert len(lista.json()) == 1
    assert lista.json()[0]["ora_entrata"] == "07:45"
    assert lista.json()[0]["descrizione"] == "Versione aggiornata"


async def test_api_chat_e_storico_gestiscono_successo_errore_ed_edge(client_api):
    server._gemini_client = FintoGemini()
    positiva = await client_api.post("/api/chat", json={"message": "Ciao assistente"})
    storico = await client_api.get("/api/chat/history")
    edge = await client_api.get("/api/chat/history", params={"limit": "molti"})

    server._gemini_client = None
    errore = await client_api.post("/api/chat", json={"message": "Ciao senza chiave"})

    assert positiva.status_code == 200
    assert "Risposta sintetica" in positiva.json()["response"]
    assert len(storico.json()) == 2
    assert storico.json()[0]["role"] == "user"
    assert edge.status_code == 422
    assert errore.status_code == 500
    assert "GEMINI_API_KEY non configurata" in errore.json()["detail"]


async def test_api_storico_chat_vuoto_e_cancellabile(client_api):
    vuoto = await client_api.get("/api/chat/history", params={"limit": 10})
    server._gemini_client = FintoGemini()
    await client_api.post("/api/chat", json={"message": "Prima domanda"})
    cancellazione = await client_api.delete("/api/chat/history")
    dopo = await client_api.get("/api/chat/history")

    assert vuoto.status_code == 200
    assert vuoto.json() == []
    assert cancellazione.status_code == 200
    assert cancellazione.json()["message"] == "Cronologia chat cancellata"
    assert dopo.json() == []
