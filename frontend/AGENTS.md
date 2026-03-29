# AGENTS.md — Frontend

TypeScript, logica leggera di presentazione.
I calcoli di dominio li fa il backend quando online, oppure `calcoli.ts` in locale quando offline — qui si formattano e mostrano i risultati.

## File critici
- `src/helpers.ts` — formattazione valuta, ore, percentuali (ZONA PROTETTA, vedi root AGENTS.md)
- `src/algorithms/calcoli.ts` — algoritmi di calcolo offline (ZONA PROTETTA, mirror di server.py)
- `app/(tabs)/index.tsx` — schermata principale (Home)
- `app/(tabs)/timbrature.tsx` — UI timbrature

## Regole
- Mobile-first: funziona da 375px, touch target 44x44px
- Il TIMBRA è il bottone più importante — prominente, raggiungibile con il pollice, max 2 tap
- TypeScript strict, niente `any`
- Ogni componente gestisce 4 stati: loading (skeleton), empty (messaggio + azione), errore (messaggio italiano + riprova), successo (feedback 3 secondi)
- Dark mode via prefers-color-scheme
- Font minimo 14px body, 12px solo etichette secondarie
- Accessibilità: label su ogni input, alt su immagini, contrasto WCAG AA

## Orchestrazione
- Codex è l'orchestratore del lavoro frontend, non il primo esecutore
- I sub-agent frontend devono lavorare con ownership chiara e ambito limitato ai file o componenti assegnati
- Se esiste un sub-agent frontend adatto e libero, il task va delegato prima di essere eseguito direttamente da Codex
- Se un sub-agent frontend fallisce, prima si tenta di sbloccarlo, restringere il task o riassegnarlo a un altro sub-agent equivalente
- Codex interviene direttamente sul frontend solo quando tutti i sub-agent adatti sono già impegnati oppure realmente bloccati

## Sub-agent di riferimento
- `agents/FRONTEND_UI_AGENT.md` — schermate, componenti, UX, copy e test visual/E2E
- `agents/OFFLINE_DATA_AGENT.md` — SQLite locale, cache, sync, file storage, cloud toggle e contratti offline
- `agents/PAYROLL_LOGIC_AGENT.md` — mirror TypeScript degli algoritmi e verifiche di coerenza col backend
- `agents/QA_AGENT.md` — regressioni frontend e test visual/E2E

## Offline
- Cache le risposte del backend e i dati operativi in locale con SQLite e file storage
- Quando online: chiama API, salva e aggiorna il locale
- Quando offline: mostra dati dal database/cache locale
- Timbratura offline: salva in locale, sincronizza quando torna la rete
- Chat AI offline: mostra "Connessione necessaria"

## Preparazione mobile nativa
- Separare logica da UI nei componenti
- Evitare dipendenze browser-specific dove possibile
- Stato centralizzato (store/context), non sparso nei componenti

## Testing
- Test E2E: `tests/test_e2e.py` — Playwright, flussi utente nel browser
- Test visual: `tests/test_e2e.py` con marker `@pytest.mark.visual`
- Screenshot a 375px (iPhone SE) e 768px (tablet)
- Screenshot dark mode — contrasto leggibile
- Bottone TIMBRA visibile senza scroll su mobile
- Touch target bottoni principali >= 44x44px
- Font body >= 14px, nessun testo tagliato
- Playwright è lo strumento per test visual e UX — per tutto il resto pytest
- Ogni modifica visiva deve passare i test visual esistenti

## Strumenti di controllo e sviluppo

### Flusso automatico dei test
- `pre-commit` esegue solo `pytest -m "unit or api"`.
- `pre-push` esegue solo `pytest -m "unit or api"`.
- `CI` esegue il gate rapido frontend e la suite browser (`e2e_smoke`, `e2e`, `visual`) piu i controlli path-aware quando servono.
- Gate reali:
  - `pytest -m "unit or api"` come gate rapido predefinito in locale.
  - `pytest -m e2e_smoke` solo in `CI` per smoke browser su bootstrap frontend.
  - `pytest -m "e2e and not e2e_smoke"` solo in `CI` per flussi utente completi, navigazione o form.
  - `pytest -m visual` solo in `CI` per layout, responsive, dark mode o touch target.
  - `pytest -q tests/test_docs_config.py`, `pytest -q tests/test_offline_runtime.py` e `tsc --noEmit` in `CI` quando i path lo richiedono.
- In locale, per verifiche E2E/visual durante sviluppo usa `playwright` (CLI Skill), `playwright-interactive` e `screenshot`; non usare `pytest -m e2e` o `pytest -m visual` come gate locale.
- Regola anti-duplicazione:
  - logica pura e calcoli solo in `unit` o nel gate backend;
  - API e storage solo in `api`;
  - flussi utente solo in `e2e`;
  - resa visiva solo in `visual`;
  - non duplicare in `e2e` ciò che è già coperto bene da `unit` o `api`.

### Strumenti utili
- `playwright`, `playwright-interactive` e `screenshot` sono i tool quotidiani per debug e verifiche visive.
- `figma`, `figma-implement-design` e `frontend-skill` sono utili quando l'input arriva da mockup o serve alzare il livello della UI.
- `pdf` è utile per import documentali e flussi che partono da cedolini o CUD.
- `security-best-practices` è utile quando tocchi dati utente o flussi esposti.

## Allineamento documentale
- Se aggiorni regole o policy in questo file, aggiorna nella stessa sessione anche `frontend/CLAUDE.md`.
- Se l'allineamento chiude un ciclo operativo, aggiorna anche i file root `CHANGES.md` e `TEST_RUN.md`.
