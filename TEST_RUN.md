# TEST_RUN — ciclo corrente

> Questo file traccia solo l'ultimo run di test completato.
> Viene sovrascritto ad ogni nuovo ciclo. La storia permanente è in `CHANGELOG.md`.

**Timestamp:** 2026-03-26
**Commit/SHA:** b5624df
**Agente:** Codex

## Gate eseguito

- `python -m pytest -q -m "unit or api"` (hook `pre-commit`)
- `python -m pytest -q -m "unit or api"` (hook `pre-push`)
- `cd frontend && npx tsc --noEmit`

## Esito

- [x] PASS
- [ ] FAIL

## Test coinvolti

- `pytest -q -m "unit or api"` → `57 passed, 10 deselected`
- `npx tsc --noEmit` → pass (nessun errore TypeScript)

## Note

- Verificato audit finale frontend: nessun bypass diretto residuo a `services/api.ts` nelle schermate/tab principali (`index`, `assenze`, `timbrature`, `altro`, `buste-paga`).
