# backend/AGENTS.md — Entry point backend

> Regole generali del progetto: [../CONTRIBUTING.md](../CONTRIBUTING.md).
> Questo file contiene solo specificità backend.

## File critici

- `server.py` — API REST + algoritmi di calcolo (**zone protette**, vedi [../PROTECTED_ZONES.md](../PROTECTED_ZONES.md))
- `server_nas.py` — duplicato quasi identico per deploy NAS (da unificare, vedi `REFERTO_RESTAURO.md`)
- `sometime_parser.py` — parser PDF timbrature (**intero modulo protetto**)
- `zucchetti_parser.py` — parser PDF buste paga (**intero modulo protetto**)

## Test backend

- Unit: `tests/test_unit.py` — chiama direttamente le funzioni di calcolo e i parser.
- API: `tests/test_api.py` — `httpx` + `TestClient` FastAPI, nessun server reale.
- Strumenti: `pytest`, `httpx`, `pytest-asyncio`.
- Ogni nuovo endpoint ha test positivo + errore.
- Modifiche agli algoritmi devono passare i test unitari esistenti **senza alterarli**.

## Preview locale

```powershell
..\start-backend.ps1    # porta 8001
```

## Mappa endpoint

La tabella autoritativa delle rotte HTTP vive in [../CONTRIBUTING.md § 4](../CONTRIBUTING.md#4-convenzioni-backend-backend).
