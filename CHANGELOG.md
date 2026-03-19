# CHANGELOG — BustaPaga

Storico del progetto. Ogni modifica significativa viene registrata qui.
Leggere questo file insieme a AGENTS.md per avere il contesto completo.

---

## 2026-03-19 — Ristrutturazione testing a tre livelli
Cosa: introdotta una strategia di test con marker `unit`, `api`, `e2e`, `visual`, aggiunte regole permanenti nei file AGENTS, creata la configurazione pytest, spostato il test Playwright legacy e aggiunte nuove suite unitarie, API ed E2E/visual con fixture condivise
Perché: separare i controlli veloci di logica e API dai flussi browser, rendere il default di `pytest` rapido e fissare regole stabili per i prossimi agenti che lavoreranno sul progetto
File: AGENTS.md, backend/AGENTS.md, frontend/AGENTS.md, CHANGELOG.md, .gitignore, pyproject.toml, requirements-test.txt, backend/server.py, frontend/app/(tabs)/assenze.tsx, tests/conftest.py, tests/test_unit.py, tests/test_api.py, tests/test_e2e.py, tests/legacy/frontend-web-runtime-regressions.test.mjs

## 2026-03-19 — Inizializzazione sistema agenti
Cosa: creati AGENTS.md (root, backend, frontend) e questo CHANGELOG
Perché: dare a Codex regole autonome per lavorare sul progetto senza briefing ogni volta
File: AGENTS.md, backend/AGENTS.md, frontend/AGENTS.md, CHANGELOG.md

Decisioni architetturali prese:
- Gli algoritmi di calcolo in server.py, sometime_parser.py, zucchetti_parser.py e helpers.ts sono ZONA PROTETTA — non modificabili senza approvazione esplicita
- L'app deve funzionare offline (dati in locale, backend come sync opzionale)
- I dati personali restano sul dispositivo
- Focus attuale: miglioramenti UI/visual e testing
- Multi-user non ancora deciso — non precludere nessuna strada
