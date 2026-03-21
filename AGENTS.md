# AGENTS.md — BustaPaga

## Progetto
App gestionale per lavoratori dipendenti italiani.
Timbrature, ferie, malattia/comporto, reperibilità, buste paga, dashboard, chat AI.
Stack: TypeScript frontend, Python/FastAPI backend, Gemini AI, Docker/Render.

## Lingua
UI e messaggi utente: italiano. Variabili e funzioni: inglese.

---

## ZONA PROTETTA — NON MODIFICARE MAI

Questi file contengono algoritmi di calcolo validati manualmente.
Nessun agente può modificarli, refactorizzarli, ottimizzarli o riscriverli.
Se un task richiede di toccare queste righe, FERMATI e chiedi conferma esplicita.

### backend/server.py
- L494 arrotonda_quarti_ora
- L506 calcola_ore_lavorate
- L527 calcola_straordinario
- L547 calcola_ticket
- L550, L553 calcolo reperibilità
- L556, L569 ore da marcature
- L924 saldo ferie
- L951 comporto malattia
- L1338 confronto timbrature
- L1392 dashboard aggregata
- L1454 statistiche mensili

### backend/sometime_parser.py (da L17)
### backend/zucchetti_parser.py (da L18)

### frontend/src/helpers.ts
- L12 formatta valuta
- L19 formatta ore
- L83 percentuale

**Se un algoritmo esiste sia nel backend che nel frontend, sono una coppia:
non si tocca uno senza toccare l'altro.**

---

## ORCHESTRAZIONE AUTONOMA

Applica queste regole automaticamente in base a cosa stai modificando.
Non aspettare che l'utente te lo chieda.

### Regola di orchestrazione
- Codex è l'orchestratore del lavoro, non il primo esecutore
- I sub-agent devono lavorare per ownership chiara e nel proprio ambito di responsabilità
- Se esiste un sub-agent adatto e libero, il lavoro va delegato a lui prima di essere eseguito dall'orchestratore
- L'orchestratore esegue direttamente un task solo quando tutti i sub-agent adatti a svolgerlo sono già impegnati
- Se un sub-agent non riesce a completare il proprio lavoro, non si abbandona subito la delega: prima si tenta di sbloccarlo, restringere meglio il task, reinviargli contesto utile o riassegnare il lavoro a un altro sub-agent equivalente
- L'orchestratore interviene direttamente solo dopo che i tentativi ragionevoli di far eseguire il task a un sub-agent sono falliti oppure quando non esiste alcun sub-agent compatibile con quel lavoro
- Quando più sub-agent possono lavorare in parallelo senza conflitti di ownership, vanno saturati prima di spostare nuovo lavoro sull'orchestratore

### Quando tocchi qualsiasi file frontend
- Mobile-first: tutto deve funzionare da 375px
- Touch target minimi 44x44px
- Ogni componente gestisce: loading, empty, errore, successo
- Dark mode: rispetta prefers-color-scheme
- Il bottone TIMBRA è l'elemento più importante dell'app — sempre visibile, max 2 tap
- TypeScript strict: niente `any`
- Playwright è lo strumento per i test visual e UX: screenshot responsive, dark mode, touch target. Per tutto il resto usa pytest.

### Quando tocchi qualsiasi file backend
- Validazione input con Pydantic su ogni endpoint
- Errori: HTTPException con messaggio in italiano, mai stack trace
- Nessuna API key nel codice, solo env var
- Async/await per le chiamate a Gemini
- Non rompere endpoint esistenti — retrocompatibilità sempre

### Quando tocchi qualsiasi cosa legata ai dati utente
- I dati personali (orari, stipendi, malattie) sono dati sensibili GDPR
- Dati salvati in locale sul dispositivo quando possibile
- Il backend è un servizio di backup/sync, non la fonte primaria
- La chat Gemini NON deve ricevere dati personali dell'utente
- Mai loggare dati personali

### Quando fai qualsiasi modifica
- Scrivi o aggiorna un test per ciò che hai modificato
- I test sono su 3 livelli con marker pytest: unit, api, e2e, visual
- `pytest -m unit` → test unitari, istantanei, sulle funzioni dirette
- `pytest -m api` → test endpoint HTTP con httpx, ~5 sec
- `pytest -m e2e` → flussi utente completi con Playwright, ~30 sec
- `pytest -m visual` → screenshot responsive, dark mode, touch target con Playwright
- `pytest` senza marker → esegue solo unit + api (default veloce)
- I test verificano che la modifica funzioni, NON alterano gli algoritmi protetti
- I test unitari VERIFICANO i risultati dei calcoli, NON MODIFICANO MAI le funzioni
- Se un test unitario fallisce, il test è sbagliato — non la funzione
- Testa anche il caso offline (cosa succede senza rete?)
- Aggiorna CHANGELOG.md con una riga datata che spiega cosa hai fatto e perché

---

## OFFLINE-FIRST

L'app deve funzionare senza connessione internet.
- I calcoli di dominio vivono nel backend → il frontend cache i risultati
- Quando online: chiama il backend, salva la risposta in locale
- Quando offline: servi i dati dalla cache locale
- La timbratura DEVE funzionare offline (registra in locale, sincronizza dopo)
- La chat AI è l'unica funzione che richiede connessione — mostrare messaggio chiaro se offline

---

## MULTI-USER

Non ancora deciso se l'app sarà single-user o multi-user.
Non fare scelte architetturali che precludano una delle due strade.
Non assumere che ci sia un solo utente, ma non implementare autenticazione senza che venga richiesto.

---

## STORICO (CHANGELOG.md)

Dopo ogni modifica significativa, aggiungi una riga a CHANGELOG.md nella root:

```
## YYYY-MM-DD — Titolo breve
Cosa: descrizione concreta della modifica
Perché: motivazione
File: lista dei file toccati
```

Questo file è lo storico del progetto. Quando una nuova sessione AI apre il repo,
legge AGENTS.md per le regole e CHANGELOG.md per sapere a che punto è il progetto.
Non servono altri file di contesto.

---

## Cartelle ignorabili
`.claude/`, `.emergent/`, `memory/` — non usate attivamente, non toccare.
