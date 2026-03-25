# agents/README.md

Contratti operativi dei sub-agent condivisi del progetto BustaPaga.

Questa cartella rende concreta la regola di orchestrazione scritta in `AGENTS.md` e `CLAUDE.md`:
- l'orchestratore delega prima al sub-agent adatto e libero
- gli agenti lavorano per ownership chiara
- quando i task sono indipendenti, gli agenti lavorano in parallelo
- l'orchestratore interviene direttamente solo quando tutti gli agenti compatibili sono gia impegnati o bloccati

## Routing rapido

- `PRODUCT_REQUIREMENTS_AGENT.md` — requisiti, comportamento atteso, casi limite, accettazione
- `ARCHITECTURE_AGENT.md` — piano tecnico, file coinvolti, dipendenze, rischi, strategia di parallelizzazione
- `BACKEND_API_AGENT.md` — backend, endpoint, storage, schema, migrazioni, test API
- `FRONTEND_UI_AGENT.md` — UI, schermate, componenti, feedback utente, test visual/E2E
- `OFFLINE_DATA_AGENT.md` — SQLite locale, file storage, cache, sync, network state, cloud toggle
- `PAYROLL_LOGIC_AGENT.md` — algoritmi protetti, parser, costanti contrattuali, mirror frontend/backend
- `QA_AGENT.md` — regressioni, criteri di accettazione, test unit/api/e2e/visual

## Sequenza consigliata

1. `PRODUCT_REQUIREMENTS_AGENT` se il comportamento atteso non e ancora chiaro.
2. `ARCHITECTURE_AGENT` per task multi-file, refactoring o cambi cross-cutting.
3. Gli agenti di ownership implementano in parallelo:
   - `BACKEND_API_AGENT`
   - `FRONTEND_UI_AGENT`
   - `OFFLINE_DATA_AGENT`
   - `PAYROLL_LOGIC_AGENT` se il task tocca algoritmi, parser o regole di calcolo
4. `QA_AGENT` verifica regressioni e test finali.

## Contenuto minimo di un handoff

- obiettivo
- file o aree coinvolte
- vincoli
- verifiche richieste
- output atteso

## Regola generale

Se un agente non puo completare il task:
- si tenta prima di sbloccarlo o restringere il perimetro
- se serve, il task viene riassegnato a un altro agente compatibile
- l'orchestratore esegue direttamente solo come ultima opzione
