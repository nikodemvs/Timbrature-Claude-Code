import uvicorn
import functools
import inspect
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form
import fastapi.routing as fastapi_routing
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import starlette._utils as starlette_utils
import starlette.routing as starlette_routing
import aiosqlite
try:
    from google import genai
    from google.genai import types as genai_types
except ImportError:
    genai = None  # type: ignore[assignment]
    genai_types = None  # type: ignore[assignment]
import os
import logging
import json
import hashlib
import hmac
import re
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta, timezone
import base64
import io
import pdfplumber
from sometime_parser import parse_sometime_pdf
from zucchetti_parser import parse_zucchetti_pdf

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

DB_PATH = ROOT_DIR / "bustapaga.db"

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

_db: aiosqlite.Connection = None
_gemini_client = None


def _is_async_callable_compat(obj: Any) -> bool:
    while isinstance(obj, functools.partial):
        obj = obj.func
    return inspect.iscoroutinefunction(obj) or (
        callable(obj) and inspect.iscoroutinefunction(obj.__call__)
    )


def _apply_fastapi_starlette_compat() -> None:
    # Python 3.14 depreca asyncio.iscoroutinefunction, ma le versioni correnti
    # di FastAPI/Starlette la richiamano ancora in alcuni path runtime.
    starlette_utils.is_async_callable = _is_async_callable_compat
    starlette_routing.is_async_callable = _is_async_callable_compat
    fastapi_routing.asyncio.iscoroutinefunction = inspect.iscoroutinefunction


_apply_fastapi_starlette_compat()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().isoformat()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _db, _gemini_client
    _db = await aiosqlite.connect(str(DB_PATH))
    _db.row_factory = aiosqlite.Row
    await _db.execute("PRAGMA journal_mode=WAL")
    await _db.execute("PRAGMA foreign_keys=ON")
    await init_db()
    api_key = os.environ.get("GEMINI_API_KEY")
    if genai and api_key:
        _gemini_client = genai.Client(api_key=api_key)
        logger.info("Gemini client inizializzato")
    elif not genai:
        logger.warning("google-genai non installato — chat AI disabilitata (server NAS)")
    else:
        logger.warning("GEMINI_API_KEY non configurata — chat disabilitata")
    try:
        yield
    finally:
        if _db:
            await _db.close()
            _db = None


app = FastAPI(title="BustaPaga API", version="1.0.0", lifespan=lifespan)
api_router = APIRouter(prefix="/api")

# ============== PYDANTIC MODELS ==============

class AppBaseModel(BaseModel):
    def dict(self, *args: Any, **kwargs: Any) -> Dict[str, Any]:
        return self.model_dump(*args, **kwargs)


