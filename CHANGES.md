# CHANGES — ciclo corrente

> Questo file traccia solo l'ultimo ciclo completato.
> Viene sovrascritto ad ogni nuovo ciclo. La storia permanente è in `CHANGELOG.md`.

**Timestamp:** 2026-03-25
**Commit/SHA:** —
**Agente:** Claude Code

## File modificati

- `frontend/src/db/localDb.ts` — aggiunto pattern `SELECT * FROM buste_paga WHERE anno = ? AND mese = ?` nel `memoryDb.getAllAsync`; il pattern mancante causava `Unsupported web getAllAsync SQL` su chiamate a `getBustaPaga(anno, mese)`

## Tipo di modifica

- [x] fix

## Causa root

`getBustaPaga(anno, mese)` usa `getFirstAsync` → `getAllAsync` con query `SELECT * FROM buste_paga WHERE anno = ? AND mese = ?`.
Il `memoryDb` (web fallback) non gestiva questa query → `Error: Unsupported web getAllAsync SQL`.

## Verifica

- Fix identificato dal QA_AGENT tramite analisi copertura pattern SQL memoryDb
- Fix applicato dall'OFFLINE_DATA_AGENT
