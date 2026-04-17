# frontend/CLAUDE.md — Entry point Claude Code per frontend

> Regole generali del progetto: [../CONTRIBUTING.md](../CONTRIBUTING.md).
> Specificità frontend: [./AGENTS.md](./AGENTS.md).
> Zone protette: [../PROTECTED_ZONES.md](../PROTECTED_ZONES.md).

## Promemoria operativo

Prima di modificare un componente UI:

1. Leggi il file con `Read` — non assumere la struttura.
2. Verifica che il componente gestisca i 4 stati (loading, empty, errore, successo).
3. Mobile-first da 375px, touch target ≥ 44×44px.
4. Se il cambio è visibile all'utente, condividi uno screenshot o uno schema prima di spingerlo.
5. Aggiorna `CHANGELOG.md` con una riga datata dopo ogni modifica visiva significativa.

## Strumenti rapidi

- `playwright` CLI per smoke visuale locale.
- `playwright-interactive` per debug iterativo con browser persistente.
- `screenshot` per catture mirate.
