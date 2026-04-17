# REFERTO RESTAURO — BustaPaga / Timbrature-Claude-Code

> Referto diagnostico prodotto il 16 aprile 2026 su snapshot datata 30 marzo 2026.
> Autore: gestore super-partes (lettura diretta del codice, nessuna modifica applicata).
> Scopo: enumerare duplicazioni, codice morto, riferimenti obsoleti, incoerenze architetturali e rischi di sicurezza, in modo che Marco possa approvare pezzo per pezzo un piano di restauro.

---

## Sintesi in 10 righe

L'app è solida dal punto di vista funzionale: governance articolata, 80 entry di changelog, suite di test a più livelli, algoritmi di dominio specchiati 1:1 tra backend Python e mirror TypeScript, deploy NAS funzionante. Il problema non è la mancanza di struttura, è la **stratificazione**: il codice è cresciuto aggiungendo senza potare. Tre sintomi dominanti: (1) `backend/server.py` e `backend/server_nas.py` sono duplicati al 99,3% (21 righe diverse su 2860+); (2) tutti i riferimenti di riga in `PROTECTED_ZONES.md`, `AGENTS.md` e `CLAUDE.md` sono obsoleti di ~960 righe rispetto al codice reale; (3) la governance è ripetuta su 5 file md diversi (zona protetta), 4 file md (regole test), e un "ciclo" con tre file paralleli (`CHANGELOG.md` + `CHANGES.md` + `TEST_RUN.md`) che non ha valore operativo oltre al primo. Il frontend è in una condizione migliore ma `offlineApi.ts` a 1584 righe ha responsabilità miste, `localDb.ts` mantiene a mano due implementazioni parallele (native + web), e `api.ts` ha il 21% di export morti. Non c'è alcun leak di dati in git. Direzione consigliata: un server unico, una sola fonte di governance, un solo engine DB client-side, moduli per dominio al posto del monolite `offlineApi`.

---

## F1 — Finding critici (alta gravità, alto impatto sulla leggibilità)

