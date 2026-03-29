# CHANGELOG — BustaPaga

Storico del progetto. Ogni modifica significativa viene registrata qui.
Leggere questo file insieme a AGENTS.md per avere il contesto completo.

---

## 2026-03-29 — Fix UI responsive: portabilità web/mobile tab principali

Cosa:
- `index.tsx`: KPI row in Home resa responsive su mobile (layout a 2 righe invece di strip troncata) e aumento del padding finale per evitare sovrapposizione visiva con tab bar.
- `assenze.tsx`: card summary Ferie/Comporto su mobile passate da affiancate a stack verticale per migliorare leggibilità.
- `timbrature.tsx`: aumentata area touch minima per frecce mese e segmenti tab (target più robusti su mobile).
- `buste-paga.tsx`: mantenuta griglia 2x2 delle azioni rapide con aumento altezza minima bottoni su mobile per etichette multilinea.
- Verifica visuale locale eseguita su desktop (1366x900) e mobile (390x844) con Playwright CLI.

Perché:
- eliminare incoerenze di portabilità grafica tra web e mobile senza cambiare logica funzionale o UX di business.

File: frontend/app/(tabs)/index.tsx, frontend/app/(tabs)/assenze.tsx, frontend/app/(tabs)/timbrature.tsx, frontend/app/(tabs)/buste-paga.tsx, CHANGELOG.md, CHANGES.md, TEST_RUN.md

---

## 2026-03-29 — Docs: allineamento governance Codex/Claude + ciclo corrente

Cosa:
- allineate le policy di orchestrazione e parallelismo tra root e contratti in `agents/*.md`: default sequenziale, parallelismo consentito solo con sub-agent gia impegnati su task indipendenti e senza conflitti di ownership.
- allineata la policy test frontend tra `frontend/AGENTS.md` e `frontend/CLAUDE.md` alla regola corrente: `pre-commit`/`pre-push` solo `pytest -m "unit or api"`, suite browser (`e2e_smoke`, `e2e`, `visual`) solo in CI, verifiche locali visual tramite Playwright/screenshot.
- chiarito il tracciamento ciclo in `AGENTS.md`, `CLAUDE.md`, `backend/AGENTS.md`, `backend/CLAUDE.md`, `frontend/AGENTS.md`, `frontend/CLAUDE.md`: quando un allineamento chiude il ciclo vanno aggiornati anche `CHANGES.md` e `TEST_RUN.md`.
- risolta l'ambiguita su `.claude/` in `AGENTS.md`: non toccare salvo richiesta esplicita utente o allineamento documentale concordato.

Perché:
- evitare drift tra regole Codex/Claude e tra root/sotto-repo.
- garantire che i cicli siano tracciati in modo completo e coerente, senza gap tra `CHANGELOG.md`, `CHANGES.md` e `TEST_RUN.md`.

File: AGENTS.md, CLAUDE.md, backend/AGENTS.md, backend/CLAUDE.md, frontend/AGENTS.md, frontend/CLAUDE.md, agents/ARCHITECTURE_AGENT.md, agents/BACKEND_API_AGENT.md, agents/FRONTEND_UI_AGENT.md, agents/OFFLINE_DATA_AGENT.md, agents/PAYROLL_LOGIC_AGENT.md, agents/PRODUCT_REQUIREMENTS_AGENT.md, agents/QA_AGENT.md, CHANGELOG.md, CHANGES.md, TEST_RUN.md

---

## 2026-03-29 — Feature: reperibilità — toggle ON/OFF + pianificazione ricorrente

Cosa:
- `index.tsx`: toggle "Reperibilità ON/OFF" nella card Timbratura Rapida (visibile solo quando si è pronti a timbrare entrata). Attivando il toggle, `offlineApi.timbra` riceve `isReperibilita=true` → la marcatura viene salvata con flag reperibilità. Il toggle si resetta dopo l'entrata. Tasto calendario nell'header card apre lo sheet di pianificazione.
- `app/components/ReperibilitaSheet.tsx`: nuovo bottom sheet per pianificazione ricorrente. Opzioni: tipo (passiva/attiva), data inizio, ora inizio/fine, interventi (solo attiva), ripetizione (mai/settimanale/bisettimanale/mensile), selezione giorni settimana, inverti sab/dom. Genera preview delle date future e chiama `offlineApi.createReperibilita` per ognuna (max 52 occorrenze, orizzonte 1 anno).
Perché: la reperibilità prima era solo registrabile tramite API; ora si può attivare manualmente al momento della timbratura e pianificare ricorrenze.
File: frontend/app/(tabs)/index.tsx, frontend/app/components/ReperibilitaSheet.tsx

---

## 2026-03-29 — Feature: swipe-to-edit su card assenze e cedolini

Cosa:
- Nuovo componente `SwipeableRow` (`frontend/src/components/SwipeableRow.tsx`) basato su `Swipeable` di `react-native-gesture-handler`. Supporta azioni opzionali `onEdit` e `onDelete` che compaiono con swipe left.
- `assenze.tsx`: sostituita `TouchableOpacity` + `onLongPress` con `SwipeableRow` → swipe left rivela "Elimina" (rosso). Feedback più naturale rispetto al longPress.
- `buste-paga.tsx`: ogni cedolino nella lista ora ha `SwipeableRow` → swipe left rivela "Modifica" (apre il detail sheet).
Perché: la gesture swipe è più scopribile del longPress e coerente con le app native moderne.
File: frontend/src/components/SwipeableRow.tsx, frontend/src/components/index.ts, frontend/app/(tabs)/assenze.tsx, frontend/app/(tabs)/buste-paga.tsx

---

## 2026-03-29 — Feature: totale netto annuo nell'header sezioni Buste Paga

Cosa:
- `buste-paga.tsx`: `renderYearSection` ora accetta `headerExtra?: string` opzionale. Per la sezione cedolini ogni header anno mostra "Totale netto: €X.XXX" (somma di tutti i netti del gruppo anno). Il totale rispetta il `privacyMode` (mostra `€ ••••` se attivo). Rimosso il badge ridondante con count numerico a destra; semplificato header a sola freccia chevron.
Perché: l'utente vuole vedere quanto ha guadagnato in un anno senza aprire tutte le mensilità.
File: frontend/app/(tabs)/buste-paga.tsx

---

## 2026-03-29 — Feature: timeline visiva timbrature nella card Home

Cosa:
- `index.tsx`: i badge testuali E/U nella card Timbratura Rapida sono sostituiti da una barra timeline orizzontale (07:00–20:00). Segmenti verdi per ogni coppia entrata-uscita completata; segmento semi-trasparente per sessione aperta corrente. Tick colorati (verde=entrata, rosso=uscita) con etichetta oraria sotto. Logica in `TimbraturaTimeline` component inline + helper `timeToPercent`.
Perché: i badge testuali erano poco leggibili con molte timbrature; la barra mostra a colpo d'occhio la distribuzione oraria della giornata.
File: frontend/app/(tabs)/index.tsx

---

## 2026-03-29 — Feature: card Home ibrida — KPI row scrollabile + expanded persistito

