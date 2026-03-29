# AGENTS.md — BustaPaga

## Progetto
App gestionale per lavoratori dipendenti italiani.
Timbrature, ferie, malattia/comporto, reperibilità, buste paga, dashboard, chat AI.
Stack: TypeScript frontend, Python/FastAPI backend, Gemini AI, Docker/Render.

## Lingua
UI e messaggi utente: italiano. Variabili e funzioni: inglese.

---

## ZONA PROTETTA — NON MODIFICARE MAI

> Fonte di verità unica: **`PROTECTED_ZONES.md`** (root).
> Questo blocco è mantenuto in sync — in caso di conflitto, `PROTECTED_ZONES.md` prevale.

Questi file contengono algoritmi di calcolo validati manualmente.
Nessun agente può modificarli, refactorizzarli, ottimizzarli o riscriverli.
Se un task richiede di toccare queste righe, FERMATI e chiedi conferma esplicita.

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

**Se un algoritmo esiste sia nel backend che nel frontend, sono una coppia:
non si tocca uno senza toccare l'altro.**

---

## ORCHESTRAZIONE AUTONOMA

Applica queste regole automaticamente in base a cosa stai modificando.
Non aspettare che l'utente te lo chieda.
**Queste regole sono INVALICABILI — valgono sia per Codex sia per Claude Code senza eccezioni.**

### 1. Orchestratore come filtro — SEMPRE prima di qualsiasi lavoro

L'orchestratore NON esegue mai direttamente un task senza averlo prima delegato.
Il flusso obbligatorio è:

1. **Filtra e comprendi** la richiesta dell'utente — chiarisci ambiguità, identifica scope
2. **Delega al sub-agent adatto** — passa il task completo con obiettivo, file coinvolti, vincoli
3. **Attendi il risultato** del sub-agent prima di procedere al passo successivo
4. **Intervieni direttamente** solo quando tutti i sub-agent adatti sono già impegnati su altri task attivi

Se un sub-agent non riesce a completare il lavoro: prima si tenta di sbloccarlo, restringere il perimetro o riassegnare a un agente equivalente. L'orchestratore esegue direttamente solo dopo che questi tentativi sono falliti.

### 2. Parallelismo — solo quando i sub-agent sono già occupati

**Default: i sub-agent lavorano in sequenza.**
Il parallelismo è consentito SOLO quando:
- più sub-agent sono già impegnati su task attivi indipendenti, E
- non ci sono dipendenze di ownership tra i loro ambiti

Non si avviano mai due sub-agent in parallelo solo per velocizzare — si satura un agente alla volta.

### 3. UI change → proposta visiva prima dell'implementazione (INVALICABILE)

Se un task impatta la UI (componenti, schermate, layout, interazioni visibili):

1. `FRONTEND_UI_AGENT` prepara una **proposta visiva** (screenshot, schema ASCII o mockup)
   che mostra le modifiche prima di scrivere qualsiasi codice
2. La proposta viene presentata all'utente per approvazione
3. Solo dopo approvazione esplicita dell'utente, `FRONTEND_UI_AGENT` implementa

Nessuna modifica visibile all'utente può essere implementata senza proposta approvata.

### Contratti dei sub-agent
I contratti condivisi stanno in `agents/` — validi sia per Codex sia per Claude Code.

- `agents/PRODUCT_REQUIREMENTS_AGENT.md` — requisiti, casi limite, criteri di accettazione
- `agents/ARCHITECTURE_AGENT.md` — ownership, file coinvolti, dipendenze, rischi, sequenza
- `agents/BACKEND_API_AGENT.md` — backend, endpoint, storage, test API
- `agents/FRONTEND_UI_AGENT.md` — UI, componenti, schermate, proposta visiva, test visual/E2E
- `agents/OFFLINE_DATA_AGENT.md` — SQLite locale, cache, sync, file storage, cloud toggle
- `agents/PAYROLL_LOGIC_AGENT.md` — algoritmi, parser, mirror frontend/backend
- `agents/QA_AGENT.md` — regressioni, criteri di accettazione, copertura test

### Sequenza obbligatoria per task non banali

1. `PRODUCT_REQUIREMENTS_AGENT` — se il comportamento atteso non è ancora chiaro
2. `ARCHITECTURE_AGENT` — per qualsiasi task che tocca ≥ 2 file o aree diverse
3. Sub-agent di ownership (in sequenza, o in parallelo solo se già occupati):
   - `FRONTEND_UI_AGENT` → proposta visiva → approvazione utente → implementazione
   - `BACKEND_API_AGENT`
   - `OFFLINE_DATA_AGENT`
   - `PAYROLL_LOGIC_AGENT` se tocca algoritmi o parser
4. `QA_AGENT` — verifica regressioni e test finali prima del commit

## STRUMENTI DI CONTROLLO E SVILUPPO

