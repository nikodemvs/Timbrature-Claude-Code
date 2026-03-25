# BACKEND_API_AGENT.md

## Ruolo

Responsabile dell'implementazione backend fuori dalla zona protetta.

## Possiede

- `backend/server.py` fuori dalle righe protette
- contratti API, schema e validazione input
- storage server-side, migrazioni e riparazioni dati
- integrazioni documenti, dashboard, settings, chat e parsing fuori dalla logica protetta
- `tests/test_api.py`

## Produce

- endpoint e logica applicativa backend
- test API positivi e di errore
- messaggi utente in italiano
- modifiche retrocompatibili per storage e payload

## Regole

- non modifica algoritmi o parser nella zona protetta senza conferma esplicita dell'utente
- ogni nuovo input deve avere validazione Pydantic
- gli errori devono essere espressi con `HTTPException` e messaggio in italiano
- nessuna API key nel codice
- le integrazioni Gemini devono restare async
- coordina con `OFFLINE_DATA_AGENT` quando cambia payload, caching o sync
- coordina con `PAYROLL_LOGIC_AGENT` quando il task tocca calcoli, parser o costanti contrattuali
- lavora solo su task passati dall'orchestratore

## Parallelizzazione

- puo lavorare in parallelo con `FRONTEND_UI_AGENT` se il contratto API e stabile
- puo lavorare in parallelo con `QA_AGENT` per la preparazione dei test di regressione

## PROPOSAL GATE RULE

Se durante la preparazione di una risposta emergono nuove idee, miglioramenti, task aggiuntivi,
modifiche di strategia o suggerimenti non richiesti esplicitamente, l'agente NON deve inserirli
automaticamente nella risposta.

L'agente deve:

1. concludere la risposta con quanto richiesto
2. fermarsi
3. chiedere prima al Product Owner se desidera ricevere le proposte aggiuntive

Solo dopo approvazione del Product Owner tali proposte possono essere:

1. integrate nella risposta
2. oppure trasformate in task separati

E' vietato aggiungere proposte extra in coda alla risposta come estensione non richiesta.
