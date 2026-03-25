# TEST_RUN — ciclo corrente

> Questo file traccia solo l'ultimo run di test completato.
> Viene sovrascritto ad ogni nuovo ciclo. La storia permanente è in `CHANGELOG.md`.

**Timestamp:** 2026-03-26
**Commit/SHA:** —
**Agente:** Codex

## Gate eseguito

`cd frontend && npx tsc --noEmit`

## Esito

- [ ] PASS
- [x] FAIL

## Test coinvolti

- `npx tsc --noEmit` → fallito con errori pre-esistenti in `app/(tabs)/altro.tsx` e `src/storage/fileStore.ts`

## Note

- Nessun errore TypeScript in `frontend/src/services/offlineApi.ts` dopo la modifica.
- Errori residui:
  - `app/(tabs)/altro.tsx`: proprietà `settingLabel` e `settingValue` mancanti nello style object
  - `src/storage/fileStore.ts`: incompatibilità tipi `expo-file-system` (`documentDirectory`, `EncodingType`, opzione `size` in `InfoOptions`)
