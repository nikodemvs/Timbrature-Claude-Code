# CHANGELOG — BustaPaga

Storico del progetto. Ogni modifica significativa viene registrata qui.
Leggere questo file insieme a AGENTS.md per avere il contesto completo.

---

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
