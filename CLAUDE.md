# CLAUDE.md — BustaPaga (Claude Code)

## Allineamento con AGENTS.md
Questo file integra `AGENTS.md` per l'uso con Claude Code.
**In caso di conflitto tra questo file e `AGENTS.md`: analizzare il conflitto, chiedere all'utente se applicare la modifica, e suggerire come allineare i due file.**
Quando `AGENTS.md` viene modificato, aggiornare anche questo file di conseguenza.

Per le regole complete del progetto (zona protetta, offline-first, multi-user, testing, lingua) leggi `AGENTS.md`.

---

## ZONA PROTETTA — NON MODIFICARE MAI

> Fonte di verità unica: **`PROTECTED_ZONES.md`** (root).
> Il dettaglio completo delle righe protette è lì. Questo blocco è mantenuto in sync.

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

### frontend/src/algorithms/calcoli.ts (mirror TypeScript — Fase 2 offline-first)
Port fedele 1:1 degli algoritmi Python sopra. Stessa logica, stessi risultati.
**Non modificare uno senza modificare l'altro.**

**Se un algoritmo esiste sia nel backend che nel frontend, sono una coppia: non si tocca uno senza toccare l'altro.**

---

## Progetto condiviso Claude Code + Codex

Questo repository è usato da entrambi gli agenti:
- **Codex** legge `AGENTS.md` e `.codex/` — non toccare queste risorse
- **Claude Code** legge `CLAUDE.md` e usa `.claude/` per la configurazione
- **Entrambi** leggono `agents/` per i contratti operativi dei sub-agent condivisi
- La memoria persistente condivisa vive in `memory/MEMORY.md`
- Entrambi aggiornano `CHANGELOG.md` dopo ogni modifica significativa
- A fine ciclo, entrambi devono mantenere in sync anche `CHANGES.md` e `TEST_RUN.md`

---

## Memoria e contesto tra sessioni

- **`CHANGELOG.md`** — registro cronologico di tutte le modifiche; leggilo all'inizio di ogni sessione per sapere a che punto è il progetto
- **`memory/MEMORY.md`** — memoria persistente condivisa (preferenze utente, decisioni architetturali, feedback); aggiornala quando apprendi qualcosa di rilevante per sessioni future
- **`AGENTS.md`** — regole del progetto; sempre valide, non cambiano tra sessioni

---

## Chiusura task — commit e push

Regola identica a `AGENTS.md § CHIUSURA TASK`. Applicarla senza eccezioni.

Al termine di ogni task:

1. Aggiorna `CHANGELOG.md`
2. Se il task chiude un ciclo operativo o un allineamento governance, sovrascrivi anche `CHANGES.md` e `TEST_RUN.md` con il ciclo corrente
3. `git add` dei soli file modificati (mai `-A` o `.`)
4. `git commit -m "tipo(scope): descrizione concisa"`
5. `git push` sul branch corrente

Non bypassare i hook (`--no-verify`). Se il pre-commit fallisce, correggi il problema e riprova.

---

## Orchestrazione Claude Code

**Le regole di orchestrazione in `AGENTS.md` § "ORCHESTRAZIONE AUTONOMA" sono INVALICABILI e si applicano anche a Claude Code senza eccezioni. Questo blocco le ribadisce e le specifica per il contesto Claude Code.**

### Flusso obbligatorio per ogni richiesta utente

1. **Filtra e comprendi** la richiesta — chiarisci ambiguità, identifica scope e file coinvolti
2. **Delega al sub-agent adatto** usando il tool `Agent` con il tipo corretto
3. **Attendi il risultato** prima di procedere al passo successivo
4. **Esegui direttamente** solo se tutti i sub-agent adatti sono già impegnati su task attivi

Claude Code NON implementa mai direttamente saltando i sub-agent.

### Regola parallelismo (INVALICABILE)

**Default: un sub-agent alla volta, in sequenza.**
Il parallelismo tra sub-agent è consentito SOLO quando sono già tutti attivi su task indipendenti.
Il parallelismo di tool call (Read, Grep, letture) su file indipendenti è sempre consentito.

### Regola proposta visiva UI (INVALICABILE)

Se il task impatta UI visibile (schermate, componenti, layout, interazioni):
1. Delegare a `FRONTEND_UI_AGENT` (subagent_type: `Plan` o `general-purpose`)
2. L'agente produce **screenshot o schema** della modifica proposta
3. Presentare la proposta all'utente e attendere approvazione
4. Solo dopo approvazione: delegare implementazione

### Agenti disponibili (tool Agent)

| subagent_type | Quando usarlo |
|---------------|--------------|
| `Explore` | leggere codebase, cercare file, capire pattern |
| `Plan` | progettare approccio tecnico, ownership, rischi |
| `general-purpose` | task complessi multi-step, implementazione delegata |

I contratti di ownership stanno in `agents/` — usarli come riferimento nel prompt del sub-agent.

### Sequenza per task non banali

1. Explore → comprendi il codebase coinvolto
2. Plan → piano tecnico (ARCHITECTURE_AGENT)
3. general-purpose → implementazione (FRONTEND_UI_AGENT, OFFLINE_DATA_AGENT, ecc.)
4. general-purpose → verifica (QA_AGENT)

## Flusso Automatico Dei Test

