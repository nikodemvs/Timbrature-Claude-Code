# CHANGES — ciclo corrente

> Questo file traccia solo l'ultimo ciclo completato.
> Viene sovrascritto ad ogni nuovo ciclo. La storia permanente è in `CHANGELOG.md`.

**Timestamp:** 2026-03-26
**Commit/SHA:** —
**Agente:** Codex

## File modificati

- `frontend/src/services/offlineApi.ts` — aggiunti i wrapper mancanti usati dal modulo Timbrature (`getWeeklySummary`, `createTimbratura`, `updateTimbratura`, `deleteTimbratura`, `getTimbratureAziendali`, `uploadTimbratureAziendali`, `getConfrontoTimbrature`) con comportamento offline-first coerente e replay queue per create/update/delete timbratura.
- `CHANGELOG.md` — aggiunta voce datata del ciclo.
- `CHANGES.md` — sovrascritto per il ciclo corrente.
- `TEST_RUN.md` — sovrascritto per il ciclo corrente.

## Tipo di modifica

- [x] feature
- [x] fix