Cosa:
- `index.tsx`: aggiunta riga KPI orizzontale scrollabile sopra le card (ore mese, straordinari, ferie disponibili, comporto, ticket). Visibile sempre (tranne in editMode). Chip comporto evidenziato in arancione/rosso se alert attivi.
- Stato `expanded` delle card ora persiste in AsyncStorage (`home_card_expanded`): ricaricato al mount, salvato ad ogni toggle. Aggiunto `setExpanded` wrapper con side-effect persistenza; `setExpandedState` resta il setter raw di useState.
File: frontend/app/(tabs)/index.tsx

---

## 2026-03-29 — Feature: doppia unità ore+giorni nelle card Assenze

Cosa:
- `assenze.tsx`: card Ferie mostra ore (primario), giorni equivalenti (secondario, calcolati su `ore_giornaliere` da settings, default 8h), riga dettaglio Maturate/Godute con entrambe le unità. Card Comporto mostra giorni (primario), ore equivalenti (secondario), barra di progresso colorata (verde/arancione/rosso in base agli alert). Aggiunto `useAppStore` per leggere `settings.ore_giornaliere`.
Perché: unità di misura incoerenti (ferie in ore, comporto in giorni) causavano confusione; ora entrambe le card mostrano entrambe le unità.
File: frontend/app/(tabs)/assenze.tsx

---

## 2026-03-29 — Feature: funzionalità cloud condizionali (online/offline)

Cosa:
- `altro.tsx`: voce "Assistente AI" nella griglia si nasconde (placeholder grigio) quando `cloudEnabled=false`. Quando `cloudEnabled=true` ma `isOnline=false`, icona AI diventa grigia con badge cloud-offline. Badge `[offline]` nell'header visibile in tutta la schermata Altro. Aggiunto `isOnline` dallo store.
- `buste-paga.tsx`: bottoni "Carica PDF", "Importa storico", "Importa cartella" (cedolini e CUD) nascosti quando `cloudEnabled=false`. Hint testuale guida l'utente alle impostazioni.
Perché: modalità offline scelta deliberatamente = funzioni cloud scompaiono, non restano disabilitate con messaggio ripetuto.
File: frontend/app/(tabs)/altro.tsx, frontend/app/(tabs)/buste-paga.tsx

---

## 2026-03-29 — Feature: privacy mode (occhietto nascondere importi €)

Cosa:
- `appStore.ts`: aggiunto `privacyMode: boolean` persistito in storage con `setPrivacyMode`.
- `index.tsx`: icona occhio (`eye`/`eye-off`) nell'header della Home — toggle rapido privacy mode. Helper `fmt()` sostituisce `formatCurrency()` su tutti gli importi della Home (Stima Netto, Lordo, Straordinari, Ticket, Ultima Busta). Aggiunto stile `headerActions` e `privacyButton`.
- `buste-paga.tsx`: helper `fmt()` su tutti gli importi (netto, lordo, scarto, dettaglio cedolino).
- `altro.tsx`: helper `fmt()` sul compenso reperibilità.
Perché: un dipendente che timbra in presenza di altri può nascondere tutti gli importi con un solo tap.
File: frontend/src/store/appStore.ts, frontend/app/(tabs)/index.tsx, frontend/app/(tabs)/buste-paga.tsx, frontend/app/(tabs)/altro.tsx

---

## 2026-03-29 — Feature: timbrature multiple per giorno + overnight + day rollover

Cosa:
- `timbrature.tsx`: `renderTimbratura` ora itera `marcature[]` come coppie E/U invece di mostrare solo `ora_entrata`/`ora_uscita` aggregate. Ogni coppia entrata/uscita appare su riga separata. Icona luna (🌙) sulla uscita se timbratura overnight.
- `offlineApi.ts`: `timbra()` gestisce sessioni a cavallo di mezzanotte (Opzione B): se si preme Uscita e oggi non ha un'entrata aperta, cerca ieri per sessione overnight e salva l'uscita sotto la data di ieri. Calcolo ore corretto su tutte le coppie E/U ordinando per `created_at`. Aggiunto `getActiveTimbratura()`: restituisce la timbratura attiva (oggi o ieri overnight).
- `index.tsx`: `loadData` usa `getActiveTimbratura()` per mostrare sessioni overnight nella card Home. `workedSecondsTotal` gestisce diff negativo per coppie overnight. Timer controlla cambio data ogni secondo: se il giorno cambia e non c'è sessione overnight aperta, ricarica automaticamente.
- `types/index.ts`: aggiunto `is_overnight?: boolean` a `Timbratura`.

Perché: la card Home mostrava tutte le marcature individualmente ma la tab Timbrature mostrava solo prima/ultima; le sessioni overnight non erano gestite; l'app non rilevava il cambio di giorno a mezzanotte.
File: frontend/app/(tabs)/timbrature.tsx, frontend/app/(tabs)/index.tsx, frontend/src/services/offlineApi.ts, frontend/src/types/index.ts

## 2026-03-26 — Fix reset account: pulizia UI locale e sync PIN
Cosa: aggiornati `frontend/app/(tabs)/altro.tsx`, `frontend/app/_layout.tsx` e `frontend/src/store/appStore.ts` per azzerare lo stato UI locale dopo cancellazione dati/account, riallineare il PIN salvato con lo stato reale e rimuovere i residui di dashboard/account dalla store.
Perché: evitare che dopo `Elimina dati` o `Elimina account` restassero visibili stato UI, sessione chat, sheet aperti o PIN obsoleto, mantenendo coerente il reset locale con la cancellazione dei dati.
File: frontend/app/(tabs)/altro.tsx, frontend/app/_layout.tsx, frontend/src/store/appStore.ts, CHANGELOG.md, CHANGES.md, TEST_RUN.md

## 2026-03-26 — Fix cancellazione locale su “Elimina dati” e “Elimina account”
Cosa: aggiornato `offlineApi` per eseguire la pulizia locale dopo successo backend nei flussi di cancellazione; `deletePersonalData` ora esegue purge dati operativi locali (DB + file storage) e `deleteAccount` esegue purge completo locale (dati operativi + settings + file storage) con cleanup best-effort per evitare crash se il filesystem fallisce.
Perché: risolvere il problema dei residui locali dopo le azioni distruttive nel tab Altro, mantenendo il comportamento remoto invariato e rendendo prevedibile lo stato offline-first sul device.
File: frontend/src/services/offlineApi.ts, CHANGELOG.md, CHANGES.md, TEST_RUN.md

## 2026-03-26 — Chiusa migrazione offlineApi nei tab frontend
Cosa: completata la migrazione offline-first delle schermate/tab frontend eliminando i bypass diretti a `services/api.ts`; in particolare aggiunti in `offlineApi.ts` i wrapper mancanti per Buste Paga (`uploadCud`, `createBustaPaga`, `updateBustaPaga`), migrata la UI `buste-paga.tsx` a `offlineApi.*`, rimossi import residuali non usati in `index.tsx` e `assenze.tsx`, corretto `fileStore.ts` per compatibilità TypeScript con `expo-file-system/legacy`, completato audit finale con `tsc --noEmit` pulito.
Perché: chiudere in modo coerente la strategia offline-first del frontend mantenendo un unico punto di accesso dati (`offlineApi`) e riducendo regressioni dovute a contratti axios (`.data`) o API non offline-aware nelle schermate.
File: frontend/src/services/offlineApi.ts, frontend/app/(tabs)/buste-paga.tsx, frontend/app/(tabs)/index.tsx, frontend/app/(tabs)/assenze.tsx, frontend/src/storage/fileStore.ts, CHANGELOG.md

