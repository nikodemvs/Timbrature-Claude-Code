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

---

## Test visual con MCP Tools (Claude Code only)

Oltre a Playwright (`tests/test_e2e.py` con marker `@pytest.mark.visual`), sono disponibili:

- **Claude Preview MCP** — avvia preview dell'app, cattura screenshot a 375px e 768px, verifica layout
- **Chrome MCP** — naviga nell'app nel browser, verifica touch target, contrasto, font size

Uso consigliato:
- Playwright per test visual automatizzati e CI
- MCP Preview/Chrome per verifica rapida interattiva durante sviluppo (non sostituisce i test formali)
