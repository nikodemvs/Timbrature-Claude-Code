# AGENTS.md — Frontend

TypeScript, logica leggera di presentazione.
I calcoli di dominio li fa il backend — qui si formattano e mostrano i risultati.

## File critici
- `src/helpers.ts` — formattazione valuta, ore, percentuali (ZONA PROTETTA, vedi root AGENTS.md)
- `src/index.tsx` — pagina principale
- `src/timbrature.tsx` — UI timbrature

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

## Offline
- Cache le risposte del backend in locale (IndexedDB o localStorage)
- Quando online: chiama API, salva risultato
- Quando offline: mostra dati dalla cache
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