## 2026-03-26 — Wrapper offlineApi completati per modulo Timbrature
Cosa: esteso `frontend/src/services/offlineApi.ts` con i wrapper usati dalla schermata Timbrature (`getWeeklySummary`, `createTimbratura`, `updateTimbratura`, `deleteTimbratura`, `getTimbratureAziendali`, `uploadTimbratureAziendali`, `getConfrontoTimbrature`), aggiunti helper di normalizzazione dati locali e supporto replay queue per create/update/delete timbratura.
Perché: completare la migrazione offline-first del modulo Timbrature riducendo dipendenze dirette da `api.ts` e garantendo fallback locale/sync coerente quando il cloud non è disponibile.
File: frontend/src/services/offlineApi.ts, CHANGELOG.md, CHANGES.md, TEST_RUN.md

## 2026-03-25 — Fix: migrazione offline-first incompleta — .data access su offlineApi

Cosa: corretto accesso `.data` rimasto dopo la migrazione da `api.*` a `offlineApi.*` in `timbrature.tsx` e `altro.tsx`.
`offlineApi.*` restituisce dati direttamente (non `AxiosResponse`), il vecchio `.data` era `undefined` → tab Timbrature vuota, alerts/reperibilita/dailyStats/settings non caricate.
- `timbrature.tsx`: `setTimbrature(timbRes.data)` → `setTimbrature(timbRes as Timbratura[])`
- `altro.tsx`: migrate a offlineApi le funzioni `loadAlerts`, `loadReperibilita`, `loadDailyStats`, `refreshDashboard`, `saveSettings`, `savePin`
Perché: quando si cambia da axios a offlineApi si deve anche rimuovere `.data`; i due contratti sono incompatibili
File: frontend/app/(tabs)/timbrature.tsx, frontend/app/(tabs)/altro.tsx

## 2026-03-25 — Fix: persistenza localStorage web — timbrature perse al reload

Cosa: aggiunto `saveWebStore()`/`loadWebStore()` in `localDb.ts` per persistere `WEB_STORE` su `localStorage` (chiave `bustapaga-webstore-v1`).
Wrapper `createMemoryDb()` chiama `saveWebStore()` dopo ogni `runAsync`/`execAsync`.
Perché: su web `WEB_STORE` era in-memory puro: dati persi ad ogni reload → offline-first non funzionante in browser
File: frontend/src/db/localDb.ts

## 2026-03-25 — Fix: bottone Entrata card Timbratura Rapida non funzionava su web
Cosa: aggiunto pattern `SELECT * FROM timbrature WHERE data = ?` nel `memoryDb.getAllAsync` di `localDb.ts`; il pattern mancante causava un'eccezione silenziata in `handleTimbra` che impediva qualsiasi aggiornamento UI e chiamata al backend
Perché: `getTimbraturaByData` usa questa query per leggere la timbratura del giorno; il memoryDb (fallback web di expo-sqlite) non la gestiva e lanciava `Unsupported web getAllAsync SQL`
File: frontend/src/db/localDb.ts

## 2026-03-22 — BUG APERTO: Card Timbratura Rapida non registra entrata (web)
Cosa: identificato bug in home page — click su "Entrata" non genera POST a backend né aggiorna UI; causa: `offlineApi.timbra()` chiama `db.upsertTimbratura()` su expo-sqlite web che genera "Invalid VFS state" nonostante fix precedente in `localDb.ts`; il catch block mostra Alert RN che non è intercettabile in preview web
Perché: fallback in-memory di localDb.ts non copre tutti i metodi usati da offlineApi; da investigare in prossima sessione
Task: verificare `localDb.ts` fallback web + `offlineApi.ts` L421 + comportamento `canUseCloud()`
File: nessuna modifica — solo diagnosi

## 2026-03-22 — Config preview tool: launch.json e metro.config.js
Cosa: aggiornato `.claude/launch.json` con configurazione diretta python/node (backend 8001, frontend 8086, senza wrapper PowerShell); aggiunto `wasm` agli `assetExts` di Metro per supporto expo-sqlite web; impostato `EXPO_PUBLIC_BACKEND_URL=http://127.0.0.1:8001` nell'env del frontend
Perché: i wrapper PowerShell causavano timeout nel preview tool di Claude Code; Metro non risolveva i file .wasm per expo-sqlite
File: .claude/launch.json, frontend/metro.config.js

## 2026-03-22 — Rimosso e2e_smoke dal pre-push locale
Cosa: aggiornato `tools/checks.py` per eseguire `pre-commit` e `pre-push` solo con `pytest -m "unit or api"`; spostato `e2e_smoke` in `CI` insieme a `e2e` e `visual`; aggiornati `AGENTS.md`, `CLAUDE.md`, `memory/MEMORY.md` e i test di coerenza (`tests/test_checks_runner.py`, `tests/test_docs_config.py`) per riflettere il nuovo flusso locale ultra-rapido e l'uso locale di Playwright CLI / Playwright Interactive / Screenshot.
Perché: il bootstrap Metro+Expo rendeva `e2e_smoke` troppo lento in pre-push locale; il controllo completo resta in CI asincrona senza bloccare il ciclo di sviluppo.
File: tools/checks.py, AGENTS.md, CLAUDE.md, memory/MEMORY.md, tests/test_checks_runner.py, tests/test_docs_config.py, CHANGELOG.md

## 2026-03-22 — Policy locale ultra-rapida: e2e/visual solo CI
Cosa: aggiornato `tools/checks.py` per applicare gate locali fissi e veloci (`pre-commit`: `pytest -m "unit or api"`, `pre-push`: `pytest -m "unit or api"` + `pytest -m e2e_smoke`) e spostare in `CI` i controlli più costosi (`docs_config`, `offline_runtime`, `tsc`, `e2e`, `visual`); aggiornati test runner/documentali e documentazione root/frontend per dichiarare che in locale E2E/visual si fanno con Playwright CLI Skill o Playwright Interactive, non con `pytest -m e2e|visual`
Perché: ridurre drasticamente i tempi del flusso locale ed evitare avvii stack completi nei gate locali, mantenendo la copertura completa asincrona in CI
File: tools/checks.py, tests/test_checks_runner.py, tests/test_docs_config.py, AGENTS.md, CLAUDE.md, frontend/CLAUDE.md, memory/MEMORY.md, CHANGELOG.md

