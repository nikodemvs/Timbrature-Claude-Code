# Algoritmi e calcoli — BustaPaga
## File di verifica

Questo file descrive tutti gli algoritmi di calcolo presenti nell'app BustaPaga.
Generato il 2026-03-21 dal codice sorgente di `backend/server.py` e `frontend/src/algorithms/calcoli.ts`.

Le due implementazioni (Python backend, TypeScript frontend) sono identiche nella logica.
Questo file usa pseudocodice e descrizione testuale per facilitare la verifica manuale con dati reali.

---

## Indice

1. [arrotonda_quarti_ora](#1-arrotonda_quarti_ora)
2. [calcola_ore_lavorate](#2-calcola_ore_lavorate)
3. [calcola_straordinario](#3-calcola_straordinario)
4. [calcola_ticket](#4-calcola_ticket)
5. [calcola_reperibilita_passiva](#5-calcola_reperibilita_passiva)
6. [calcola_reperibilita_attiva](#6-calcola_reperibilita_attiva)
7. [calcola_ore_da_marcature](#7-calcola_ore_da_marcature)
8. [calcola_ore_reperibilita](#8-calcola_ore_reperibilita)
9. [calcola_metadati_stima](#9-calcola_metadati_stima)
10. [stima_netto (dashboard)](#10-stima_netto-dashboard)
11. [calcola_saldo_ferie](#11-calcola_saldo_ferie)
12. [calcola_comporto_malattia](#12-calcola_comporto_malattia)

---

## 1. arrotonda_quarti_ora

**Scopo:** Arrotonda i minuti residui al quarto d'ora superiore più vicino.

**Logica:**
```
input:  minuti (intero, 0-59)
output: minuti arrotondati (0, 15, 30, 45, o 60)

se minuti == 0  → 0
se minuti <= 15 → 15
se minuti <= 30 → 30
se minuti <= 45 → 45
altrimenti      → 60
```

**Esempi:**
| Input (minuti) | Output |
|---|---|
| 0 | 0 |
| 7 | 15 |
| 15 | 15 |
| 16 | 30 |
| 30 | 30 |
| 31 | 45 |
| 45 | 45 |
| 46 | 60 |
| 59 | 60 |

**Note:** Quando il risultato è 60, la funzione `calcola_ore_lavorate` incrementa l'ora intera di 1 e azzera i minuti.

---

## 2. calcola_ore_lavorate

**Scopo:** Calcola le ore lavorate tra entrata e uscita, sia in formato esatto che arrotondato ai quarti d'ora.

**Input:**
- `ora_entrata`: stringa "HH:MM"
- `ora_uscita`: stringa "HH:MM"

**Output:** coppia `(ore_effettive, ore_arrotondate)` — entrambi float con 2 decimali

**Logica:**
```
minuti_totali = (ora_uscita in minuti) - (ora_entrata in minuti)
se minuti_totali < 0: aggiunge 24*60  ← gestisce turni a cavallo della mezzanotte

ore_effettive = minuti_totali / 60

ore_intere = parte intera di (minuti_totali / 60)
minuti_residui = minuti_totali mod 60
minuti_arrotondati = arrotonda_quarti_ora(minuti_residui)

se minuti_arrotondati == 60:
    ore_arrotondate = ore_intere + 1
altrimenti:
    ore_arrotondate = ore_intere + (minuti_arrotondati / 60)

arrotonda entrambi a 2 decimali
```

**Esempi:**
| Entrata | Uscita | Ore effettive | Ore arrotondate |
|---|---|---|---|
| 08:00 | 17:00 | 9.00 | 9.00 |
| 08:00 | 17:07 | 9.12 | 9.25 |
| 08:00 | 17:16 | 9.27 | 9.50 |
| 08:00 | 17:31 | 9.52 | 9.75 |
| 08:00 | 17:46 | 9.77 | 10.00 |
| 08:00 | 12:30 | 4.50 | 4.50 |
| 22:00 | 06:00 | 8.00 | 8.00 |

**Note:** Input vuoto/null restituisce (0.0, 0.0).

---

## 3. calcola_straordinario

**Scopo:** Calcola la maggiorazione e l'importo orario dello straordinario in base al totale delle ore settimanali, alla fascia oraria e al giorno.

**Input:**
- `ore_settimanali`: float — totale ore nella settimana
- `fascia_oraria`: stringa — `"giorno"`, `"notte"`, `"mattina"`, `"pomeriggio"`
- `giorno`: stringa — `"lun-ven"`, `"sabato"`, `"domenica"`

**Output:**
- `percentuale`: float — percentuale di maggiorazione (es. 18.0)
- `importo_ora`: float — importo orario lordo (quota base + maggiorazione)
- `bonus_intervento`: float — bonus fisso per intervento (0 o 100)

**Costanti:**
```
quota_oraria_base = 15.50 €/ora
```

**Tabella maggiorazioni:**
| Giorno_Fascia | 41-48 ore/sett. | >48 ore/sett. |
|---|---|---|
| lun-ven_giorno | 18% | 25% |
| lun-ven_notte | 35% | 75% |
| sabato_mattina | 18% | 25% |
| sabato_pomeriggio | 50% | 75% |
| domenica | 50% | 75% |

**Fascia straordinario:**
- ore_settimanali ≤ 48 → usa colonna "41-48"
- ore_settimanali > 48 → usa colonna ">48"

**Bonus intervento:**
- sabato_pomeriggio o domenica → 100 €
- tutti gli altri → 0 €

**Formula:**
```
importo_ora = 15.50 * (1 + percentuale/100)
```

**Esempi:**
| ore_sett | giorno | fascia | % maggiorazione | importo_ora | bonus |
|---|---|---|---|---|---|
| 45 | lun-ven | giorno | 18% | 18.29 € | 0 € |
| 50 | lun-ven | giorno | 25% | 19.38 € | 0 € |
| 45 | sabato | pomeriggio | 50% | 23.25 € | 100 € |
| 45 | domenica | — | 50% | 23.25 € | 100 € |
| 45 | lun-ven | notte | 35% | 20.93 € | 0 € |

**Note:** Se la chiave giorno_fascia non esiste nella tabella, la percentuale di fallback è 18%.

---

## 4. calcola_ticket

**Scopo:** Determina se il lavoratore ha diritto al ticket del giorno.

**Input:**
- `ore_lavorate`: float
- `ore_giustificate`: float (default: 0) — ore di assenza giustificata che contano ai fini del ticket

**Output:** booleano — `true` se il ticket spetta, `false` altrimenti

**Logica:**
```
(ore_lavorate + ore_giustificate) >= 5  →  true
altrimenti                              →  false
```

**Esempi:**
| ore_lavorate | ore_giustificate | ticket |
|---|---|---|
| 8.0 | 0 | true |
| 4.0 | 0 | false |
| 4.0 | 1.5 | true |
| 5.0 | 0 | true |
| 4.9 | 0 | false |

---

## 5. calcola_reperibilita_passiva

**Scopo:** Calcola il compenso per le ore di reperibilità passiva (in standby, non chiamato).

**Input:** `ore` — numero di ore di reperibilità passiva

**Output:** float — compenso in euro, arrotondato a 2 decimali

**Formula:**
```
compenso = ore * 4.00 €/ora
```

**Esempi:**
| ore | compenso |
|---|---|
| 1 | 4.00 € |
| 8 | 32.00 € |
| 12 | 48.00 € |
| 24 | 96.00 € |

---

## 6. calcola_reperibilita_attiva

**Scopo:** Calcola il compenso per gli interventi durante la reperibilità (reperibilità attiva = chiamato).

**Input:** `interventi` — numero di interventi effettuati

**Output:** float — compenso in euro

**Formula:**
```
compenso = interventi * 100.00 €/intervento
```

**Esempi:**
| interventi | compenso |
|---|---|
| 1 | 100.00 € |
| 3 | 300.00 € |
| 0 | 0.00 € |

---

## 7. calcola_ore_da_marcature

**Scopo:** Calcola il totale delle ore lavorate da una lista di marcature entrata/uscita.

**Input:** lista di marcature, ogni marcatura ha:
- `tipo`: `"entrata"` o `"uscita"`
- `ora`: stringa "HH:MM"
- `is_reperibilita`: booleano

**Output:** float — ore totali lavorate (somma di tutti i segmenti entrata→uscita)

**Logica:**
```
ordina le marcature per ora crescente
per ogni marcatura:
    se tipo == "entrata": memorizza l'ora come entrata_corrente
    se tipo == "uscita" e c'è entrata_corrente:
        ore, _ = calcola_ore_lavorate(entrata_corrente, ora_uscita)
        somma le ore
        azzera entrata_corrente
```

**Esempi:**
| Marcature | Ore totali |
|---|---|
| E 08:00 / U 17:00 | 9.00 |
| E 08:00 / U 12:00 / E 13:00 / U 17:00 | 8.00 |
| E 22:00 / U 06:00 | 8.00 |
| Solo E 08:00 (uscita mancante) | 0.00 |

**Note:** Le marcature uscita senza entrata precedente sono ignorate. Le entrate doppie tengono solo l'ultima.

---

## 8. calcola_ore_reperibilita

**Scopo:** Calcola le ore di reperibilità da una lista di marcature, considerando solo quelle con flag `is_reperibilita = true`.

**Input:** stessa struttura di `calcola_ore_da_marcature`

**Output:** float — ore totali di reperibilità

**Logica:** identica a `calcola_ore_da_marcature`, ma prima filtra solo le marcature con `is_reperibilita == true`.

---

## 9. calcola_metadati_stima

**Scopo:** Determina la qualità e la fonte dei dati disponibili per la stima dello stipendio netto.

**Input:**
- `settings`: oggetto con i dati contrattuali dell'utente
- `timbrature`: lista delle timbrature del mese

**Output:**
- `ha_dati_contrattuali`: booleano
- `ha_dati_operativi_mese`: booleano
- `sorgente`: stringa identificativa
- `stato`: stringa descrittiva per l'utente

**Logica dati contrattuali:**
```
ha_dati_contrattuali = true se almeno uno tra questi è > 0:
    paga_base, scatti_anzianita, superminimo, premio_incarico, ticket_valore
```

**Logica dati operativi:**
```
ha_dati_operativi_mese = true se la lista timbrature non è vuota
```

**Tabella sorgente/stato:**
| ha_contrattuali | ha_operativi | sorgente | stato |
|---|---|---|---|
| true | true | dati_contrattuali_e_operativi_mese | Stima basata su dati contrattuali e timbrature del mese. |
| true | false | solo_dati_contrattuali | Stima basata solo sui dati contrattuali. |
| false | true | solo_dati_operativi | Dati operativi presenti, ma dati contrattuali insufficienti per una stima affidabile. |
| false | false | nessun_dato_utile | Stima non disponibile: mancano dati contrattuali e operativi del mese. |

---

## 10. stima_netto (dashboard)

**Scopo:** Stima il lordo e il netto mensile in base ai dati contrattuali e alle ore lavorate.

**Input:**
- `settings`: oggetto con i dati contrattuali
- `ore_mese`: float — ore totali lavorate nel mese corrente
- `timbrature`: lista timbrature del mese (per calcolare i ticket)

**Output:**
- `lordo_stimato`: float
- `netto_stimato`: float
- `straordinario_stimato`: float
- `ticket_totale`: float
- `metadati`: oggetto da `calcola_metadati_stima`

**Costanti:**
```
ore_contrattuali_mensili = 169  (usato sia come soglia straordinario che come divisore di default)
aliquota_netto = 0.72           (netto = 72% del lordo — media stimata)
maggiorazione_straordinario = 1.18  (18% — fascia base lun-ven_giorno 41-48h)
```

**Formule:**
```
ore_straordinarie = max(0, ore_mese - 169)

base_mensile = paga_base + scatti_anzianita + superminimo + premio_incarico

divisore_orario = settings.divisore_orario  oppure  169 (default)

quota_oraria = base_mensile / divisore_orario

straordinario_stimato = ore_straordinarie * quota_oraria * 1.18

giorni_con_ticket = numero di giorni in cui ore_arrotondate >= 5
ticket_totale = giorni_con_ticket * ticket_valore

lordo_stimato = base_mensile + straordinario_stimato + ticket_totale

netto_stimato = lordo_stimato * 0.72
```

**Esempio:**
```
paga_base = 1800 €
scatti_anzianita = 50 €
superminimo = 100 €
premio_incarico = 0 €
divisore_orario = 169
ticket_valore = 8 €

ore_mese = 180  →  ore_straordinarie = 11

base_mensile = 1950 €
quota_oraria = 1950 / 169 = 11.54 €/ora
straordinario_stimato = 11 * 11.54 * 1.18 = 149.86 €

giorni_con_ticket = 20  →  ticket_totale = 160 €

lordo_stimato = 1950 + 149.86 + 160 = 2259.86 €
netto_stimato = 2259.86 * 0.72 = 1627.10 €
```

**Note:**
- L'aliquota 0.72 è una stima media — non considera scaglioni IRPEF, detrazioni, contributi INPS esatti.
- Il divisore orario è usabile per personalizzare il calcolo (es. part-time).
- Lo straordinario usa sempre la maggiorazione base 18% — non considera la fascia oraria reale.

---

## 11. calcola_saldo_ferie

**Scopo:** Calcola il saldo ferie residue per un dato anno.

**Input:**
- `assenze_ferie`: lista delle assenze di tipo "ferie", ognuna con `data_inizio` (YYYY-MM-DD) e `ore_totali`
- `anno`: intero (default: anno corrente)

**Output:**
- `anno`: intero
- `monte_annuo`: float — ore annue totali (costante)
- `maturazione_mensile`: float — ore che maturano ogni mese (costante)
- `residuo_anno_precedente`: float — sempre 0 (non gestito)
- `ore_maturate`: float — ore maturate fino al mese corrente
- `ore_godute`: float — ore di ferie effettivamente prese nell'anno
- `saldo_attuale`: float — ore disponibili

**Costanti:**
```
monte_annuo = 80 ore/anno
maturazione_mensile = 6.667 ore/mese
```

**Formule:**
```
se anno == anno_corrente:
    mese_corrente = mese attuale (1-12)
altrimenti:
    mese_corrente = 12  ← anno passato, tutte le ore sono già maturate

ore_maturate = round(6.667 * mese_corrente, 2)

ore_godute = somma di ore_totali per le assenze_ferie che iniziano nell'anno target

saldo_attuale = round(ore_maturate - ore_godute, 2)
```

**Esempio (mese corrente = marzo = 3):**
```
ore_maturate = 6.667 * 3 = 20.00 ore
ore_godute = 16 ore  (es. 2 giorni da 8 ore)
saldo_attuale = 20.00 - 16 = 4.00 ore
```

**Note:**
- `residuo_anno_precedente` è fisso a 0 — le ferie arretrate non sono ancora gestite.
- Le assenze sono filtrate per `data_inizio.startsWith(anno)` — basta che l'assenza inizi nell'anno target.

---

## 12. calcola_comporto_malattia

**Scopo:** Verifica quanti giorni di malattia sono stati utilizzati negli ultimi 3 anni e se si stanno avvicinando i limiti contrattuali (comporto).

**Input:**
- `assenze_malattia`: lista delle assenze di tipo "malattia", ognuna con `data_inizio` e `data_fine` (YYYY-MM-DD)

**Output:**
- `giorni_malattia_3_anni`: intero — giorni totali di malattia negli ultimi 3 anni
- `soglia_attenzione`: intero — sempre 150
- `soglia_critica`: intero — sempre 180
- `alert_attenzione`: booleano — true se giorni >= 150
- `alert_critico`: booleano — true se giorni >= 180
- `giorni_disponibili`: intero — giorni rimanenti prima di 180

**Costanti:**
```
soglia_attenzione = 150 giorni
soglia_critica = 180 giorni
finestra_temporale = 3 anni dalla data odierna
```

**Logica:**
```
data_limite = oggi - 3 anni

per ogni assenza_malattia con data_inizio >= data_limite:
    giorni = (data_fine - data_inizio).days + 1   ← inclusi entrambi i giorni
    somma i giorni

alert_attenzione = (giorni_totali >= 150)
alert_critico    = (giorni_totali >= 180)
giorni_disponibili = max(0, 180 - giorni_totali)
```

**Esempio:**
```
Malattia A: 2024-01-10 → 2024-01-15  (6 giorni)
Malattia B: 2025-03-01 → 2025-03-10  (10 giorni)
Malattia C: 2026-02-01 → 2026-02-28  (28 giorni)

Totale = 44 giorni
alert_attenzione = false
alert_critico = false
giorni_disponibili = 136
```

**Note importante:** La finestra è calcolata sottraendo esattamente 3*365 giorni dalla data odierna (non 3 anni esatti di calendario). Questo significa che gli anni bisestili possono spostare la soglia di 1 giorno.

---

## Domande aperte / punti da verificare

Questi punti del calcolo potrebbero non corrispondere alla realtà contrattuale specifica — verificare con i dati reali:

1. **Quota oraria base straordinario (€15.50)** — è il valore reale del tuo contratto?
2. **Aliquota netto (72%)** — è coerente con il tuo storico buste paga (lordo → netto)?
3. **Monte ferie annuo (80 ore)** — corrisponde al tuo CCNL?
4. **Maturazione mensile (6.667 ore)** — deriva da 80/12 = 6.667, coerente?
5. **Soglie comporto (150 / 180 giorni)** — corrispondono al tuo contratto?
6. **Divisore orario (169)** — è il divisore usato nelle tue buste paga?
7. **Bonus intervento reperibilità (€100 fisso)** — corrisponde al contratto?
8. **Reperibilità passiva (€4.00/ora)** — corrisponde al contratto?
9. **Ore contrattuali mensili (169)** — soglia per lo straordinario corretta?
10. **`calcola_straordinario` usa sempre maggiorazione base 18%** nella stima netto, indipendentemente dall'orario reale — ok come semplificazione?

---

*Generato da: backend/server.py + frontend/src/algorithms/calcoli.ts*
*Data: 2026-03-21*
