# AGENTS.md — Entry point per agenti

> File di compatibilità per agenti (Codex e simili) che cercano per convenzione un `AGENTS.md` in root.
> **Le regole operative vivono in un solo posto:**

- **Onboarding e struttura:** [README.md](./README.md)
- **Regole operative complete (principi, zona protetta, testing, convenzioni, commit):** [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Zone protette di codice:** [PROTECTED_ZONES.md](./PROTECTED_ZONES.md)
- **Memoria persistente tra sessioni:** [memory/MEMORY.md](./memory/MEMORY.md)
- **Contratti sub-agent (opzionali):** [agents/](./agents/)

## In caso di dubbio

1. Leggi CONTRIBUTING.md. Se la risposta non è lì, leggi il codice.
2. Non toccare nulla di elencato in PROTECTED_ZONES.md senza conferma esplicita.
3. Se la richiesta è ambigua, chiedi all'utente prima di procedere.

## Principio architetturale

Gli algoritmi generano dati. L'UI richiama i dati. Non duplicare logica tra layer.