## 2026-03-22 — Testing unificato + governance + file ciclo (Claude Code × Codex)
Cosa: piano concordato tra Claude Code e Codex — aggiunto `PROTECTED_ZONES.md` come fonte unica delle zone protette; aggiunte fixture `stack_frontend_mock` e `stack_full_integration` in conftest.py; test startup marcato `e2e_smoke` con fixture senza backend; marker `e2e_smoke` in pyproject.toml; `pytest-xdist` in requirements-test.txt; rimossi check porte hardcodate da test_docs_config.py con check di coerenza strutturale; creati CHANGES.md e TEST_RUN.md con template rotate-and-replace; aggiornato AGENTS.md e CLAUDE.md con reference a PROTECTED_ZONES.md; fix metro.config.js per supporto .wasm (expo-sqlite web)
Perché: rendere i test E2E più veloci separando smoke test (solo frontend) dai test di integrazione reale; unificare governance con fonte unica per zone protette; eliminare valori fissi fragili nei test documentali; definire protocollo condiviso per tracciare cicli modifica→test
File: PROTECTED_ZONES.md, CHANGES.md, TEST_RUN.md, AGENTS.md, CLAUDE.md, tests/conftest.py, tests/test_e2e.py, tests/test_docs_config.py, pyproject.toml, requirements-test.txt, frontend/metro.config.js

## 2026-03-22 — Gate startup-smoke rapido e de-duplicazione E2E
Cosa: aggiunto `tools/startup_smoke.py` per verificare in automatico bootstrap backend+frontend e rendering home con Playwright headless; integrato nel runner path-aware come check `startup_smoke` in `pre-push`; spostata la suite E2E/visual completa al solo `CI`; escluso dal comando E2E il test startup gia coperto da smoke; aggiornati test del runner e documentazione operativa
Perché: evitare timeout e ridurre i tempi dei controlli automatici locali mantenendo una verifica reale dell'avvio dell'app senza duplicare la stessa copertura in più livelli
File: tools/startup_smoke.py, tools/checks.py, tests/test_checks_runner.py, tests/test_docs_config.py, AGENTS.md, CLAUDE.md, memory/MEMORY.md, CHANGELOG.md

## 2026-03-22 — Separazione netta tra policy test e skill
Cosa: ripulite le sezioni guida per rendere i controlli automatici una policy autonoma e le skill una sezione separata e non vincolante; riorganizzata anche `memory/MEMORY.md` in blocchi distinti controlli/skill; rafforzato il test documentale sulla distinzione
Perché: evitare commistioni inutili tra regole di test e competenze/skill, così Codex e Claude leggono subito cosa è obbligatorio e cosa è solo raccomandato
File: AGENTS.md, CLAUDE.md, memory/MEMORY.md, tests/test_docs_config.py, CHANGELOG.md

## 2026-03-22 — Runner test coerente con la policy CI
Cosa: aggiornato `tools/checks.py` per far eseguire sempre in CI il gate rapido `pytest -m "unit or api"` anche quando il diff tocca solo docs o configurazione, esteso `tests/test_checks_runner.py` per bloccare questa regola e reso `_run-checks.sh` più robusto su Windows con fallback `python` / `python3` / `py -3`
Perché: riallineare il comportamento reale del runner alla policy documentata e rendere affidabile l'avvio automatico dei check locali senza dover lanciare test manualmente
File: tools/checks.py, .githooks/_run-checks.sh, tests/test_checks_runner.py, CHANGELOG.md

## 2026-03-22 — Stabilizzato bootstrap SQLite nella preview web
Cosa: corretto il gate runtime in `frontend/src/db/localDb.ts` per trattare ogni esecuzione `Platform.OS === 'web'` come ambiente web e usare sempre il fallback in-memory gia presente, evitando il ramo `expo-sqlite` persistente durante la preview browser; rafforzato il test offline runtime sul comportamento web
Perché: la preview locale avviata con gli script `.claude` si bloccava su web con errori `cannot create file` / `xFileControl` / `Invalid VFS state` nel worker SQLite perche il bootstrap poteva entrare nel ramo sbagliato invece del fallback web
File: frontend/src/db/localDb.ts, tests/test_offline_runtime.py, CHANGELOG.md

## 2026-03-22 — Metodo di avvio locale unificato
Cosa: allineati `start-backend.ps1`, `start-frontend.ps1` e `start-app.ps1` alle porte locali `8001/8083`, aggiunta modalita `-Foreground` ai servizi root, convertiti gli script `.claude/preview-*` in wrapper sottili che delegano agli script root e aggiornato `.claude/launch.json` per usare la stessa catena di avvio; adeguati docs e test documentali
Perché: eliminare la doppia implementazione tra repo e Claude Preview e avere un unico metodo di avvio locale realmente condiviso e verificabile
File: start-backend.ps1, start-frontend.ps1, start-app.ps1, .claude/preview-backend.ps1, .claude/preview-frontend.ps1, .claude/launch.json, AGENTS.md, CLAUDE.md, backend/AGENTS.md, tests/test_docs_config.py, CHANGELOG.md

## 2026-03-22 — Formalizzata automazione test e anti-duplicazione
Cosa: riscritta la policy test nei file guida root, backend, frontend e memoria condivisa con una sequenza chiara `pre-commit` / `pre-push` / `CI`, gate reali per path, regola anti-duplicazione tra unit, api, e2e e visual, e aggiornato il test documentale per bloccare la nuova struttura
Perché: rendere univoco per Codex e Claude Code quando i test partono automaticamente, quali suite usare e come evitare ripetizioni inutili tra livelli di test
File: AGENTS.md, CLAUDE.md, backend/AGENTS.md, backend/CLAUDE.md, frontend/AGENTS.md, frontend/CLAUDE.md, memory/MEMORY.md, tests/test_docs_config.py, CHANGELOG.md

## 2026-03-21 — Formalizzato toolchain di controllo e skill utili
Cosa: aggiunte nei file guida root, backend, frontend e memoria condivisa le sezioni operative su controlli standard (`pytest`, marker, test docs/offline, `tsc --noEmit` quando rilevante), controlli condizionali per UI e sync offline, strumenti di sviluppo utili (`playwright-interactive`, `screenshot`, `pdf`, MCP Preview/Chrome) e skill raccomandate per questo progetto; esteso il test documentale per bloccare regressioni sulla policy di toolchain e skill
Perché: rendere stabile e condiviso tra Codex e Claude Code l'insieme degli strumenti da usare per sviluppo, debug e verifica dell'app senza doverlo ridefinire a ogni sessione
File: AGENTS.md, CLAUDE.md, backend/AGENTS.md, backend/CLAUDE.md, frontend/AGENTS.md, frontend/CLAUDE.md, memory/MEMORY.md, tests/test_docs_config.py, CHANGELOG.md

---