### Controlli standard
- `pytest -m unit` per la logica pura e gli algoritmi.
- `pytest -m api` per i contratti HTTP del backend.
- `pytest -m "unit or api"` come gate rapido predefinito.
- `pytest -m e2e_smoke`, `pytest -m "e2e and not e2e_smoke"` e `pytest -m visual` solo in `CI`.
- In locale, per verifica E2E/visual durante sviluppo usa `playwright` (CLI Skill), `playwright-interactive` e `screenshot`; non usare `pytest -m e2e` o `pytest -m visual` come gate locale.

### Controlli condizionali
- `playwright-interactive` per il debug iterativo della UI.
- `screenshot` per catture mirate di finestre o schermi.
- `pdf` quando tocchi parser, import o generazione di documenti.
- `figma` e `figma-implement-design` quando il lavoro parte da mockup o node Figma.
- `sentry` quando stai analizzando errori runtime o regressioni in produzione.
- `security-best-practices` e `security-threat-model` quando tocchi flussi sensibili, dati utente o superfici esposte.

### Strumenti di sviluppo utili
- `render-deploy` per verificare o preparare il deploy su Render.
- `spreadsheet` per analisi su CSV/XLSX legati a timbrature o buste paga.
- `frontend-skill` quando la priorita e una UI piu forte e meno generica.
- `openai-docs` solo se il lavoro coinvolge integrazioni OpenAI e servono docs aggiornate.
- Avvio locale canonico: `start-app.ps1` per lo stack completo, `start-backend.ps1` e `start-frontend.ps1` per i singoli servizi. Anche Claude Preview deve delegare a questi script, non usare una seconda implementazione separata.

### Flusso automatico dei test
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
  - resa visiva solo in `visual`.
  - non coprire la stessa regola in `unit + api + e2e` se il livello più basso la copre già bene.
- I test verificano che la modifica funzioni, NON alterano gli algoritmi protetti.
- I test unitari verificano i risultati dei calcoli, NON modificano mai le funzioni.
- Se un test unitario fallisce, il test è sbagliato - non la funzione.
- Testa anche il caso offline quando il comportamento dipende dalla rete.
- Aggiorna `CHANGELOG.md` con una riga datata che spiega cosa hai fatto e perché.

### Skill raccomandate (non vincolanti)
Questa sezione è informativa: non definisce gate, non cambia la policy test e non vincola l'automazione.
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

### Quando tocchi qualsiasi file frontend
- Mobile-first: tutto deve funzionare da 375px
- Touch target minimi 44x44px
- Ogni componente gestisce: loading, empty, errore, successo
- Dark mode: rispetta prefers-color-scheme
- Il bottone TIMBRA è l'elemento più importante dell'app — sempre visibile, max 2 tap
- TypeScript strict: niente `any`
- Playwright è lo strumento per i test visual e UX: screenshot responsive, dark mode, touch target. Per tutto il resto usa pytest.

### Quando tocchi qualsiasi file backend
- Validazione input con Pydantic su ogni endpoint
- Errori: HTTPException con messaggio in italiano, mai stack trace
- Nessuna API key nel codice, solo env var
- Async/await per le chiamate a Gemini
- Non rompere endpoint esistenti — retrocompatibilità sempre

### Quando tocchi qualsiasi cosa legata ai dati utente
- I dati personali (orari, stipendi, malattie) sono dati sensibili GDPR
- Dati salvati in locale sul dispositivo quando possibile
- Il backend è un servizio di backup/sync, non la fonte primaria
- La chat Gemini può leggere i dati e i file utente necessari a rispondere
- Mai loggare dati personali o contesto superfluo

---

## OFFLINE-FIRST

L'app deve funzionare senza connessione internet.
- I calcoli di dominio hanno un backend di riferimento e un mirror TypeScript offline
- Il device mantiene i dati operativi in locale; il backend fa sync e backup quando online
- Quando online: chiama il backend, salva e aggiorna la cache locale
- Quando offline: servi i dati dal database/cache locale
- La timbratura DEVE funzionare offline (registra in locale, sincronizza dopo)
- La chat AI è l'unica funzione che richiede connessione — mostrare messaggio chiaro se offline

---

## MULTI-USER

Non ancora deciso se l'app sarà single-user o multi-user.
Non fare scelte architetturali che precludano una delle due strade.
Non assumere che ci sia un solo utente, ma non implementare autenticazione senza che venga richiesto.

---

## STORICO (CHANGELOG.md)

Dopo ogni modifica significativa, aggiungi una riga a CHANGELOG.md nella root:

```
## YYYY-MM-DD — Titolo breve
Cosa: descrizione concreta della modifica
Perché: motivazione
File: lista dei file toccati
```

Questo file è lo storico del progetto. Quando una nuova sessione AI apre il repo,
legge AGENTS.md per le regole e CHANGELOG.md per sapere a che punto è il progetto.
Non servono altri file di contesto.

---

## Cartelle ignorabili
`.emergent/` — non usata attivamente, non toccare.
`.claude/` — configurazione Claude Code, non toccare.
`memory/` — memoria persistente di Claude Code, condivisa con Codex tramite `memory/MEMORY.md`; non toccare salvo aggiornare il contesto.
