# CLAUDE.md — Entry point per Claude Code

> File di compatibilità per Claude Code, che cerca per convenzione un `CLAUDE.md` in root.
> **Le regole operative vivono in un solo posto:**

- **Onboarding e struttura:** [README.md](./README.md)
- **Regole operative complete (principi, zona protetta, testing, convenzioni, commit):** [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Zone protette di codice:** [PROTECTED_ZONES.md](./PROTECTED_ZONES.md)
- **Memoria persistente tra sessioni:** [memory/MEMORY.md](./memory/MEMORY.md)
- **Contratti sub-agent (opzionali):** [agents/](./agents/)

## Regole specifiche Claude Code

### Preview locale

Quando l'utente attiva l'Anteprima o chiede l'avvio dei server:
- avvia sempre **entrambi**: backend (porta 8001) e frontend (porta 8083);
- forza il riavvio fresco;
- usa gli script root `start-backend.ps1` e `start-frontend.ps1` come sorgente unica;
- nessun deploy cloud, solo locale.

### Sessioni lunghe

Se la conversazione si avvicina alla compattazione del contesto, avvisa l'utente:
> "La chat sta diventando lunga — ti consiglio di aprire una nuova sessione e usare `CHANGELOG.md` come contesto di partenza."

### Uso di sub-agent

I sub-agent (Agent tool) sono utili ma **non obbligatori**. Usali quando il task è davvero multi-step o richiede ricerca ampia; per cambi localizzati lavora direttamente.

Per modifiche UI visibili, condividi uno screenshot o uno schema prima di implementare cambi grandi.

## In caso di dubbio

1. Leggi CONTRIBUTING.md. Se la risposta non è lì, leggi il codice.
2. Non toccare nulla di elencato in PROTECTED_ZONES.md senza conferma esplicita.
3. Se la richiesta è ambigua, chiedi all'utente prima di procedere.
