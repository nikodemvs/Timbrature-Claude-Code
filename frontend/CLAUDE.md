# CLAUDE.md — Frontend (Claude Code)

## Allineamento con AGENTS.md
Questo file integra `frontend/AGENTS.md` per l'uso con Claude Code.
**In caso di conflitto con `frontend/AGENTS.md`: analizzare il conflitto, chiedere all'utente se applicare la modifica, e suggerire come allineare i due file.**
Quando `frontend/AGENTS.md` viene modificato, aggiornare anche questo file.

Per le regole complete (mobile-first, offline, testing visual, zona protetta) leggi `frontend/AGENTS.md`.
Per le regole generali del progetto leggi `AGENTS.md` (root) e `CLAUDE.md` (root).

---

## Zona protetta — reminder
`src/helpers.ts` (L12, L19, L83) contiene funzioni di formattazione protette.
Non modificare senza conferma esplicita.

---

## Orchestrazione Claude Code per il frontend

Prima di modificare componenti UI:
1. Leggi i file interessati — non assumere la struttura
2. Per nuovi componenti o refactoring, usa un Plan agent
3. Verifica che il componente gestisca i 4 stati: loading, empty, errore, successo
4. Aggiorna `CHANGELOG.md` dopo ogni modifica visiva significativa

Sub-agent di riferimento:
- `agents/FRONTEND_UI_AGENT.md`
- `agents/OFFLINE_DATA_AGENT.md`
- `agents/PAYROLL_LOGIC_AGENT.md`
- `agents/QA_AGENT.md`

La memoria persistente condivisa con Claude Code vive in `memory/MEMORY.md`.

## Strumenti di controllo e sviluppo

### Flusso automatico dei test
- `pre-commit` esegue solo `pytest -m "unit or api"`.
- `pre-push` esegue solo `pytest -m "unit or api"` + `pytest -m e2e_smoke`.
- `CI` esegue il gate rapido e aggiunge i controlli speciali (`e2e`, `visual`, `docs_config`, `offline_runtime`, `tsc`) quando servono.
- Gate reali:
  - `pytest -m e2e_smoke` nel `pre-push` per smoke browser rapido dell'avvio.
  - `pytest -m "e2e and not e2e_smoke"` solo in `CI` per flussi utente completi.
  - `pytest -m visual` solo in `CI` per layout, responsive, dark mode e touch target.
  - `pytest -m "unit or api"` come gate rapido locale.
  - `pytest -q tests/test_docs_config.py`, `pytest -q tests/test_offline_runtime.py` e `tsc --noEmit` in `CI` quando i path lo richiedono.
- Regola anti-duplicazione:
  - logica pura e calcoli solo in `unit` o nel gate backend;
  - API e storage solo in `api`;
  - flussi utente solo in `e2e`;
  - resa visiva solo in `visual`;
  - non duplicare in `e2e` ciò che è già coperto bene da `unit` o `api`.

### Strumenti utili
- `playwright` (CLI Skill) per verifiche E2E/visual locali durante sviluppo.
- `playwright-interactive` per debug visivo iterativo (browser persistente), non come gate automatico.
- `screenshot` per catture mirate durante QA manuale.
- `figma`, `figma-implement-design` e `frontend-skill` sono utili quando l'input arriva da mockup o serve alzare il livello della UI.
- `pdf` è utile per import documentali e flussi che partono da cedolini o CUD.
- `security-best-practices` è utile quando tocchi dati utente o flussi esposti.

---

## Test visual con MCP Tools (Claude Code only)

Oltre a Playwright (`tests/test_e2e.py` con marker `@pytest.mark.visual`), sono disponibili:

- **Claude Preview MCP** — avvia preview dell'app, cattura screenshot a 375px e 768px, verifica layout
- **Chrome MCP** — naviga nell'app nel browser, verifica touch target, contrasto, font size

Uso consigliato:
- Playwright per test visual automatizzati e CI
- MCP Preview/Chrome per verifica rapida interattiva durante sviluppo (non sostituisce i test formali)
