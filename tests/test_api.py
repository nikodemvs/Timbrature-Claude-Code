from __future__ import annotations

import base64
from datetime import datetime, timedelta
from types import SimpleNamespace
from io import BytesIO

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
    aggiornata = await client_api.put("/api/settings", json={"nome": "Mario Rossi", "use_biometric": False})
    errore = await client_api.put("/api/settings", json={"livello": "alto"})
    edge = await client_api.put("/api/settings", json={"pin_hash": ""})

    assert iniziale.status_code == 200
    assert iniziale.json()["nome"] in {"Marco Zambara", "Zambara Marco"}
    assert aggiornata.status_code == 200
    assert aggiornata.json()["nome"] == "Mario Rossi"
    assert aggiornata.json()["use_biometric"] is False
    assert errore.status_code == 422
    assert edge.status_code == 200


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
    assert creata.json()["ore_arrotondate"] == 1.5
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

    assert upload.status_code == 200
    assert upload.json()["parse_success"] is True
    assert dettaglio.status_code == 200
    assert dettaglio.json()["pdf_nome"] == "marzo-2026.pdf"
    assert dettaglio.json()["lordo"] == 2400.0
    assert dettaglio.json()["netto"] == 1450.0
    assert dettaglio.json()["straordinari_ore"] == 12.5
    assert dettaglio.json()["trattenute_totali"] == 500.0


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
    sovrascritta = await client_api.post(
        "/api/buste-paga/upload",
        data={"force_overwrite": "true"},
        files={"file": ("marzo-2026-v2.pdf", BytesIO(b"%PDF-busta-3"), "application/pdf")},
    )
    dettaglio = await client_api.get("/api/buste-paga/2026/3")

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


async def test_api_dashboard_positivo_errore_ed_edge_vuoto(client_api):
    vuota = await client_api.get("/api/dashboard")
    await client_api.put("/api/settings", json={"ticket_valore": 8.0})
    await client_api.post(
        "/api/timbrature",
        json={"data": datetime.now().strftime("%Y-%m-%d"), "ora_entrata": "08:00", "ora_uscita": "17:00"},
    )
    piena = await client_api.get("/api/dashboard")
    errore = await client_api.post("/api/dashboard")

    assert vuota.status_code == 200
    assert vuota.json()["mese_corrente"]["ore_lavorate"] == 0
    assert piena.status_code == 200
    assert piena.json()["mese_corrente"]["ore_lavorate"] == 9.0
    assert piena.json()["mese_corrente"]["ticket_maturati"] == 1
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
