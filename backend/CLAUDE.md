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