## 2026-03-21 — Allineamento offline-first, preview Claude e policy Gemini
Cosa: riallineati AGENTS/CLAUDE root, backend e frontend alla realtà corrente del progetto; chiarito che Gemini può accedere ai dati e ai file utente necessari a rispondere senza log superflui; rese coerenti le porte preview Claude su 8001/8083 con backend URL allineato; creata `memory/MEMORY.md` come memoria condivisa locale; implementato il replay della `offline_queue` con flush automatico al ritorno online o alla riattivazione del cloud; aggiornati tipi frontend e helper locali al modello path-based e corretta la semantica di `clearAccount`; aggiunti test di coerenza docs/config e runtime offline
Perché: eliminare i disallineamenti tra documentazione, configurazione locale e comportamento reale dell'app, mantenendo coerenti la policy Gemini e il flusso offline-first
File: AGENTS.md, CLAUDE.md, backend/AGENTS.md, backend/CLAUDE.md, frontend/AGENTS.md, frontend/CLAUDE.md, .claude/launch.json, .claude/preview-backend.ps1, .claude/preview-frontend.ps1, memory/MEMORY.md, frontend/src/services/offlineApi.ts, frontend/src/db/localDb.ts, frontend/src/hooks/useNetworkStatus.ts, frontend/src/types/index.ts, tests/test_docs_config.py, tests/test_offline_runtime.py, CHANGELOG.md

---

## 2026-03-21 — Creati contratti agenti condivisi
Cosa: creata la cartella `agents/` con contratti operativi per `PRODUCT_REQUIREMENTS_AGENT`, `ARCHITECTURE_AGENT`, `BACKEND_API_AGENT`, `FRONTEND_UI_AGENT`, `OFFLINE_DATA_AGENT`, `PAYROLL_LOGIC_AGENT` e `QA_AGENT`; aggiornati i file guida root, backend e frontend per renderli discoverable sia da Codex sia da Claude Code
Perché: rendere concreta la regola di orchestrazione con ownership chiare, delega preventiva e parallelismo esplicito tra agenti specializzati
File: agents/README.md, agents/PRODUCT_REQUIREMENTS_AGENT.md, agents/ARCHITECTURE_AGENT.md, agents/BACKEND_API_AGENT.md, agents/FRONTEND_UI_AGENT.md, agents/OFFLINE_DATA_AGENT.md, agents/PAYROLL_LOGIC_AGENT.md, agents/QA_AGENT.md, AGENTS.md, CLAUDE.md, backend/AGENTS.md, backend/CLAUDE.md, frontend/AGENTS.md, frontend/CLAUDE.md, CHANGELOG.md

---

## 2026-03-21 — Porte preview spostate (8001/8083)
Cosa: backend spostato da porta 8000 a 8001, frontend da 8082 a 8083 in .claude/launch.json
Perché: porte 8000 e 8082 occupate da Codex in parallelo
File: .claude/launch.json

---

## 2026-03-21 — Allineamento file di documentazione
Cosa: aggiunto calcoli.ts alla zona protetta di AGENTS.md; aggiornata nota cartelle ignorabili in AGENTS.md; corretti percorsi file critici e frase calcoli in frontend/AGENTS.md; aggiunto endpoint /api/documenti in backend/AGENTS.md; aggiornato stato memoria offline-first a "completato"; aggiunte in CLAUDE.md la procedura di allineamento documenti e la regola avviso compattazione chat
Perché: correggere i disallineamenti emersi dal report di allineamento e codificare in CLAUDE.md le procedure operative per sessioni future
File: AGENTS.md, CLAUDE.md, frontend/AGENTS.md, backend/AGENTS.md, memory/project_offline_architecture.md

---

## 2026-03-21 — Fase 4 offline-first: backend cloud opzionale
Cosa: aggiunto cloudEnabled (toggle persistito) allo store; offlineApi usa canUseCloud() (isOnline && cloudEnabled) per tutte le chiamate backend; sezione "Servizi cloud" in Impostazioni con switch on/off e descrizione funzionalità; guard cloud su upload PDF in buste-paga.tsx; guard cloud su chat AI in altro.tsx
Perché: l'utente può disabilitare completamente il backend cloud — l'app funziona in modalità puramente locale; il cloud rimane necessario solo per parsing PDF e chat AI
File: frontend/src/store/appStore.ts, frontend/src/services/offlineApi.ts, frontend/app/(tabs)/altro.tsx, frontend/app/(tabs)/buste-paga.tsx

---

## 2026-03-21 — Fase 3 offline-first: cache layer + timbra offline
Cosa: installato @react-native-community/netinfo; creati useNetworkStatus hook e offlineApi.ts (wrapper cache-first per settings, dashboard, timbrature, assenze, buste-paga, reperibilità, alerts); aggiunto isOnline/lastSyncAt allo store; banner offline nel layout; timbra() ora salva in SQLite locale immediatamente e tenta sync (aggiunge a offline_queue se offline); dashboard home usa algoritmi TypeScript locali quando offline
Perché: funzionalità core (timbratura, dashboard) ora funzionano senza rete; il backend rimane il source of truth quando disponibile
File: frontend/src/hooks/useNetworkStatus.ts, frontend/src/services/offlineApi.ts, frontend/src/store/appStore.ts, frontend/app/(tabs)/_layout.tsx, frontend/app/(tabs)/index.tsx, frontend/app/(tabs)/timbrature.tsx, frontend/package.json

---

## 2026-03-21 — Fase 2 offline-first: algoritmi TypeScript
Cosa: creato src/algorithms/calcoli.ts — port fedele 1:1 di tutti gli algoritmi protetti da backend/server.py (arrotondaQuartiOra, calcolaOreLavorate, calcolaStraordinario, calcolaTicket, calcolaReperibilita passiva/attiva, calcolaOreDaMarcature, calcolaOreReperibilita, calcolaMetadatiStima, stimaNetto, calcolaSaldoFerie, calcolaComporto)
Perché: gli algoritmi devono funzionare offline sul device senza chiamare il backend; traduzione 1:1, stessa logica, nessuna ottimizzazione
File: frontend/src/algorithms/calcoli.ts, CLAUDE.md

---

## 2026-03-21 — Fase 1 offline-first: fondamenta locali
Cosa: installato expo-sqlite; creati src/db/localDb.ts (database SQLite locale con 9 tabelle + offline_queue) e src/storage/fileStore.ts (wrapper Expo FileSystem per PDF e documenti)
Perché: primo step della migrazione offline-first — il device diventa fonte di verità, il backend cloud è opzionale; i file utente (PDF, certificati) sono ora salvati in locale invece che come base64 nel DB
File: frontend/package.json, frontend/src/db/localDb.ts, frontend/src/storage/fileStore.ts

---

## 2026-03-21 — Aggiunta configurazione nativa Claude Code
Cosa: creati CLAUDE.md (root), backend/CLAUDE.md e frontend/CLAUDE.md per uso con Claude Code; il progetto è ora condiviso tra Claude Code e Codex
Perché: AGENTS.md è la convenzione Codex; Claude Code legge CLAUDE.md nativamente — i nuovi file si dichiarano allineati ad AGENTS.md (che resta la fonte di verità) e aggiungono solo regole specifiche Claude Code (orchestrazione agenti, MCP tools, gestione .claude/ e memory/)
File: CLAUDE.md, backend/CLAUDE.md, frontend/CLAUDE.md

---

## 2026-03-21 — Riparato recupero account da cedolino Zucchetti reale
Cosa: aggiunto un fallback backend che ricava nome, cognome e matricola dal raw text delle buste Zucchetti quando il parser strutturato non li espone, e sia `/settings` sia `/dashboard` riparano anche le buste gia archiviate
Perché: il PDF reale importato salvava azienda e livello ma lasciava vuoti nome, cognome e matricola nella dashboard, quindi la card `Nessun account attivo` restava visibile e le informazioni account non si popolavano
File: backend/server.py, frontend/app/(tabs)/altro.tsx, frontend/app/(tabs)/buste-paga.tsx, tests/test_api.py, CHANGELOG.md

