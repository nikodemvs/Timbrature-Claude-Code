# agents/README.md

Contratti di ownership dei sub-agent del progetto BustaPaga.

> **Stato:** consultivi, non vincolanti.
> Sono una guida mentale di chi tocca cosa, non un flusso di orchestrazione obbligatorio.
> Le regole operative vive sono in [../CONTRIBUTING.md](../CONTRIBUTING.md).

Chi lavora sulla repo (umano o agente) può usarli come checklist per capire dove va una modifica, quale file è probabile che tocchi, e quali test vanno aggiornati. Nessuno è obbligato a delegare ogni task a un sub-agent.

## Linee guida utili, non invalicabili

1. **Scopo prima di tutto:** prima di scrivere codice, chiarisci cosa deve fare e perché.
2. **Cambi UI visibili:** se la modifica è visibile all'utente, condividi uno screenshot o uno schema prima di un refactor grande. Non serve un rituale di approvazione per ogni bottone.
3. **Zone protette:** [../PROTECTED_ZONES.md](../PROTECTED_ZONES.md) è l'unico vincolo rigido. Nessuna modifica lì senza conferma esplicita.

---

## Routing rapido

- `PRODUCT_REQUIREMENTS_AGENT.md` — requisiti, comportamento atteso, casi limite, accettazione
- `ARCHITECTURE_AGENT.md` — piano tecnico, file coinvolti, dipendenze, rischi, sequenza
- `BACKEND_API_AGENT.md` — backend, endpoint, storage, schema, migrazioni, test API
- `FRONTEND_UI_AGENT.md` — UI, schermate, componenti, **proposta visiva**, test visual/E2E
- `OFFLINE_DATA_AGENT.md` — SQLite locale, file storage, cache, sync, network state, cloud toggle
- `PAYROLL_LOGIC_AGENT.md` — algoritmi protetti, parser, costanti contrattuali, mirror frontend/backend
- `QA_AGENT.md` — regressioni, criteri di accettazione, test unit/api/e2e/visual

## Ordine suggerito per task non banali

Un flusso che funziona bene quando il task è davvero grosso (≥ 2 aree, comportamento nuovo):

1. `PRODUCT_REQUIREMENTS_AGENT` se il cosa-deve-fare non è chiaro
2. `ARCHITECTURE_AGENT` se il task tocca più moduli
3. Sub-agent di ownership (UI, backend, offline data, payroll logic) a seconda di cosa cambia
4. `QA_AGENT` per verificare regressioni prima del commit

Per task piccoli (un bug, un bottone, una rotta nuova isolata), si può lavorare direttamente senza questo rituale.

## Contenuto minimo di un handoff

Se deleghi a un sub-agent, passagli: obiettivo, file coinvolti, vincoli, verifiche richieste, output atteso.
