# MEMORY — BustaPaga

- Gemini può accedere ai dati e ai file utente necessari per rispondere.
- Evita log superflui o dati personali non necessari.
- Preview locale: backend `8001`, frontend `8083`.
- Offline-first: dati operativi in locale con SQLite e file storage, backend come sync/backup quando online.
## Controlli

- Controlli standard: `pytest -m "unit or api"` per i gate locali; `pytest -m e2e_smoke`, `pytest -m "e2e and not e2e_smoke"`, `pytest -m visual`, `pytest -q tests/test_docs_config.py`, `pytest -q tests/test_offline_runtime.py`, `tsc --noEmit` in CI.
- Automazione test: `pre-commit` lancia solo `pytest -m "unit or api"`, `pre-push` lancia solo `pytest -m "unit or api"`, `CI` esegue suite browser (`e2e_smoke`, `e2e`, `visual`) + check path-aware.
- E2E/visual in locale: usare `playwright` (CLI Skill), `playwright-interactive` e `screenshot` per debug iterativo; non usare `pytest -m e2e` o `pytest -m visual` come gate locale.
- Anti-duplicazione: logica pura in `unit`, HTTP/storage in `api`, flussi utente in `e2e`, resa visiva in `visual`; non coprire la stessa regola in più livelli se il livello più basso basta.

## Skill Utili (non vincolanti)

Questa sezione è informativa e separata dai controlli.
- Skill subito utili: `playwright`, `playwright-interactive`, `pdf`, `screenshot`, `frontend-skill`, `figma`, `figma-implement-design`.
- Skill utili in casi specifici: `render-deploy`, `sentry`, `spreadsheet`, `security-best-practices`, `security-threat-model`, `openai-docs`, `skill-installer`, `skill-creator`.
