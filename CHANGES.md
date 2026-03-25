# CHANGES — ciclo corrente

> Questo file traccia solo l'ultimo ciclo completato.
> Viene sovrascritto ad ogni nuovo ciclo. La storia permanente è in `CHANGELOG.md`.

**Timestamp:** 2026-03-25
**Commit/SHA:** —
**Agente:** Claude Code

## File modificati

- `frontend/src/db/localDb.ts` — aggiunta persistenza localStorage per WEB_STORE:
  - `WEB_STORE_KEY` = `'bustapaga-webstore-v1'`
  - `saveWebStore()` — serializza WEB_STORE in localStorage dopo ogni write
  - `loadWebStore()` — ripristina WEB_STORE da localStorage all'avvio
  - `createMemoryDbImpl()` — rinominata da `createMemoryDb()`
  - `createMemoryDb()` — nuovo wrapper che chiama `saveWebStore()` dopo ogni `runAsync`/`execAsync`
  - `openDb()` — chiama `loadWebStore()` prima di creare il memoryDb su web

## Tipo di modifica

- [x] fix

## Causa root

Su web, `WEB_STORE` era in-memory puro: dati persi ad ogni reload.
Nessuna persistenza tra sessioni → offline-first non funzionante su browser.

## Verifica

- Entrata registrata alle 21:52 → reload pagina → timer attivo, "Oggi sei entrato alle 21:52" ✓
- `localStorage['bustapaga-webstore-v1']` contiene la timbratura ✓
- `pytest -m "unit or api"` → 57 passed ✓
