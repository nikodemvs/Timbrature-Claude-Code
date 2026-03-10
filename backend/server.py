import uvicorn
from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import aiosqlite
from google import genai
from google.genai import types as genai_types
import os
import logging
import json
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
import base64
import io
from PyPDF2 import PdfReader
from sometime_parser import parse_sometime_pdf
from zucchetti_parser import parse_zucchetti_pdf

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

DB_PATH = ROOT_DIR / "bustapaga.db"

app = FastAPI(title="BustaPaga API", version="1.0.0")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

_db: aiosqlite.Connection = None
_gemini_client: genai.Client = None

# ============== PYDANTIC MODELS ==============

class UserSettings(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nome: str = "Zambara Marco"
    qualifica: str = "Operaio"
    livello: int = 5
    azienda: str = "Plastiape SpA"
    sede: str = "Osnago (LC)"
    ccnl: str = "Unionchimica Confapi — Gomma Plastica"
    data_assunzione: str = "2015-07-11"
    orario_tipo: str = "Giornata fissa Lun-Ven"
    ore_giornaliere: int = 8
    paga_base: float = 2026.64
    scatti_anzianita: float = 66.88
    superminimo: float = 469.41
    premio_incarico: float = 56.90
    divisore_orario: int = 169
    divisore_giornaliero: int = 25
    ticket_valore: float = 8.00
    pin_hash: Optional[str] = None
    use_biometric: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class UserSettingsUpdate(BaseModel):
    nome: Optional[str] = None
    qualifica: Optional[str] = None
    livello: Optional[int] = None
    azienda: Optional[str] = None
    sede: Optional[str] = None
    paga_base: Optional[float] = None
    scatti_anzianita: Optional[float] = None
    superminimo: Optional[float] = None
    premio_incarico: Optional[float] = None
    pin_hash: Optional[str] = None
    use_biometric: Optional[bool] = None

class Marcatura(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tipo: str
    ora: str
    is_reperibilita: bool = False
    note: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Timbratura(BaseModel):
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
    created_at: datetime = Field(default_factory=datetime.utcnow)

class TimbraturaCreate(BaseModel):
    data: str
    ora_entrata: Optional[str] = None
    ora_uscita: Optional[str] = None
    is_reperibilita_attiva: bool = False
    note: Optional[str] = None

class TimbraturaUpdate(BaseModel):
    ora_entrata: Optional[str] = None
    ora_uscita: Optional[str] = None
    is_reperibilita_attiva: Optional[bool] = None
    note: Optional[str] = None

class MarcaturaCreate(BaseModel):
    tipo: str
    ora: Optional[str] = None
    is_reperibilita: bool = False
    note: Optional[str] = None

class Assenza(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tipo: str
    data_inizio: str
    data_fine: str
    ore_totali: float = 0.0
    note: Optional[str] = None
    certificato_base64: Optional[str] = None
    certificato_nome: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class AssenzaCreate(BaseModel):
    tipo: str
    data_inizio: str
    data_fine: str
    ore_totali: Optional[float] = None
    note: Optional[str] = None

class Reperibilita(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    data: str
    ora_inizio: str
    ora_fine: str
    tipo: str = "passiva"
    ore_totali: float = 0.0
    interventi: int = 0
    compenso_calcolato: float = 0.0
    note: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ReperibilitaCreate(BaseModel):
    data: str
    ora_inizio: str
    ora_fine: str
    tipo: str = "passiva"
    interventi: int = 0
    note: Optional[str] = None

class BustaPaga(BaseModel):
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
    created_at: datetime = Field(default_factory=datetime.utcnow)

class BustaPagaCreate(BaseModel):
    mese: int
    anno: int
    lordo: Optional[float] = None
    netto: Optional[float] = None
    straordinari_ore: Optional[float] = None
    straordinari_importo: Optional[float] = None
    trattenute_totali: Optional[float] = None

class BustaPagaUpdate(BaseModel):
    lordo: Optional[float] = None
    netto: Optional[float] = None
    straordinari_ore: Optional[float] = None
    straordinari_importo: Optional[float] = None
    trattenute_totali: Optional[float] = None

class TimbraturaAziendale(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    data: str
    ora_entrata: Optional[str] = None
    ora_uscita: Optional[str] = None
    ore_lavorate: float = 0.0
    descrizione: Optional[str] = None
    fonte_pdf: Optional[str] = None
    mese_riferimento: int = 0
    anno_riferimento: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ConfrontoTimbratura(BaseModel):
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

class Documento(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tipo: str
    titolo: str
    descrizione: Optional[str] = None
    file_base64: str
    file_nome: str
    file_tipo: str
    data_riferimento: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: str
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None

class Alert(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tipo: str
    titolo: str
    messaggio: str
    data_scadenza: Optional[str] = None
    letto: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

# ============== DB INIT ==============

async def init_db():
    await _db.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            id TEXT PRIMARY KEY,
            nome TEXT DEFAULT 'Zambara Marco',
            qualifica TEXT DEFAULT 'Operaio',
            livello INTEGER DEFAULT 5,
            azienda TEXT DEFAULT 'Plastiape SpA',
            sede TEXT DEFAULT 'Osnago (LC)',
            ccnl TEXT DEFAULT 'Unionchimica Confapi — Gomma Plastica',
            data_assunzione TEXT DEFAULT '2015-07-11',
            orario_tipo TEXT DEFAULT 'Giornata fissa Lun-Ven',
            ore_giornaliere INTEGER DEFAULT 8,
            paga_base REAL DEFAULT 2026.64,
            scatti_anzianita REAL DEFAULT 66.88,
            superminimo REAL DEFAULT 469.41,
            premio_incarico REAL DEFAULT 56.90,
            divisore_orario INTEGER DEFAULT 169,
            divisore_giornaliero INTEGER DEFAULT 25,
            ticket_valore REAL DEFAULT 8.00,
            pin_hash TEXT,
            use_biometric INTEGER DEFAULT 1,
            created_at TEXT,
            updated_at TEXT
        )
    """)
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
    await _db.commit()

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
    return BustaPaga(**safe).dict()

def arrotonda_quarti_ora(minuti: int) -> int:
    if minuti == 0:
        return 0
    elif minuti <= 15:
        return 15
    elif minuti <= 30:
        return 30
    elif minuti <= 45:
        return 45
    else:
        return 60

def calcola_ore_lavorate(ora_entrata: str, ora_uscita: str) -> tuple:
    if not ora_entrata or not ora_uscita:
        return 0.0, 0.0
    try:
        h1, m1 = map(int, ora_entrata.split(':'))
        h2, m2 = map(int, ora_uscita.split(':'))
        minuti_totali = (h2 * 60 + m2) - (h1 * 60 + m1)
        if minuti_totali < 0:
            minuti_totali += 24 * 60
        ore_effettive = minuti_totali / 60
        ore_intere = minuti_totali // 60
        minuti_residui = minuti_totali % 60
        minuti_arrotondati = arrotonda_quarti_ora(minuti_residui)
        if minuti_arrotondati == 60:
            ore_arrotondate = ore_intere + 1
        else:
            ore_arrotondate = ore_intere + (minuti_arrotondati / 60)
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
    cur = await _db.execute("SELECT * FROM settings LIMIT 1")
    row = _row(await cur.fetchone())
    if not row:
        default = UserSettings()
        d = default.dict()
        await _db.execute(
            "INSERT INTO settings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [d['id'], d['nome'], d['qualifica'], d['livello'], d['azienda'], d['sede'],
             d['ccnl'], d['data_assunzione'], d['orario_tipo'], d['ore_giornaliere'],
             d['paga_base'], d['scatti_anzianita'], d['superminimo'], d['premio_incarico'],
             d['divisore_orario'], d['divisore_giornaliero'], d['ticket_valore'],
             d['pin_hash'], int(d['use_biometric']),
             d['created_at'].isoformat(), d['updated_at'].isoformat()]
        )
        await _db.commit()
        return default
    return UserSettings(**_settings_from_row(row))

@api_router.put("/settings", response_model=UserSettings)
async def update_settings(updates: UserSettingsUpdate):
    update_data = {k: v for k, v in updates.dict().items() if v is not None}
    if 'use_biometric' in update_data:
        update_data['use_biometric'] = int(update_data['use_biometric'])
    update_data['updated_at'] = datetime.utcnow().isoformat()

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
        d = default.dict()
        await _db.execute(
            "INSERT INTO settings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [d['id'], d['nome'], d['qualifica'], d['livello'], d['azienda'], d['sede'],
             d['ccnl'], d['data_assunzione'], d['orario_tipo'], d['ore_giornaliere'],
             d['paga_base'], d['scatti_anzianita'], d['superminimo'], d['premio_incarico'],
             d['divisore_orario'], d['divisore_giornaliero'], d['ticket_valore'],
             d['pin_hash'], int(d['use_biometric']),
             d['created_at'].isoformat(), d['updated_at'].isoformat()]
        )
        await _db.commit()

    cur = await _db.execute("SELECT * FROM settings LIMIT 1")
    row = _row(await cur.fetchone())
    return UserSettings(**_settings_from_row(row))

@api_router.post("/settings/verify-pin")
async def verify_pin(pin: str):
    cur = await _db.execute("SELECT pin_hash FROM settings LIMIT 1")
    row = await cur.fetchone()
    if not row or not row['pin_hash']:
        return {"valid": True, "message": "Nessun PIN configurato"}
    if row['pin_hash'] == pin:
        return {"valid": True}
    return {"valid": False, "message": "PIN non valido"}

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
    dt = datetime.strptime(data, "%Y-%m-%d")
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
    t = Timbratura(
        **input.dict(),
        ore_lavorate=ore_lavorate,
        ore_arrotondate=ore_arrotondate
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
    row = _row(await cur.fetchone())
    if not row:
        raise HTTPException(status_code=404, detail="Timbratura non trovata")
    update_data = {k: v for k, v in updates.dict().items() if v is not None}
    ora_entrata = update_data.get("ora_entrata", row.get("ora_entrata"))
    ora_uscita = update_data.get("ora_uscita", row.get("ora_uscita"))
    ore_lavorate, ore_arrotondate = calcola_ore_lavorate(ora_entrata, ora_uscita)
    update_data["ore_lavorate"] = ore_lavorate
    update_data["ore_arrotondate"] = ore_arrotondate
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
        marcature.append(nuova_marcatura)
        ore_totali = calcola_ore_da_marcature(marcature)
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
             ore_totali, round(ore_totali * 4) / 4, ore_reperibilita,
             int(any(m.get("is_reperibilita") for m in marcature)), data]
        )
        await _db.commit()
    else:
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
        start = datetime.strptime(input.data_inizio, "%Y-%m-%d")
        end = datetime.strptime(input.data_fine, "%Y-%m-%d")
        ore = ((end - start).days + 1) * 8
    a = Assenza(**input.dict(), ore_totali=ore)
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
    rep = Reperibilita(**input.dict(), ore_totali=round(ore, 2), compenso_calcolato=compenso)
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
    busta_data = input.dict()
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
async def upload_busta_paga(anno: int, mese: int, file: UploadFile = File(...)):
    content = await file.read()
    b64 = base64.b64encode(content).decode()
    parse_result = parse_zucchetti_pdf(content, file.filename)
    update_fields = {"pdf_base64": b64, "pdf_nome": file.filename}
    if parse_result["success"]:
        if parse_result.get("netto"):
            update_fields["netto"] = parse_result["netto"]
        elementi = parse_result.get("elementi_retributivi", {})
        if elementi.get("paga_base"):
            update_fields["paga_base"] = elementi["paga_base"]
        ore = parse_result.get("ore", {})
        if ore.get("straordinarie"):
            update_fields["straordinari_ore"] = ore["straordinarie"]
        totali = parse_result.get("totali", {})
        if totali.get("competenze"):
            update_fields["lordo"] = totali["competenze"]
        if totali.get("trattenute"):
            update_fields["trattenute_totali"] = totali["trattenute"]

    cur = await _db.execute(
        "SELECT id FROM buste_paga WHERE anno = ? AND mese = ?", [anno, mese]
    )
    existing = await cur.fetchone()
    if existing:
        set_clause = ", ".join(f"{k} = ?" for k in update_fields.keys())
        await _db.execute(
            f"UPDATE buste_paga SET {set_clause} WHERE anno = ? AND mese = ?",
            list(update_fields.values()) + [anno, mese]
        )
        await _db.commit()
    else:
        new_id = str(uuid.uuid4())
        b = BustaPaga(id=new_id, anno=anno, mese=mese, **{
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
        await _db.commit()

    cur = await _db.execute(
        "SELECT * FROM buste_paga WHERE anno = ? AND mese = ?", [anno, mese]
    )
    row = _busta_from_row(_row(await cur.fetchone()))
    return {
        "busta": BustaPaga(**row).dict(),
        "parse_success": parse_result["success"],
        "parsed_data": {k: v for k, v in parse_result.items()
                        if k not in ["raw_text", "success", "errors", "filename"]}
    }

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

    update_data = {k: v for k, v in updates.dict().items() if v is not None}
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
async def get_documenti(tipo: Optional[str] = None):
    if tipo:
        cur = await _db.execute(
            "SELECT * FROM documenti WHERE tipo = ? ORDER BY created_at DESC", [tipo]
        )
    else:
        cur = await _db.execute("SELECT * FROM documenti ORDER BY created_at DESC")
    rows = _rows(await cur.fetchall())
    for r in rows:
        r["file_base64"] = ""
    return [Documento(**r) for r in rows]

@api_router.get("/documenti/{id}")
async def get_documento(id: str):
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
    data_riferimento: str = Form(None),
    file: UploadFile = File(...)
):
    content = await file.read()
    b64 = base64.b64encode(content).decode()
    fname = file.filename.lower()
    file_tipo = 'pdf' if fname.endswith('.pdf') else \
                'jpg' if fname.endswith(('.jpg', '.jpeg')) else \
                'png' if fname.endswith('.png') else 'altro'
    doc = Documento(
        tipo=tipo, titolo=titolo, descrizione=descrizione,
        file_base64=b64, file_nome=file.filename, file_tipo=file_tipo,
        data_riferimento=data_riferimento
    )
    await _db.execute(
        "INSERT INTO documenti VALUES (?,?,?,?,?,?,?,?,?)",
        [doc.id, doc.tipo, doc.titolo, doc.descrizione, doc.file_base64,
         doc.file_nome, doc.file_tipo, doc.data_riferimento, doc.created_at.isoformat()]
    )
    await _db.commit()
    return doc

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
    mese: int = Form(...),
    anno: int = Form(...),
    file: UploadFile = File(...)
):
    content = await file.read()
    b64 = base64.b64encode(content).decode()
    parse_result = parse_sometime_pdf(content, file.filename)
    imported_count = 0
    if parse_result["success"] and parse_result["timbrature"]:
        parsed_mese = parse_result.get("mese") or mese
        parsed_anno = parse_result.get("anno") or anno
        for t in parse_result["timbrature"]:
            timb = TimbraturaAziendale(
                data=t["data"],
                ora_entrata=t.get("ora_entrata"),
                ora_uscita=t.get("ora_uscita"),
                ore_lavorate=t.get("ore_lavorate", 0.0),
                descrizione=t.get("descrizione"),
                fonte_pdf=file.filename,
                mese_riferimento=parsed_mese,
                anno_riferimento=parsed_anno
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
    doc = Documento(
        tipo="timbrature_report",
        titolo=f"Timbrature Aziendali {mese:02d}/{anno}",
        descrizione=f"Report timbrature aziendali per {mese}/{anno}",
        file_base64=b64, file_nome=file.filename, file_tipo="pdf",
        data_riferimento=f"{anno}-{mese:02d}"
    )
    await _db.execute(
        "INSERT INTO documenti VALUES (?,?,?,?,?,?,?,?,?)",
        [doc.id, doc.tipo, doc.titolo, doc.descrizione, doc.file_base64,
         doc.file_nome, doc.file_tipo, doc.data_riferimento, doc.created_at.isoformat()]
    )
    await _db.commit()
    return {
        "message": f"PDF caricato e {imported_count} timbrature importate automaticamente",
        "documento_id": doc.id,
        "filename": file.filename,
        "mese": mese, "anno": anno,
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
        imported.append(timb.dict())
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
    now = datetime.now()
    mese = now.month
    anno = now.year
    cur = await _db.execute("SELECT * FROM settings LIMIT 1")
    settings = _settings_from_row(_row(await cur.fetchone()))
    if not settings:
        settings = UserSettings().dict()
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
    quota_oraria = base_mensile / (settings.get("divisore_orario") or 169)
    straordinario_stimato = ore_straordinarie * quota_oraria * 1.18
    ticket_totale = giorni_con_ticket * (settings.get("ticket_valore") or 8)
    lordo_stimato = base_mensile + straordinario_stimato + ticket_totale
    netto_stimato = lordo_stimato * 0.72
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
            "ticket_totale": round(ticket_totale, 2)
        },
        "ferie": ferie_data,
        "comporto": comporto_data,
        "ultima_busta": _safe_busta_paga(last_busta_row) if last_busta_row else None,
        "alerts_non_letti": alerts_count,
        "settings": UserSettings(**settings).dict()
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
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY non configurata")
    try:
        cur = await _db.execute("SELECT * FROM settings LIMIT 1")
        settings = _settings_from_row(_row(await cur.fetchone())) or {}
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
Nome: {settings.get('nome', 'Zambara Marco')}
Qualifica: {settings.get('qualifica', 'Operaio')} - Livello: {settings.get('livello', 5)}
Azienda: {settings.get('azienda', 'Plastiape SpA')}, {settings.get('sede', 'Osnago (LC)')}
CCNL: {settings.get('ccnl', 'Unionchimica Confapi — Gomma Plastica')}
Data assunzione: {settings.get('data_assunzione', '2015-07-11')}
Orario: {settings.get('orario_tipo', 'Giornata fissa Lun-Ven')}, {settings.get('ore_giornaliere', 8)}h/giorno

=== ELEMENTI RETRIBUTIVI ATTUALI ===
Paga base: €{settings.get('paga_base', 2026.64):.2f}
Scatti anzianità: €{settings.get('scatti_anzianita', 66.88):.2f} (quinto scatto N.4,80 × €13,94)
Superminimo: €{settings.get('superminimo', 469.41):.2f}
Premio incarico: €{settings.get('premio_incarico', 56.90):.2f}
Totale base mensile: €{base_mensile:.2f}
Divisore orario: {settings.get('divisore_orario', 169)} → quota oraria €{quota_oraria:.2f}
Divisore giornaliero: {settings.get('divisore_giornaliero', 25)} → quota giornaliera €{base_mensile / (settings.get('divisore_giornaliero') or 25):.2f}
Ticket elettronico: €{settings.get('ticket_valore', 8.00):.2f}/giorno se ore totali ≥ 5h

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
            model="gemini-1.5-flash-latest",
            history=gemini_history,
            config=genai_types.GenerateContentConfig(
                system_instruction=system_prompt,
                max_output_tokens=2048,
            )
        )
        response = await chat.send_message(request.message)
        reply = response.text

        # Salva nella cronologia
        now_iso = datetime.utcnow().isoformat()
        user_msg = ChatMessage(role="user", content=request.message)
        asst_msg = ChatMessage(role="assistant", content=reply)
        await _db.execute(
            "INSERT INTO chat_history VALUES (?,?,?,?,?)",
            [user_msg.id, session_id, user_msg.role, user_msg.content, now_iso]
        )
        await _db.execute(
            "INSERT INTO chat_history VALUES (?,?,?,?,?)",
            [asst_msg.id, session_id, asst_msg.role, asst_msg.content,
             datetime.utcnow().isoformat()]
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
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# ============== APP SETUP ==============

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    global _db, _gemini_client
    _db = await aiosqlite.connect(str(DB_PATH))
    _db.row_factory = aiosqlite.Row
    await _db.execute("PRAGMA journal_mode=WAL")
    await _db.execute("PRAGMA foreign_keys=ON")
    await init_db()
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key:
        _gemini_client = genai.Client(api_key=api_key)
        logger.info("Gemini client inizializzato")
    else:
        logger.warning("GEMINI_API_KEY non configurata — chat disabilitata")

@app.on_event("shutdown")
async def shutdown():
    if _db:
        await _db.close()

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)
