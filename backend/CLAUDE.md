# CLAUDE.md — Backend (Claude Code)

## Allineamento con AGENTS.md
Questo file integra `backend/AGENTS.md` per l'uso con Claude Code.
**In caso di conflitto con `backend/AGENTS.md`: analizzare il conflitto, chiedere all'utente se applicare la modifica, e suggerire come allineare i due file.**
Quando `backend/AGENTS.md` viene modificato, aggiornare anche questo file.

Per le regole complete (endpoint, testing, validazione, zona protetta) leggi `backend/AGENTS.md`.
Per le regole generali del progetto leggi `AGENTS.md` (root) e `CLAUDE.md` (root).

---

## Zona protetta — reminder
I file `server.py`, `sometime_parser.py`, `zucchetti_parser.py` contengono algoritmi protetti.
Vedi `CLAUDE.md` (root) per i numeri di riga esatti. Non modificare senza conferma esplicita.

---

## Orchestrazione Claude Code per il backend

Prima di modificare `server.py` o i parser:
1. Leggi i file interessati con `Read` o `Grep` — non assumere la struttura
2. Per modifiche non banali, usa un Plan agent per progettare l'approccio
3. Aggiorna `CHANGELOG.md` dopo ogni modifica
4. Scrivi o aggiorna il test corrispondente in `tests/test_api.py` o `tests/test_unit.py`

Sub-agent di riferimento:
- `agents/BACKEND_API_AGENT.md`
- `agents/PAYROLL_LOGIC_AGENT.md`
- `agents/QA_AGENT.md`

La memoria persistente condivisa con Claude Code vive in `memory/MEMORY.md`.

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
- `pdf` e `screenshot` sono utili per parser, import e verifica di layout di documenti.
- `sentry`, `security-best-practices` e `security-threat-model` sono i tool da preferire quando tocchi dati sensibili o superfici esposte.
- `render-deploy` è utile quando lavori sulla configurazione di deploy.
- `openai-docs` va usato solo per integrazioni OpenAI o docs di quel stack.
