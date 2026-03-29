# CHANGES — ciclo corrente

> Questo file traccia solo l'ultimo ciclo completato.
> Viene sovrascritto ad ogni nuovo ciclo. La storia permanente è in `CHANGELOG.md`.

**Timestamp:** 2026-03-29
**Commit/SHA:** pending (allineamento in corso)
**Agente:** Codex

## File modificati

- `AGENTS.md` — regole di chiusura task aggiornate con sync obbligatorio `CHANGES.md` + `TEST_RUN.md`; chiarita eccezione documentale su `.claude/`.
- `CLAUDE.md` — procedura di allineamento estesa a `CHANGES.md`/`TEST_RUN.md` e varianti backend/frontend; chiusura task allineata.
- `frontend/AGENTS.md` — policy test frontend allineata a pre-commit/pre-push solo `unit/api`; e2e/visual solo CI; nota di allineamento documentale.
- `frontend/CLAUDE.md` — policy test frontend allineata al root; nota di allineamento documentale.
- `backend/AGENTS.md` + `backend/CLAUDE.md` — aggiunte regole di sync documentale tra coppia backend e file ciclo root.
- `agents/ARCHITECTURE_AGENT.md`
- `agents/BACKEND_API_AGENT.md`
- `agents/FRONTEND_UI_AGENT.md`
- `agents/OFFLINE_DATA_AGENT.md`
- `agents/PAYROLL_LOGIC_AGENT.md`
- `agents/PRODUCT_REQUIREMENTS_AGENT.md`
- `agents/QA_AGENT.md`
  - sezione "Parallelizzazione" uniformata: default sequenziale; parallelismo solo con agenti gia impegnati su task indipendenti.
- `CHANGELOG.md` — nuova entry datata di allineamento governance.
- `CHANGES.md` — sovrascritto con il ciclo corrente.
- `TEST_RUN.md` — sovrascritto con il ciclo corrente.

## Tipo di modifica

- [ ] feature
- [ ] fix
- [x] docs
- [x] chore
