from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

import server
import sometime_parser
import zucchetti_parser

pytestmark = pytest.mark.unit


class PaginaFinta:
    def __init__(self, testo: str, tabelle=None):
        self._testo = testo
        self._tabelle = tabelle or []

    def extract_text(self) -> str:
        return self._testo

    def extract_tables(self):
        return self._tabelle


class PdfFinto:
    def __init__(self, pagine):
        self.pages = pagine

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def campione_sometime_di_esempio() -> str:
    return "\n".join(
        [
            "Dipendente: 1234 - Mario Rossi",
            "Azienda: Plastiape S.p.A.",
            "Periodo: 01/03/2026 - 31/03/2026",
            "Totale Giorni Lavorativi: 22",
            "Totale Ore Lavorate: 168:30",
            "Lun 04/03/2026 08:00 17:00 08:00 1 Tkt Mensa",
            "Mar 05/03/2026 08:15 17:30 08:45",
        ]
    )


def campione_zucchetti_di_esempio() -> str:
    return "\n".join(
        [
            "PERIODO DI RETRIBUZIONE: Marzo 2026",
            "MARIO ROSSI (RSSMRA80A01F205X)",
            "Matricola: 1234",
            "Data Assunzione: 11-07-2015",
            "Livello: 5",
            "PLASTIAPE S.P.A.",
            "PAGA BASE 2.026,64",
            "SCATTI N.4,80 66,88",
            "SUP.ASS. 469,41",
            "Pr.Inc. 56,90",
            "Ore ordinarie: 168,00",
            "Ore straordinarie: 12,50",
            "Straordinario 50% 12,50 ORE COMPETENZE: 290,50",
            "Contributo IVS TRATTENUTE: 120,15",
            "Ritenute IRPEF 340,10",
            "TOTALE COMPETENZE: 2.920,33",
            "TOTALE TRATTENUTE: 460,25",
            "Retribuzione utile T.F.R.: 2.920,33",
            "Quota T.F.R.: 216,32",
            "TFR a fondi: 100,00",
            "NETTO DEL MESE: 2.460,08",
        ]
    )


def test_unit_arrotonda_quarti_ora_sui_tagli_attesi():
    assert server.arrotonda_quarti_ora(0) == 0
    assert server.arrotonda_quarti_ora(7) == 15
    assert server.arrotonda_quarti_ora(16) == 30
    assert server.arrotonda_quarti_ora(31) == 45
    assert server.arrotonda_quarti_ora(46) == 60


def test_unit_calcola_ore_lavorate_normali_e_notturne():
    assert server.calcola_ore_lavorate("08:10", "17:20") == (9.17, 9.25)
    assert server.calcola_ore_lavorate("23:50", "01:10") == (1.33, 1.5)
    assert server.calcola_ore_lavorate("", "17:00") == (0.0, 0.0)


def test_unit_calcola_straordinario_ticket_e_reperibilita():
    feriale = server.calcola_straordinario(45, "giorno", "lun-ven")
    sabato = server.calcola_straordinario(50, "pomeriggio", "sabato")

    assert feriale == {"percentuale": 18.0, "importo_ora": 18.29, "bonus_intervento": 0}
    assert sabato == {"percentuale": 75.0, "importo_ora": 27.12, "bonus_intervento": 0}
    assert server.calcola_ticket(5.0) is True
    assert server.calcola_ticket(4.0, 1.0) is True
    assert server.calcola_ticket(4.5) is False
    assert server.calcola_reperibilita_passiva(2.5) == 10.0
    assert server.calcola_reperibilita_attiva(3) == 300.0