class UserSettings(AppBaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nome: str = ""
    cognome: str = ""
    matricola: str = ""
    numero_badge: str = ""
    qualifica: str = ""
    livello: int = 0
    azienda: str = ""
    sede: str = ""
    ccnl: str = ""
    data_assunzione: str = ""
    orario_tipo: str = ""
    ore_giornaliere: int = 0
    paga_base: float = 0.0
    scatti_anzianita: float = 0.0
    superminimo: float = 0.0
    premio_incarico: float = 0.0
    divisore_orario: int = 0
    divisore_giornaliero: int = 0
    ticket_valore: float = 0.0
    pin_hash: Optional[str] = None
    use_biometric: bool = False
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

class UserSettingsUpdate(AppBaseModel):
    nome: Optional[str] = None
    cognome: Optional[str] = None
    matricola: Optional[str] = None
    numero_badge: Optional[str] = None
    qualifica: Optional[str] = None
    livello: Optional[int] = None
    azienda: Optional[str] = None
    sede: Optional[str] = None
    ccnl: Optional[str] = None
    data_assunzione: Optional[str] = None
    orario_tipo: Optional[str] = None
    ore_giornaliere: Optional[int] = None
    paga_base: Optional[float] = None
    scatti_anzianita: Optional[float] = None
    superminimo: Optional[float] = None
    premio_incarico: Optional[float] = None
    divisore_orario: Optional[int] = None
    divisore_giornaliero: Optional[int] = None
    ticket_valore: Optional[float] = None
    pin_hash: Optional[str] = None
    use_biometric: Optional[bool] = None

class Marcatura(AppBaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tipo: str
    ora: str
    is_reperibilita: bool = False
    note: Optional[str] = None
    created_at: datetime = Field(default_factory=_utc_now)

class Timbratura(AppBaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    data: str
    ora_entrata: Optional[str] = None
    ora_uscita: Optional[str] = None
    marcature: List[Dict[str, Any]] = []
    ore_lavorate: float = 0.0
    ore_arrotondate: float = 0.0
    ore_reperibilita: float = 0.0
    is_reperibilita_attiva: bool = False
    note: Optional[str] = None
    created_at: datetime = Field(default_factory=_utc_now)

class TimbraturaCreate(AppBaseModel):
    data: str
    ora_entrata: Optional[str] = None
    ora_uscita: Optional[str] = None
    is_reperibilita_attiva: bool = False
    note: Optional[str] = None

class TimbraturaUpdate(AppBaseModel):
    ora_entrata: Optional[str] = None
    ora_uscita: Optional[str] = None
    is_reperibilita_attiva: Optional[bool] = None
    note: Optional[str] = None

class MarcaturaCreate(AppBaseModel):
    tipo: str
    ora: Optional[str] = None
    is_reperibilita: bool = False
    note: Optional[str] = None

class Assenza(AppBaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tipo: str
    data_inizio: str
    data_fine: str
    ore_totali: float = 0.0
    note: Optional[str] = None
    certificato_base64: Optional[str] = None
    certificato_nome: Optional[str] = None
    created_at: datetime = Field(default_factory=_utc_now)

class AssenzaCreate(AppBaseModel):
    tipo: str
    data_inizio: str
    data_fine: str
    ore_totali: Optional[float] = None
    note: Optional[str] = None

class Reperibilita(AppBaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    data: str
    ora_inizio: str
    ora_fine: str
    tipo: str = "passiva"
    ore_totali: float = 0.0
    interventi: int = 0
    compenso_calcolato: float = 0.0
    note: Optional[str] = None
    created_at: datetime = Field(default_factory=_utc_now)

class ReperibilitaCreate(AppBaseModel):
    data: str
    ora_inizio: str
    ora_fine: str
    tipo: str = "passiva"
    interventi: int = 0
    note: Optional[str] = None

class BustaPaga(AppBaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    mese: int
    anno: int
    pdf_base64: Optional[str] = None
    pdf_nome: Optional[str] = None
    lordo: float = 0.0
    netto: float = 0.0
    straordinari_ore: float = 0.0
    straordinari_importo: float = 0.0
    trattenute_totali: float = 0.0
    netto_calcolato: float = 0.0
    differenza: float = 0.0
    has_discrepancy: bool = False
    note_confronto: Optional[str] = None
    created_at: datetime = Field(default_factory=_utc_now)

class BustaPagaCreate(AppBaseModel):
    mese: int
    anno: int
    lordo: Optional[float] = None
    netto: Optional[float] = None
    straordinari_ore: Optional[float] = None
    straordinari_importo: Optional[float] = None
    trattenute_totali: Optional[float] = None

class BustaPagaUpdate(AppBaseModel):
    lordo: Optional[float] = None
    netto: Optional[float] = None
    straordinari_ore: Optional[float] = None
    straordinari_importo: Optional[float] = None
    trattenute_totali: Optional[float] = None

class TimbraturaAziendale(AppBaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    data: str
    ora_entrata: Optional[str] = None
    ora_uscita: Optional[str] = None
    ore_lavorate: float = 0.0
    descrizione: Optional[str] = None
    fonte_pdf: Optional[str] = None
    mese_riferimento: int = 0
    anno_riferimento: int = 0
    created_at: datetime = Field(default_factory=_utc_now)

class ConfrontoTimbratura(AppBaseModel):
    data: str
    personale_entrata: Optional[str] = None
    personale_uscita: Optional[str] = None
    personale_ore: float = 0.0
    aziendale_entrata: Optional[str] = None
    aziendale_uscita: Optional[str] = None
    aziendale_ore: float = 0.0
    aziendale_descrizione: Optional[str] = None
    differenza_ore: float = 0.0
    has_discrepancy: bool = False
    note: Optional[str] = None

class Documento(AppBaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tipo: str
    titolo: str
    descrizione: Optional[str] = None
    sottotipo: Optional[str] = None
    file_base64: str
    file_nome: str
    file_tipo: str
    data_riferimento: Optional[str] = None
    created_at: datetime = Field(default_factory=_utc_now)

class ChatMessage(AppBaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: str
    content: str
    timestamp: datetime = Field(default_factory=_utc_now)

class ChatRequest(AppBaseModel):
    message: str
    session_id: Optional[str] = None


class CancellaDatiPersonaliRequest(AppBaseModel):
    conferma: bool = False


class EliminaAccountRequest(AppBaseModel):
    conferma: bool = False


class Alert(AppBaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tipo: str
    titolo: str
    messaggio: str
    data_scadenza: Optional[str] = None
    letto: bool = False
    created_at: datetime = Field(default_factory=_utc_now)


SETTINGS_COLUMN_ORDER = [
    "id",
    "nome",
    "cognome",
    "matricola",
    "numero_badge",
    "qualifica",
    "livello",
    "azienda",
    "sede",
    "ccnl",
    "data_assunzione",
    "orario_tipo",
    "ore_giornaliere",
    "paga_base",
    "scatti_anzianita",
    "superminimo",
    "premio_incarico",
    "divisore_orario",
    "divisore_giornaliero",
    "ticket_valore",
    "pin_hash",
    "use_biometric",
    "created_at",
    "updated_at",
]


def _settings_insert_values(settings: UserSettings) -> List[Any]:
    return [
        settings.id,
        settings.nome,
        settings.cognome,
        settings.matricola,
        settings.numero_badge,
        settings.qualifica,
        settings.livello,
        settings.azienda,
        settings.sede,
        settings.ccnl,
        settings.data_assunzione,
        settings.orario_tipo,
        settings.ore_giornaliere,
        settings.paga_base,
        settings.scatti_anzianita,
        settings.superminimo,
        settings.premio_incarico,
        settings.divisore_orario,
        settings.divisore_giornaliero,
        settings.ticket_valore,
        settings.pin_hash,
        int(settings.use_biometric),
        settings.created_at.isoformat(),
        settings.updated_at.isoformat(),
    ]


def _split_nome_completo(value: Optional[str]) -> tuple[str, str]:
    testo = " ".join(str(value or "").split()).strip()
    if not testo:
        return "", ""
    parti = testo.split()
    if len(parti) == 1:
        return parti[0], ""
    return parti[0], " ".join(parti[1:])


def _normalizza_testo_persona(value: Optional[str]) -> str:
    return " ".join(str(value or "").split()).strip().title()


def _split_cognome_nome_zucchetti(value: Optional[str]) -> tuple[str, str]:
    testo = " ".join(str(value or "").split()).strip()
    if not testo:
        return "", ""
    parti = testo.split()
    if len(parti) == 1:
        return _normalizza_testo_persona(parti[0]), ""
    cognome = _normalizza_testo_persona(" ".join(parti[:-1]))
    nome = _normalizza_testo_persona(parti[-1])
    return nome, cognome


def _estrai_identita_da_raw_zucchetti(raw_text: Optional[str]) -> Dict[str, str]:
    testo = " ".join(str(raw_text or "").split())
    if not testo:
        return {}

    match = re.search(
        r"\b\d{4,}\s+([A-ZÀ-ÖØ-Þ' ]{4,}?)\s+([A-Z0-9]{16})(?:\s+(\d+))?\b",
        testo,
    )
    if not match:
        return {}

    nome, cognome = _split_cognome_nome_zucchetti(match.group(1))
    matricola = (match.group(3) or "").strip()
    updates: Dict[str, str] = {}
    if nome:
        updates["nome"] = nome
    if cognome:
        updates["cognome"] = cognome
    if matricola:
        updates["matricola"] = matricola
    return updates


async def _ensure_settings_schema() -> None:
    cur = await _db.execute("PRAGMA table_info(settings)")
    colonne_presenti = {row["name"] for row in await cur.fetchall()}
    colonne_da_aggiungere = {
        "cognome": "TEXT DEFAULT ''",
        "matricola": "TEXT DEFAULT ''",
        "numero_badge": "TEXT DEFAULT ''",
    }

    for colonna, ddl in colonne_da_aggiungere.items():
        if colonna not in colonne_presenti:
            await _db.execute(f"ALTER TABLE settings ADD COLUMN {colonna} {ddl}")

    cur = await _db.execute("SELECT * FROM settings LIMIT 1")
    row = _row(await cur.fetchone())
    if not row:
        return

    aggiornamenti: Dict[str, Any] = {}
    nome_norm, cognome_norm = _split_nome_completo(row.get("nome"))
    if not (row.get("cognome") or "").strip() and nome_norm:
        aggiornamenti["nome"] = nome_norm
        aggiornamenti["cognome"] = cognome_norm

    if aggiornamenti:
        aggiornamenti["updated_at"] = _utc_now_iso()
        set_clause = ", ".join(f"{chiave} = ?" for chiave in aggiornamenti.keys())
        await _db.execute(
            f"UPDATE settings SET {set_clause} WHERE id = ?",
            list(aggiornamenti.values()) + [row["id"]],
        )

# ============== DB INIT ==============

async def init_db():
    await _db.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            id TEXT PRIMARY KEY,
            nome TEXT DEFAULT '',
            cognome TEXT DEFAULT '',
            matricola TEXT DEFAULT '',
            numero_badge TEXT DEFAULT '',
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
    """)
    await _ensure_settings_schema()
    await _db.execute("""
        CREATE TABLE IF NOT EXISTS timbrature (
            id TEXT PRIMARY KEY,
            data TEXT UNIQUE,
            ora_entrata TEXT,
            ora_uscita TEXT,
            marcature TEXT DEFAULT '[]',
            ore_lavorate REAL DEFAULT 0.0,
            ore_arrotondate REAL DEFAULT 0.0,
            ore_reperibilita REAL DEFAULT 0.0,
            is_reperibilita_attiva INTEGER DEFAULT 0,
            note TEXT,
            created_at TEXT
        )
    """)
    await _db.execute("""
        CREATE TABLE IF NOT EXISTS timbrature_aziendali (
            id TEXT PRIMARY KEY,
            data TEXT UNIQUE,
            ora_entrata TEXT,
            ora_uscita TEXT,
            ore_lavorate REAL DEFAULT 0.0,
            descrizione TEXT,
            fonte_pdf TEXT,
            mese_riferimento INTEGER DEFAULT 0,
            anno_riferimento INTEGER DEFAULT 0,
            created_at TEXT
        )
    """)
    await _db.execute("""
        CREATE TABLE IF NOT EXISTS assenze (
            id TEXT PRIMARY KEY,
            tipo TEXT,
            data_inizio TEXT,
            data_fine TEXT,
            ore_totali REAL DEFAULT 0.0,
            note TEXT,
            certificato_base64 TEXT,
            certificato_nome TEXT,
            created_at TEXT
        )
    """)
    await _db.execute("""
        CREATE TABLE IF NOT EXISTS reperibilita (
            id TEXT PRIMARY KEY,
            data TEXT,
            ora_inizio TEXT,
            ora_fine TEXT,
            tipo TEXT DEFAULT 'passiva',
            ore_totali REAL DEFAULT 0.0,
            interventi INTEGER DEFAULT 0,
            compenso_calcolato REAL DEFAULT 0.0,
            note TEXT,
            created_at TEXT
        )
    """)
    await _db.execute("""
        CREATE TABLE IF NOT EXISTS buste_paga (
            id TEXT PRIMARY KEY,
            mese INTEGER,
            anno INTEGER,
            pdf_base64 TEXT,
            pdf_nome TEXT,
            lordo REAL DEFAULT 0.0,
            netto REAL DEFAULT 0.0,
            straordinari_ore REAL DEFAULT 0.0,
            straordinari_importo REAL DEFAULT 0.0,
            trattenute_totali REAL DEFAULT 0.0,
            netto_calcolato REAL DEFAULT 0.0,
            differenza REAL DEFAULT 0.0,
            has_discrepancy INTEGER DEFAULT 0,
            note_confronto TEXT,
            created_at TEXT
        )
    """)
    await _db.execute("""
        CREATE TABLE IF NOT EXISTS documenti (
            id TEXT PRIMARY KEY,
            tipo TEXT,
            titolo TEXT,
            descrizione TEXT,
            sottotipo TEXT,
            file_base64 TEXT,
            file_nome TEXT,
            file_tipo TEXT,
            data_riferimento TEXT,
            created_at TEXT
        )
    """)
    await _db.execute("""
        CREATE TABLE IF NOT EXISTS chat_history (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            role TEXT,
            content TEXT,
            timestamp TEXT
        )
    """)
    await _db.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id TEXT PRIMARY KEY,
            tipo TEXT,
            titolo TEXT,
            messaggio TEXT,
            data_scadenza TEXT,
            letto INTEGER DEFAULT 0,
            created_at TEXT
        )
    """)
    await _ensure_column_exists("documenti", "sottotipo", "TEXT")
    await _ripara_documenti_archivio()
    await _sync_timbrature_aziendali_periodi()
    await _db.commit()


async def _ensure_column_exists(table_name: str, column_name: str, column_definition: str) -> None:
    cur = await _db.execute(f"PRAGMA table_info({table_name})")
    columns = {row["name"] for row in await cur.fetchall()}
    if column_name not in columns:
        await _db.execute(
            f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}"
        )


def _sembra_timestamp_iso(valore: Optional[str]) -> bool:
    if not valore or not isinstance(valore, str):
        return False
    try:
        datetime.fromisoformat(valore)
        return True
    except ValueError:
        return False


async def _ripara_documenti_archivio() -> int:
    cur = await _db.execute(
        """
        SELECT id, tipo, titolo, descrizione, file_base64, file_nome, file_tipo,
               data_riferimento, created_at, sottotipo
        FROM documenti
        """
    )
    righe = _rows(await cur.fetchall())
    riparati = 0
    for riga in righe:
        if _sembra_timestamp_iso(riga.get("created_at")) or not _sembra_timestamp_iso(riga.get("sottotipo")):
            continue
        await _db.execute(
            """
            UPDATE documenti
            SET file_base64 = ?,
                file_nome = ?,
                file_tipo = ?,
                data_riferimento = ?,
                created_at = ?,
                sottotipo = ?
            WHERE id = ?
            """,
            [
                riga.get("file_nome"),
                riga.get("file_tipo"),
                riga.get("data_riferimento"),
                riga.get("created_at"),
                riga.get("sottotipo"),
                riga.get("file_base64"),
                riga.get("id"),
            ],
        )
        riparati += 1
    if riparati:
        await _db.commit()
    return riparati


def _periodo_da_data_iso(data_iso: str) -> tuple[int, int]:
    data = datetime.strptime(data_iso, "%Y-%m-%d")
    return data.year, data.month


def _periodi_da_timbrature_parse(timbrature: List[Dict[str, Any]]) -> List[tuple[int, int]]:
    periodi = {
        _periodo_da_data_iso(t["data"])
        for t in timbrature
        if t.get("data")
    }
    return sorted(periodi)


def _dettaglio_duplicato(codice: str, messaggio: str, anno: int, mese: int) -> Dict[str, Any]:
    return {
        "code": codice,
        "message": messaggio,
        "anno": anno,
        "mese": mese,
    }


def _dettaglio_duplicato_documento(codice: str, messaggio: str, periodo: str) -> Dict[str, Any]:
    return {
        "code": codice,
        "message": messaggio,
        "periodo": periodo,
    }


def _risolvi_periodo_timbrature(
    parse_result: Dict[str, Any],
    mese_hint: Optional[int] = None,
    anno_hint: Optional[int] = None,
) -> tuple[int, int]:
    timbrature = parse_result.get("timbrature") or []
    periodi = _periodi_da_timbrature_parse(timbrature)

    if len(periodi) == 1:
        return periodi[0]

    parser_anno = parse_result.get("anno")
    parser_mese = parse_result.get("mese")
    if parser_anno and parser_mese and not periodi:
        return parser_anno, parser_mese

    if len(periodi) > 1:
        raise HTTPException(
            status_code=400,
            detail=(
                "Il report timbrature contiene giornate di più mesi. "
                "Carica un PDF riferito a un solo mese per permettere "
                "l'associazione automatica corretta."
            ),
        )

    if anno_hint and mese_hint:
        return anno_hint, mese_hint

    raise HTTPException(
        status_code=400,
        detail=(
            "Impossibile riconoscere automaticamente il mese del report timbrature. "
            "Carica un PDF compatibile con il dettaglio giornaliero del mese."
        ),
    )


def _risolvi_periodo_busta_paga(
    parse_result: Dict[str, Any],
    mese_hint: Optional[int] = None,
    anno_hint: Optional[int] = None,
) -> tuple[int, int]:
    parser_anno = parse_result.get("anno")
    parser_mese = parse_result.get("mese")
    if parser_anno and parser_mese:
        return parser_anno, parser_mese

    if anno_hint and mese_hint:
        return anno_hint, mese_hint

    raise HTTPException(
        status_code=400,
        detail=(
            "Impossibile riconoscere automaticamente il mese della busta paga. "
            "Carica un PDF Zucchetti che contenga il periodo di retribuzione."
        ),
    )


async def _sync_timbrature_aziendali_periodi() -> None:
    await _db.execute(
        """
        UPDATE timbrature_aziendali
        SET anno_riferimento = CAST(substr(data, 1, 4) AS INTEGER),
            mese_riferimento = CAST(substr(data, 6, 2) AS INTEGER)
        WHERE data IS NOT NULL
          AND (
            anno_riferimento IS NULL OR mese_riferimento IS NULL OR
            anno_riferimento != CAST(substr(data, 1, 4) AS INTEGER) OR
            mese_riferimento != CAST(substr(data, 6, 2) AS INTEGER)
          )
        """
    )


def _estrai_testo_pdf_breve(pdf_content: bytes, max_pages: int = 2) -> str:
    try:
        with pdfplumber.open(io.BytesIO(pdf_content)) as pdf:
            testi = []
            for page in pdf.pages[:max_pages]:
                testi.append(page.extract_text() or "")
            return "\n".join(testi)
    except Exception:
        return ""


def _classifica_busta_caricata(filename: str, parse_result: Dict[str, Any]) -> str:
    testo = f"{filename} {parse_result.get('raw_text', '')}".lower()
    if re.search(r"\bcud\b|certificazione\s+unica", testo):
        return "cud"
    if re.search(r"tredices|13(?:ma|a)\b|gratifica\s+natal|mensilit[àa]\s+aggiuntiva", testo):
        return "tredicesima"
    return "ordinaria"


def _titolo_documento_busta(anno: int, mese: int, sottotipo: str) -> str:
    base = f"{mese:02d}/{anno}"
    if sottotipo == "tredicesima":
        return f"Tredicesima {base}"
    return f"Busta paga {base}"


async def _salva_documento_archivio(
    *,
    tipo: str,
    titolo: str,
    descrizione: Optional[str],
    sottotipo: Optional[str],
    data_riferimento: Optional[str],
    file_nome: str,
    file_tipo: str,
    file_base64: str,
) -> Documento:
    doc = Documento(
        tipo=tipo,
        titolo=titolo,
        descrizione=descrizione,
        sottotipo=sottotipo,
        file_base64=file_base64,
        file_nome=file_nome,
        file_tipo=file_tipo,
        data_riferimento=data_riferimento,
    )
    await _db.execute(
        """
        INSERT INTO documenti (
            id, tipo, titolo, descrizione, file_base64, file_nome,
            file_tipo, data_riferimento, created_at, sottotipo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            doc.id,
            doc.tipo,
            doc.titolo,
            doc.descrizione,
            doc.file_base64,
            doc.file_nome,
            doc.file_tipo,
            doc.data_riferimento,
            doc.created_at.isoformat(),
            doc.sottotipo,
        ],
    )
    return doc


def _risolvi_anno_cud(pdf_content: bytes, filename: str) -> int:
    testo = f"{filename}\n{_estrai_testo_pdf_breve(pdf_content)}".lower()
    match = re.search(r"(?:certificazione\s+unica|cud)\s*(20\d{2})", testo)
    if match:
        return int(match.group(1))

    anni = [int(value) for value in re.findall(r"\b(20\d{2})\b", testo)]
    anni_validi = [anno for anno in anni if 2010 <= anno <= datetime.now().year + 1]
    if anni_validi:
        return max(anni_validi)

    raise HTTPException(
        status_code=400,
        detail=(
            "Impossibile riconoscere automaticamente l'anno del CUD. "
            "Carica un PDF o un nome file che riporti chiaramente l'anno della certificazione unica."
        ),
    )


async def _salva_upload_busta_paga(
    file: UploadFile,
    *,
    anno_hint: Optional[int] = None,
    mese_hint: Optional[int] = None,
    force_overwrite: bool = False,
) -> Dict[str, Any]:
    await _ripara_documenti_archivio()
    content = await file.read()
    timbrature_result = parse_sometime_pdf(content, file.filename)
    if timbrature_result["success"] and (timbrature_result.get("timbrature") or []):
        raise HTTPException(
            status_code=400,
            detail="Il file caricato sembra un report timbrature, non una busta paga Zucchetti. Carica il PDF mensile della busta paga.",
        )

    b64 = base64.b64encode(content).decode()
    parse_result = parse_zucchetti_pdf(content, file.filename)
    anno_rilevato, mese_rilevato = _risolvi_periodo_busta_paga(
        parse_result,
        mese_hint=mese_hint,
        anno_hint=anno_hint,
    )
    sottotipo = _classifica_busta_caricata(file.filename, parse_result)
    if sottotipo == "cud":
        raise HTTPException(
            status_code=400,
            detail=(
                "Il file caricato sembra un CUD o una Certificazione Unica. "
                "Usa la sezione CUD per archiviarlo correttamente."
            ),
        )

    periodo_riferimento = f"{anno_rilevato}-{mese_rilevato:02d}"
    cur = await _db.execute(
        """
        SELECT id FROM documenti
        WHERE tipo = 'busta_paga' AND data_riferimento = ? AND COALESCE(sottotipo, 'ordinaria') = ?
        """,
        [periodo_riferimento, sottotipo],
    )
    existing_document = await cur.fetchone()

    update_fields = {"pdf_base64": b64, "pdf_nome": file.filename}
    if parse_result["success"]:
        if parse_result.get("netto"):
            update_fields["netto"] = parse_result["netto"]
        ore = parse_result.get("ore", {})
        if ore.get("straordinarie"):
            update_fields["straordinari_ore"] = ore["straordinarie"]
        totali = parse_result.get("totali", {})
        if totali.get("competenze"):
            update_fields["lordo"] = totali["competenze"]
        if totali.get("trattenute"):
            update_fields["trattenute_totali"] = totali["trattenute"]
        await _aggiorna_settings_da_zucchetti(parse_result)

    if sottotipo == "tredicesima":
        if existing_document and not force_overwrite:
            raise HTTPException(
                status_code=409,
                detail=_dettaglio_duplicato(
                    "duplicato_tredicesima",
                    (
                        "Esiste già una tredicesima archiviata per questo mese. "
                        "Puoi annullare il caricamento oppure sovrascrivere il file esistente."
                    ),
                    anno_rilevato,
                    mese_rilevato,
                ),
            )

        if existing_document and force_overwrite:
            await _db.execute("DELETE FROM documenti WHERE id = ?", [existing_document["id"]])

        documento = await _salva_documento_archivio(
            tipo="busta_paga",
            titolo=_titolo_documento_busta(anno_rilevato, mese_rilevato, sottotipo),
            descrizione="Mensilità aggiuntiva archiviata separatamente dal cedolino ordinario.",
            sottotipo=sottotipo,
            data_riferimento=periodo_riferimento,
            file_nome=file.filename,
            file_tipo="pdf",
            file_base64=b64,
        )
        await _db.commit()
        return {
            "busta": None,
            "documento": documento.model_dump(),
            "parse_success": parse_result["success"],
            "parsed_data": {k: v for k, v in parse_result.items()
                            if k not in ["raw_text", "success", "errors", "filename"]},
            "mese": mese_rilevato,
            "anno": anno_rilevato,
            "sottotipo": sottotipo,
        }

    cur = await _db.execute(
        "SELECT id FROM buste_paga WHERE anno = ? AND mese = ?",
        [anno_rilevato, mese_rilevato],
    )
    existing = await cur.fetchone()
    if (existing or existing_document) and not force_overwrite:
        raise HTTPException(
            status_code=409,
            detail=_dettaglio_duplicato(
                "duplicato_busta_paga",
                (
                    "Esiste già una busta paga archiviata per questo mese. "
                    "Puoi annullare il caricamento oppure sovrascrivere il file esistente."
                ),
                anno_rilevato,
                mese_rilevato,
            ),
        )

    if existing_document and force_overwrite:
        await _db.execute("DELETE FROM documenti WHERE id = ?", [existing_document["id"]])

    if existing:
        set_clause = ", ".join(f"{k} = ?" for k in update_fields.keys())
        await _db.execute(
            f"UPDATE buste_paga SET {set_clause} WHERE anno = ? AND mese = ?",
            list(update_fields.values()) + [anno_rilevato, mese_rilevato]
        )
    else:
        new_id = str(uuid.uuid4())
        b = BustaPaga(id=new_id, anno=anno_rilevato, mese=mese_rilevato, **{
            k: v for k, v in update_fields.items()
            if k in ['pdf_base64', 'pdf_nome', 'netto', 'lordo',
                     'straordinari_ore', 'trattenute_totali']
        })
        await _db.execute(
            "INSERT INTO buste_paga VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [b.id, b.mese, b.anno, b.pdf_base64, b.pdf_nome,
             b.lordo, b.netto, b.straordinari_ore, b.straordinari_importo,
             b.trattenute_totali, b.netto_calcolato, b.differenza,
             int(b.has_discrepancy), b.note_confronto, b.created_at.isoformat()]
        )

    documento = await _salva_documento_archivio(
        tipo="busta_paga",
        titolo=_titolo_documento_busta(anno_rilevato, mese_rilevato, sottotipo),
        descrizione="Cedolino ordinario mensile.",
        sottotipo=sottotipo,
        data_riferimento=periodo_riferimento,
        file_nome=file.filename,
        file_tipo="pdf",
        file_base64=b64,
    )
    await _db.commit()
    cur = await _db.execute(
        "SELECT * FROM buste_paga WHERE anno = ? AND mese = ?",
        [anno_rilevato, mese_rilevato]
    )
    row = _busta_from_row(_row(await cur.fetchone()))
    return {
        "busta": BustaPaga(**row).model_dump(),
        "documento": documento.model_dump(),
        "parse_success": parse_result["success"],
        "parsed_data": {k: v for k, v in parse_result.items()
                        if k not in ["raw_text", "success", "errors", "filename"]},
        "mese": mese_rilevato,
        "anno": anno_rilevato,
        "sottotipo": sottotipo,
    }

# ============== DB HELPERS ==============

def _row(row) -> Optional[dict]:
    return dict(row) if row else None

def _rows(rows) -> List[dict]:
    return [dict(r) for r in rows]

def _parse_json(val, default=None):
    if val is None:
        return default if default is not None else []
    if isinstance(val, (list, dict)):
        return val
    try:
        return json.loads(val)
    except Exception:
        return default if default is not None else []

def _timbratura_from_row(row: dict) -> dict:
    if not row:
        return None
    row['marcature'] = _parse_json(row.get('marcature'), [])
    row['is_reperibilita_attiva'] = bool(row.get('is_reperibilita_attiva', 0))
    return row

def _busta_from_row(row: dict) -> dict:
    if not row:
        return None
    row['has_discrepancy'] = bool(row.get('has_discrepancy', 0))
    for f in ['lordo', 'netto', 'straordinari_ore', 'straordinari_importo',
              'trattenute_totali', 'netto_calcolato', 'differenza']:
        if row.get(f) is None:
            row[f] = 0.0
    return row

def _settings_from_row(row: dict) -> dict:
    if not row:
        return None
    row['use_biometric'] = bool(row.get('use_biometric', 1))
    return row

def _public_settings_from_row(row: dict) -> dict:
    settings = _settings_from_row(row)
    if not settings:
        return None
    safe = dict(settings)
    safe['pin_hash'] = None
    return safe


def _normalizza_data_assunzione(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    testo = str(value).strip()
    for formato_input, formato_output in (
        ("%d-%m-%Y", "%Y-%m-%d"),
        ("%d/%m/%Y", "%Y-%m-%d"),
        ("%Y-%m-%d", "%Y-%m-%d"),
    ):
        try:
            return datetime.strptime(testo, formato_input).strftime(formato_output)
        except ValueError:
            continue
    return None


def _estrai_aggiornamenti_settings_da_zucchetti(parse_result: Dict[str, Any]) -> Dict[str, Any]:
    if not parse_result.get("success"):
        return {}

    updates: Dict[str, Any] = {}
    dipendente = parse_result.get("dipendente") or {}
    azienda = parse_result.get("azienda") or {}
    elementi_retributivi = parse_result.get("elementi_retributivi") or {}

    nome_completo = dipendente.get("nome") or parse_result.get("nome")
    cognome = dipendente.get("cognome") or parse_result.get("cognome")
    if isinstance(nome_completo, str) and nome_completo.strip():
        nome_norm, cognome_norm = _split_nome_completo(nome_completo)
        if nome_norm:
            updates["nome"] = nome_norm
        if isinstance(cognome, str) and cognome.strip():
            updates["cognome"] = _normalizza_testo_persona(cognome)
        elif cognome_norm:
            updates["cognome"] = cognome_norm

    matricola = dipendente.get("matricola") or parse_result.get("matricola")
    if isinstance(matricola, str) and matricola.strip():
        updates["matricola"] = matricola.strip()

    if not (updates.get("nome") or updates.get("cognome")):
        updates.update(_estrai_identita_da_raw_zucchetti(parse_result.get("raw_text")))

    livello = dipendente.get("livello")
    if isinstance(livello, int) and livello > 0:
        updates["livello"] = livello

    data_assunzione = _normalizza_data_assunzione(dipendente.get("data_assunzione"))
    if data_assunzione:
        updates["data_assunzione"] = data_assunzione

    nome_azienda = " ".join(str(azienda.get("nome", "")).split())
    if nome_azienda:
        updates["azienda"] = nome_azienda

    for campo in ["paga_base", "scatti_anzianita", "superminimo", "premio_incarico"]:
        valore = elementi_retributivi.get(campo)
        if isinstance(valore, (int, float)):
            updates[campo] = float(valore)

    return updates


async def _aggiorna_settings_da_zucchetti(parse_result: Dict[str, Any]) -> None:
    updates = _estrai_aggiornamenti_settings_da_zucchetti(parse_result)
    if not updates:
        return

    updates["updated_at"] = _utc_now_iso()
    cur = await _db.execute("SELECT * FROM settings LIMIT 1")
    existing = _row(await cur.fetchone())

    if existing:
        set_clause = ", ".join(f"{chiave} = ?" for chiave in updates.keys())
        await _db.execute(
            f"UPDATE settings SET {set_clause} WHERE id = ?",
            list(updates.values()) + [existing["id"]],
        )
        return

    default_settings = UserSettings()
    for chiave, valore in updates.items():
        if chiave == "updated_at":
            continue
        setattr(default_settings, chiave, valore)
    default_settings.updated_at = _utc_now()
    await _db.execute(
        f"INSERT INTO settings ({', '.join(SETTINGS_COLUMN_ORDER)}) VALUES ({', '.join(['?'] * len(SETTINGS_COLUMN_ORDER))})",
        _settings_insert_values(default_settings),
    )


async def _ripara_identita_account_da_ultima_busta() -> bool:
    cur = await _db.execute("SELECT * FROM settings LIMIT 1")
    settings_row = _row(await cur.fetchone())
    if not settings_row:
        return False

    nome_presente = (settings_row.get("nome") or "").strip()
    cognome_presente = (settings_row.get("cognome") or "").strip()
    matricola_presente = (settings_row.get("matricola") or "").strip()
    if nome_presente and cognome_presente and matricola_presente:
        return False

    cur = await _db.execute(
        """
        SELECT pdf_base64, pdf_nome
        FROM buste_paga
        WHERE pdf_base64 IS NOT NULL AND pdf_base64 != ''
        ORDER BY created_at DESC
        LIMIT 1
        """
    )
    ultima_busta = _row(await cur.fetchone())
    if not ultima_busta:
        return False

    try:
        contenuto = base64.b64decode(ultima_busta["pdf_base64"])
    except Exception:
        return False

    parse_result = parse_zucchetti_pdf(contenuto, ultima_busta.get("pdf_nome") or "busta-paga.pdf")
    updates = _estrai_aggiornamenti_settings_da_zucchetti(parse_result)
    if not (updates.get("nome") or updates.get("cognome") or updates.get("matricola")):
        return False

    await _aggiorna_settings_da_zucchetti(parse_result)
    await _db.commit()
    return True


def _settings_personali_vuote() -> UserSettings:
    return UserSettings()


async def _scrivi_settings_neutre() -> None:
    settings_vuote = _settings_personali_vuote().model_dump()
    cur = await _db.execute("SELECT id FROM settings LIMIT 1")
    settings_esistenti = await cur.fetchone()
    if settings_esistenti:
        await _db.execute(
            """
            UPDATE settings
            SET nome = ?,
                cognome = ?,
                matricola = ?,
                numero_badge = ?,
                qualifica = ?,
                livello = ?,
                azienda = ?,
                sede = ?,
                ccnl = ?,
                data_assunzione = ?,
                orario_tipo = ?,
                ore_giornaliere = ?,
                paga_base = ?,
                scatti_anzianita = ?,
                superminimo = ?,
                premio_incarico = ?,
                divisore_orario = ?,
                divisore_giornaliero = ?,
                ticket_valore = ?,
                pin_hash = ?,
                use_biometric = ?,
                created_at = ?,
                updated_at = ?
            WHERE id = ?
            """,
            [
                settings_vuote["nome"],
                settings_vuote["cognome"],
                settings_vuote["matricola"],
                settings_vuote["numero_badge"],
                settings_vuote["qualifica"],
                settings_vuote["livello"],
                settings_vuote["azienda"],
                settings_vuote["sede"],
                settings_vuote["ccnl"],
                settings_vuote["data_assunzione"],
                settings_vuote["orario_tipo"],
                settings_vuote["ore_giornaliere"],
                settings_vuote["paga_base"],
                settings_vuote["scatti_anzianita"],
                settings_vuote["superminimo"],
                settings_vuote["premio_incarico"],
                settings_vuote["divisore_orario"],
                settings_vuote["divisore_giornaliero"],
                settings_vuote["ticket_valore"],
                settings_vuote["pin_hash"],
                int(settings_vuote["use_biometric"]),
                settings_vuote["created_at"].isoformat(),
                settings_vuote["updated_at"].isoformat(),
                settings_esistenti["id"],
            ],
        )
    else:
        await _db.execute(
            f"INSERT INTO settings ({', '.join(SETTINGS_COLUMN_ORDER)}) VALUES ({', '.join(['?'] * len(SETTINGS_COLUMN_ORDER))})",
            _settings_insert_values(_settings_personali_vuote()),
        )


async def _azzera_identita_account_e_sicurezza() -> None:
    aggiornamenti = {
        "nome": "",
        "cognome": "",
        "matricola": "",
        "numero_badge": "",
        "pin_hash": None,
        "use_biometric": 0,
        "updated_at": _utc_now_iso(),
    }
    cur = await _db.execute("SELECT id FROM settings LIMIT 1")
    settings_esistenti = await cur.fetchone()
    if settings_esistenti:
        await _db.execute(
            """
            UPDATE settings
            SET nome = ?,
                cognome = ?,
                matricola = ?,
                numero_badge = ?,
                pin_hash = ?,
                use_biometric = ?,
                updated_at = ?
            WHERE id = ?
            """,
            [
                aggiornamenti["nome"],
                aggiornamenti["cognome"],
                aggiornamenti["matricola"],
                aggiornamenti["numero_badge"],
                aggiornamenti["pin_hash"],
                aggiornamenti["use_biometric"],
                aggiornamenti["updated_at"],
                settings_esistenti["id"],
            ],
        )
        return

    settings_vuote = _settings_personali_vuote().model_dump()
    await _db.execute(
        f"INSERT INTO settings ({', '.join(SETTINGS_COLUMN_ORDER)}) VALUES ({', '.join(['?'] * len(SETTINGS_COLUMN_ORDER))})",
        _settings_insert_values(_settings_personali_vuote()),
    )


def _calcola_metadati_stima(settings: Dict[str, Any], timbrature: List[Dict[str, Any]]) -> Dict[str, Any]:
    ha_dati_contrattuali = any(
        (settings.get(campo) or 0) > 0
        for campo in [
            "paga_base",
            "scatti_anzianita",
            "superminimo",
            "premio_incarico",
            "ticket_valore",
        ]
    )
    ha_dati_operativi_mese = len(timbrature) > 0

    if ha_dati_contrattuali and ha_dati_operativi_mese:
        sorgente = "dati_contrattuali_e_operativi_mese"
        stato = "Stima basata su dati contrattuali e timbrature del mese."
    elif ha_dati_contrattuali:
        sorgente = "solo_dati_contrattuali"
        stato = "Stima basata solo sui dati contrattuali."
    elif ha_dati_operativi_mese:
        sorgente = "solo_dati_operativi"
        stato = "Dati operativi presenti, ma dati contrattuali insufficienti per una stima affidabile."
    else:
        sorgente = "nessun_dato_utile"
        stato = "Stima non disponibile: mancano dati contrattuali e operativi del mese."

    return {
        "ha_dati_contrattuali": ha_dati_contrattuali,
        "ha_dati_operativi_mese": ha_dati_operativi_mese,
        "sorgente": sorgente,
        "stato": stato,
    }


async def _svuota_dati_operativi_personali() -> Dict[str, int]:
    tabelle_da_svuotare = [
        "timbrature",
        "timbrature_aziendali",
        "buste_paga",
        "documenti",
    ]
    cancellati: Dict[str, int] = {}
    for tabella in tabelle_da_svuotare:
        cur = await _db.execute(f"SELECT COUNT(1) AS totale FROM {tabella}")
        riga = await cur.fetchone()
        cancellati[tabella] = int(riga["totale"]) if riga else 0
        await _db.execute(f"DELETE FROM {tabella}")
    await _db.commit()
    return cancellati


def _alert_from_row(row: dict) -> dict:
    if not row:
        return None
    row['letto'] = bool(row.get('letto', 0))
    return row

# ============== HELPER FUNCTIONS ==============

def _safe_busta_paga_data(busta_data):
    if not busta_data:
        return None
    safe = dict(busta_data)
    for f in ['lordo', 'netto', 'straordinari_ore', 'straordinari_importo',
              'trattenute_totali', 'netto_calcolato', 'differenza']:
        if safe.get(f) is None:
            safe[f] = 0.0
    return safe

def _safe_busta_paga(busta_data):
    if not busta_data:
        return None
    safe = _safe_busta_paga_data(busta_data)
    return BustaPaga(**safe).model_dump()

def _hash_pin(pin: str) -> str:
    return hashlib.sha256(pin.encode('utf-8')).hexdigest()

def _looks_like_sha256(value: str) -> bool:
    if not isinstance(value, str) or len(value) != 64:
        return False
    return all(ch in "0123456789abcdef" for ch in value.lower())

def _pin_matches(stored_pin: str, provided_pin: str) -> bool:
    if not stored_pin:
        return False
    if _looks_like_sha256(stored_pin):
        return hmac.compare_digest(stored_pin, _hash_pin(provided_pin))
    return hmac.compare_digest(stored_pin, provided_pin)

def _build_manual_marcature(
    ora_entrata: Optional[str],
    ora_uscita: Optional[str],
    is_reperibilita: bool = False,
    created_at: Optional[str] = None
) -> List[Dict[str, Any]]:
    timestamp = created_at or _utc_now_iso()
    marcature: List[Dict[str, Any]] = []
    if ora_entrata:
        marcature.append({
            "id": str(uuid.uuid4()),
            "tipo": "entrata",
            "ora": ora_entrata,
            "is_reperibilita": is_reperibilita,
            "created_at": timestamp,
        })
    if ora_uscita:
        marcature.append({
            "id": str(uuid.uuid4()),
            "tipo": "uscita",
            "ora": ora_uscita,
            "is_reperibilita": is_reperibilita,
            "created_at": timestamp,
        })
    return marcature

def arrotonda_quarti_ora(minuti: int) -> int:
    if minuti <= 0:
        return 0
    return ((minuti + 14) // 15) * 15

def arrotonda_quarti_ora_difetto(minuti: int) -> int:
    if minuti <= 0:
        return 0
    return (minuti // 15) * 15

def calcola_ore_lavorate(ora_entrata: str, ora_uscita: str) -> tuple:
    if not ora_entrata or not ora_uscita:
        return 0.0, 0.0
    try:
        h1, m1 = map(int, ora_entrata.split(':'))
        h2, m2 = map(int, ora_uscita.split(':'))
        minuti_entrata = (h1 * 60) + m1
        minuti_uscita = (h2 * 60) + m2

        if minuti_uscita < minuti_entrata:
            minuti_uscita += 24 * 60

        minuti_totali = minuti_uscita - minuti_entrata
        ore_effettive = minuti_totali / 60

        # Regola aziendale: entrata per eccesso al quarto, uscita per difetto al quarto.
        minuti_entrata_arrotondati = ((minuti_entrata + 14) // 15) * 15
        minuti_uscita_arrotondati = (minuti_uscita // 15) * 15
        minuti_totali_arrotondati = max(0, minuti_uscita_arrotondati - minuti_entrata_arrotondati)
        ore_arrotondate = minuti_totali_arrotondati / 60
        return round(ore_effettive, 2), round(ore_arrotondate, 2)
    except Exception:
        return 0.0, 0.0

def calcola_straordinario(ore_settimanali: float, fascia_oraria: str, giorno: str) -> dict:
    quota_oraria = 15.50
    fascia_straordinario = "41-48" if ore_settimanali <= 48 else ">48"
    maggiorazioni = {
        "lun-ven_giorno": {"41-48": 0.18, ">48": 0.25},
        "lun-ven_notte": {"41-48": 0.35, ">48": 0.75},
        "sabato_mattina": {"41-48": 0.18, ">48": 0.25},
        "sabato_pomeriggio": {"41-48": 0.50, ">48": 0.75},
        "domenica": {"41-48": 0.50, ">48": 0.75},
    }
    chiave = f"{giorno}_{fascia_oraria}"
    percentuale = maggiorazioni.get(chiave, {}).get(fascia_straordinario, 0.18)
    importo_ora = quota_oraria * (1 + percentuale)
    bonus_intervento = 100 if giorno in ["sabato_pomeriggio", "domenica"] else 0
    return {
        "percentuale": percentuale * 100,
        "importo_ora": round(importo_ora, 2),
        "bonus_intervento": bonus_intervento
    }

def calcola_ticket(ore_lavorate: float, ore_giustificate: float = 0) -> bool:
    return (ore_lavorate + ore_giustificate) >= 5

def calcola_reperibilita_passiva(ore: float) -> float:
    return round(ore * 4.0, 2)

def calcola_reperibilita_attiva(interventi: int) -> float:
    return interventi * 100.0

def calcola_ore_da_marcature(marcature: List[Dict]) -> float:
    sorted_m = sorted(marcature, key=lambda x: x["ora"])
    ore_totali = 0.0
    entrata_corrente = None
    for m in sorted_m:
        if m["tipo"] == "entrata":
            entrata_corrente = m["ora"]
        elif m["tipo"] == "uscita" and entrata_corrente:
            ore, _ = calcola_ore_lavorate(entrata_corrente, m["ora"])
            ore_totali += ore
            entrata_corrente = None
    return ore_totali

def calcola_ore_arrotondate_da_marcature(marcature: List[Dict]) -> float:
    sorted_m = sorted(marcature, key=lambda x: x["ora"])
    ore_totali = 0.0
    entrata_corrente = None
    for m in sorted_m:
        if m["tipo"] == "entrata":
            entrata_corrente = m["ora"]
        elif m["tipo"] == "uscita" and entrata_corrente:
            _, ore_arrotondate = calcola_ore_lavorate(entrata_corrente, m["ora"])
            ore_totali += ore_arrotondate
            entrata_corrente = None
    return ore_totali

def calcola_ore_reperibilita(marcature: List[Dict]) -> float:
    sorted_m = sorted([m for m in marcature if m.get("is_reperibilita")], key=lambda x: x["ora"])
    ore_totali = 0.0
    entrata_corrente = None
    for m in sorted_m:
        if m["tipo"] == "entrata":
            entrata_corrente = m["ora"]
        elif m["tipo"] == "uscita" and entrata_corrente:
            ore, _ = calcola_ore_lavorate(entrata_corrente, m["ora"])
            ore_totali += ore
            entrata_corrente = None
    return ore_totali

# ============== API ROUTES ==============

# --- Settings ---

@api_router.get("/settings", response_model=UserSettings)
async def get_settings():
    await _ripara_identita_account_da_ultima_busta()
    cur = await _db.execute("SELECT * FROM settings LIMIT 1")
    row = _row(await cur.fetchone())
    if not row:
        default = UserSettings()
        await _db.execute(
            f"INSERT INTO settings ({', '.join(SETTINGS_COLUMN_ORDER)}) VALUES ({', '.join(['?'] * len(SETTINGS_COLUMN_ORDER))})",
            _settings_insert_values(default),
        )
        await _db.commit()
        return UserSettings(**_public_settings_from_row(default.model_dump()))
    return UserSettings(**_public_settings_from_row(row))

@api_router.put("/settings", response_model=UserSettings)
async def update_settings(updates: UserSettingsUpdate):
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if 'pin_hash' in update_data:
        pin_value = (update_data['pin_hash'] or '').strip()
        update_data['pin_hash'] = _hash_pin(pin_value) if pin_value else None
    if 'use_biometric' in update_data:
        update_data['use_biometric'] = int(update_data['use_biometric'])
    update_data['updated_at'] = _utc_now_iso()

    cur = await _db.execute("SELECT id FROM settings LIMIT 1")
    existing = await cur.fetchone()

    if existing:
        set_clause = ", ".join(f"{k} = ?" for k in update_data.keys())
        await _db.execute(
            f"UPDATE settings SET {set_clause} WHERE id = ?",
            list(update_data.values()) + [existing['id']]
        )
        await _db.commit()
    else:
        default = UserSettings(**update_data)
        await _db.execute(
            f"INSERT INTO settings ({', '.join(SETTINGS_COLUMN_ORDER)}) VALUES ({', '.join(['?'] * len(SETTINGS_COLUMN_ORDER))})",
            _settings_insert_values(default),
        )
        await _db.commit()

    cur = await _db.execute("SELECT * FROM settings LIMIT 1")
    row = _row(await cur.fetchone())
    return UserSettings(**_public_settings_from_row(row))

@api_router.post("/settings/verify-pin")
async def verify_pin(pin: str):
    cur = await _db.execute("SELECT pin_hash FROM settings LIMIT 1")
    row = await cur.fetchone()
    if not row or not row['pin_hash']:
        return {"valid": True, "message": "Nessun PIN configurato"}
    if _pin_matches(row['pin_hash'], pin):
        return {"valid": True}
    return {"valid": False, "message": "PIN non valido"}


@api_router.post("/dati-personali/cancella")
async def cancella_dati_personali(richiesta: CancellaDatiPersonaliRequest):
    if not richiesta.conferma:
        raise HTTPException(
            status_code=400,
            detail="Conferma richiesta per cancellare i dati personali operativi.",
        )

    cancellati = await _svuota_dati_operativi_personali()
    return {
        "message": "Dati personali operativi cancellati.",
        "cancellati": cancellati,
    }


@api_router.post("/account/elimina")
async def elimina_account(richiesta: EliminaAccountRequest):
    if not richiesta.conferma:
        raise HTTPException(
            status_code=400,
            detail="Conferma richiesta per eliminare l'account.",
        )

    await _azzera_identita_account_e_sicurezza()
    await _db.commit()
    return {
        "message": "Account eliminato e dati di accesso azzerati.",
        "dati_contrattuali_conservati": True,
        "settings_reset": True,
    }

# --- Timbrature ---

@api_router.get("/timbrature", response_model=List[Timbratura])
async def get_timbrature(
    mese: Optional[int] = None,
    anno: Optional[int] = None,
    data_inizio: Optional[str] = None,
    data_fine: Optional[str] = None
):
    if data_inizio and data_fine:
        cur = await _db.execute(
            "SELECT * FROM timbrature WHERE data >= ? AND data <= ? ORDER BY data DESC",
            [data_inizio, data_fine]
        )
    elif mese and anno:
        start = f"{anno}-{mese:02d}-01"
        end = f"{anno + 1}-01-01" if mese == 12 else f"{anno}-{mese + 1:02d}-01"
        cur = await _db.execute(
            "SELECT * FROM timbrature WHERE data >= ? AND data < ? ORDER BY data DESC",
            [start, end]
        )
    else:
        cur = await _db.execute("SELECT * FROM timbrature ORDER BY data DESC")
    rows = _rows(await cur.fetchall())
    return [Timbratura(**_timbratura_from_row(r)) for r in rows]

@api_router.get("/timbrature/settimana/{data}")
async def get_settimana(data: str):
    try:
        dt = datetime.strptime(data, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail="Formato data non valido. Usa YYYY-MM-DD"
        ) from exc
    monday = dt - timedelta(days=dt.weekday())
    sunday = monday + timedelta(days=6)
    start = monday.strftime("%Y-%m-%d")
    end = sunday.strftime("%Y-%m-%d")
    cur = await _db.execute(
        "SELECT * FROM timbrature WHERE data >= ? AND data <= ? ORDER BY data ASC",
        [start, end]
    )
    timbrature = _rows(await cur.fetchall())
    ore_totali = sum(t.get("ore_arrotondate", 0) for t in timbrature)
    ore_ordinarie = min(ore_totali, 40)
    ore_straordinarie = max(0, ore_totali - 40)
    return {
        "settimana_inizio": start,
        "settimana_fine": end,
        "timbrature": [Timbratura(**_timbratura_from_row(t)) for t in timbrature],
        "ore_totali": round(ore_totali, 2),
        "ore_ordinarie": round(ore_ordinarie, 2),
        "ore_straordinarie": round(ore_straordinarie, 2),
        "giorni_lavorati": len([t for t in timbrature if t.get("ore_arrotondate", 0) > 0])
    }

@api_router.get("/timbrature/{data}")
async def get_timbratura_by_date(data: str):
    cur = await _db.execute("SELECT * FROM timbrature WHERE data = ?", [data])
    row = _row(await cur.fetchone())
    if not row:
        raise HTTPException(status_code=404, detail="Timbratura non trovata")
    return Timbratura(**_timbratura_from_row(row))

@api_router.post("/timbrature", response_model=Timbratura)
async def create_timbratura(input: TimbraturaCreate):
    cur = await _db.execute("SELECT id FROM timbrature WHERE data = ?", [input.data])
    if await cur.fetchone():
        raise HTTPException(status_code=400, detail="Timbratura già esistente per questa data")
    ore_lavorate, ore_arrotondate = calcola_ore_lavorate(input.ora_entrata, input.ora_uscita)
    marcature = _build_manual_marcature(
        input.ora_entrata,
        input.ora_uscita,
        input.is_reperibilita_attiva
    )
    t = Timbratura(
        **input.model_dump(),
        marcature=marcature,
        ore_lavorate=ore_lavorate,
        ore_arrotondate=ore_arrotondate,
        ore_reperibilita=calcola_ore_reperibilita(marcature)
    )
    await _db.execute(
        "INSERT INTO timbrature VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [t.id, t.data, t.ora_entrata, t.ora_uscita, json.dumps(t.marcature),
         t.ore_lavorate, t.ore_arrotondate, t.ore_reperibilita,
         int(t.is_reperibilita_attiva), t.note, t.created_at.isoformat()]
    )
    await _db.commit()
    return t

@api_router.put("/timbrature/{data}", response_model=Timbratura)
async def update_timbratura(data: str, updates: TimbraturaUpdate):
    cur = await _db.execute("SELECT * FROM timbrature WHERE data = ?", [data])
    row = _timbratura_from_row(_row(await cur.fetchone()))
    if not row:
        raise HTTPException(status_code=404, detail="Timbratura non trovata")
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    ora_entrata = update_data.get("ora_entrata", row.get("ora_entrata"))
    ora_uscita = update_data.get("ora_uscita", row.get("ora_uscita"))
    ore_lavorate, ore_arrotondate = calcola_ore_lavorate(ora_entrata, ora_uscita)
    update_data["ore_lavorate"] = ore_lavorate
    update_data["ore_arrotondate"] = ore_arrotondate
    if any(k in update_data for k in ("ora_entrata", "ora_uscita", "is_reperibilita_attiva")):
        manual_marcature = _build_manual_marcature(
            ora_entrata,
            ora_uscita,
            bool(update_data.get("is_reperibilita_attiva", row.get("is_reperibilita_attiva", False))),
            row.get("created_at")
        )
        update_data["marcature"] = json.dumps(manual_marcature)
        update_data["ore_reperibilita"] = calcola_ore_reperibilita(manual_marcature)
    if 'is_reperibilita_attiva' in update_data:
        update_data['is_reperibilita_attiva'] = int(update_data['is_reperibilita_attiva'])
    set_clause = ", ".join(f"{k} = ?" for k in update_data.keys())
    await _db.execute(
        f"UPDATE timbrature SET {set_clause} WHERE data = ?",
        list(update_data.values()) + [data]
    )
    await _db.commit()
    cur = await _db.execute("SELECT * FROM timbrature WHERE data = ?", [data])
    row = _row(await cur.fetchone())
    return Timbratura(**_timbratura_from_row(row))

@api_router.delete("/timbrature/{data}")
async def delete_timbratura(data: str):
    cur = await _db.execute("DELETE FROM timbrature WHERE data = ?", [data])
    await _db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Timbratura non trovata")
    return {"message": "Timbratura eliminata"}

@api_router.post("/timbrature/timbra")
async def timbra(tipo: str, is_reperibilita: bool = False):
    now = datetime.now()
    data = now.strftime("%Y-%m-%d")
    ora = now.strftime("%H:%M")

    nuova_marcatura = {
        "id": str(uuid.uuid4()),
        "tipo": tipo,
        "ora": ora,
        "is_reperibilita": is_reperibilita,
        "created_at": now.isoformat()
    }

    cur = await _db.execute("SELECT * FROM timbrature WHERE data = ?", [data])
    existing = _row(await cur.fetchone())

    if existing:
        marcature = _parse_json(existing.get("marcature"), [])
        if not marcature and (existing.get("ora_entrata") or existing.get("ora_uscita")):
            if existing.get("ora_entrata"):
                marcature.append({
                    "id": str(uuid.uuid4()), "tipo": "entrata",
                    "ora": existing["ora_entrata"],
                    "is_reperibilita": bool(existing.get("is_reperibilita_attiva", 0)),
                    "created_at": existing.get("created_at", now.isoformat())
                })
            if existing.get("ora_uscita"):
                marcature.append({
                    "id": str(uuid.uuid4()), "tipo": "uscita",
                    "ora": existing["ora_uscita"], "is_reperibilita": False,
                    "created_at": existing.get("created_at", now.isoformat())
                })
        if marcature and marcature[-1]["tipo"] == tipo:
            expected = "uscita" if tipo == "entrata" else "entrata"
            raise HTTPException(
                status_code=400,
                detail=f"Sequenza non valida: registra prima {expected}"
            )
        if not marcature and tipo == "uscita":
            raise HTTPException(
                status_code=400,
                detail="Non puoi registrare un'uscita senza un'entrata"
            )
        marcature.append(nuova_marcatura)
        ore_totali = calcola_ore_da_marcature(marcature)
        ore_arrotondate_totali = calcola_ore_arrotondate_da_marcature(marcature)
        ore_reperibilita = calcola_ore_reperibilita(marcature)
        entrate = [m for m in marcature if m["tipo"] == "entrata"]
        uscite = [m for m in marcature if m["tipo"] == "uscita"]
        prima_entrata = min(entrate, key=lambda x: x["ora"])["ora"] if entrate else None
        ultima_uscita = max(uscite, key=lambda x: x["ora"])["ora"] if uscite else None
        await _db.execute(
            """UPDATE timbrature SET marcature=?, ora_entrata=?, ora_uscita=?,
               ore_lavorate=?, ore_arrotondate=?, ore_reperibilita=?,
               is_reperibilita_attiva=? WHERE data=?""",
            [json.dumps(marcature), prima_entrata, ultima_uscita,
             ore_totali, ore_arrotondate_totali, ore_reperibilita,
             int(any(m.get("is_reperibilita") for m in marcature)), data]
        )
        await _db.commit()
    else:
        if tipo == "uscita":
            raise HTTPException(
                status_code=400,
                detail="Non puoi registrare un'uscita senza un'entrata"
            )
        t = Timbratura(
            data=data,
            ora_entrata=ora if tipo == "entrata" else None,
            marcature=[nuova_marcatura],
            is_reperibilita_attiva=is_reperibilita
        )
        await _db.execute(
            "INSERT INTO timbrature VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            [t.id, t.data, t.ora_entrata, t.ora_uscita, json.dumps(t.marcature),
             t.ore_lavorate, t.ore_arrotondate, t.ore_reperibilita,
             int(t.is_reperibilita_attiva), t.note, t.created_at.isoformat()]
        )
        await _db.commit()

    cur = await _db.execute("SELECT * FROM timbrature WHERE data = ?", [data])
    row = _row(await cur.fetchone())
    return Timbratura(**_timbratura_from_row(row))

# --- Assenze ---

@api_router.get("/assenze", response_model=List[Assenza])
async def get_assenze(tipo: Optional[str] = None, anno: Optional[int] = None):
    if tipo and anno:
        cur = await _db.execute(
            "SELECT * FROM assenze WHERE tipo = ? AND data_inizio LIKE ? ORDER BY data_inizio DESC",
            [tipo, f"{anno}%"]
        )
    elif tipo:
        cur = await _db.execute(
            "SELECT * FROM assenze WHERE tipo = ? ORDER BY data_inizio DESC", [tipo]
        )
    elif anno:
        cur = await _db.execute(
            "SELECT * FROM assenze WHERE data_inizio LIKE ? ORDER BY data_inizio DESC",
            [f"{anno}%"]
        )
    else:
        cur = await _db.execute("SELECT * FROM assenze ORDER BY data_inizio DESC")
    rows = _rows(await cur.fetchall())
    return [Assenza(**r) for r in rows]

@api_router.post("/assenze", response_model=Assenza)
async def create_assenza(input: AssenzaCreate):
    ore = input.ore_totali
    if not ore:
        try:
            start = datetime.strptime(input.data_inizio, "%Y-%m-%d")
            end = datetime.strptime(input.data_fine, "%Y-%m-%d")
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail="Formato data non valido. Usa YYYY-MM-DD"
            ) from exc
        ore = ((end - start).days + 1) * 8
    a = Assenza(**input.model_dump(exclude={"ore_totali"}), ore_totali=ore)
    await _db.execute(
        "INSERT INTO assenze VALUES (?,?,?,?,?,?,?,?,?)",
        [a.id, a.tipo, a.data_inizio, a.data_fine, a.ore_totali,
         a.note, a.certificato_base64, a.certificato_nome, a.created_at.isoformat()]
    )
    await _db.commit()
    return a

@api_router.post("/assenze/{id}/certificato")
async def upload_certificato(id: str, file: UploadFile = File(...)):
    content = await file.read()
    b64 = base64.b64encode(content).decode()
    cur = await _db.execute(
        "UPDATE assenze SET certificato_base64=?, certificato_nome=? WHERE id=?",
        [b64, file.filename, id]
    )
    await _db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Assenza non trovata")
    cur = await _db.execute("SELECT * FROM assenze WHERE id = ?", [id])
    return Assenza(**_row(await cur.fetchone()))

@api_router.delete("/assenze/{id}")
async def delete_assenza(id: str):
    cur = await _db.execute("DELETE FROM assenze WHERE id = ?", [id])
    await _db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Assenza non trovata")
    return {"message": "Assenza eliminata"}

# --- Ferie ---

@api_router.get("/ferie/saldo")
async def get_saldo_ferie(anno: Optional[int] = None):
    if not anno:
        anno = datetime.now().year
    monte_annuo = 80
    maturazione_mensile = 6.667
    mese_corrente = datetime.now().month if datetime.now().year == anno else 12
    ore_maturate = round(maturazione_mensile * mese_corrente, 2)
    cur = await _db.execute(
        "SELECT ore_totali FROM assenze WHERE tipo = 'ferie' AND data_inizio LIKE ?",
        [f"{anno}%"]
    )
    ferie = await cur.fetchall()
    ore_godute = sum(f['ore_totali'] for f in ferie)
    saldo = ore_maturate - ore_godute
    return {
        "anno": anno,
        "monte_annuo": monte_annuo,
        "maturazione_mensile": maturazione_mensile,
        "residuo_anno_precedente": 0,
        "ore_maturate": ore_maturate,
        "ore_godute": ore_godute,
        "saldo_attuale": round(saldo, 2)
    }

# --- Malattia / Comporto ---

@api_router.get("/malattia/comporto")
async def get_comporto():
    three_years_ago = (datetime.now() - timedelta(days=3 * 365)).strftime("%Y-%m-%d")
    cur = await _db.execute(
        "SELECT data_inizio, data_fine FROM assenze WHERE tipo = 'malattia' AND data_inizio >= ?",
        [three_years_ago]
    )
    malattie = await cur.fetchall()
    giorni_totali = 0
    for m in malattie:
        start = datetime.strptime(m['data_inizio'], "%Y-%m-%d")
        end = datetime.strptime(m['data_fine'], "%Y-%m-%d")
        giorni_totali += (end - start).days + 1
    soglia_attenzione = 150
    soglia_critica = 180
    return {
        "giorni_malattia_3_anni": giorni_totali,
        "soglia_attenzione": soglia_attenzione,
        "soglia_critica": soglia_critica,
        "alert_attenzione": giorni_totali >= soglia_attenzione,
        "alert_critico": giorni_totali >= soglia_critica,
        "giorni_disponibili": max(0, soglia_critica - giorni_totali)
    }

# --- Reperibilità ---

@api_router.get("/reperibilita", response_model=List[Reperibilita])
async def get_reperibilita(mese: Optional[int] = None, anno: Optional[int] = None):
    if mese and anno:
        start = f"{anno}-{mese:02d}-01"
        end = f"{anno + 1}-01-01" if mese == 12 else f"{anno}-{mese + 1:02d}-01"
        cur = await _db.execute(
            "SELECT * FROM reperibilita WHERE data >= ? AND data < ? ORDER BY data DESC",
            [start, end]
        )
    else:
        cur = await _db.execute("SELECT * FROM reperibilita ORDER BY data DESC")
    rows = _rows(await cur.fetchall())
    return [Reperibilita(**r) for r in rows]

@api_router.post("/reperibilita", response_model=Reperibilita)
async def create_reperibilita(input: ReperibilitaCreate):
    h1, m1 = map(int, input.ora_inizio.split(':'))
    h2, m2 = map(int, input.ora_fine.split(':'))
    minuti = (h2 * 60 + m2) - (h1 * 60 + m1)
    if minuti < 0:
        minuti += 24 * 60
    ore = minuti / 60
    compenso = calcola_reperibilita_passiva(ore) if input.tipo == "passiva" else calcola_reperibilita_attiva(input.interventi)
    rep = Reperibilita(**input.model_dump(), ore_totali=round(ore, 2), compenso_calcolato=compenso)
    await _db.execute(
        "INSERT INTO reperibilita VALUES (?,?,?,?,?,?,?,?,?,?)",
        [rep.id, rep.data, rep.ora_inizio, rep.ora_fine, rep.tipo,
         rep.ore_totali, rep.interventi, rep.compenso_calcolato,
         rep.note, rep.created_at.isoformat()]
    )
    await _db.commit()
    return rep

@api_router.delete("/reperibilita/{id}")
async def delete_reperibilita(id: str):
    cur = await _db.execute("DELETE FROM reperibilita WHERE id = ?", [id])
    await _db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Reperibilità non trovata")
    return {"message": "Reperibilità eliminata"}

# --- Buste Paga ---

@api_router.get("/buste-paga", response_model=List[BustaPaga])
async def get_buste_paga(anno: Optional[int] = None):
    if anno:
        cur = await _db.execute(
            "SELECT * FROM buste_paga WHERE anno = ? ORDER BY anno DESC, mese DESC", [anno]
        )
    else:
        cur = await _db.execute("SELECT * FROM buste_paga ORDER BY anno DESC, mese DESC")
    rows = _rows(await cur.fetchall())
    return [BustaPaga(**_busta_from_row(r)) for r in rows]

@api_router.get("/buste-paga/{anno}/{mese}")
async def get_busta_paga(anno: int, mese: int):
    cur = await _db.execute(
        "SELECT * FROM buste_paga WHERE anno = ? AND mese = ?", [anno, mese]
    )
    row = _row(await cur.fetchone())
    if not row:
        raise HTTPException(status_code=404, detail="Busta paga non trovata")
    return BustaPaga(**_busta_from_row(row))

@api_router.post("/buste-paga", response_model=BustaPaga)
async def create_busta_paga(input: BustaPagaCreate):
    cur = await _db.execute(
        "SELECT id FROM buste_paga WHERE anno = ? AND mese = ?", [input.anno, input.mese]
    )
    if await cur.fetchone():
        raise HTTPException(status_code=400, detail="Busta paga già esistente per questo periodo")
    busta_data = input.model_dump()
    for f in ['lordo', 'netto', 'straordinari_ore', 'straordinari_importo', 'trattenute_totali']:
        if busta_data.get(f) is None:
            busta_data[f] = 0.0
    b = BustaPaga(**busta_data)
    await _db.execute(
        "INSERT INTO buste_paga VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [b.id, b.mese, b.anno, b.pdf_base64, b.pdf_nome,
         b.lordo, b.netto, b.straordinari_ore, b.straordinari_importo,
         b.trattenute_totali, b.netto_calcolato, b.differenza,
         int(b.has_discrepancy), b.note_confronto, b.created_at.isoformat()]
    )
    await _db.commit()
    return b

@api_router.post("/buste-paga/{anno}/{mese}/upload")
async def upload_busta_paga(
    anno: int,
    mese: int,
    file: UploadFile = File(...),
    force_overwrite: bool = Form(False),
):
    return await _salva_upload_busta_paga(
        file,
        anno_hint=anno,
        mese_hint=mese,
        force_overwrite=force_overwrite,
    )


@api_router.post("/buste-paga/upload")
async def upload_busta_paga_auto(
    file: UploadFile = File(...),
    force_overwrite: bool = Form(False),
):
    return await _salva_upload_busta_paga(
        file,
        force_overwrite=force_overwrite,
    )

@api_router.put("/buste-paga/{anno}/{mese}")
async def update_busta_paga(anno: int, mese: int, updates: BustaPagaUpdate):
    cur = await _db.execute("SELECT * FROM settings LIMIT 1")
    settings = _row(await cur.fetchone())
    if settings:
        base_mensile = (
            (settings.get("paga_base") or 0) +
            (settings.get("scatti_anzianita") or 0) +
            (settings.get("superminimo") or 0) +
            (settings.get("premio_incarico") or 0)
        )
        netto_stimato = base_mensile * 0.75
    else:
        netto_stimato = 0

    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    update_data["netto_calcolato"] = round(netto_stimato, 2)
    if updates.netto:
        differenza = updates.netto - netto_stimato
        update_data["differenza"] = round(differenza, 2)
        update_data["has_discrepancy"] = int(abs(differenza) > 20)

    set_clause = ", ".join(f"{k} = ?" for k in update_data.keys())
    cur = await _db.execute(
        f"UPDATE buste_paga SET {set_clause} WHERE anno = ? AND mese = ?",
        list(update_data.values()) + [anno, mese]
    )
    await _db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Busta paga non trovata")
    cur = await _db.execute(
        "SELECT * FROM buste_paga WHERE anno = ? AND mese = ?", [anno, mese]
    )
    return BustaPaga(**_busta_from_row(_row(await cur.fetchone())))

# --- Documenti ---

@api_router.get("/documenti", response_model=List[Documento])
async def get_documenti(tipo: Optional[str] = None, sottotipo: Optional[str] = None):
    await _ripara_documenti_archivio()
    if tipo and sottotipo:
        cur = await _db.execute(
            "SELECT * FROM documenti WHERE tipo = ? AND sottotipo = ? ORDER BY created_at DESC",
            [tipo, sottotipo],
        )
    elif tipo:
        cur = await _db.execute(
            "SELECT * FROM documenti WHERE tipo = ? ORDER BY created_at DESC", [tipo]
        )
    elif sottotipo:
        cur = await _db.execute(
            "SELECT * FROM documenti WHERE sottotipo = ? ORDER BY created_at DESC", [sottotipo]
        )
    else:
        cur = await _db.execute("SELECT * FROM documenti ORDER BY created_at DESC")
    rows = _rows(await cur.fetchall())
    for r in rows:
        r["file_base64"] = ""
    return [Documento(**r) for r in rows]

@api_router.get("/documenti/{id}")
async def get_documento(id: str):
    await _ripara_documenti_archivio()
    cur = await _db.execute("SELECT * FROM documenti WHERE id = ?", [id])
    row = _row(await cur.fetchone())
    if not row:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    return Documento(**row)

@api_router.post("/documenti", response_model=Documento)
async def upload_documento(
    tipo: str = Form(...),
    titolo: str = Form(...),
    descrizione: str = Form(None),
    sottotipo: str = Form(None),
    data_riferimento: str = Form(None),
    file: UploadFile = File(...)
):
    await _ripara_documenti_archivio()
    content = await file.read()
    b64 = base64.b64encode(content).decode()
    fname = file.filename.lower()
    file_tipo = 'pdf' if fname.endswith('.pdf') else \
                'jpg' if fname.endswith(('.jpg', '.jpeg')) else \
                'png' if fname.endswith('.png') else 'altro'
    doc = Documento(
        tipo=tipo, titolo=titolo, descrizione=descrizione,
        sottotipo=sottotipo,
        file_base64=b64, file_nome=file.filename, file_tipo=file_tipo,
        data_riferimento=data_riferimento
    )
    await _db.execute(
        """
        INSERT INTO documenti (
            id, tipo, titolo, descrizione, file_base64, file_nome,
            file_tipo, data_riferimento, created_at, sottotipo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            doc.id,
            doc.tipo,
            doc.titolo,
            doc.descrizione,
            doc.file_base64,
            doc.file_nome,
            doc.file_tipo,
            doc.data_riferimento,
            doc.created_at.isoformat(),
            doc.sottotipo,
        ]
    )
    await _db.commit()
    return doc


@api_router.post("/cud/upload")
async def upload_cud(
    file: UploadFile = File(...),
    force_overwrite: bool = Form(False),
):
    await _ripara_documenti_archivio()
    content = await file.read()
    anno_cud = _risolvi_anno_cud(content, file.filename)
    cur = await _db.execute(
        "SELECT id FROM documenti WHERE tipo = 'cud' AND data_riferimento = ?",
        [str(anno_cud)],
    )
    existing = await cur.fetchone()
    if existing and not force_overwrite:
        raise HTTPException(
            status_code=409,
            detail=_dettaglio_duplicato_documento(
                "duplicato_cud",
                (
                    "Esiste già un CUD archiviato per questo anno. "
                    "Puoi annullare il caricamento oppure sovrascrivere il file esistente."
                ),
                str(anno_cud),
            ),
        )
    if existing and force_overwrite:
        await _db.execute("DELETE FROM documenti WHERE id = ?", [existing["id"]])

    b64 = base64.b64encode(content).decode()
    documento = await _salva_documento_archivio(
        tipo="cud",
        titolo=f"CUD {anno_cud}",
        descrizione="Certificazione Unica archiviata con informazioni base.",
        sottotipo="certificazione_unica",
        data_riferimento=str(anno_cud),
        file_nome=file.filename,
        file_tipo="pdf",
        file_base64=b64,
    )
    await _db.commit()
    return {
        "documento": documento.model_dump(),
        "anno": anno_cud,
    }

@api_router.delete("/documenti/{id}")
async def delete_documento(id: str):
    cur = await _db.execute("DELETE FROM documenti WHERE id = ?", [id])
    await _db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    return {"message": "Documento eliminato"}

# --- Timbrature Aziendali ---

@api_router.get("/timbrature-aziendali")
async def get_timbrature_aziendali(mese: Optional[int] = None, anno: Optional[int] = None):
    await _sync_timbrature_aziendali_periodi()
    await _db.commit()
    if mese and anno:
        cur = await _db.execute(
            "SELECT * FROM timbrature_aziendali WHERE mese_riferimento=? AND anno_riferimento=? ORDER BY data DESC",
            [mese, anno]
        )
    elif anno:
        cur = await _db.execute(
            "SELECT * FROM timbrature_aziendali WHERE anno_riferimento=? ORDER BY data DESC", [anno]
        )
    else:
        cur = await _db.execute("SELECT * FROM timbrature_aziendali ORDER BY data DESC")
    return _rows(await cur.fetchall())

@api_router.post("/timbrature-aziendali/upload")
async def upload_timbrature_aziendali(
    mese: Optional[int] = Form(None),
    anno: Optional[int] = Form(None),
    file: UploadFile = File(...),
    force_overwrite: bool = Form(False),
):
    await _ripara_documenti_archivio()
    content = await file.read()
    parse_result = parse_sometime_pdf(content, file.filename)
    timbrature_parse = parse_result.get("timbrature") or []

    if not parse_result["success"] or not timbrature_parse:
        zucchetti_result = parse_zucchetti_pdf(content, file.filename)
        if zucchetti_result.get("success"):
            raise HTTPException(
                status_code=400,
                detail="Il file caricato sembra una busta paga, non un report timbrature. Carica il PDF timbrature mensile dell'azienda con il dettaglio giornaliero di entrate e uscite.",
            )

        dettaglio_errore = parse_result.get("errors", [])
        messaggio = (
            "Impossibile importare timbrature da questo PDF. "
            "Carica un report timbrature aziendale compatibile con il dettaglio giornaliero di entrate e uscite."
        )
        if dettaglio_errore:
            messaggio = f"{messaggio} Dettaglio parser: {dettaglio_errore[0]}"
        raise HTTPException(status_code=400, detail=messaggio)

    parsed_anno, parsed_mese = _risolvi_periodo_timbrature(
        parse_result,
        mese_hint=mese,
        anno_hint=anno,
    )
    cur = await _db.execute(
        "SELECT COUNT(1) AS totale FROM timbrature_aziendali WHERE mese_riferimento=? AND anno_riferimento=?",
        [parsed_mese, parsed_anno],
    )
    existing_count_row = await cur.fetchone()
    existing_count = int(existing_count_row["totale"]) if existing_count_row else 0
    if existing_count > 0 and not force_overwrite:
        raise HTTPException(
            status_code=409,
            detail=_dettaglio_duplicato(
                "duplicato_timbrature_report",
                (
                    "Esiste già un report timbrature archiviato per questo mese. "
                    "Puoi annullare il caricamento oppure sovrascrivere i dati esistenti."
                ),
                parsed_anno,
                parsed_mese,
            ),
        )
    if existing_count > 0 and force_overwrite:
        await _db.execute(
            "DELETE FROM timbrature_aziendali WHERE mese_riferimento=? AND anno_riferimento=?",
            [parsed_mese, parsed_anno],
        )
        await _db.execute(
            "DELETE FROM documenti WHERE tipo='timbrature_report' AND data_riferimento=?",
            [f"{parsed_anno}-{parsed_mese:02d}"],
        )

    imported_count = 0
    for t in timbrature_parse:
        anno_timbratura, mese_timbratura = _periodo_da_data_iso(t["data"])
        timb = TimbraturaAziendale(
            data=t["data"],
            ora_entrata=t.get("ora_entrata"),
            ora_uscita=t.get("ora_uscita"),
            ore_lavorate=t.get("ore_lavorate", 0.0),
            descrizione=t.get("descrizione"),
            fonte_pdf=file.filename,
            mese_riferimento=mese_timbratura,
            anno_riferimento=anno_timbratura
        )
        await _db.execute(
            """INSERT INTO timbrature_aziendali VALUES (?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(data) DO UPDATE SET
               ora_entrata=excluded.ora_entrata, ora_uscita=excluded.ora_uscita,
               ore_lavorate=excluded.ore_lavorate, descrizione=excluded.descrizione,
               fonte_pdf=excluded.fonte_pdf, mese_riferimento=excluded.mese_riferimento,
               anno_riferimento=excluded.anno_riferimento""",
            [timb.id, timb.data, timb.ora_entrata, timb.ora_uscita,
             timb.ore_lavorate, timb.descrizione, timb.fonte_pdf,
             timb.mese_riferimento, timb.anno_riferimento, timb.created_at.isoformat()]
        )
        imported_count += 1
    await _db.commit()

    b64 = base64.b64encode(content).decode()
    doc = await _salva_documento_archivio(
        tipo="timbrature_report",
        titolo=f"Timbrature Aziendali {parsed_mese:02d}/{parsed_anno}",
        descrizione=f"Report timbrature aziendali per {parsed_mese}/{parsed_anno}",
        sottotipo="report_mensile",
        data_riferimento=f"{parsed_anno}-{parsed_mese:02d}",
        file_nome=file.filename,
        file_tipo="pdf",
        file_base64=b64,
    )
    await _db.commit()
    return {
        "message": f"PDF caricato e {imported_count} timbrature importate automaticamente",
        "documento_id": doc.id,
        "filename": file.filename,
        "mese": parsed_mese, "anno": parsed_anno,
        "timbrature_importate": imported_count,
        "totali": parse_result.get("totali", {}),
        "parse_success": parse_result["success"],
        "parse_errors": parse_result.get("errors", [])
    }

@api_router.post("/timbrature-aziendali/import")
async def import_timbrature_aziendali(timbrature: List[Dict[str, Any]]):
    imported = []
    for t in timbrature:
        timb = TimbraturaAziendale(
            data=t.get("data"),
            ora_entrata=t.get("ora_entrata"),
            ora_uscita=t.get("ora_uscita"),
            ore_lavorate=t.get("ore_lavorate", 0.0),
            descrizione=t.get("descrizione"),
            fonte_pdf=t.get("fonte_pdf"),
            mese_riferimento=t.get("mese_riferimento", 0),
            anno_riferimento=t.get("anno_riferimento", 0)
        )
        await _db.execute(
            """INSERT INTO timbrature_aziendali VALUES (?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(data) DO UPDATE SET
               ora_entrata=excluded.ora_entrata, ora_uscita=excluded.ora_uscita,
               ore_lavorate=excluded.ore_lavorate, descrizione=excluded.descrizione,
               fonte_pdf=excluded.fonte_pdf, mese_riferimento=excluded.mese_riferimento,
               anno_riferimento=excluded.anno_riferimento""",
            [timb.id, timb.data, timb.ora_entrata, timb.ora_uscita,
             timb.ore_lavorate, timb.descrizione, timb.fonte_pdf,
             timb.mese_riferimento, timb.anno_riferimento, timb.created_at.isoformat()]
        )
        imported.append(timb.model_dump())
    await _db.commit()
    return {"message": f"Importate {len(imported)} timbrature aziendali", "timbrature": imported}

@api_router.delete("/timbrature-aziendali/{data}")
async def delete_timbratura_aziendale(data: str):
    cur = await _db.execute("DELETE FROM timbrature_aziendali WHERE data = ?", [data])
    await _db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Timbratura aziendale non trovata")
    return {"message": "Timbratura aziendale eliminata"}

@api_router.delete("/timbrature-aziendali")
async def delete_all_timbrature_aziendali(mese: int, anno: int):
    cur = await _db.execute(
        "DELETE FROM timbrature_aziendali WHERE mese_riferimento=? AND anno_riferimento=?",
        [mese, anno]
    )
    await _db.commit()
    return {"message": f"Eliminate {cur.rowcount} timbrature aziendali"}

# --- Confronto Timbrature ---

@api_router.get("/confronto-timbrature")
async def get_confronto_timbrature(mese: int, anno: int):
    start = f"{anno}-{mese:02d}-01"
    end = f"{anno + 1}-01-01" if mese == 12 else f"{anno}-{mese + 1:02d}-01"
    cur = await _db.execute(
        "SELECT * FROM timbrature WHERE data >= ? AND data < ?", [start, end]
    )
    personali = {r['data']: r for r in _rows(await cur.fetchall())}
    cur = await _db.execute(
        "SELECT * FROM timbrature_aziendali WHERE mese_riferimento=? AND anno_riferimento=?",
        [mese, anno]
    )
    aziendali = {r['data']: r for r in _rows(await cur.fetchall())}
    all_dates = set(personali.keys()) | set(aziendali.keys())
    confronti = []
    totale_diff_ore = 0.0
    discrepanze = 0
    for data in sorted(all_dates):
        pers = personali.get(data, {})
        azn = aziendali.get(data, {})
        pers_ore = pers.get("ore_arrotondate", 0.0) or 0.0
        azn_ore = azn.get("ore_lavorate", 0.0) or 0.0
        diff = round(pers_ore - azn_ore, 2)
        has_disc = abs(diff) > 0.25
        if has_disc:
            discrepanze += 1
        totale_diff_ore += diff
        confronto = ConfrontoTimbratura(
            data=data,
            personale_entrata=pers.get("ora_entrata"),
            personale_uscita=pers.get("ora_uscita"),
            personale_ore=pers_ore,
            aziendale_entrata=azn.get("ora_entrata"),
            aziendale_uscita=azn.get("ora_uscita"),
            aziendale_ore=azn_ore,
            aziendale_descrizione=azn.get("descrizione"),
            differenza_ore=diff,
            has_discrepancy=has_disc
        )
        confronti.append(confronto.dict())
    return {
        "mese": mese, "anno": anno,
        "confronti": confronti,
        "riepilogo": {
            "giorni_totali": len(confronti),
            "giorni_con_discrepanza": discrepanze,
            "differenza_ore_totale": round(totale_diff_ore, 2),
            "ore_personali_totali": sum(c["personale_ore"] for c in confronti),
            "ore_aziendali_totali": sum(c["aziendale_ore"] for c in confronti)
        }
    }

# --- Dashboard ---

@api_router.get("/dashboard")
async def get_dashboard():
    await _ripara_identita_account_da_ultima_busta()
    now = datetime.now()
    mese = now.month
    anno = now.year
    cur = await _db.execute("SELECT * FROM settings LIMIT 1")
    settings = _settings_from_row(_row(await cur.fetchone()))
    if not settings:
        settings = _settings_personali_vuote().dict()
    start = f"{anno}-{mese:02d}-01"
    end = f"{anno + 1}-01-01" if mese == 12 else f"{anno}-{mese + 1:02d}-01"
    cur = await _db.execute(
        "SELECT ore_arrotondate FROM timbrature WHERE data >= ? AND data < ?", [start, end]
    )
    timbrature = await cur.fetchall()
    ore_mese = sum(t['ore_arrotondate'] or 0 for t in timbrature)
    ore_ordinarie = min(ore_mese, 169)
    ore_straordinarie = max(0, ore_mese - 169)
    giorni_con_ticket = sum(1 for t in timbrature if calcola_ticket(t['ore_arrotondate'] or 0))
    ferie_data = await get_saldo_ferie(anno)
    comporto_data = await get_comporto()
    cur = await _db.execute(
        "SELECT * FROM buste_paga ORDER BY anno DESC, mese DESC LIMIT 1"
    )
    last_busta_row = _busta_from_row(_row(await cur.fetchone()))
    cur = await _db.execute("SELECT id FROM alerts WHERE letto = 0")
    alerts_count = len(await cur.fetchall())
    base_mensile = (
        (settings.get("paga_base") or 0) +
        (settings.get("scatti_anzianita") or 0) +
        (settings.get("superminimo") or 0) +
        (settings.get("premio_incarico") or 0)
    )
    metadati_stima = _calcola_metadati_stima(settings, timbrature)
    divisore_orario = settings.get("divisore_orario") or 169
    ticket_valore = settings.get("ticket_valore")
    ticket_unitario = float(ticket_valore) if isinstance(ticket_valore, (int, float)) else 0.0
    quota_oraria = base_mensile / divisore_orario
    straordinario_stimato = ore_straordinarie * quota_oraria * 1.18
    ticket_totale = giorni_con_ticket * ticket_unitario
    lordo_stimato = base_mensile + straordinario_stimato + ticket_totale
    netto_stimato = lordo_stimato * 0.72
    pagamento_mese = mese + 1 if mese < 12 else 1
    pagamento_anno = anno if mese < 12 else anno + 1
    return {
        "mese_corrente": {
            "mese": mese, "anno": anno,
            "ore_lavorate": round(ore_mese, 2),
            "ore_ordinarie": round(ore_ordinarie, 2),
            "ore_straordinarie": round(ore_straordinarie, 2),
            "giorni_lavorati": sum(1 for t in timbrature if (t['ore_arrotondate'] or 0) > 0),
            "ticket_maturati": giorni_con_ticket
        },
        "stime": {
            "lordo_stimato": round(lordo_stimato, 2),
            "netto_stimato": round(netto_stimato, 2),
            "straordinario_stimato": round(straordinario_stimato, 2),
            "ticket_totale": round(ticket_totale, 2),
            "metadati": {
                "ha_dati_contrattuali": metadati_stima["ha_dati_contrattuali"],
                "ha_dati_operativi_mese": metadati_stima["ha_dati_operativi_mese"],
                "sorgente": metadati_stima["sorgente"],
                "stato": metadati_stima["stato"],
            },
            "ha_dati_contrattuali": metadati_stima["ha_dati_contrattuali"],
            "ha_dati_operativi_mese": metadati_stima["ha_dati_operativi_mese"],
            "fonte": metadati_stima["sorgente"],
            "fonte_stima": metadati_stima["stato"],
            "competenza_mese": mese,
            "competenza_anno": anno,
            "pagamento_previsto_giorno": 27,
            "pagamento_previsto_mese": pagamento_mese,
            "pagamento_previsto_anno": pagamento_anno,
        },
        "ferie": ferie_data,
        "comporto": comporto_data,
        "ultima_busta": _safe_busta_paga(last_busta_row) if last_busta_row else None,
        "alerts_non_letti": alerts_count,
        "settings": UserSettings(**_public_settings_from_row(settings)).dict()
    }

# --- Statistiche ---

@api_router.get("/statistiche/mensili")
async def get_statistiche_mensili(anno: Optional[int] = None):
    if not anno:
        anno = datetime.now().year
    stats = []
    for mese in range(1, 13):
        start = f"{anno}-{mese:02d}-01"
        end = f"{anno + 1}-01-01" if mese == 12 else f"{anno}-{mese + 1:02d}-01"
        cur = await _db.execute(
            "SELECT ore_arrotondate FROM timbrature WHERE data >= ? AND data < ?",
            [start, end]
        )
        timbrature = await cur.fetchall()
        ore_totali = sum(t['ore_arrotondate'] or 0 for t in timbrature)
        ore_straordinarie = max(0, ore_totali - 169)
        cur = await _db.execute(
            "SELECT netto FROM buste_paga WHERE anno=? AND mese=?", [anno, mese]
        )
        busta = await cur.fetchone()
        stats.append({
            "mese": mese, "anno": anno,
            "ore_lavorate": round(ore_totali, 2),
            "ore_straordinarie": round(ore_straordinarie, 2),
            "netto": busta['netto'] if busta else 0,
            "giorni_lavorati": sum(1 for t in timbrature if (t['ore_arrotondate'] or 0) > 0)
        })
    return stats

# --- Alerts ---

@api_router.get("/alerts", response_model=List[Alert])
async def get_alerts(solo_non_letti: bool = False):
    if solo_non_letti:
        cur = await _db.execute(
            "SELECT * FROM alerts WHERE letto=0 ORDER BY created_at DESC"
        )
    else:
        cur = await _db.execute("SELECT * FROM alerts ORDER BY created_at DESC")
    rows = _rows(await cur.fetchall())
    return [Alert(**_alert_from_row(r)) for r in rows]

@api_router.post("/alerts", response_model=Alert)
async def create_alert(tipo: str, titolo: str, messaggio: str, data_scadenza: Optional[str] = None):
    alert = Alert(tipo=tipo, titolo=titolo, messaggio=messaggio, data_scadenza=data_scadenza)
    await _db.execute(
        "INSERT INTO alerts VALUES (?,?,?,?,?,?,?)",
        [alert.id, alert.tipo, alert.titolo, alert.messaggio,
         alert.data_scadenza, int(alert.letto), alert.created_at.isoformat()]
    )
    await _db.commit()
    return alert

@api_router.put("/alerts/{id}/letto")
async def mark_alert_read(id: str):
    cur = await _db.execute("UPDATE alerts SET letto=1 WHERE id=?", [id])
    await _db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Alert non trovato")
    cur = await _db.execute("SELECT * FROM alerts WHERE id=?", [id])
    return Alert(**_alert_from_row(_row(await cur.fetchone())))

@api_router.delete("/alerts/{id}")
async def delete_alert(id: str):
    cur = await _db.execute("DELETE FROM alerts WHERE id=?", [id])
    await _db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Alert non trovato")
    return {"message": "Alert eliminato"}

# --- Chat ---

@api_router.post("/chat")
async def chat(request: ChatRequest):
    if not _gemini_client:
        return {
            "error": "Chat AI non disponibile su questo server",
            "response": "Funzione non disponibile offline",
        }
    try:
        cur = await _db.execute("SELECT * FROM settings LIMIT 1")
        settings = _settings_from_row(_row(await cur.fetchone())) or _settings_personali_vuote().dict()
        dashboard = await get_dashboard()
        ferie = await get_saldo_ferie()
        comporto = await get_comporto()
        base_mensile = (
            (settings.get("paga_base") or 0) +
            (settings.get("scatti_anzianita") or 0) +
            (settings.get("superminimo") or 0) +
            (settings.get("premio_incarico") or 0)
        )
        quota_oraria = base_mensile / (settings.get("divisore_orario") or 169)
        system_prompt = f"""Sei l'assistente virtuale di BustaPaga, app personale per gestione buste paga, timbrature e assenze.
Rispondi SEMPRE in italiano, in modo chiaro, preciso e diretto. Quando fai calcoli, mostra i passaggi.

=== DATI ANAGRAFICI E CONTRATTUALI ===
Nome: {settings.get('nome') or 'Non disponibile'}
Qualifica: {settings.get('qualifica') or 'Non disponibile'} - Livello: {settings.get('livello') or 0}
Azienda: {settings.get('azienda') or 'Non disponibile'}, {settings.get('sede') or 'Non disponibile'}
CCNL: {settings.get('ccnl') or 'Non disponibile'}
Data assunzione: {settings.get('data_assunzione') or 'Non disponibile'}
Orario: {settings.get('orario_tipo') or 'Non disponibile'}, {settings.get('ore_giornaliere') or 0}h/giorno

=== ELEMENTI RETRIBUTIVI ATTUALI ===
Paga base: €{float(settings.get('paga_base') or 0):.2f}
Scatti anzianità: €{float(settings.get('scatti_anzianita') or 0):.2f}
Superminimo: €{float(settings.get('superminimo') or 0):.2f}
Premio incarico: €{float(settings.get('premio_incarico') or 0):.2f}
Totale base mensile: €{base_mensile:.2f}
Divisore orario: {settings.get('divisore_orario') or 0} → quota oraria €{quota_oraria:.2f}
Divisore giornaliero: {settings.get('divisore_giornaliero') or 0} → quota giornaliera €{base_mensile / (settings.get('divisore_giornaliero') or 25):.2f}
Ticket elettronico: €{float(settings.get('ticket_valore') or 0):.2f}/giorno se ore totali ≥ 5h

=== STORICO PAGA BASE ===
- Fino luglio 2025: €1.987,14
- Agosto 2025: €2.015,14
- Da dicembre 2025: €2.026,64

=== CONTRIBUTI E TRATTENUTE ===
INPS: IVS 9,19% + CIGS 0,30% sulla retribuzione lorda
FONDAPI (fondo pensione): dipendente volontario 1,44% + base 1,06%; azienda base 1,96% (da ago 2025)
TFR: 100% trasferito a FONDAPI

Trattenute fisse mensili:
- Cessione 1/5: €160,00/mese → scade settembre 2027 (alert 60gg prima)
- Cessione 1/5: €319,00/mese → scade giugno 2033 (alert 60gg prima)
- Sindacale CGIL: €20,27/mese
- Addizionale regionale Lombardia 2025: €45,53/mese
- Addizionale comunale Monza 2025: €17,74/mese
- Acconto addizionale comunale 2026: €8,94/mese

Scatti anzianità:
- Scatto attuale: quinto (N.4,80), valore unitario €13,94
- Prossimo scatto: agosto 2027

=== REGOLE CALCOLO STRAORDINARI ===
Arrotondamento timbrature al quarto d'ora successivo:
- 01-15 min → :15 | 16-30 min → :30 | 31-45 min → :45 | 46-59 min → :00 ora successiva

Conteggio settimanale (lunedì-domenica):
- Prime 40 ore = ordinarie; dalla 41ª ora = straordinario

Tabella maggiorazioni:
- Lun-ven diurno (fino 22:00): 41ª-48ª ora +18%, da 49ª +25%
- Lun-ven notturno (dopo 22:00): 41ª-48ª ora +35%, da 49ª +75%
- Sabato entro le 14:00: 41ª-48ª ora +18%, da 49ª +25%
- Sabato dopo le 14:00: 41ª-48ª ora +50% + €100 flat/intervento; da 49ª +75% + €100
- Domenica intera: 41ª-48ª ora +50% + €100 flat/intervento; da 49ª +75% + €100
Nota: la fascia 20:00-22:00 è trattata come diurno. Si applica sempre la maggiorazione più alta.

Voci in busta: 000304=18%, 000302=25%, 000310=30%, 000315=35%, 00350B=54%, 000353=75%

=== REPERIBILITÀ ===
Passiva (disponibilità programmata): €4,00 lordi/ora di disponibilità
Attiva (intervento effettivo): €100,00 flat per ogni coppia entrata-uscita + ore calcolate normalmente
Se una timbratura ricade in un periodo di reperibilità passiva → classificata automaticamente come attiva.

=== FERIE ===
Monte annuo: 80 ore | Maturazione mensile: 6,667 ore
Saldo = Residuo anno precedente + Maturato progressivo − Goduto progressivo
Alert: saldo ferie anno precedente > 0 dopo il 31 gennaio

=== MALATTIA / COMPORTO ===
Copertura economica:
- Giorni 1-3 (carenza): Azienda 100%
- Giorni 4-65: INPS + integrazione aziendale 100%
- Giorni 66-180: INPS + fondo integrativo 100%
- Oltre 180 giorni: Solo INPS, nessuna integrazione

Comporto (ultimi 3 anni a ritroso):
- Soglia attenzione: 150 giorni | Soglia critica: 180 giorni → rischio licenziamento

=== VOCI VARIABILI IN BUSTA ===
00240E = Premio Forfettario C.Q.: €119,75 fisso mensile
00245H = Indennità chiamata reperibilità: €100/chiamata
00362A = Turno diurno 4% | 00362B = Turno notturno 28%
00385B = Incremento turno notturno €15,97/giorno
242PAC = Saldo Premio Produzione annuale (tassazione agevolata 5-10%, fuori IRPEF ordinario)
ZP0001 = Integrazione malattia aziendale | Z01139 = Festività non godute
Z00010+Z00015 = Anticipo+Recupero retribuzione (impatto netto zero)
00621B = Detrazione ROL art.14 CCNL

=== SITUAZIONE ATTUALE ===
Mese: {dashboard['mese_corrente']['mese']}/{dashboard['mese_corrente']['anno']}
Ore lavorate: {dashboard['mese_corrente']['ore_lavorate']}h | Straordinarie: {dashboard['mese_corrente']['ore_straordinarie']}h
Giorni lavorati: {dashboard['mese_corrente']['giorni_lavorati']} | Ticket maturati: {dashboard['mese_corrente']['ticket_maturati']}
Netto stimato: €{dashboard['stime']['netto_stimato']:.2f} | Lordo stimato: €{dashboard['stime']['lordo_stimato']:.2f}

Ferie: maturate {ferie['ore_maturate']}h | godute {ferie['ore_godute']}h | saldo {ferie['saldo_attuale']}h
Comporto malattia: {comporto['giorni_malattia_3_anni']} giorni su {comporto['soglia_critica']} | disponibili: {comporto['giorni_disponibili']} giorni
"""

        session_id = request.session_id or str(uuid.uuid4())

        # Recupera storia sessione
        cur = await _db.execute(
            "SELECT role, content FROM chat_history WHERE session_id=? ORDER BY timestamp ASC LIMIT 40",
            [session_id]
        )
        history_rows = await cur.fetchall()
        # Gemini usa role "model" invece di "assistant"
        gemini_history = [
            genai_types.Content(
                role="user" if r["role"] == "user" else "model",
                parts=[genai_types.Part(text=r["content"])]
            )
            for r in history_rows
        ]

        chat = _gemini_client.aio.chats.create(
            model="gemini-2.0-flash",
            history=gemini_history,
            config=genai_types.GenerateContentConfig(
                system_instruction=system_prompt,
                max_output_tokens=2048,
            )
        )
        response = await chat.send_message(request.message)
        reply = response.text

        # Salva nella cronologia
        now_iso = _utc_now_iso()
        user_msg = ChatMessage(role="user", content=request.message)
        asst_msg = ChatMessage(role="assistant", content=reply)
        await _db.execute(
            "INSERT INTO chat_history VALUES (?,?,?,?,?)",
            [user_msg.id, session_id, user_msg.role, user_msg.content, now_iso]
        )
        await _db.execute(
            "INSERT INTO chat_history VALUES (?,?,?,?,?)",
            [asst_msg.id, session_id, asst_msg.role, asst_msg.content,
             _utc_now_iso()]
        )
        await _db.commit()

        return {"response": reply, "session_id": session_id}

    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=f"Errore nel chatbot: {str(e)}")

@api_router.get("/chat/history")
async def get_chat_history(limit: int = 50):
    cur = await _db.execute(
        "SELECT * FROM chat_history ORDER BY timestamp DESC LIMIT ?", [limit]
    )
    rows = _rows(await cur.fetchall())
    return [ChatMessage(**r) for r in reversed(rows)]

@api_router.delete("/chat/history")
async def clear_chat_history():
    await _db.execute("DELETE FROM chat_history")
    await _db.commit()
    return {"message": "Cronologia chat cancellata"}

# --- Health ---

@api_router.get("/")
async def root():
    return {"message": "BustaPaga API v1.0.0", "status": "online"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": _utc_now_iso()}

# ============== APP SETUP ==============

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

if __name__ == "__main__":
    uvicorn.run("server_nas:app", host="0.0.0.0", port=8000, reload=False)
