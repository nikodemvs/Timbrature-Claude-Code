# TEST_RUN — ciclo corrente

> Questo file traccia solo l'ultimo run di test completato.
> Viene sovrascritto ad ogni nuovo ciclo. La storia permanente è in `CHANGELOG.md`.

**Timestamp:** 2026-03-25
**Commit/SHA:** —
**Agente:** Claude Code

## Gate eseguito

- `pytest -m "unit or api"` — gate rapido backend

## Esito

- [x] PASS — 57 passed, 10 deselected in 0.41s

## Test coinvolti

- `pytest -m "unit or api"` → 57 passed ✓

## Note

Fix `.data` su `offlineApi.*` in timbrature.tsx e altro.tsx.
`offlineApi.*` restituisce i dati direttamente (non AxiosResponse),
il vecchio codice accedeva `.data` → `undefined`.
