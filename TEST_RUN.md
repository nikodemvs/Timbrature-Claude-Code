# TEST_RUN — ciclo corrente

> Questo file traccia solo l'ultimo run di test completato.
> Viene sovrascritto ad ogni nuovo ciclo. La storia permanente è in `CHANGELOG.md`.

**Timestamp:** 2026-03-26
**Commit/SHA:** pending
**Agente:** Codex

## Gate eseguiti

- `pytest -q -m "unit or api"`
- `cd frontend && npx tsc --noEmit`

## Esito

- [x] PASS
- [ ] FAIL

## Risultati

- `pytest -q -m "unit or api"` → `57 passed, 10 deselected in 0.49s`
- `cd frontend && npx tsc --noEmit` → pass (nessun errore TypeScript)

## Note

- Fix verificata su `offlineApi`: purge locale post-cancellazione per azioni distruttive account/dati operativi.
