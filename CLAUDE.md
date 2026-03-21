# CLAUDE.md — BustaPaga (Claude Code)

## Allineamento con AGENTS.md
Questo file integra `AGENTS.md` per l'uso con Claude Code.
**In caso di conflitto tra questo file e `AGENTS.md`: analizzare il conflitto, chiedere all'utente se applicare la modifica, e suggerire come allineare i due file.**
Quando `AGENTS.md` viene modificato, aggiornare anche questo file di conseguenza.

Per le regole complete del progetto (zona protetta, offline-first, multi-user, testing, lingua) leggi `AGENTS.md`.

---

## ZONA PROTETTA — NON MODIFICARE MAI

Copia identica da `AGENTS.md`. Questi numeri di riga sono vincolanti.

### backend/server.py
- L494 arrotonda_quarti_ora
- L506 calcola_ore_lavorate
- L527 calcola_straordinario
- L547 calcola_ticket
- L550, L553 calcolo reperibilità
- L556, L569 ore da marcature
- L924 saldo ferie
- L951 comporto malattia
- L1338 confronto timbrature
- L1392 dashboard aggregata
- L1454 statistiche mensili

### backend/sometime_parser.py (da L17)
### backend/zucchetti_parser.py (da L18)

### frontend/src/helpers.ts
- L12 formatta valuta
- L19 formatta ore
- L83 percentuale

**Se un algoritmo esiste sia nel backend che nel frontend, sono una coppia: non si tocca uno senza toccare l'altro.**

---

## Progetto condiviso Claude Code + Codex

Questo repository è usato da entrambi gli agenti:
- **Codex** legge `AGENTS.md` e `.codex/` — non toccare queste risorse
- **Claude Code** legge `CLAUDE.md` e usa `.claude/` per la configurazione
- Entrambi aggiornano `CHANGELOG.md` dopo ogni modifica significativa
- `memory/MEMORY.md` è la memoria persistente di Claude Code — Codex può leggerla per aggiornare il proprio contesto

---

## Memoria e contesto tra sessioni

- **`CHANGELOG.md`** — registro cronologico di tutte le modifiche; leggilo all'inizio di ogni sessione per sapere a che punto è il progetto
- **`memory/MEMORY.md`** — memoria persistente di Claude Code (preferenze utente, decisioni architetturali, feedback); aggiornala quando apprendi qualcosa di rilevante per sessioni future
- **`AGENTS.md`** — regole del progetto; sempre valide, non cambiano tra sessioni

---

## Orchestrazione Claude Code

### Sistema di agenti
- **Explore agent** — per esplorare il codebase, cercare file, capire pattern esistenti
- **Plan agent** — per progettare l'approccio implementativo prima di scrivere codice
- **general-purpose agent** — per task complessi multi-step o ricerche approfondite
- Lancia agenti **in parallelo** quando i task sono indipendenti (singolo messaggio, più tool call)
- Usa Explore/Plan prima di eseguire modifiche non banali — non assumere, verifica

### Quando esplorare prima di agire
- Task che toccano più file → Explore agent
- Nuove funzionalità o refactoring → Plan agent prima di scrivere codice
- Bug fix su codice non letto → leggi prima con Read/Grep

### Tool call parallelism
- Più letture di file indipendenti → in parallelo
- Più ricerche → in parallelo
- Tool che dipendono dal risultato di un altro → in sequenza

---

## MCP Tools disponibili (Claude Code only)

Strumenti aggiuntivi rispetto a Playwright per test visual e UX:

- **Claude Preview MCP** (`mcp__Claude_Preview__*`) — avvia un server di preview, cattura screenshot, verifica layout responsive, simula click e interazioni
- **Chrome MCP** (`mcp__Claude_in_Chrome__*`) — naviga nel browser, legge la pagina, interagisce con form, cattura screenshot

Uso consigliato:
- Playwright resta lo strumento principale per test E2E e visual automatizzati (marker `@pytest.mark.visual`)
- MCP Preview/Chrome sono utili per verifica rapida interattiva durante lo sviluppo, senza scrivere test formali

---

## Cartelle
- `.claude/` — configurazione Claude Code (settings, piani, memoria) — non ignorare
- `.codex/` — configurazione Codex — non toccare
- `memory/` — memoria persistente Claude Code, condivisibile con Codex
