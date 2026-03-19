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
