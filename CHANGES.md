# CHANGES — ciclo corrente

> Questo file traccia solo l'ultimo ciclo completato.
> Viene sovrascritto ad ogni nuovo ciclo. La storia permanente è in `CHANGELOG.md`.

**Timestamp:** 2026-03-26
**Commit/SHA:** b5624df
**Agente:** Codex

## File modificati

- `frontend/src/services/offlineApi.ts` — completati wrapper offline-first per Buste Paga (`uploadCud`, `createBustaPaga`, `updateBustaPaga`) e relativo replay queue conservativo; già presente `uploadBustaPagaAuto`.
- `frontend/src/storage/fileStore.ts` — allineato a `expo-file-system/legacy` per compatibilità TypeScript (`documentDirectory`, `EncodingType`, `InfoOptions`).
- `frontend/app/(tabs)/altro.tsx` — migrazione completa chiamate da `api.*` a `offlineApi.*` + aggiunti stili mancanti `settingLabel/settingValue`.
- `frontend/app/(tabs)/index.tsx` — rimosso import residuale inutile a `api.ts`.
- `frontend/app/(tabs)/assenze.tsx` — rimosso import residuale inutile a `api.ts`.
- `frontend/app/(tabs)/buste-paga.tsx` — sostituite chiamate dirette `api.*` con `offlineApi.*` dove disponibili.
- `CHANGELOG.md` — aggiunta voce datata di chiusura migrazione frontend offline-first.
- `CHANGES.md` — sovrascritto per il ciclo corrente.
- `TEST_RUN.md` — sovrascritto per il ciclo corrente.

## Tipo di modifica

- [x] feature
- [x] fix
- [x] docs
- [x] chore
