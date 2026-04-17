# backend/CLAUDE.md — Entry point Claude Code per backend

> Regole generali del progetto: [../CONTRIBUTING.md](../CONTRIBUTING.md).
> Specificità backend: [./AGENTS.md](./AGENTS.md).
> Zone protette: [../PROTECTED_ZONES.md](../PROTECTED_ZONES.md).

## Promemoria operativo

Prima di modificare `server.py`, `server_nas.py` o i parser:

1. Leggi i file con `Read` o `Grep` — non assumere la struttura, i numeri di riga cambiano.
2. Verifica che il simbolo toccato non sia elencato in `PROTECTED_ZONES.md`.
3. Aggiungi o aggiorna il test corrispondente in `tests/test_api.py` o `tests/test_unit.py`.
4. Aggiorna `CHANGELOG.md` con una riga datata.
