# PROTECTED_ZONES.md — Fonte di verità unica per le zone protette

Questo file è l'unico posto dove le zone protette sono definite.
Referenziato da `README.md` e `CONTRIBUTING.md` — non modificare senza aggiornare entrambi i file di riferimento.

**Nessun agente può modificare il codice elencato qui sotto.**
**Se un task richiede di toccare queste funzioni, FERMATI e chiedi conferma esplicita all'utente.**

Le zone sono identificate per **nome di simbolo** (funzione, classe, endpoint). I numeri di riga cambiano ad ogni refactor e non vanno mai usati come riferimento. Per localizzare un simbolo:

```
grep -nE '^(def|async def|class|export (function|const)) <nome>' <file>
```

---

## Principio: algoritmi immutabili, wrapper sì

Le **funzioni di calcolo puro** elencate qui sotto sono la spina dorsale matematica dell'app. Gli endpoint che le consumano (`/dashboard`, `/statistiche/mensili`, ecc.) sono elencati perché la loro **logica aggregata** è anch'essa regola di business.

Ciò che è **lecito** senza chiedere:
- rinominare una variabile interna inutilizzata altrove;
- aggiungere type hint senza cambiare il flusso;
- spostare una funzione in un modulo diverso **se tutti i chiamanti vengono aggiornati**.

Ciò che **non è** lecito senza conferma:
- cambiare input, output o algoritmo di una funzione qui elencata;
- cambiare la regola di arrotondamento (entrata ceil al quarto, uscita floor al quarto);
- cambiare la struttura di risposta di un endpoint aggregato.

---

## backend/server.py

**Funzioni di calcolo puro — algoritmi core**

- `arrotonda_quarti_ora` — arrotondamento in eccesso al quarto d'ora (usato per entrata)
- `arrotonda_quarti_ora_difetto` — arrotondamento in difetto al quarto d'ora (usato per uscita)
- `calcola_ore_lavorate` — ore lavorate da `ora_entrata` / `ora_uscita` applicando la regola di arrotondamento
- `calcola_straordinario` — calcolo maggiorazione straordinario per fascia oraria e giorno
- `calcola_ticket` — diritto al buono pasto in base a ore lavorate e giustificate
- `calcola_reperibilita_passiva` — indennità passiva per ore di reperibilità
- `calcola_reperibilita_attiva` — indennità attiva per numero di interventi
- `calcola_ore_da_marcature` — ore lavorate da lista marcature (grezzo, non arrotondato)
- `calcola_ore_arrotondate_da_marcature` — ore lavorate da marcature con regola di arrotondamento
- `calcola_ore_reperibilita` — ore di reperibilità da marcature con flag reperibilità

**Endpoint aggregati — logica di business**

- `get_saldo_ferie` (GET `/api/ferie/saldo`)
- `get_comporto` (GET `/api/malattia/comporto`)
- `get_confronto_timbrature` (GET `/api/confronto-timbrature`)
- `get_dashboard` (GET `/api/dashboard`)
- `get_statistiche_mensili` (GET `/api/statistiche/mensili`)

## backend/server_nas.py

Duplicato quasi identico di `backend/server.py` (variante per deploy NAS). Tutte le funzioni ed endpoint elencati sopra sono protetti anche qui, finché i due file non saranno unificati (vedi Fase B del piano di restauro).

## backend/sometime_parser.py

**Intero modulo protetto.** Estrae timbrature da PDF Sometime con regole deterministiche calibrate su esempi reali. Toccare anche un regex può rompere import silenziosamente.

Simboli principali: `parse_sometime_pdf`, `extract_dipendente`, `extract_azienda`, `extract_periodo`, `extract_totali`, `parse_timbrature_tables`, `parse_sometime_from_url`.

## backend/zucchetti_parser.py

**Intero modulo protetto.** Estrae buste paga Zucchetti con regole deterministiche calibrate. Stessa motivazione del parser Sometime.

Simboli principali: `parse_zucchetti_pdf`, `extract_periodo`, `extract_dipendente`, `extract_azienda`, `extract_elementi_retributivi`, `extract_ore`, `extract_straordinari`, `extract_trattenute`, `extract_totali`, `extract_tfr`, `extract_netto`, `parse_zucchetti_from_url`.

## frontend/src/utils/helpers.ts

Formattatori usati da tutta l'UI. Cambiare il formato rompe la coerenza visiva in decine di punti.

- `formatCurrency` — formato valuta €
- `formatHours` — ore in decimale
- `formatHoursHHMM` — ore in `hh:mm` con segno opzionale
- `calculatePercentage` — percentuale arrotondata

## frontend/src/algorithms/calcoli.ts

**Intero modulo protetto.** Mirror TypeScript 1:1 degli algoritmi di `backend/server.py` — è il cuore offline-first.

**Regola di invariante di coppia:**

> Se un algoritmo esiste sia nel backend che nel frontend, sono una coppia: non si tocca uno senza toccare l'altro, e i risultati devono coincidere.

Simboli mirror: `arrotondaQuartiOra`, `arrotondaQuartiOraDifetto`, `calcolaOreLavorate`, `calcolaStraordinario`, `calcolaTicket`, `calcolaReperibilitaPassiva`, `calcolaReperibilitaAttiva`, `calcolaOreDaMarcature`, `calcolaOreReperibilita`, `calcolaMetadatiStima`, `stimaNetto`, `calcolaSaldoFerie`, `calcolaComporto`.
