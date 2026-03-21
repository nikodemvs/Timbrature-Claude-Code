# CHANGELOG — BustaPaga

Storico del progetto. Ogni modifica significativa viene registrata qui.
Leggere questo file insieme a AGENTS.md per avere il contesto completo.

---

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
