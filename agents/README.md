# agents/README.md

Contratti operativi dei sub-agent condivisi del progetto BustaPaga.
**Validi per Codex e Claude Code senza eccezioni.**

---

## Regole invalicabili dell'orchestratore

### 1. L'orchestratore è sempre il filtro

L'orchestratore (Codex o Claude Code) NON esegue mai un task direttamente.
Sequenza obbligatoria:
1. Filtra e comprendi la richiesta utente
2. Delega al sub-agent adatto
3. Attendi il risultato
4. Esegui direttamente solo se tutti i sub-agent compatibili sono già occupati

### 2. Parallelismo: solo quando i sub-agent sono già tutti occupati

Default: un sub-agent alla volta, in sequenza.
Parallelismo consentito solo quando più sub-agent hanno già task attivi indipendenti in corso.
Non si parallelizza per velocizzare: si satura un agente alla volta.

### 3. UI change → proposta visiva prima di implementare (INVALICABILE)

Se il task impatta la UI (schermate, componenti, layout, interazioni visibili):
1. `FRONTEND_UI_AGENT` produce uno **screenshot o schema** della modifica proposta
2. La proposta viene presentata all'utente per approvazione esplicita
3. Solo dopo approvazione: `FRONTEND_UI_AGENT` implementa

Nessuna modifica visibile può essere implementata senza proposta approvata.

---

## Routing rapido

- `PRODUCT_REQUIREMENTS_AGENT.md` — requisiti, comportamento atteso, casi limite, accettazione
- `ARCHITECTURE_AGENT.md` — piano tecnico, file coinvolti, dipendenze, rischi, sequenza
- `BACKEND_API_AGENT.md` — backend, endpoint, storage, schema, migrazioni, test API
- `FRONTEND_UI_AGENT.md` — UI, schermate, componenti, **proposta visiva**, test visual/E2E
- `OFFLINE_DATA_AGENT.md` — SQLite locale, file storage, cache, sync, network state, cloud toggle
- `PAYROLL_LOGIC_AGENT.md` — algoritmi protetti, parser, costanti contrattuali, mirror frontend/backend
- `QA_AGENT.md` — regressioni, criteri di accettazione, test unit/api/e2e/visual

## Sequenza obbligatoria per task non banali

1. `PRODUCT_REQUIREMENTS_AGENT` — se il comportamento atteso non è ancora chiaro
2. `ARCHITECTURE_AGENT` — per qualsiasi task che tocca ≥ 2 file o aree diverse
3. Sub-agent di ownership **in sequenza** (parallelo solo se già tutti occupati):
   - `FRONTEND_UI_AGENT` → **proposta visiva** → approvazione utente → implementazione
   - `BACKEND_API_AGENT`
   - `OFFLINE_DATA_AGENT`
   - `PAYROLL_LOGIC_AGENT` se il task tocca algoritmi, parser o regole di calcolo
4. `QA_AGENT` — verifica regressioni e test finali prima del commit

## Contenuto minimo di un handoff

- obiettivo
- file o aree coinvolte
- vincoli
- verifiche richieste
- output atteso

## Sblocco agente bloccato

Se un agente non riesce a completare il task:
1. Tenta di sbloccarlo restringendo il perimetro o inviando contesto aggiuntivo
2. Riassegna a un agente compatibile
3. L'orchestratore esegue direttamente solo come ultima opzione
