# CHANGES — ciclo corrente

> Questo file traccia solo l'ultimo ciclo completato.
> Viene sovrascritto ad ogni nuovo ciclo. La storia permanente è in `CHANGELOG.md`.

**Timestamp:** 2026-03-30
**Commit/SHA:** pending (fix autostart backend NAS post-reboot)
**Agente:** Codex

## File modificati

- `backend/start-nas.sh` — avvio backend NAS reso robusto (health-check, cleanup processi stale, avvio single-process senza `--workers`).
- `CHANGELOG.md` — aggiunta entry del fix autostart post-reboot.
- `CHANGES.md` — sovrascritto con il ciclo corrente.
- `TEST_RUN.md` — sovrascritto con il ciclo corrente.

## Tipo di modifica

- [ ] feature
- [x] fix
- [x] docs
- [ ] chore
