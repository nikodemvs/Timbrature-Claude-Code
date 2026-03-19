# AGENTS.md — Backend

Python/FastAPI, porta 8000, Docker, deploy su Render.

## File critici
- `server.py` — API REST + algoritmi di calcolo (ZONA PROTETTA, vedi root AGENTS.md)
- `sometime_parser.py` — parser PDF Sometime (ZONA PROTETTA)
- `zucchetti_parser.py` — parser PDF Zucchetti (ZONA PROTETTA)
- `Dockerfile` — build container

## Endpoint API
| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| GET | /api/ | Info API |
| GET | /api/health | Health check |
| GET/PUT | /api/settings | Impostazioni utente |
| GET | /api/dashboard | Dashboard con stime |
| GET/POST | /api/timbrature | Lista e crea timbrature |
| POST | /api/timbrature/timbra?tipo=entrata\|uscita | Timbra rapido |
| GET | /api/timbrature/settimana/{data} | Riepilogo settimanale |
| GET/POST | /api/assenze | Lista e crea assenze |
| GET | /api/ferie/saldo | Saldo ferie |
| GET | /api/malattia/comporto | Stato comporto |
| GET/POST | /api/reperibilita | Reperibilità |
| GET/POST | /api/buste-paga | Buste paga |
| PUT | /api/buste-paga/{anno}/{mese} | Aggiorna busta paga |
| POST | /api/chat | Chat AI Gemini |
| GET | /api/chat/history | Storico chat |

## Regole
- Ogni nuovo endpoint ha un test
- Validazione Pydantic su ogni input
- Errori in italiano, mai stack trace
- Date ISO 8601, ore HH:MM, importi float 2 decimali
- GEMINI_API_KEY solo da env var, mai nel codice
- Le risposte devono essere cacheable dal frontend (pensare offline-first)

## Testing
- Test unitari: `tests/test_unit.py` — importa e chiama direttamente le funzioni di `server.py`, `sometime_parser.py`, `zucchetti_parser.py`
- Test API: `tests/test_api.py` — httpx + TestClient di FastAPI, no server
- Strumenti: pytest, httpx, pytest-asyncio
- Ogni nuovo endpoint deve avere test in `tests/test_api.py` (positivo + errore)
- Ogni modifica a una funzione di calcolo deve passare i test unitari esistenti senza alterarli
