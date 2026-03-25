# CHANGES — ciclo corrente

> Questo file traccia solo l'ultimo ciclo completato.
> Viene sovrascritto ad ogni nuovo ciclo. La storia permanente è in `CHANGELOG.md`.

**Timestamp:** 2026-03-25
**Commit/SHA:** —
**Agente:** Claude Code

## File modificati

- `frontend/app/(tabs)/timbrature.tsx` — fix critico: `setTimbrature(timbRes.data)` → `setTimbrature(timbRes as Timbratura[])`
  - `offlineApi.getTimbrature` ritorna `Timbratura[]` direttamente, non `AxiosResponse`
  - Il `.data` era `undefined` → la tab mostrava "Nessuna timbratura"

- `frontend/app/(tabs)/altro.tsx` — migrazione a offlineApi:
  - Aggiunto `import * as offlineApi from '../../src/services/offlineApi'`
  - `loadAlerts`: `api.getAlerts()` → `offlineApi.getAlerts()`, rimosso `.data`
  - `loadReperibilita`: `api.getReperibilita()` → `offlineApi.getReperibilita()`, rimosso `.data`
  - `loadDailyStats`: `api.getTimbrature()` → `offlineApi.getTimbrature()`, rimosso `.data`
  - `refreshDashboard`: `api.getSettings/getDashboard` → `offlineApi.*`, adattato accesso diretto
  - `saveSettings`: `api.updateSettings` → `offlineApi.updateSettings`
  - `savePin`: `api.updateSettings` → `offlineApi.updateSettings`

## Tipo di modifica

- [x] fix

## Causa root

Migrazione offline-first incompleta: alcune funzioni erano state cambiate da `api.*` a `offlineApi.*`
ma l'accesso `.data` (specifico di AxiosResponse) non era stato rimosso.
`offlineApi.*` restituisce i dati direttamente, non dentro `{ data: ... }`.

## Verifica

- `pytest -m "unit or api"` → 57 passed ✓
- Tab timbrature: fix `.data` → mostra timbrature locali ✓
- Tab altro: funzioni offline-first ✓
