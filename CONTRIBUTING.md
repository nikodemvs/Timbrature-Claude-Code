# CONTRIBUTING — BustaPaga

Regole operative del progetto. Valgono per Marco e per qualsiasi agente (Claude Code, Codex, Cowork) che lavori sulla repo.

Per i documenti che queste regole tengono a riferimento vedi il [README](./README.md).

---

## 1. Principi

1. **Algoritmi → dati → UI.** I calcoli stanno nel backend (`backend/server.py`) e nel suo mirror TypeScript (`frontend/src/algorithms/calcoli.ts`). La UI li richiama, non li duplica.
2. **Offline-first.** L'app deve funzionare senza rete. La timbratura **deve** funzionare offline (salva in locale, sincronizza dopo). La chat AI è l'unica funzione online-only: se offline, mostra un messaggio chiaro.
3. **Lingua:** UI e messaggi utente in italiano, variabili e funzioni in inglese.
4. **Semplicità sopra completezza.** Se una cosa non serve oggi, non scriverla. Meno layer, meno file, meno governance.
5. **Dati personali sono GDPR-sensibili.** Niente log di orari, stipendi, malattie. La chat Gemini può leggere quello che serve per rispondere — nulla di superfluo.

---

## 2. Zona protetta

La fonte di verità unica è **[PROTECTED_ZONES.md](./PROTECTED_ZONES.md)**.
La spec degli algoritmi (costanti, formule, esempi attesi) è in **[ALGORITMI.md](./ALGORITMI.md)**.

Regole:

- Le funzioni elencate lì non si toccano senza conferma esplicita dell'utente.
- I test unitari verificano i risultati dei calcoli, non modificano mai gli algoritmi. Se un test fallisce, il test è sbagliato — non la funzione.
- Se un algoritmo esiste sia in backend che in frontend, è una **coppia**: non si tocca uno senza l'altro, e i risultati devono coincidere.
- Se cambi un algoritmo protetto (con conferma), aggiorna anche `ALGORITMI.md` nella sezione relativa.

---

## 3. Testing

### Marker pytest

| Marker | Scopo |
|--------|-------|
| `unit` | logica pura, algoritmi, parser isolati |
| `api` | contratti HTTP, validazioni Pydantic, storage |
| `e2e_smoke` | smoke browser bootstrap frontend |
| `e2e` (non smoke) | flussi utente completi |
| `visual` | layout, responsive, dark mode, touch target |

### Gate

- **Gate rapido locale** (pre-commit, pre-push): `pytest -m "unit or api"`
- **CI:** gate rapido + `e2e_smoke` + `e2e` + `visual` + check path-aware (`test_docs_config.py`, `test_offline_runtime.py`, `tsc --noEmit`)
- **Locale E2E/visual:** usa `playwright` CLI, `playwright-interactive`, `screenshot` — **non** `pytest -m e2e` o `pytest -m visual`

### Anti-duplicazione

- logica pura → solo `unit`
- HTTP / storage → solo `api`
- flussi utente → solo `e2e`
- resa visiva → solo `visual`

Non coprire la stessa regola in più livelli se quello più basso basta.

---

## 4. Convenzioni backend (`backend/`)

- Validazione input con Pydantic su ogni endpoint.
- Errori: `HTTPException` con messaggio in italiano, mai stack trace esposti.
- Nessuna API key nel codice; solo variabili d'ambiente (`GEMINI_API_KEY`).
- `async/await` per le chiamate a Gemini.
- Retrocompatibilità sempre: non rompere endpoint esistenti.
- Date ISO 8601, ore `HH:MM`, importi `float` 2 decimali.
- Le risposte devono essere cacheable dal frontend (offline-first).

