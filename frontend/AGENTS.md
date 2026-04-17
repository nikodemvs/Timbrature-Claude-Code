# frontend/AGENTS.md — Entry point frontend

> Regole generali del progetto: [../CONTRIBUTING.md](../CONTRIBUTING.md).
> Questo file contiene solo specificità frontend.

## File critici

- `src/utils/helpers.ts` — formattazione valuta, ore, percentuali (**zone protette**, vedi [../PROTECTED_ZONES.md](../PROTECTED_ZONES.md))
- `src/algorithms/calcoli.ts` — mirror TypeScript degli algoritmi backend (**intero modulo protetto**)
- `src/services/offlineApi.ts` — facade cache-first (target di refactor, Fase C del piano)
- `src/services/api.ts` — chiamate HTTP low-level
- `src/db/localDb.ts` — SQLite locale + fallback web
- `app/(tabs)/index.tsx` — schermata Home
- `app/(tabs)/timbrature.tsx` — UI timbrature

## Principio

La UI **non calcola**. Richiama `offlineApi` / `calcoli` e mostra. Se devi aggiungere logica, chiediti prima se va in `algorithms/` o `services/`.

## Test frontend

- `tests/test_e2e.py` con Playwright per flussi utente.
- Marker `@pytest.mark.visual` per screenshot responsive e dark mode.
- Screenshot a 375px (mobile) e 768px (tablet).
- Ogni modifica visiva deve passare i test visual esistenti.

In locale, per verifiche E2E/visual durante sviluppo usa `playwright` CLI, `playwright-interactive`, `screenshot`. Non usare `pytest -m e2e` o `pytest -m visual` come gate locale.

## Preview locale

```powershell
..\start-frontend.ps1    # porta 8083
```