- Ogni modifica che cambia comportamento, output, contratto o dato persistito deve far partire automaticamente la suite minima che la copre.
- Se un task tocca più aree, si uniscono i gate necessari ma non si ripetono gli stessi scenari su più livelli.
- `pre-commit` esegue solo `pytest -m "unit or api"`.
- `pre-push` esegue solo `pytest -m "unit or api"`.
- `CI` esegue il gate rapido e la suite browser completa (`e2e_smoke`, `e2e`, `visual`) piu i check path-aware (`docs_config`, `offline_runtime`, `tsc`) quando i path lo richiedono.
- Gate reali:
  - `pytest -m "unit or api"` come gate rapido predefinito.
  - `pytest -m e2e_smoke` solo in `CI` per smoke browser su bootstrap frontend.
  - `pytest -q tests/test_docs_config.py` in `CI` quando tocchi `.md`, `.claude/`, `memory/`, policy operative o automazione test.
  - `pytest -q tests/test_offline_runtime.py` in `CI` quando tocchi offline queue, storage locale, sync o tipi path-based.
  - `pytest -m "e2e and not e2e_smoke"` in `CI` per flussi utente completi, navigazione o form.
  - `pytest -m visual` in `CI` per layout, responsive, dark mode o touch target.
  - `tsc --noEmit` in `CI` quando tocchi tipi, store, servizi o hook frontend.
- Regola anti-duplicazione:
  - logica pura e calcoli solo in `unit`;
  - HTTP, validazioni e persistenza solo in `api`;
  - flussi utente solo in `e2e`;
  - resa visiva solo in `visual`;
  - non coprire la stessa regola in `unit + api + e2e` se il livello più basso la copre già bene.
- `playwright-interactive`, `Claude Preview MCP`, `Chrome MCP` e `screenshot` restano strumenti di debug rapido e verifiche visive non formali.
- In locale, per verifica E2E/visual durante sviluppo usa `playwright` (CLI Skill), `playwright-interactive` e `screenshot`; non usare `pytest -m e2e` o `pytest -m visual` come gate locale.

## Skill Utili (non vincolanti)

Questa sezione è solo informativa: resta separata dai gate test e non cambia la policy di automazione.

Subito utili:
- `playwright`
- `playwright-interactive`
- `pdf`
- `screenshot`
- `frontend-skill`
- `figma`
- `figma-implement-design`

Utili in casi specifici:
- `render-deploy`
- `sentry`
- `spreadsheet`
- `security-best-practices`
- `security-threat-model`
- `openai-docs`
- `skill-installer`
- `skill-creator`

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

---

## Procedura di allineamento documenti

All'inizio di ogni nuova sessione, o quando richiesto esplicitamente, eseguire questa procedura:

1. Leggi tutti i file `.md` di progetto (escluso `node_modules`): `AGENTS.md`, `CLAUDE.md`, `backend/AGENTS.md`, `frontend/AGENTS.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `CHANGELOG.md`, `CHANGES.md`, `TEST_RUN.md`, `memory/MEMORY.md` e i file di memoria collegati.
2. Confronta i contenuti cercando:
   - Zone protette non allineate tra `AGENTS.md` e `CLAUDE.md`
   - Riferimenti a file o percorsi non più esistenti
   - Stato del progetto nella memoria obsoleto rispetto al `CHANGELOG.md`
   - `CHANGES.md` e `TEST_RUN.md` non allineati all'ultimo ciclo in `CHANGELOG.md`
   - Endpoint API non documentati in `backend/AGENTS.md`
   - Regole presenti in `CLAUDE.md` ma mancanti in `AGENTS.md` (o viceversa, dove rilevante), incluse varianti `backend/*` e `frontend/*`
3. Riporta il report all'utente con: problema, gravità, azione consigliata.
4. Applica le correzioni solo dopo conferma esplicita dell'utente.
5. Dopo ogni correzione, aggiorna `CHANGELOG.md`; se il ciclo viene chiuso o riallineato, aggiorna anche `CHANGES.md` e `TEST_RUN.md`.

---

## Preview — avvio automatico locale

Quando viene attivato il tasto Anteprima o viene richiesto l'avvio dei server:
- **Avvia sempre entrambi**: `backend` (porta 8001) e `frontend` (porta 8083)
- **Senza chiedere** quale avviare — la domanda è superflua per questo progetto
- **Forza sempre il riavvio** — i server vengono terminati e riavviati freschi
- Nessun deploy su Render, nessun cloud: solo locale
- Se l'utente vuole avviare solo uno dei due, lo chiederà esplicitamente

Configurazione in `.claude/launch.json`, script in `.claude/preview-backend.ps1` e `.claude/preview-frontend.ps1`.
Gli script `.claude` delegano agli script root `start-backend.ps1` e `start-frontend.ps1`: questa e la sorgente unica del metodo di avvio locale.

---

## Avviso compattazione chat

Quando la conversazione diventa lunga e si avvicina alla compattazione automatica del contesto, avvisare esplicitamente l'utente con un messaggio del tipo:

> "La chat sta diventando lunga — ti consiglio di aprire una nuova sessione e usare `CHANGELOG.md` come contesto di partenza per continuare."

Segnali da monitorare: molte fasi completate nella sessione corrente, numero elevato di file toccati, o risposte che crescono molto in lunghezza.
