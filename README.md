# BustaPaga

App gestionale personale per lavoratori dipendenti italiani (CCNL Unionchimica Confapi Gomma Plastica, caso d'uso: Plastiape SpA).

Gestisce timbrature, ferie, malattia/comporto, reperibilità, buste paga, documenti, dashboard e chat AI. Pensata **offline-first**: i dati operativi vivono in locale, il backend fa da sync/backup quando online.

## Principio architetturale

> Gli algoritmi generano dati. L'UI richiama i dati. Semplice.

- Calcolo puro → `backend/server.py` (Python) e mirror 1:1 in `frontend/src/algorithms/calcoli.ts` (TypeScript)
- Persistenza locale → SQLite (`frontend/src/db/localDb.ts`) + file storage
- Facade cache-first → `frontend/src/services/offlineApi.ts`
- UI → consuma, non calcola

Le funzioni di calcolo sono **protette**: vedi [PROTECTED_ZONES.md](./PROTECTED_ZONES.md).

## Stack

- **Frontend:** Expo / React Native + TypeScript (target web PWA)
- **Backend:** Python 3.11+ / FastAPI
- **Storage:** SQLite locale + file; backend con file-based store per backup/sync
- **AI:** Google Gemini (chat)
- **Deploy produzione:** Synology DS220j via Tailscale (vedi `backend/start-nas.sh`)

## Struttura

```
backend/
  server.py             algoritmi + API REST
  server_nas.py         variante deploy NAS (da unificare, vedi REFERTO)
  sometime_parser.py    parser PDF timbrature
  zucchetti_parser.py   parser PDF buste paga
  tests/                unit + api + e2e + visual
frontend/
  app/                  routing Expo Router
  src/
    algorithms/calcoli.ts     mirror TS degli algoritmi
    db/localDb.ts             SQLite + fallback web
    services/offlineApi.ts    facade cache-first
    services/api.ts           chiamate HTTP low-level
    components/ screens/ ...
agents/                 contratti sub-agent (opzionali, guida di ownership)
memory/MEMORY.md        memoria persistente tra sessioni agent
CHANGELOG.md            storico cronologico
PROTECTED_ZONES.md      zone di codice immutabile senza conferma
CONTRIBUTING.md         regole operative complete
```

## Avvio locale

**Windows (ambiente primario, PowerShell):**

```powershell
.\start-app.ps1        # backend 8001 + frontend 8083
.\start-backend.ps1    # solo backend
.\start-frontend.ps1   # solo frontend
```

Separatore comandi: `;` (mai `&&`).

**Porte:**
- Backend: `8001`
- Frontend PWA: `8083`

## Documenti principali

- [CONTRIBUTING.md](./CONTRIBUTING.md) — regole operative, test, convenzioni, commit
- [ALGORITMI.md](./ALGORITMI.md) — spec degli algoritmi di calcolo (mirror backend/frontend)
- [PROTECTED_ZONES.md](./PROTECTED_ZONES.md) — zone di codice protette
- [CHANGELOG.md](./CHANGELOG.md) — storico del progetto
- [REFERTO_RESTAURO.md](./REFERTO_RESTAURO.md) — stato del lavoro di restauro in corso
- [memory/MEMORY.md](./memory/MEMORY.md) — memoria persistente tra sessioni agent