| ID | Finding | Evidenza concreta | Proposta |
|----|---------|-------------------|----------|
| **F1.1** | **server.py e server_nas.py sono lo stesso file al 99,3%.** | `diff --brief` li dichiara diversi; `diff` completo produce solo 6 hunk per **21 righe modificate su 2860**. Le differenze sono quattro try/except attorno all'import `google.genai`, due log, la type annotation di `_gemini_client`, la risposta friendly dell'endpoint `/chat` quando il client è `None`, e il nome del modulo in `uvicorn.run`. Nient'altro. | Unificare in un unico `backend/server.py` con import condizionale di `google.genai` e flag di avvio. `server_nas.py` diventa uno `start-nas.sh` + variabile d'ambiente, zero codice duplicato. Elimina 2860 righe di manutenzione doppia. |
| **F1.2** | **Tutti i riferimenti di riga in `PROTECTED_ZONES.md` (e i suoi mirror in `AGENTS.md`, `CLAUDE.md`, `backend/AGENTS.md`) sono obsoleti di ~960 righe.** | PROTECTED_ZONES cita `L494 arrotonda_quarti_ora` → reale `L1452`. `L506 calcola_ore_lavorate` → `L1462`. `L527 calcola_straordinario` → `L1486`. `L924 saldo_ferie` → `L1935`. `L951 comporto` → `L1962`. `L1338 confronto` → `L2447`. `L1454 statistiche` → `L2584`. Il percorso `frontend/src/helpers.ts` è sbagliato (reale `frontend/src/utils/helpers.ts`); `L83 percentuale` è a `L94`. | Rimuovere del tutto i numeri di riga. Le zone protette si definiscono per **nome di funzione** (stabile) non per riga (mobile). Un blocco unico in `PROTECTED_ZONES.md`, i file `AGENTS.md`/`CLAUDE.md` linkano invece di copiare. |
| **F1.3** | **Governance ripetuta fino a 5 volte sulla stessa cosa.** | La frase "ZONA PROTETTA" compare con contenuto in: root `AGENTS.md` (266 righe), root `CLAUDE.md` (235), `PROTECTED_ZONES.md` (46), `backend/AGENTS.md` (101), `frontend/AGENTS.md` (85). Il blocco "Flusso Automatico Dei Test" è riprodotto in `AGENTS.md`, `CLAUDE.md`, `memory/MEMORY.md`. I "contratti sub-agent" sono in `agents/*` (8 file, 454 righe totali) ma non tutti gli agent descritti corrispondono a scelte oggettive (es. `FRONTEND_UI_AGENT` parla di proposta visiva obbligatoria, nella storia commit ciò non è mai tracciato). | Sostituire con due soli file: `README.md` (cosa è l'app, come si avvia, dove si deploya) e `CONTRIBUTING.md` (regole operative, zona protetta per nome funzione, test gate). Tutto il resto archiviato in `docs/legacy/` o cancellato. Obiettivo: da ~18 md di governance a 2. |
| **F1.4** | **Tre changelog paralleli con contenuti sovrapposti.** | `CHANGELOG.md` (601 righe, 80 entry datate, è la storia vera), `CHANGES.md` (23 righe, "ultimo ciclo" ripetuto dentro CHANGELOG), `TEST_RUN.md` (non ispezionato ma dichiarato "rotate-and-replace" sul medesimo ciclo). L'entry di CHANGES.md corrente duplica parola per parola l'entry `2026-03-30 — Fix autostart backend NAS` di CHANGELOG.md. | Tenere solo `CHANGELOG.md`. Se serve traccia dell'"ultimo ciclo", la prima entry di CHANGELOG.md già lo è per definizione. Eliminare `CHANGES.md` e `TEST_RUN.md`. |
| **F1.5** | **`algoritmi-verifica.md` + `APP_RIASSUNTO_ALGORITMI.txt` documentano gli stessi algoritmi due volte, in formati diversi.** | `algoritmi-verifica.md` 15 KB + `APP_RIASSUNTO_ALGORITMI.txt` 5.4 KB. Entrambi elencano le funzioni `arrotonda_quarti_ora`, `calcola_ore_lavorate`, `calcola_straordinario`, `calcola_ticket`, reperibilità, ferie, comporto, stima netto con le stesse regole. | Unificare in un solo `docs/ALGORITHMS.md` linkato dal README. Il codice è la fonte di verità; il documento serve solo come "cheatsheet per lettori umani". |

---

## F2 — Finding medi (impatto architetturale, manutenzione)

| ID | Finding | Evidenza | Proposta |
|----|---------|----------|----------|
| **F2.1** | **`offlineApi.ts` (1584 righe) ha responsabilità miste.** Sezione "Helpers" interna di 372 righe (L91-463) che contiene il motore di sync queue, non dei semplici helper. La sezione "Assenze" è **spezzata in due blocchi** (L1178 read, L1498 write) — sintomo di aggiunte in coda senza riordino. Timbrature occupa 540 righe, un terzo del file. | Split in moduli per dominio mantenendo le firme esportate come re-export: `services/sync-engine.ts` (queue + online detect), `services/timbrature.service.ts`, `services/assenze.service.ts`, `services/buste-paga.service.ts`, `services/reperibilita.service.ts`, `services/chat.service.ts`, `services/documenti.service.ts`, `services/alerts.service.ts`, `services/account.service.ts`. Il file `offlineApi.ts` rimane solo come barrel che re-esporta, back-compat garantita. |
| **F2.2** | **`localDb.ts` mantiene a mano due engine paralleli.** Native expo-sqlite (L565-1095) e web in-memory+localStorage (L1-565). Ogni modifica schema richiede di toccare entrambi — e già ha causato bug (CHANGELOG 2026-03-25 "persistenza localStorage web — timbrature perse al reload"). | Valutare `@op-engineering/op-sqlite` (web+native), oppure `wa-sqlite` (WASM) per unificare. In alternativa mantenere la doppia implementazione ma **generare il web store dallo schema SQL** invece di duplicare a mano le colonne. |
| **F2.3** | **`api.ts` ha 10 export morti su 47 (21%).** Nessuno li chiama, né le tab né `offlineApi.ts`: `createAlert`, `deleteAlert`, `deleteAllTimbratureAziendali`, `deleteTimbraturaAziendale`, `getDocumento`, `importTimbratureAziendali`, `uploadBustaPaga`, `uploadCertificato`, `uploadDocumento`, `verifyPin`. | Eliminare gli export morti. Se alcuni servono a feature future, spostarli in una sezione `// TODO-ROADMAP` commentata o rimuovere del tutto (git li conserva nella storia). |
| **F2.4** | **Componenti frontend su due cartelle diverse.** `frontend/src/components/` contiene 9 componenti generici. `frontend/app/components/ReperibilitaSheet.tsx` è l'unico componente sotto `app/`. Incoerenza strutturale di convention (Expo Router non impone questa divisione). | Spostare `ReperibilitaSheet.tsx` sotto `frontend/src/components/` (o `frontend/src/components/sheets/`). Un solo percorso per tutti i componenti. |
| **F2.5** | **Dockerfile e render.yaml sono orfani.** `backend/Dockerfile` (205 byte) e root `render.yaml` (218 byte) erano previsti per deploy Render.com, ma il deploy reale è NAS via `backend/start-nas.sh`. Il CHANGELOG dal 29 marzo 2026 parla solo di NAS. | Decisione binaria: o si cancellano (consigliato, sei su NAS stabile), o si tengono solo se mantieni Render come backup attivo. Non c'è via di mezzo: file di deploy "nel dubbio" diventano trappole. |
| **F2.6** | **`tests/legacy/frontend-web-runtime-regressions.test.mjs` è dichiarato "legacy" ma ancora tracciato.** | File .mjs nella cartella `tests/legacy/`, isolato. Probabilmente regression suite di un vecchio runner. | Verificare se CI lo invoca (sospetto di no, vista la posizione). Se no, cancellare. Se sì, rinominare in qualcosa che non lo dichiari legacy. |
| **F2.7** | **`backend/sometime_parser.py` e `backend/zucchetti_parser.py` sono 10 KB + 13 KB, protetti "dalla riga 17/18 in poi".** Non ho letto il contenuto ma la governance dice che sono zona protetta. | Verificare se sono ancora in uso (i commit recenti non li menzionano). Se entrambi sono chiamati, OK. Se solo Zucchetti è usato (unico CCNL di Marco), `sometime_parser.py` può essere archiviato. |

---

## F3 — Finding bassi (rumore, rischi accettati)

| ID | Finding | Evidenza |
|----|---------|----------|
| **F3.1** | **`.codex/environments/environment.toml` tracciato nonostante la governance dica "non toccare .codex".** Piccola incoerenza di patto: se non si tocca, perché è committato? |
| **F3.2** | `backend/bustapaga.db` (9.5 MB, con dati reali) esiste nel filesystem **ma non in repo** (ignorato da `.gitignore *.db`). Nessun leak, nessuna azione urgente. Da documentare "come ricreare un DB pulito" per chi clona. |
| **F3.3** | `backend/.env` (54 byte, vuoto) e `frontend/.env` (50 byte) nel filesystem, ignorati. OK. |
| **F3.4** | Il `.git/` pesa 41 MB con 106 file tracciati — non è grande, ma potrebbe contenere blob pesanti nella storia da quando una prima volta è stato committato qualcosa di grosso e poi rimosso. Verificare con `git rev-list --objects --all | sort -k 2` se vale la pena un `git gc --aggressive`. |
| **F3.5** | `CLAUDE.md` dichiara la chat AI come l'unica funzione che richiede connessione. `offlineApi.ts` sezione "Chat" (L1433-1496) prova a funzionare offline con cache locale — piccola incoerenza semantica: la policy e il codice non dicono la stessa cosa. |
| **F3.6** | `AGENTS.md` dichiara lo stack come "Docker/Render", ma il deploy attivo è NAS Synology. Testo da aggiornare o rimuovere. |

---

## F4 — Sicurezza (sintetico)

Nessun incendio. Punti da verificare in una fase dedicata, **non oggi**:

- **Endpoint backend**: 36 endpoint unici. Non ho controllato se tutti abbiano un minimo di auth o siano aperti. Essendo esposti via Tailscale il perimetro è ristretto, ma **basta che qualcuno con accesso alla tailnet bussi a `/settings` per leggere dati personali** (nessun PIN, nessun JWT). Il backup `verifyPin` è definito in api.ts ma è tra i 10 dead-export; suggerisce che una volta c'era l'idea di un PIN sul frontend e poi è stata mollata.
- **CORS**: backend è `/api`, frontend punta a `hostname:8001`. Non ho letto la configurazione CORS di FastAPI. Da verificare che non sia `*`.
- **Input validation**: Pydantic dovrebbe coprirla (governance lo impone), ma non ho fatto audit sistematico sui modelli.
- **Permessi file SQLite**: il DB è nella cartella del backend, permessi Unix dipendono dal NAS. Verificare almeno che sia `0600` owned dal processo uvicorn.

---

## F5 — Cose che invece **funzionano bene** (da preservare)

- Il mirror backend↔frontend degli algoritmi (`server.py` ↔ `calcoli.ts`) è ben documentato e i commenti rimangono allineati alle righe reali del backend (solo `PROTECTED_ZONES.md` si è disallineato).
- Il `.gitignore` è completo e corretto: `*.db`, `*.env`, `**/*.zip` tutti ignorati, nessun leak reale.
- I test coprono la logica di arrotondamento con casi concreti (08:39→17:02, 09:30, 09:46) e funzionano come regression net.
- La separazione in hooks (`useAppTheme`, `useNetworkStatus`), store (Zustand in `appStore.ts`), componenti UI riutilizzabili, tipi centralizzati (`types/index.ts`) è sana.
- Il fix del 30 marzo sull'arrotondamento per coppia E/U è la scelta corretta per la regola aziendale confermata; il formatter `formatHoursHHMM` in `utils/helpers.ts` è pulito e già propagato alle tab.
- La scelta di `backend/server_nas.py` come variante per DS220j era ragionevole al momento (isolare la dipendenza google-genai); **ora che il pattern è stabile non serve più come file separato**, può diventare un flag.

---

## Direzione del restauro proposta (target architetturale)

Il punto d'arrivo è questo (descritto, non implementato):

**Backend**
- Un solo `backend/server.py`. La chat Gemini è opzionale tramite flag d'ambiente (`ENABLE_CHAT=1`); senza flag, l'endpoint `/chat` restituisce il messaggio "funzione non disponibile" invece di un 500. Si elimina `server_nas.py` completamente.
- `start-nas.sh` resta come script di bootstrap sul DS220j.
- `Dockerfile` e `render.yaml` eliminati (o archiviati in `docs/legacy/deploy/`).
- Parser: solo quelli effettivamente in uso.

**Frontend**
- `offlineApi.ts` diventa un barrel di re-export; i moduli reali vivono in `services/<dominio>.service.ts` + `services/sync-engine.ts`.
- `localDb.ts` mantiene la doppia implementazione ma con schema generato da una sola sorgente (dict SQL → entrambe le strade); oppure si valuta una libreria che unifichi.
- Un solo `components/` in `src/components/`.
- `api.ts` con export morti rimossi.
- Componenti, hooks, store invariati (funzionano).

**Governance**
- Un solo `README.md` (cosa fa l'app, come avviarla, come deployarla).
- Un solo `CONTRIBUTING.md` (regole operative, zona protetta per nome funzione, convenzioni, test gate).
- `CHANGELOG.md` resta unico. `CHANGES.md`, `TEST_RUN.md`, `APP_RIASSUNTO_ALGORITMI.txt`, `algoritmi-verifica.md`, `PROTECTED_ZONES.md`, `AGENTS.md`, `CLAUDE.md`, `backend/AGENTS.md`, `backend/CLAUDE.md`, `frontend/AGENTS.md`, `frontend/CLAUDE.md`, `agents/*` archiviati o eliminati.
- `memory/MEMORY.md` diventa `docs/NOTES.md` se davvero serve.

Risultato: **da ~18 file md di governance a 3**, da **2 server Python a 1**, da **1 monolite offlineApi a ~8 moduli**, senza perdere una virgola di funzionalità.

---

## Piano di lavoro a tre fasi (per approvazione)

### Fase A — Pulizia a costo zero (reversibile, nessun rischio funzionale)
- A.1 Unificare `PROTECTED_ZONES.md` su nomi di funzione, rimuovere numeri di riga. (F1.2)
- A.2 Consolidare la governance: bozza di nuovo `README.md` + `CONTRIBUTING.md`. Archiviare il resto in `docs/legacy/` senza cancellare nulla. (F1.3, F1.5, F3.5, F3.6)
- A.3 Eliminare `CHANGES.md` e `TEST_RUN.md`. (F1.4)
- A.4 Rimuovere i 10 export morti da `api.ts`. (F2.3)
- A.5 Spostare `ReperibilitaSheet.tsx` in `src/components/`. (F2.4)
- A.6 Decidere su `Dockerfile` / `render.yaml` / `tests/legacy/`. (F2.5, F2.6)

**Costo**: 1 branch, ~6 commit piccoli, testabili uno per uno. Zero tocchi ad algoritmi o endpoint.

### Fase B — Unificazione server (singolo fronte invasivo ma contenuto)
- B.1 Port: `server_nas.py` diventa un'opzione di `server.py`. Test API esistenti devono passare tutti.
- B.2 Aggiornare `start-nas.sh` per chiamare `server.py` con flag.
- B.3 Eliminare `server_nas.py`.
- B.4 Deploy sul NAS, verificare che tutto risponde come prima.

**Costo**: 1 branch, 2-3 commit, gate test `pytest -m "unit or api"`. Rischio: che il NAS non riavvii, ma `start-nas.sh` ha già health-check dal fix 2026-03-30. (F1.1)

### Fase C — Modularizzazione frontend (incrementale, un dominio alla volta)
- C.1 Estrarre `sync-engine.ts` da `offlineApi.ts`.
- C.2 Estrarre `timbrature.service.ts`.
- C.3 Estrarre `assenze.service.ts` (e risolvere lo split read/write).
- C.4 Estrarre `buste-paga.service.ts`, `reperibilita.service.ts`, `chat.service.ts`, `documenti.service.ts`, `alerts.service.ts`, `account.service.ts`.
- C.5 `offlineApi.ts` rimane come barrel (60-80 righe).

**Costo**: 1 branch lungo, ~9 commit, ognuno testabile con `pytest -m "unit or api"` + `tsc --noEmit`. Le tab non cambiano per niente perché i re-export mantengono le firme. (F2.1)

Fasi **D** (localDb unificato, F2.2) e **E** (audit sicurezza, F4) possono aspettare o essere fuse in una seconda tornata di restauro.

---

## Cosa ti chiedo di fare adesso

Leggi questo referto. Poi dimmi **quali finding approvo** e **da quale fase parti**. La mia raccomandazione è: parti dalla Fase A, è tutta roba reversibile e di effetto visibile immediato. Fase B e C le decidiamo dopo che abbiamo fatto pulizia.

Se vuoi possiamo anche iniziare subito dalla F1.1 o dalla F2.3 (i più meccanici e veloci). Dimmi tu.

---

## Esito Fase A (chiusa 2026-04-16)

Marco ha approvato l'intera Fase A. Sotto la mappa finding → intervento → stato finale. Nessun algoritmo è stato toccato.

| Finding | Intervento | Stato |
|---|---|---|
| **F1.1** — server.py ≈ server_nas.py al 99,3% | **Non toccato in Fase A** (appartiene a Fase B, unificazione server). | differito a Fase B |
| **F1.2** — riferimenti di riga obsoleti in PROTECTED_ZONES/AGENTS/CLAUDE | `PROTECTED_ZONES.md` riscritto su **nomi di funzione** (self-validabile via grep). Path corretto: `frontend/src/utils/helpers.ts`. | chiuso |
| **F1.3** — governance ripetuta 5× | Creato `README.md` + `CONTRIBUTING.md` come uniche fonti operative. `AGENTS.md`, `CLAUDE.md`, `backend/AGENTS.md`, `backend/CLAUDE.md`, `frontend/AGENTS.md`, `frontend/CLAUDE.md` ridotti a **thin pointer** (~15 righe ciascuno) che rinviano a CONTRIBUTING/PROTECTED_ZONES. `agents/README.md` riscritto come guida consultiva, non obbligatoria. | chiuso |
| **F1.4** — tre changelog paralleli | `CHANGES.md` e `TEST_RUN.md` **eliminati**. `CHANGELOG.md` resta unico. `tools/checks.py` e `tests/test_docs_config.py` aggiornati. | chiuso |
| **F1.5** — doc algoritmi duplicata | `algoritmi-verifica.md` e `APP_RIASSUNTO_ALGORITMI.txt` **unificati** in `ALGORITMI.md` (root). Sezioni 1–3 riscritte per riflettere la regola aziendale corrente (entrata ceil / uscita floor). Originali eliminati. | chiuso |
| **F2.3** — 10 export morti in api.ts (21%) | Rimossi `verifyPin`, `uploadCertificato`, variante esplicita di `uploadBustaPaga`, `getDocumento`, `uploadDocumento`, `createAlert`, `deleteAlert`, `importTimbratureAziendali`, `deleteTimbraturaAziendale`, `deleteAllTimbratureAziendali` + interfaccia `TimbraturaAziendalePayload`. Aggiunto commento in coda con elenco per ripristino veloce. Endpoint GDPR-sensibili preservati. | chiuso |
| **F2.4** — componenti su due cartelle | `ReperibilitaSheet.tsx` spostato da `frontend/app/components/` a `frontend/src/components/`, import interni riscalati, export aggiunto al barrel. La cartella `frontend/app/components/` è stata rimossa (vuota). | chiuso |
| **F2.5** — Dockerfile + render.yaml orfani | **Eliminati** `backend/Dockerfile` e `render.yaml`. `tools/checks.py` aggiornato. `backend/AGENTS.md` ripulito. | chiuso |
| **F2.6** — tests/legacy/*.mjs orfano | **Eliminato** `tests/legacy/frontend-web-runtime-regressions.test.mjs` e la cartella. Non era invocato né da CI né da npm script. | chiuso |

### Finding che restano aperti dopo Fase A

Per trasparenza, questi finding del referto **non sono stati affrontati** in Fase A — o perché appartengono alle Fasi B/C o perché sono rischi accettati:

- **F1.1** (server duplicato) → Fase B.
- **F2.1** (offlineApi.ts monolite 1584 LOC) → Fase C.
- **F2.2** (localDb.ts doppio engine) → Fase D (eventuale).
- **F2.7** (parser Sometime vs Zucchetti: entrambi ancora in repo) → decidere quando toccheremo i parser.
- **F3.1**–**F3.6** (rumore minore, rischi accettati) → non urgenti. F3.6 (AGENTS.md parla di "Docker/Render") è implicitamente chiuso perché AGENTS.md è ora thin pointer privo di quel testo.
- **F4** (audit sicurezza) → fase a sé.

### File toccati in Fase A (inventario completo)

Governance/doc:
- `README.md` (creato)
- `CONTRIBUTING.md` (creato)
- `PROTECTED_ZONES.md` (riscritto su nomi di funzione)
- `AGENTS.md`, `CLAUDE.md` (thin pointer)
- `backend/AGENTS.md`, `backend/CLAUDE.md` (thin pointer)
- `frontend/AGENTS.md`, `frontend/CLAUDE.md` (thin pointer)
- `agents/README.md` (disclaimer consultivo)
- `ALGORITMI.md` (creato; unificato)
- `CHANGELOG.md` (aggiornato)
- `REFERTO_RESTAURO.md` (questo documento, chiusura Fase A)

Eliminati:
- `CHANGES.md`, `TEST_RUN.md`
- `algoritmi-verifica.md`, `APP_RIASSUNTO_ALGORITMI.txt`
- `render.yaml`, `backend/Dockerfile`
- `tests/legacy/frontend-web-runtime-regressions.test.mjs` (+ cartella)
- `frontend/app/components/ReperibilitaSheet.tsx` (spostato, non perso) + cartella

Automazione:
- `tools/checks.py` (ROOT_DOCS_AND_CONFIG allineato)
- `tests/test_docs_config.py` (riscritto con asserzioni strutturali invece che string-match fragili)

Frontend:
- `frontend/src/services/api.ts` (10 export morti rimossi)
- `frontend/src/components/ReperibilitaSheet.tsx` (nuovo)
- `frontend/src/components/index.ts` (+1 export)
- `frontend/app/(tabs)/index.tsx` (import aggiornato)

### Zone intoccate (preservate per definizione)

- `backend/server.py` — algoritmi e endpoint: **zero modifiche**.
- `backend/server_nas.py` — idem.
- `backend/sometime_parser.py`, `backend/zucchetti_parser.py` — zero modifiche.
- `frontend/src/algorithms/calcoli.ts` — zero modifiche.
- `frontend/src/utils/helpers.ts` — zero modifiche.
- Tutti i test di logica (`tests/test_unit.py`, `tests/test_api.py`, `tests/test_e2e.py`, `tests/test_offline_runtime.py`) — zero modifiche al contenuto.

### Verifiche eseguite

- `pytest tests/test_docs_config.py tests/test_checks_runner.py` → **19/19 green** dopo ogni intervento.
- `grep` incrociato sugli import dei simboli rimossi da `api.ts` → zero consumatori residui.
- `grep` incrociato su `ReperibilitaSheet` → unico consumatore è `frontend/app/(tabs)/index.tsx`, già aggiornato.
- `grep` su `algoritmi-verifica|APP_RIASSUNTO_ALGORITMI|render\.yaml|Dockerfile|tests/legacy` → residui solo nei documenti storici (CHANGELOG, REFERTO_RESTAURO) che li citano legittimamente come "rimossi".

### Stato dopo Fase A

La repo è più leggera: meno duplicazione di governance, una sola fonte per gli algoritmi, nessun artefatto di deploy orfano, nessun runner di test orfano, api.ts senza simboli morti, componenti su un solo path. Il codice di dominio (algoritmi, endpoint, parser) non è stato toccato. Le Fasi B (unificazione server) e C (modularizzazione offlineApi) sono ora tecnicamente più semplici perché partono da un perimetro più pulito.
