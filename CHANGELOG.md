# CHANGELOG — BustaPaga

Storico del progetto. Ogni modifica significativa viene registrata qui.
Leggere questo file insieme a AGENTS.md per avere il contesto completo.

---

## 2026-03-19 — Fix warning deprecazione FastAPI/Pydantic/datetime
Cosa: sostituiti gli usi deprecati di `datetime.utcnow()`, introdotta una compatibilita runtime per FastAPI/Starlette su Python 3.14+, rimossi gli usi Pydantic v1 fuori dalla zona protetta e mantenuti filtri mirati solo per warning di librerie terze
Perché: ottenere output pulito nei test, evitare regressioni con versioni future di Python e librerie e mantenere intatti gli algoritmi validati manualmente
File: backend/server.py, tests/test_unit.py, tests/conftest.py, pyproject.toml, CHANGELOG.md

## 2026-03-19 — Tema chiaro/scuro con preferenza utente
Cosa: introdotto un sistema di tema light/dark con opzione Sistema, tema persistito e applicazione del tema ai layout globali, componenti condivisi e tab principali del frontend
Perché: rendere l'app più leggibile in ambienti scuri e permettere all'utente di scegliere se seguire il tema del dispositivo o forzare chiaro/scuro
File: frontend/src/utils/colors.ts, frontend/src/store/appStore.ts, frontend/src/hooks/useAppTheme.ts, frontend/src/components/Card.tsx, frontend/src/components/Button.tsx, frontend/src/components/BottomSheet.tsx, frontend/src/components/InputField.tsx, frontend/src/components/LoadingScreen.tsx, frontend/src/components/StatCard.tsx, frontend/src/components/DateTimePicker.tsx, frontend/app/_layout.tsx, frontend/app/(tabs)/_layout.tsx, frontend/app/(tabs)/index.tsx, frontend/app/(tabs)/timbrature.tsx, frontend/app/(tabs)/assenze.tsx, frontend/app/(tabs)/buste-paga.tsx, frontend/app/(tabs)/altro.tsx

## 2026-03-19 — Correzione runtime web e warning UI
Cosa: corretto il bootstrap HTML web che iniettava JavaScript non valido, sostituito il dismiss del bottom sheet con Pressable e centralizzata la gestione delle ombre con uno stile compatibile tra web e native
Perché: eliminare l'errore console sul web, rimuovere warning deprecati del frontend e impedire regressioni sulle superfici principali dell'interfaccia
File: frontend/app/+html.tsx, frontend/app/_layout.tsx, frontend/app/(tabs)/_layout.tsx, frontend/src/components/BottomSheet.tsx, frontend/src/components/Card.tsx, frontend/src/utils/shadows.ts, tests/legacy/frontend-web-runtime-regressions.test.mjs

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
