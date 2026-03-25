# PROTECTED_ZONES.md — Fonte di verità unica per le zone protette

Questo file è l'unico posto dove le zone protette sono definite.
Referenziato da `AGENTS.md` e `CLAUDE.md` — non modificare senza aggiornare entrambi i file di riferimento.

**Nessun agente può modificare le righe elencate qui sotto.**
**Se un task richiede di toccare queste righe, FERMATI e chiedi conferma esplicita all'utente.**

---

## backend/server.py

- L494 `arrotonda_quarti_ora`
- L506 `calcola_ore_lavorate`
- L527 `calcola_straordinario`
- L547 `calcola_ticket`
- L550, L553 calcolo reperibilità
- L556, L569 ore da marcature
- L924 saldo ferie
- L951 comporto malattia
- L1338 confronto timbrature
- L1392 dashboard aggregata
- L1454 statistiche mensili

## backend/sometime_parser.py

Da L17 in poi.

## backend/zucchetti_parser.py

Da L18 in poi.

## frontend/src/helpers.ts

- L12 `formatta valuta`
- L19 `formatta ore`
- L83 `percentuale`

## frontend/src/algorithms/calcoli.ts (mirror TypeScript — Fase 2 offline-first)

Port fedele 1:1 degli algoritmi Python sopra. Stessa logica, stessi risultati.

**Non modificare uno senza modificare l'altro.**

**Se un algoritmo esiste sia nel backend che nel frontend, sono una coppia:
non si tocca uno senza toccare l'altro.**