### Mappa endpoint

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| GET | `/api/` | Info API |
| GET | `/api/health` | Health check |
| GET / PUT | `/api/settings` | Impostazioni utente |
| POST | `/api/settings/verify-pin` | Verifica PIN locale |
| GET | `/api/dashboard` | Dashboard con stime |
| GET / POST | `/api/timbrature` | Lista e crea timbrature |
| GET / PUT / DELETE | `/api/timbrature/{data}` | Lettura, update, delete |
| POST | `/api/timbrature/timbra?tipo=entrata\|uscita` | Timbra rapido |
| GET | `/api/timbrature/settimana/{data}` | Riepilogo settimanale |
| GET / POST | `/api/assenze` | Lista e crea assenze |
| POST | `/api/assenze/{id}/certificato` | Upload certificato medico |
| DELETE | `/api/assenze/{id}` | Elimina assenza |
| GET | `/api/ferie/saldo` | Saldo ferie |
| GET | `/api/malattia/comporto` | Stato comporto |
| GET / POST | `/api/reperibilita` | Reperibilità |
| DELETE | `/api/reperibilita/{id}` | Elimina reperibilità |
| GET / POST | `/api/buste-paga` | Buste paga |
| GET | `/api/buste-paga/{anno}/{mese}` | Lettura busta |
| POST | `/api/buste-paga/upload` | Upload busta con mese auto |
| POST | `/api/buste-paga/{anno}/{mese}/upload` | Upload per periodo esplicito |
| PUT | `/api/buste-paga/{anno}/{mese}` | Aggiorna busta |
| GET / POST | `/api/documenti` | Archivio documenti |
| GET / DELETE | `/api/documenti/{id}` | Lettura / cancellazione documento |
| POST | `/api/cud/upload` | Upload CUD |
| GET / POST | `/api/alerts` | Lista / crea alert |
| PUT | `/api/alerts/{id}/letto` | Segna letto |
| DELETE | `/api/alerts/{id}` | Elimina alert |
| POST | `/api/chat` | Chat AI Gemini |
| GET / DELETE | `/api/chat/history` | Storico chat |
| GET / POST | `/api/timbrature-aziendali` | Import / lettura timbrature aziendali |
| DELETE | `/api/timbrature-aziendali/{data}` | Elimina timbratura aziendale |
| DELETE | `/api/timbrature-aziendali` | Elimina un mese |
| GET | `/api/confronto-timbrature` | Confronto azienda/utente |
| GET | `/api/statistiche/mensili` | Statistiche mensili |

---

## 5. Convenzioni frontend (`frontend/`)

- **Mobile-first.** Funziona da 375px, touch target >= 44×44px.
- Il bottone **TIMBRA** è l'elemento più importante: sempre visibile, massimo 2 tap.
- **TypeScript strict**, niente `any`.
- Ogni componente gestisce 4 stati: **loading** (skeleton), **empty** (messaggio + azione), **errore** (messaggio italiano + riprova), **successo** (feedback ~3s).
- **Dark mode** via `prefers-color-scheme`.
- Font body ≥ 14px; 12px solo etichette secondarie.
- Accessibilità: label su ogni input, alt su immagini, contrasto WCAG AA.

### Offline

- Cache delle risposte backend in locale (SQLite + file).
- Online → chiama API, salva e aggiorna il locale.
- Offline → serve dal locale.
- Timbratura offline → salva in locale, sincronizza al ritorno della rete.
- Chat offline → `"Connessione necessaria"`.

---

## 6. Commit e CHANGELOG

Al termine di ogni task:

1. Aggiorna `CHANGELOG.md` con una riga datata:
   ```
   ## YYYY-MM-DD — Titolo breve
   Cosa: descrizione concreta della modifica
   Perché: motivazione
   File: lista dei file toccati
   ```
2. `git add` **dei soli file modificati** (mai `git add -A` o `git add .`).
3. `git commit -m "tipo(scope): descrizione concisa"`.
4. `git push` sul branch corrente.

Niente `--no-verify`. Se il pre-commit fallisce, correggi la causa. Niente force push su `main`.

---

## 7. Agenti (informativo, non vincolante)

Il progetto ha storicamente usato una struttura di sub-agent con contratti in `agents/`. **Non è obbligatoria.** Resta come guida di ownership:

- `agents/ARCHITECTURE_AGENT.md`
- `agents/BACKEND_API_AGENT.md`
- `agents/FRONTEND_UI_AGENT.md`
- `agents/OFFLINE_DATA_AGENT.md`
- `agents/PAYROLL_LOGIC_AGENT.md`
- `agents/PRODUCT_REQUIREMENTS_AGENT.md`
- `agents/QA_AGENT.md`

Chi lavora sulla repo (umano o agente) può usarli come checklist mentale, non deve seguirli come flusso rigido. L'unica regola sulla UI è il buon senso: se la modifica cambia qualcosa di visibile, condividi uno screenshot o un mockup prima di implementare in grande.

La memoria persistente condivisa vive in [`memory/MEMORY.md`](./memory/MEMORY.md).

---

## 8. Cartelle da ignorare

- `.emergent/` — non attiva.
- `.claude/`, `.codex/` — configurazioni degli agenti; non toccare salvo esplicita richiesta.
- `output/` — output locale, non versionare.

---

## 9. Ambiente di sviluppo

- **OS primario:** Windows / PowerShell. Separatore comandi: `;` (mai `&&`).
- **Python:** 3.11+
- **Node:** compatibile con Expo corrente (vedi `frontend/package.json`).
- Porte: backend `8001`, frontend PWA `8083`.
- Script canonici: `start-app.ps1`, `start-backend.ps1`, `start-frontend.ps1` in root.