## 2026-03-21 — Sincronizzato account attivo dopo primo cedolino
Cosa: la scheda Altro si aggiorna al focus, consente il caricamento diretto di una busta paga dalla card vuota, sincronizza dashboard e settings dopo l'import e considera attivo l'account appena arrivano nome o cognome dal cedolino
Perché: evitare che la card "Nessun account attivo" resti visibile dopo il primo import valido e rendere davvero automatico il recupero dei dati minimi account
File: frontend/app/(tabs)/altro.tsx, frontend/app/(tabs)/buste-paga.tsx, CHANGELOG.md

## 2026-03-21 — Reso robusto il recupero nome e cognome da busta paga
Cosa: il parser Zucchetti dei settings accetta ora anche un output con nome e cognome al livello root del risultato, la card Altro si aggiorna al focus e i test API verificano che dopo il primo upload i campi minimi account siano presenti in settings e dashboard
Perché: evitare che la UI resti su `Nessun account attivo` quando la prima busta paga ha gia fornito i dati minimi dell'account, anche se il parser cambia leggermente forma
File: backend/server.py, frontend/app/(tabs)/altro.tsx, tests/test_api.py, CHANGELOG.md

## 2026-03-21 — Dati account minimi nei settings
Cosa: esteso lo schema settings con cognome, matricola e numero badge, aggiunta una migrazione retrocompatibile per i database gia esistenti e aggiornato il flusso automatico della prima busta per separare nome e cognome quando possibile
Perché: supportare solo i dati account davvero necessari nell'inserimento manuale, mantenere i dati contrattuali al parser e non rompere gli archivi locali gia presenti
File: backend/server.py, tests/test_api.py, CHANGELOG.md

## 2026-03-21 — Ridotto il form account ai soli dati identificativi
Cosa: la card e il bottom sheet account in Altro ora usano solo Nome, Cognome, Matricola e Numero badge, con un messaggio esplicito che il resto dei dati arrivera dalla prima busta paga e con reset locale allineato su questi soli campi
Perché: semplificare l'inserimento manuale iniziale e lasciare al parser del cedolino il completamento dei dati contrattuali non essenziali
File: frontend/app/(tabs)/altro.tsx, frontend/src/store/appStore.ts, frontend/src/types/index.ts, tests/test_e2e.py, CHANGELOG.md

## 2026-03-21 — Ricalibrato il copy di recupero account in Altro
Cosa: aggiornata la card `Nessun account attivo` con il nuovo testo su due righe logiche e allineato il test E2E che verifica il copy della schermata
Perché: rendere piu chiaro il messaggio di recupero account e mantenere il controllo automatico del copy visibile nella suite visuale
File: frontend/app/(tabs)/altro.tsx, tests/test_e2e.py, CHANGELOG.md

## 2026-03-21 — Recupero account guidato dalla scheda Altro
Cosa: nella card `Nessun account attivo` aggiunte due scelte reali per reinserire i dati dell'account, con accesso diretto all'editing manuale dei dati e instradamento al flusso automatico di caricamento busta paga gia presente nella scheda Buste Paga
Perché: trasformare l'avviso passivo dopo `Elimina account` in un punto di recupero chiaro e operativo, riducendo l'ambiguita tra inserimento manuale e riconoscimento automatico tramite parser
File: frontend/app/(tabs)/altro.tsx, tests/test_e2e.py, CHANGELOG.md

## 2026-03-21 — Separazione account locale e catena dati Stima Netto
Cosa: separati i dati di account dai dati contrattuali nella logica di eliminazione, rimossi fallback personali finti da Home e Altro, resa esplicita la fonte della stima netto e mantenuta la stima anche dopo l'eliminazione dell'account locale quando i dati contrattuali restano presenti
Perché: evitare che Elimina account azzeri il contratto usato nei calcoli, chiarire perché Cancella dati personali può lasciare una stima basata sul contratto e impedire che la UI mostri dati fantasma
File: backend/server.py, frontend/app/(tabs)/altro.tsx, frontend/app/(tabs)/index.tsx, frontend/src/store/appStore.ts, frontend/src/types/index.ts, tests/test_api.py, tests/test_e2e.py, CHANGELOG.md

## 2026-03-21 — Restyling del design system condiviso
Cosa: riallineati i token colore e le superfici condivise con card, button, input, bottom sheet, stat card, loading screen e tab bar piu puliti, coerenti e leggibili
Perché: ottenere un look piu premium e uniforme senza toccare le singole screen e senza alterare i flussi di navigazione
File: frontend/src/utils/colors.ts, frontend/src/components/Card.tsx, frontend/src/components/Button.tsx, frontend/src/components/InputField.tsx, frontend/src/components/BottomSheet.tsx, frontend/src/components/StatCard.tsx, frontend/src/components/LoadingScreen.tsx, frontend/app/(tabs)/_layout.tsx, CHANGELOG.md

## 2026-03-21 — Mitigazione log SSL di Responsively
Cosa: rafforzato il launcher frontend quando apre Responsively App, isolando meglio il processo Electron e reindirizzando stdout/stderr su file runtime dedicati per evitare che i warning SSL net_error -202 finiscano nel terminale
Perché: mantenere pulito l'output del tasto Start quando il frontend viene aperto in Responsively senza toccare l'app Expo
File: start-frontend.ps1, tests/test_unit.py, CHANGELOG.md

## 2026-03-21 — Sincronizzazione automatica dati contrattuali da cedolino
Cosa: il caricamento della busta paga Zucchetti aggiorna automaticamente i dati contrattuali estraibili dal parser in settings e la schermata Buste Paga rinfresca subito il dashboard locale
Perché: mantenere nome, azienda, livello, data assunzione ed elementi retributivi allineati ai cedolini senza inserimento manuale
File: backend/server.py, frontend/app/(tabs)/buste-paga.tsx, tests/test_api.py

## 2026-03-21 — Stima Netto allineata a competenza e pagamento previsto
Cosa: chiarita la logica della card Home Stima Netto mantenendo il calcolo sulla competenza del mese corrente ma distinguendo nel payload e nella UI il pagamento previsto al 27 del mese successivo, con tipi frontend e test coerenti
Perché: evitare che la stima sembri un residuo dati e mostrare in modo esplicito quale mensilita si sta stimando e quando verra pagata
File: backend/server.py, frontend/app/(tabs)/index.tsx, frontend/src/types/index.ts, tests/test_api.py, tests/test_e2e.py, CHANGELOG.md

## 2026-03-21 — Separazione cancellazione dati operativi e account
Cosa: aggiunti due flussi distinti nelle impostazioni con conferma esplicita: Cancella dati personali elimina solo PDF, timbrature, buste paga, tredicesime, CUD e documenti; Elimina account azzera solo profilo, dati descrittivi e PIN locale
Perché: distinguere in modo netto i dati operativi caricati dai dati dell'account ed evitare cancellazioni troppo estese o ambigue durante i test dell'app
File: backend/server.py, frontend/app/(tabs)/altro.tsx, frontend/src/services/api.ts, tests/test_api.py, tests/test_e2e.py

