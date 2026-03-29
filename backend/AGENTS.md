# AGENTS.md — Backend

Python/FastAPI, porta locale di preview 8001, Docker, deploy su Render.

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
| POST | /api/settings/verify-pin | Verifica PIN locale |
| GET | /api/dashboard | Dashboard con stime |
| GET/POST | /api/timbrature | Lista e crea timbrature |
| GET/PUT/DELETE | /api/timbrature/{data} | Lettura, aggiornamento e cancellazione timbratura |
| POST | /api/timbrature/timbra?tipo=entrata\|uscita | Timbra rapido |
| GET | /api/timbrature/settimana/{data} | Riepilogo settimanale |
| GET/POST | /api/assenze | Lista e crea assenze |
| POST | /api/assenze/{id}/certificato | Caricamento certificato medico |
| GET | /api/ferie/saldo | Saldo ferie |
| GET | /api/malattia/comporto | Stato comporto |
| GET/POST | /api/reperibilita | Reperibilità |
| DELETE | /api/reperibilita/{id} | Elimina reperibilità |
| GET/POST | /api/buste-paga | Buste paga |
| POST | /api/buste-paga/upload | Upload busta paga con mese automatico |
| POST | /api/buste-paga/{anno}/{mese}/upload | Upload busta paga per periodo esplicito |
| PUT | /api/buste-paga/{anno}/{mese} | Aggiorna busta paga |
| GET/POST | /api/documenti | Archivio documenti |
| GET/DELETE | /api/documenti/{id} | Lettura e cancellazione documento |
| POST | /api/cud/upload | Upload CUD |
| GET/POST | /api/alerts | Lista e crea alert |
| PUT | /api/alerts/{id}/letto | Segna alert come letto |
| DELETE | /api/alerts/{id} | Elimina alert |
| POST | /api/chat | Chat AI Gemini |
| GET | /api/chat/history | Storico chat |
| DELETE | /api/chat/history | Svuota storico chat |
| GET/POST | /api/timbrature-aziendali | Import e lettura timbrature aziendali |
| GET/DELETE | /api/timbrature-aziendali/{data} | Lettura e cancellazione timbratura aziendale |
| DELETE | /api/timbrature-aziendali | Elimina un mese di timbrature aziendali |
| GET | /api/confronto-timbrature | Confronto timbrature azienda/utente |
| GET | /api/statistiche/mensili | Statistiche mensili aggregate |

## Regole
- Ogni nuovo endpoint ha un test
- Validazione Pydantic su ogni input
- Errori in italiano, mai stack trace
- Date ISO 8601, ore HH:MM, importi float 2 decimali
- GEMINI_API_KEY solo da env var, mai nel codice
- Le risposte devono essere cacheable dal frontend (pensare offline-first)
- Gemini può leggere i dati e i file utente necessari a rispondere; evita log superflui e dati personali inutili

## Orchestrazione
- Codex è l'orchestratore del lavoro backend, non il primo esecutore
- I sub-agent backend devono lavorare con ownership chiara e ambito limitato ai file o moduli assegnati
- Se esiste un sub-agent backend adatto e libero, il task va delegato prima di essere eseguito direttamente da Codex
- Se un sub-agent backend fallisce, prima si tenta di sbloccarlo, restringere il task o riassegnarlo a un altro sub-agent equivalente
- Codex interviene direttamente sul backend solo quando tutti i sub-agent adatti sono già impegnati oppure realmente bloccati

## Sub-agent di riferimento
- `agents/BACKEND_API_AGENT.md` — endpoint, storage, schema, migrazioni e test API
- `agents/PAYROLL_LOGIC_AGENT.md` — verifica di algoritmi, parser e costanti di dominio senza modificare la zona protetta senza conferma
- `agents/QA_AGENT.md` — regressioni backend e copertura test

## Testing
- Test unitari: `tests/test_unit.py` — importa e chiama direttamente le funzioni di `server.py`, `sometime_parser.py`, `zucchetti_parser.py`
- Test API: `tests/test_api.py` — httpx + TestClient di FastAPI, no server
- Strumenti: pytest, httpx, pytest-asyncio
- Ogni nuovo endpoint deve avere test in `tests/test_api.py` (positivo + errore)
- Ogni modifica a una funzione di calcolo deve passare i test unitari esistenti senza alterarli

## Strumenti di controllo e sviluppo

### Flusso automatico dei test
- `pre-commit` esegue la suite minima sui file backend staged.
- `pre-push` esegue il gate rapido backend e aggiunge i controlli speciali se il path lo richiede.
- `CI` esegue sempre il gate rapido backend e aggiunge i controlli speciali solo quando servono.
- Gate reali:
  - `pytest -m unit` per logica pura, algoritmi e parser isolati.
  - `pytest -m api` per contratti HTTP, validazioni e storage backend.
  - `pytest -m "unit or api"` come gate rapido predefinito backend.
  - `pytest -q tests/test_docs_config.py` quando tocchi docs, memory, porte preview o policy operative.
  - `pytest -q tests/test_offline_runtime.py` quando tocchi offline queue, storage locale o sync.
- Regola anti-duplicazione:
  - logica pura e calcoli solo in `unit`;
  - HTTP, validazioni e persistenza solo in `api`;
  - non duplicare lo stesso comportamento in test backend multipli se un livello più basso lo copre già bene.

### Strumenti utili
- `pdf` e `screenshot` sono i tool utili quando tocchi parser, import documenti o layout di file.
- `sentry` e `security-best-practices` sono utili per incidenti, regressioni e flussi sensibili.
- `security-threat-model` e `render-deploy` sono utili quando cambi superfici esposte o deploy.
- `openai-docs` va usato solo se lavori su integrazioni OpenAI o documentazione di quel stack.

## Allineamento documentale
- Se aggiorni regole o policy in questo file, aggiorna nella stessa sessione anche `backend/CLAUDE.md`.
- Se l'allineamento chiude un ciclo operativo, aggiorna anche i file root `CHANGES.md` e `TEST_RUN.md`.