async def inserisci_assenza_di_test(
    *,
    tipo: str,
    data_inizio: str,
    data_fine: str,
    ore_totali: float = 0.0,
    note: str | None = None,
):
    await server._db.execute(
        """
        INSERT INTO assenze (id, tipo, data_inizio, data_fine, ore_totali, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        [str(uuid4()), tipo, data_inizio, data_fine, ore_totali, note, datetime.now(timezone.utc).isoformat()],
    )
    await server._db.commit()


def test_unit_calcola_ore_da_marcature_e_reperibilita():
    marcature = [
        {"tipo": "entrata", "ora": "08:00", "is_reperibilita": False},
        {"tipo": "uscita", "ora": "12:00", "is_reperibilita": False},
        {"tipo": "entrata", "ora": "13:00", "is_reperibilita": True},
        {"tipo": "uscita", "ora": "17:30", "is_reperibilita": True},
    ]

    assert server.calcola_ore_da_marcature(marcature) == 8.5
    assert server.calcola_ore_reperibilita(marcature) == 4.5


@pytest.mark.asyncio
async def test_unit_saldo_ferie_calcola_residuo_su_db_temporaneo(db_temporaneo):
    anno_corrente = datetime.now().year
    await inserisci_assenza_di_test(tipo="ferie", data_inizio=f"{anno_corrente}-01-10", data_fine=f"{anno_corrente}-01-10", ore_totali=8)
    await inserisci_assenza_di_test(tipo="ferie", data_inizio=f"{anno_corrente}-02-14", data_fine=f"{anno_corrente}-02-14", ore_totali=4)

    saldo = await server.get_saldo_ferie(anno_corrente)
    ore_maturate_attese = round(6.667 * (datetime.now().month if datetime.now().year == anno_corrente else 12), 2)

    assert saldo["anno"] == anno_corrente
    assert saldo["ore_godute"] == 12
    assert saldo["ore_maturate"] == ore_maturate_attese
    assert saldo["saldo_attuale"] == round(ore_maturate_attese - 12, 2)


@pytest.mark.asyncio
async def test_unit_comporto_somma_i_giorni_di_malattia(db_temporaneo):
    oggi = datetime.now().date()
    inizio_1 = (oggi - timedelta(days=20)).strftime("%Y-%m-%d")
    fine_1 = (oggi - timedelta(days=18)).strftime("%Y-%m-%d")
    inizio_2 = (oggi - timedelta(days=10)).strftime("%Y-%m-%d")
    fine_2 = (oggi - timedelta(days=6)).strftime("%Y-%m-%d")

    await inserisci_assenza_di_test(tipo="malattia", data_inizio=inizio_1, data_fine=fine_1)
    await inserisci_assenza_di_test(tipo="malattia", data_inizio=inizio_2, data_fine=fine_2)

    comporto = await server.get_comporto()

    assert comporto["giorni_malattia_3_anni"] == 8
    assert comporto["alert_attenzione"] is False
    assert comporto["giorni_disponibili"] == 172


@pytest.mark.asyncio
async def test_unit_confronto_timbrature_dashboard_e_statistiche_mensili(db_temporaneo):
    oggi = datetime.now()
    data_corrente = oggi.strftime("%Y-%m-%d")
    mese = oggi.month
    anno = oggi.year

    await server.create_timbratura(
        server.TimbraturaCreate(data=data_corrente, ora_entrata="08:00", ora_uscita="17:00", note="Turno regolare")
    )
    await server.import_timbrature_aziendali(
        [
            {
                "data": data_corrente,
                "ora_entrata": "08:00",
                "ora_uscita": "16:30",
                "ore_lavorate": 8.5,
                "descrizione": "Rilevazione SOMEtime",
                "mese_riferimento": mese,
                "anno_riferimento": anno,
            }
        ]
    )
    await server.create_busta_paga(server.BustaPagaCreate(mese=mese, anno=anno, lordo=2800.0, netto=2100.0))
    await server._db.execute(
        "INSERT INTO alerts VALUES (?,?,?,?,?,?,?)",
        ["alert-1", "info", "Promemoria", "Scadenza mensile", None, 0, datetime.now(timezone.utc).isoformat()],
    )
    await server._db.commit()

    confronto = await server.get_confronto_timbrature(mese, anno)
    dashboard = await server.get_dashboard()
    statistiche = await server.get_statistiche_mensili(anno)

    assert confronto["riepilogo"]["giorni_con_discrepanza"] == 1
    assert confronto["riepilogo"]["differenza_ore_totale"] == 0.5
    assert dashboard["mese_corrente"]["ore_lavorate"] == 9.0
    assert dashboard["mese_corrente"]["ticket_maturati"] == 1
    assert dashboard["alerts_non_letti"] == 1
    assert dashboard["ultima_busta"]["netto"] == 2100.0
    mese_corrente = next(item for item in statistiche if item["mese"] == mese)
    assert mese_corrente["ore_lavorate"] == 9.0
    assert mese_corrente["netto"] == 2100.0


def test_unit_parser_sometime_estraggono_i_campi_principali():
    testo = campione_sometime_di_esempio()
    timbrature = sometime_parser.parse_timbrature_tables([], testo, 2026, 3)
    totali = sometime_parser.extract_totali(testo)

    assert sometime_parser.extract_dipendente(testo) == "Mario Rossi\nAzienda"
    assert sometime_parser.extract_azienda(testo) == "Plastiape S.p.A."
    assert sometime_parser.extract_periodo(testo) == "01/03/2026 - 31/03/2026"
    assert timbrature[0]["data"] == "2026-03-04"
    assert timbrature[0]["descrizione"] == "Tkt Mensa"
    assert totali["giorni_lavorativi"] == 22
    assert totali["ore_lavorate"] == 168.5


def test_unit_parse_sometime_pdf_e_download_url(monkeypatch):
    testo = campione_sometime_di_esempio()

    monkeypatch.setattr(
        sometime_parser.pdfplumber,
        "open",
        lambda *_args, **_kwargs: PdfFinto([PaginaFinta(testo)]),
    )

    risultato = sometime_parser.parse_sometime_pdf(
        b"%PDF-finto",
        "CART_2026-03-01_2026-03-31_0001_Mario Rossi.pdf",
    )

    assert risultato["success"] is True
    assert risultato["mese"] == 3
    assert risultato["anno"] == 2026
    assert risultato["dipendente"] == "Mario Rossi\nAzienda"
    assert len(risultato["timbrature"]) == 2

    richieste_finte = SimpleNamespace(get=lambda url, timeout=30: SimpleNamespace(content=b"abc", raise_for_status=lambda: None))
    monkeypatch.setitem(sys.modules, "requests", richieste_finte)
    monkeypatch.setattr(
        sometime_parser,
        "parse_sometime_pdf",
        lambda contenuto, filename: {"success": True, "filename": filename, "size": len(contenuto)},
    )

    da_url = sometime_parser.parse_sometime_from_url("https://esempio.test/CART_2026-03-01_2026-03-31.pdf")
    assert da_url["success"] is True
    assert da_url["filename"] == "CART_2026-03-01_2026-03-31.pdf"
    assert da_url["size"] == 3


def test_unit_parser_zucchetti_estraggono_voci_retributive():
    testo = campione_zucchetti_di_esempio()

    assert zucchetti_parser.extract_periodo(testo) == {"mese": 3, "anno": 2026}
    assert zucchetti_parser.extract_dipendente(testo)["matricola"] == "1234"
    assert zucchetti_parser.extract_azienda(testo)["nome"] == "Plastiape S.p.A."
    assert zucchetti_parser.extract_elementi_retributivi(testo) == {
        "paga_base": 2026.64,
        "scatti_anzianita": 66.88,
        "superminimo": 469.41,
        "premio_incarico": 56.9,
    }
    assert zucchetti_parser.extract_ore(testo) == {"ordinarie": 168.0, "straordinarie": 12.5}
    assert zucchetti_parser.extract_straordinari(testo) == [{"percentuale": 50, "importo": 290.5}]
    assert {"tipo": "contributo_ivs", "importo": 120.15} in zucchetti_parser.extract_trattenute(testo)
    assert zucchetti_parser.extract_totali(testo) == {"competenze": 2920.33, "trattenute": 460.25}
    assert zucchetti_parser.extract_tfr(testo) == {"retribuzione_utile": 2920.33, "quota": 216.32, "a_fondi": 100.0}
    assert zucchetti_parser.extract_netto(testo) == 2460.08


def test_unit_parse_zucchetti_pdf_e_download_url(monkeypatch):
    testo = campione_zucchetti_di_esempio()

    monkeypatch.setattr(
        zucchetti_parser.pdfplumber,
        "open",
        lambda *_args, **_kwargs: PdfFinto([PaginaFinta(testo)]),
    )

    risultato = zucchetti_parser.parse_zucchetti_pdf(b"%PDF-finto", "busta-marzo.pdf")
    assert risultato["success"] is True
    assert risultato["mese"] == 3
    assert risultato["anno"] == 2026
    assert risultato["netto"] == 2460.08
    assert risultato["elementi_retributivi"]["paga_base"] == 2026.64

    richieste_finte = SimpleNamespace(get=lambda url, timeout=30: SimpleNamespace(content=b"xyz", raise_for_status=lambda: None))
    monkeypatch.setitem(sys.modules, "requests", richieste_finte)
    monkeypatch.setattr(
        zucchetti_parser,
        "parse_zucchetti_pdf",
        lambda contenuto, filename: {"success": True, "filename": filename, "size": len(contenuto)},
    )

    da_url = zucchetti_parser.parse_zucchetti_from_url("https://esempio.test/busta-marzo.pdf")
    assert da_url["success"] is True
    assert da_url["filename"] == "busta-marzo.pdf"
    assert da_url["size"] == 3


def test_unit_script_avvio_locale_esistono_e_puntano_ai_comandi_attesi():
    root_dir = Path(__file__).resolve().parents[1]
    backend_script = root_dir / "start-backend.ps1"
    frontend_script = root_dir / "start-frontend.ps1"
    app_script = root_dir / "start-app.ps1"

    for script in [backend_script, frontend_script, app_script]:
        assert script.exists(), f"Script mancante: {script.name}"

    backend_source = backend_script.read_text(encoding="utf-8")
    frontend_source = frontend_script.read_text(encoding="utf-8")
    app_source = app_script.read_text(encoding="utf-8")

    assert "uvicorn server:app" in backend_source
    assert "backend.log" in backend_source
    assert "[switch]$ForceRestart" in backend_source
    assert "[string]$BackendDir" in backend_source
    assert "[string]$RuntimeDir" in backend_source
    assert "taskkill" in backend_source
    assert "node_modules/expo/bin/cli" in frontend_source
    assert "start --web" in frontend_source
    assert "EXPO_PUBLIC_BACKEND_URL" in frontend_source
    assert "[switch]$ForceRestart" in frontend_source
    assert "[switch]$NoResponsively" in frontend_source
    assert "[string]$FrontendDir" in frontend_source
    assert "[string]$RuntimeDir" in frontend_source
    assert "RESPONSIVELY_APP_PATH" in frontend_source
    assert "responsively://" in frontend_source
    assert "ArgumentList @($Url)" in frontend_source
    assert "responsively.log" in frontend_source
    assert "responsively.err.log" in frontend_source
    assert "ELECTRON_ENABLE_LOGGING" in frontend_source
    assert "RedirectStandardError" in frontend_source
    assert "WindowStyle Hidden" in frontend_source
    assert "$env:BROWSER = 'none'" in frontend_source
    assert "taskkill" in frontend_source
    assert "start-backend.ps1" in app_source
    assert "start-frontend.ps1" in app_source
    assert "ForceRestart = $true" in app_source
    assert "[switch]$NoResponsively" in app_source
    assert "[string]$BackendDir" in app_source
    assert "[string]$FrontendDir" in app_source
    assert "[string]$RuntimeDir" in app_source