## 2026-03-21 — Riorganizzazione schermata buste paga
Cosa: ridisegnata la scheda Buste Paga con azioni rapide compattate, riepilogo iniziale e storico raggruppato per anno con sezioni espandibili separate per Cedolini, Archivio PDF e CUD
Perché: ridurre il carico cognitivo, accorciare lo scroll e rendere più leggibile la gestione dei documenti senza cambiare i flussi esistenti
File: frontend/app/(tabs)/buste-paga.tsx

## 2026-03-21 — Riparazione archivio documenti
Cosa: corretto l'ordine di inserimento nella tabella documenti con colonne esplicite, aggiunta una riparazione automatica per le righe gia corrotte e copertura API per upload corretti e recupero dell'archivio senza crash
Perché: evitare il 500 su GET /api/documenti, rendere leggibile l'archivio esistente e prevenire nuove corruzioni dei record documenti
File: backend/server.py, tests/test_api.py, CHANGELOG.md

## 2026-03-21 — Import cartella Buste Paga tollerante e misto
Cosa: reso piu robusto il caricamento da cartella nella schermata Buste Paga con scansione ricorsiva delle sottocartelle sul web, instradamento dei PDF supportati verso cedolini o CUD in base al nome, ignorando i file non supportati senza interrompere il batch e senza bloccare il refresh dell'archivio se una sola sezione fallisce
Perché: permettere l'import di alberi di cartelle annidati contenenti storici misti senza trasformare un file fuori posto o un archivio parziale in un errore globale della pagina
File: frontend/app/(tabs)/buste-paga.tsx, tests/test_e2e.py, CHANGELOG.md

## 2026-03-21 — Propagata orchestrazione anche nei file AGENTS secondari
Cosa: aggiunta anche in backend/AGENTS.md e frontend/AGENTS.md la regola che definisce Codex come orchestratore, impone ownership chiara ai sub-agent e richiede delega, sblocco o riassegnazione prima dell'esecuzione diretta
Perché: evitare che la regola resti valida solo nel file root e renderla esplicita anche nei contesti backend e frontend letti da agenti specializzati
File: backend/AGENTS.md, frontend/AGENTS.md, CHANGELOG.md

## 2026-03-21 — Regola permanente per orchestrazione e sub-agent
Cosa: aggiunta in AGENTS.md una regola esplicita che definisce Codex come orchestratore, impone ai sub-agent di lavorare nel proprio ambito con ownership chiara e obbliga a delegare il lavoro prima all'agente adatto e libero, usando l'orchestratore come esecutore solo quando tutti gli agenti compatibili sono già impegnati o davvero bloccati
Perché: rendere stabile il metodo di lavoro tra sessioni, evitare che l'orchestratore assorba task delegabili e imporre un tentativo reale di sblocco o riassegnazione quando un sub-agent fallisce
File: AGENTS.md, CHANGELOG.md

## 2026-03-21 — Storico cedolini, tredicesima separata e archivio CUD
Cosa: ricostruita la schermata Buste Paga con tab dedicati per Cedolini e CUD, import singolo o storico da più PDF/cartella sul web, archivio distinto dei file caricati, conferma di sovrascrittura sui duplicati e test automatici per tredicesima e Certificazione Unica
Perché: permettere il caricamento ordinato di storici documentali, distinguere la tredicesima dal cedolino ordinario del mese e iniziare a gestire i CUD con un archivio base senza confonderli con le mensilità standard
File: backend/server.py, frontend/app/(tabs)/buste-paga.tsx, frontend/src/services/api.ts, frontend/src/types/index.ts, tests/test_api.py, tests/test_e2e.py, CHANGELOG.md

## 2026-03-21 — Mese automatico PDF e conferma sovrascrittura archivio
Cosa: il backend ora ricava automaticamente il mese reale dai PDF di timbrature e buste paga, riallinea i record aziendali già salvati alla data effettiva, blocca i duplicati con richiesta esplicita di sovrascrittura e il frontend sposta la vista sul periodo riconosciuto dal parser senza chiedere il mese del file per l'upload busta paga
Perché: evitare import con mese errato, far sì che il selettore mese della schermata Timbrature condizioni davvero i dati mostrati, associare correttamente report e buste paga al loro periodo e impedire sovrascritture involontarie dell'archivio
File: backend/server.py, frontend/src/services/api.ts, frontend/app/(tabs)/timbrature.tsx, frontend/app/(tabs)/buste-paga.tsx, tests/test_api.py, CHANGELOG.md

## 2026-03-21 — Avvio automatico in Responsively App
Cosa: aggiornati gli script di avvio locale per impedire a Expo di aprire il browser predefinito, provare ad aprire automaticamente il frontend in Responsively App dopo il boot, cercare il binario in modo automatico, usare l'URL diretto quando viene lanciato `ResponsivelyApp.exe` e supportare `RESPONSIVELY_APP_PATH` con fallback pulito se l'app non è disponibile
Perché: usare il tasto Start con un ambiente di preview responsive invece di Edge o del browser di sistema, evitando l'errore `Invalid URL` quando Responsively viene aperta direttamente su Windows
File: start-app.ps1, start-frontend.ps1, tests/test_unit.py, CHANGELOG.md

## 2026-03-21 — Fix upload PDF timbrature aziendali sul web
Cosa: corretto il `FormData` della schermata Timbrature per usare il `File` reale restituito da `expo-document-picker` sul web e mantenere il fallback `uri` su native, aggiunto un test API sull'import delle timbrature aziendali da PDF
Perché: far sì che il caricamento del report mensile aziendale arrivi davvero al parser backend e popoli la sezione Azienda con le timbrature importate invece di lasciare la schermata vuota
File: frontend/app/(tabs)/timbrature.tsx, tests/test_api.py, CHANGELOG.md

## 2026-03-21 — Validazione PDF errato nella scheda Azienda
Cosa: la sezione Timbrature > Azienda ora rifiuta i PDF che sembrano buste paga invece di salvarli come report timbrature vuoti, mostra un messaggio chiaro lato API e rende piu esplicito nell'interfaccia quale documento va caricato
Perché: evitare schermate vuote e falsi caricamenti riusciti quando l'utente seleziona una busta paga o un PDF non compatibile al posto del report timbrature giornaliero
File: backend/server.py, frontend/app/(tabs)/timbrature.tsx, tests/test_api.py, CHANGELOG.md

## 2026-03-21 — Validazione incrociata PDF tra Timbrature e Buste Paga
Cosa: aggiunto anche nel caricamento buste paga il rifiuto esplicito dei report timbrature, uniformati i popup frontend con avviso `File non compatibile` in entrambe le schermate e resa piu chiara l'indicazione sul tipo di PDF atteso
Perché: impedire caricamenti nel posto sbagliato in entrambi i sensi e dare all'utente un feedback immediato senza salvare documenti errati
File: backend/server.py, frontend/app/(tabs)/buste-paga.tsx, frontend/app/(tabs)/timbrature.tsx, tests/test_api.py, CHANGELOG.md

## 2026-03-21 — Timer Home timbratura parte da zero
Cosa: corretto il timer della card Home timbrature usando il timestamp reale dell'ultima entrata e un override locale alla conferma della timbratura, aggiunti testID dedicati e rafforzata la verifica E2E sul primo secondo di conteggio
Perché: evitare che il timer parta gia avanzato dopo il tap su Entrata e rendere affidabile la percezione del conteggio in tempo reale
File: frontend/app/(tabs)/index.tsx, tests/test_e2e.py, CHANGELOG.md

## 2026-03-21 — Aggiornamento testi stato timbratura Home
Cosa: aggiornati i messaggi sotto il timer della card Home timbrature con testi piu espliciti per sessione attiva e giornata conclusa, e adeguata la verifica E2E
Perché: rendere piu chiaro all'utente lo stato corrente della timbratura nella schermata principale
File: frontend/app/(tabs)/index.tsx, tests/test_e2e.py, CHANGELOG.md

## 2026-03-21 — Riavvio forzato dal tasto Start
Cosa: aggiornati gli script di avvio locale per chiudere backend e frontend gia attivi prima di rilanciare lo stack completo quando viene eseguito `start-app.ps1`
Perché: rendere il tasto Start di Codex affidabile anche quando l'app e gia in esecuzione, evitando stato sporco e processi duplicati
File: start-app.ps1, start-backend.ps1, start-frontend.ps1, tests/test_unit.py, CHANGELOG.md

## 2026-03-21 — Correzione elimina timbratura con conferma esplicita
Cosa: sostituita la conferma nativa della cancellazione nella scheda Timbrature con uno sheet interno all'app, corretta la funzione elimina con refresh affidabile dello stato, sincronizzata la scheda Home quando viene rimossa la timbratura del giorno e aggiunti test API ed E2E per annulla/conferma della rimozione
Perché: rendere stabile la cancellazione della timbratura anche sul web, dare all'utente una conferma chiara prima dell'azione distruttiva e mantenere allineate Home e Timbrature
File: frontend/app/(tabs)/timbrature.tsx, frontend/app/(tabs)/index.tsx, tests/test_api.py, tests/test_e2e.py, CHANGELOG.md

## 2026-03-19 — Script di avvio locale per Codex
Cosa: aggiunti tre launcher PowerShell in root per avviare backend, frontend e stack completo in locale con log runtime in `%TEMP%\\Timbrature-Codex-runtime`, piu un test unitario che blocca regressioni sui comandi di bootstrap
Perché: rendere riutilizzabile dal tasto Start di Codex l'avvio locale dell'app senza dover riscrivere ogni volta i comandi manuali
File: start-backend.ps1, start-frontend.ps1, start-app.ps1, tests/test_unit.py, CHANGELOG.md

## 2026-03-19 — Fix warning deprecazione FastAPI/Pydantic/datetime
Cosa: sostituiti gli usi deprecati di `datetime.utcnow()`, introdotta una compatibilita runtime per FastAPI/Starlette su Python 3.14+, rimossi gli usi Pydantic v1 fuori dalla zona protetta e mantenuti filtri mirati solo per warning di librerie terze
Perché: ottenere output pulito nei test, evitare regressioni con versioni future di Python e librerie e mantenere intatti gli algoritmi validati manualmente
File: backend/server.py, tests/test_unit.py, tests/conftest.py, pyproject.toml, CHANGELOG.md

## 2026-03-19 — Tema chiaro/scuro con preferenza utente
Cosa: introdotto un sistema di tema light/dark con opzione Sistema, tema persistito e applicazione del tema ai layout globali, componenti condivisi e tab principali del frontend
Perché: rendere l'app più leggibile in ambienti scuri e permettere all'utente di scegliere se seguire il tema del dispositivo o forzare chiaro/scuro
File: frontend/src/utils/colors.ts, frontend/src/store/appStore.ts, frontend/src/hooks/useAppTheme.ts, frontend/src/components/Card.tsx, frontend/src/components/Button.tsx, frontend/src/components/BottomSheet.tsx, frontend/src/components/InputField.tsx, frontend/src/components/LoadingScreen.tsx, frontend/src/components/StatCard.tsx, frontend/src/components/DateTimePicker.tsx, frontend/app/_layout.tsx, frontend/app/(tabs)/_layout.tsx, frontend/app/(tabs)/index.tsx, frontend/app/(tabs)/timbrature.tsx, frontend/app/(tabs)/assenze.tsx, frontend/app/(tabs)/buste-paga.tsx, frontend/app/(tabs)/altro.tsx

## 2026-03-19 — Correzione runtime web e warning UI
Cosa: corretto il bootstrap HTML web che iniettava JavaScript non valido, sostituito il dismiss del bottom sheet con Pressable e centralizzata la gestione delle ombre con uno stile compatibile tra web e native
Perché: eliminare l'errore console sul web, rimuovere warning deprecati del frontend e impedire regressioni sulle superfici principali dell'interfaccia
File: frontend/app/+html.tsx, frontend/app/_layout.tsx, frontend/app/(tabs)/_layout.tsx, frontend/src/components/BottomSheet.tsx, frontend/src/components/Card.tsx, frontend/src/utils/shadows.ts, tests/legacy/frontend-web-runtime-regressions.test.mjs

## 2026-03-19 — Ristrutturazione testing a tre livelli
Cosa: introdotta una strategia di test con marker `unit`, `api`, `e2e`, `visual`, aggiunte regole permanenti nei file AGENTS, creata la configurazione pytest, spostato il test Playwright legacy e aggiunte nuove suite unitarie, API ed E2E/visual con fixture condivise
Perché: separare i controlli veloci di logica e API dai flussi browser, rendere il default di `pytest` rapido e fissare regole stabili per i prossimi agenti che lavoreranno sul progetto
File: AGENTS.md, backend/AGENTS.md, frontend/AGENTS.md, CHANGELOG.md, .gitignore, pyproject.toml, requirements-test.txt, backend/server.py, frontend/app/(tabs)/assenze.tsx, tests/conftest.py, tests/test_unit.py, tests/test_api.py, tests/test_e2e.py, tests/legacy/frontend-web-runtime-regressions.test.mjs

## 2026-03-19 — Inizializzazione sistema agenti
Cosa: creati AGENTS.md (root, backend, frontend) e questo CHANGELOG
Perché: dare a Codex regole autonome per lavorare sul progetto senza briefing ogni volta
File: AGENTS.md, backend/AGENTS.md, frontend/AGENTS.md, CHANGELOG.md

Decisioni architetturali prese:
- Gli algoritmi di calcolo in server.py, sometime_parser.py, zucchetti_parser.py e helpers.ts sono ZONA PROTETTA — non modificabili senza approvazione esplicita
- L'app deve funzionare offline (dati in locale, backend come sync opzionale)
- I dati personali restano sul dispositivo
- Focus attuale: miglioramenti UI/visual e testing
- Multi-user non ancora deciso — non precludere nessuna strada
