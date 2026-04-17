# Algoritmi e calcoli — BustaPaga

Fonte di verità canonica per gli algoritmi dell'app. Unifica i vecchi
`algoritmi-verifica.md` (spec dettagliata 2026-03-21) e
`APP_RIASSUNTO_ALGORITMI.txt` (handoff sintetico 2026-03-30).

Riferimenti al codice:
- Backend: `backend/server.py` (+ variante `backend/server_nas.py`)
- Mirror frontend: `frontend/src/algorithms/calcoli.ts`

Regola di progetto: se si modifica un algoritmo condiviso, backend e mirror
frontend vanno aggiornati insieme. Le funzioni chiave sono elencate in
`PROTECTED_ZONES.md`.

---

## Panoramica veloce

| Dominio | Funzione backend | Funzione frontend | Costanti |
|---|---|---|---|
| Arrotondamento quarti (eccesso) | `arrotonda_quarti_ora` | `arrotondaQuartiOra` | — |
| Arrotondamento quarti (difetto) | `arrotonda_quarti_ora_difetto` | `arrotondaQuartiOraDifetto` | — |
| Ore lavorate (coppia E/U) | `calcola_ore_lavorate` | `calcolaOreLavorate` | — |
| Ore da marcature (lista) | `calcola_ore_da_marcature` | (mirror) | — |
| Ore arrotondate da marcature | `calcola_ore_arrotondate_da_marcature` | (mirror) | — |
| Straordinario | `calcola_straordinario` | `calcolaStraordinario` | quota 15,50 €/h |
| Ticket | `calcola_ticket` | `calcolaTicket` | soglia 5 h |
| Reperibilità passiva | `calcola_reperibilita_passiva` | — | 4,00 €/h |
| Reperibilità attiva | `calcola_reperibilita_attiva` | — | 100 €/intervento |
| Ferie | `get_saldo_ferie` | `calcolaSaldoFerie` | 80 h/anno — 6,667 h/mese |
| Comporto malattia | `get_comporto` | `calcolaComporto` | 150 / 180 g su 3 anni |
| Stima netto | `stima_netto` (dashboard) | `stimaNetto` | aliquota 0,72 — soglia 169 h |

Formato UI: ore in `hh:mm` (non decimali) su tutte le tab operative.
Differenze con segno nel confronto personale vs aziendale.

---

## Indice dettagliato

1. [arrotonda_quarti_ora (eccesso)](#1-arrotonda_quarti_ora-eccesso)
2. [arrotonda_quarti_ora_difetto](#2-arrotonda_quarti_ora_difetto)
3. [calcola_ore_lavorate](#3-calcola_ore_lavorate)
4. [calcola_straordinario](#4-calcola_straordinario)
5. [calcola_ticket](#5-calcola_ticket)
6. [calcola_reperibilita_passiva](#6-calcola_reperibilita_passiva)
7. [calcola_reperibilita_attiva](#7-calcola_reperibilita_attiva)
8. [calcola_ore_da_marcature](#8-calcola_ore_da_marcature)
9. [calcola_ore_arrotondate_da_marcature](#9-calcola_ore_arrotondate_da_marcature)
10. [calcola_ore_reperibilita](#10-calcola_ore_reperibilita)
11. [calcola_metadati_stima](#11-calcola_metadati_stima)
12. [stima_netto (dashboard)](#12-stima_netto-dashboard)
13. [calcola_saldo_ferie](#13-calcola_saldo_ferie)
14. [calcola_comporto_malattia](#14-calcola_comporto_malattia)

---

## 1. arrotonda_quarti_ora (eccesso)

**Scopo:** arrotonda i minuti al quarto d'ora **superiore** più vicino.
Usato per l'orario di **entrata**.

**Logica:**
```
input:  minuti (intero, 0-59)
output: 0, 15, 30, 45 o 60

se minuti <= 0  → 0
altrimenti      → ((minuti + 14) // 15) * 15
```

**Esempi:**

| Input | Output |
|---|---|
| 0 | 0 |
| 1 | 15 |
| 14 | 15 |
| 15 | 15 |
| 16 | 30 |
| 30 | 30 |
| 31 | 45 |
| 45 | 45 |
| 46 | 60 |
| 59 | 60 |

Quando il risultato è 60, `calcola_ore_lavorate` lo tratta come incremento dell'ora (vedi §3).

---

## 2. arrotonda_quarti_ora_difetto

**Scopo:** arrotonda i minuti al quarto d'ora **inferiore** più vicino.
Usato per l'orario di **uscita**.

**Logica:**
```
se minuti <= 0  → 0
altrimenti      → (minuti // 15) * 15
```

**Esempi:**

| Input | Output |
|---|---|
| 0 | 0 |
| 1 | 0 |
| 14 | 0 |
| 15 | 15 |
| 29 | 15 |
| 30 | 30 |
| 44 | 30 |
| 45 | 45 |
| 59 | 45 |

---

## 3. calcola_ore_lavorate

**Scopo:** calcola le ore lavorate fra entrata e uscita, sia **effettive** che **arrotondate** (regola aziendale: entrata per eccesso, uscita per difetto).

**Input:**
- `ora_entrata`: stringa `HH:MM`
- `ora_uscita`: stringa `HH:MM`

**Output:** coppia `(ore_effettive, ore_arrotondate)`, entrambi float a 2 decimali.

**Logica:**
```
minuti_entrata = h_entrata * 60 + m_entrata
minuti_uscita  = h_uscita  * 60 + m_uscita
se minuti_uscita < minuti_entrata: minuti_uscita += 24 * 60   ← overnight

ore_effettive = (minuti_uscita - minuti_entrata) / 60

# Regola aziendale: entrata ceil al quarto, uscita floor al quarto.
minuti_entrata_arr = ((minuti_entrata + 14) // 15) * 15
minuti_uscita_arr  =  (minuti_uscita // 15) * 15
minuti_arr_totali  = max(0, minuti_uscita_arr - minuti_entrata_arr)
ore_arrotondate    = minuti_arr_totali / 60
```

**Esempi (aziendali):**

| Entrata | Uscita | Ore effettive | Ore arrotondate |
|---|---|---|---|
| 08:00 | 17:00 | 9,00 | 9,00 |
| 08:39 | 17:02 | 8,38 | 8,25 |
| 09:30 | 17:00 | 7,50 | 7,50 |
| 09:46 | 17:00 | 7,23 | 7,00 |
| 08:00 | 12:30 | 4,50 | 4,50 |
| 22:00 | 06:00 | 8,00 | 8,00 |

Input vuoto/null → `(0.0, 0.0)`.

---

## 4. calcola_straordinario

**Scopo:** calcola la maggiorazione e l'importo orario dello straordinario in base a ore settimanali, fascia oraria e giorno.

**Input:**
- `ore_settimanali`: float
- `fascia_oraria`: `giorno`, `notte`, `mattina`, `pomeriggio`
- `giorno`: `lun-ven`, `sabato`, `domenica`

**Output:**
- `percentuale`: float (es. 18.0)
- `importo_ora`: float (quota base + maggiorazione)
- `bonus_intervento`: 0 o 100

**Costanti:**
```
quota_oraria_base = 15.50 €/h
```

**Tabella maggiorazioni:**

| Giorno_Fascia | 41–48 h/sett. | > 48 h/sett. |
|---|---|---|
| lun-ven_giorno | 18% | 25% |
| lun-ven_notte | 35% | 75% |
| sabato_mattina | 18% | 25% |
| sabato_pomeriggio | 50% | 75% |
| domenica | 50% | 75% |

**Fascia:**
- `ore_settimanali ≤ 48` → colonna 41–48
- `ore_settimanali > 48` → colonna >48

**Bonus intervento:** 100 € se `sabato_pomeriggio` o `domenica`, altrimenti 0.

**Formula:** `importo_ora = 15.50 * (1 + percentuale / 100)`.

Fallback percentuale: 18% se la chiave giorno_fascia non esiste.

---

## 5. calcola_ticket

**Scopo:** determina se spetta il ticket del giorno.

```
(ore_lavorate + ore_giustificate) >= 5  →  true
```

| ore_lavorate | ore_giustificate | ticket |
|---|---|---|
| 8,0 | 0 | true |
| 4,0 | 0 | false |
| 4,0 | 1,5 | true |
| 5,0 | 0 | true |
| 4,9 | 0 | false |

---

## 6. calcola_reperibilita_passiva

**Formula:** `compenso = ore * 4.00 €/h`, arrotondato a 2 decimali.

| ore | compenso |
|---|---|
| 1 | 4,00 € |
| 8 | 32,00 € |
| 12 | 48,00 € |
| 24 | 96,00 € |

---

## 7. calcola_reperibilita_attiva

**Formula:** `compenso = interventi * 100.00 €/intervento`.

| interventi | compenso |
|---|---|
| 0 | 0,00 € |
| 1 | 100,00 € |
| 3 | 300,00 € |

---

## 8. calcola_ore_da_marcature

**Scopo:** somma le ore **effettive** da una lista di marcature E/U.

**Input:** lista di marcature `{ tipo: entrata|uscita, ora: HH:MM, is_reperibilita }`.

**Logica:**
```
ordina le marcature per ora crescente
per ogni marcatura:
    se tipo == entrata: memorizza come entrata_corrente
    se tipo == uscita e c'è entrata_corrente:
        ore_eff, _ = calcola_ore_lavorate(entrata_corrente, ora)
        somma ore_eff; azzera entrata_corrente
```

| Marcature | Ore totali |
|---|---|
| E 08:00 / U 17:00 | 9,00 |
| E 08:00 / U 12:00 / E 13:00 / U 17:00 | 8,00 |
| E 22:00 / U 06:00 | 8,00 |
| Solo E 08:00 | 0,00 |

Le uscite orfane sono ignorate. Entrate doppie consecutive tengono solo l'ultima.

---

## 9. calcola_ore_arrotondate_da_marcature

**Scopo:** somma le ore **arrotondate aziendali** per ogni coppia E/U.

Logica identica a §8, ma prende `ore_arrotondate` invece di `ore_effettive` da `calcola_ore_lavorate`. È il valore salvato nel campo `ore_arrotondate` della timbratura quando si usa il flusso `/timbrature/timbra`.

Implica: 8:39 → 12:00 poi 13:00 → 17:02 dà ore_arrotondate = 3,00 + 4,00 = 7,00, non applica la regola al totale giornaliero.

---

## 10. calcola_ore_reperibilita

Identica a §8 ma filtra solo le marcature con `is_reperibilita == true`. Output: ore totali di reperibilità passiva (le ore attive non si contano qui, si contano come interventi in §7).

---

## 11. calcola_metadati_stima

**Scopo:** valuta la qualità dei dati per la stima netto.

**Logica dati contrattuali:**
```
ha_dati_contrattuali = true se almeno uno > 0:
    paga_base, scatti_anzianita, superminimo, premio_incarico, ticket_valore
```

**Logica dati operativi:** `ha_dati_operativi_mese = len(timbrature) > 0`.

**Tabella:**

| contrattuali | operativi | sorgente | stato |
|---|---|---|---|
| ✓ | ✓ | `dati_contrattuali_e_operativi_mese` | Stima basata su dati contrattuali e timbrature del mese. |
| ✓ | ✗ | `solo_dati_contrattuali` | Stima basata solo sui dati contrattuali. |
| ✗ | ✓ | `solo_dati_operativi` | Dati operativi presenti, ma contrattuali insufficienti. |
| ✗ | ✗ | `nessun_dato_utile` | Stima non disponibile. |

---

## 12. stima_netto (dashboard)

**Scopo:** stima lordo e netto mensile.

**Costanti:**
```
ore_contrattuali_mensili    = 169
aliquota_netto              = 0.72
maggiorazione_straordinario = 1.18   (fascia base lun-ven_giorno 41-48h)
```

**Formule:**
```
ore_straordinarie = max(0, ore_mese - 169)

base_mensile = paga_base + scatti_anzianita + superminimo + premio_incarico
divisore_orario = settings.divisore_orario OR 169
quota_oraria    = base_mensile / divisore_orario

straordinario_stimato = ore_straordinarie * quota_oraria * 1.18

giorni_con_ticket = #giorni con ore_arrotondate >= 5
ticket_totale     = giorni_con_ticket * ticket_valore

lordo_stimato = base_mensile + straordinario_stimato + ticket_totale
netto_stimato = lordo_stimato * 0.72
```

**Esempio:**
```
paga_base=1800  scatti=50  superminimo=100  premio=0
divisore_orario=169  ticket_valore=8  ore_mese=180

ore_straordinarie = 11
base_mensile      = 1950
quota_oraria      = 1950 / 169 = 11,54
straordinario     = 11 * 11,54 * 1,18 = 149,86
giorni_con_ticket = 20  →  ticket_totale = 160
lordo_stimato     = 1950 + 149,86 + 160 = 2259,86
netto_stimato     = 2259,86 * 0,72      = 1627,10
```

**Semplificazioni dichiarate:**
- aliquota 0,72 è media — no scaglioni IRPEF, detrazioni, INPS esatti.
- lo straordinario usa sempre il 18% — non distingue fascia oraria reale.

---

## 13. calcola_saldo_ferie

**Costanti:**
```
monte_annuo         = 80 ore/anno
maturazione_mensile = 6.667 ore/mese
```

**Formule:**
```
se anno == anno_corrente:
    mese_corrente = mese attuale (1-12)
altrimenti:
    mese_corrente = 12   ← anno passato → tutto maturato

ore_maturate = round(6.667 * mese_corrente, 2)

ore_godute = somma ore_totali per assenze tipo=ferie con data_inizio nell'anno target

saldo_attuale = round(ore_maturate - ore_godute, 2)
```

**Esempio (marzo):**
```
ore_maturate = 6,667 * 3 = 20,00
ore_godute   = 16,00   (es. 2 giorni da 8 ore)
saldo        = 4,00
```

`residuo_anno_precedente` è fisso a 0 (le ferie arretrate non sono ancora gestite). Le assenze sono filtrate con `data_inizio.startswith(anno)`.

---

## 14. calcola_comporto_malattia

**Costanti:**
```
soglia_attenzione   = 150 giorni
soglia_critica      = 180 giorni
finestra_temporale  = ultimi 3 anni (3 * 365 giorni dalla data odierna)
```

**Logica:**
```
data_limite = oggi - 3 anni (in giorni)
per ogni assenza tipo=malattia con data_inizio >= data_limite:
    giorni = (data_fine - data_inizio).days + 1    ← inclusivo
    somma

alert_attenzione   = giorni_totali >= 150
alert_critico      = giorni_totali >= 180
giorni_disponibili = max(0, 180 - giorni_totali)
```

Nota: la finestra è 3 * 365 giorni puri, non 3 anni solari. Gli anni bisestili spostano la soglia di 1 giorno.

---

## Domande aperte

Parametri da validare con il contratto/buste paga reali:

1. Quota oraria base straordinario (15,50 €) — corretta?
2. Aliquota netto (72%) — coerente con storico buste?
3. Monte ferie annuo (80 h) — corrisponde al CCNL?
4. Maturazione mensile (6,667 h) — deriva da 80/12 = 6,667, ok?
5. Soglie comporto (150 / 180 g) — contrattuali?
6. Divisore orario (169) — usato nelle buste?
7. Bonus intervento reperibilità (100 €) — corrisponde?
8. Reperibilità passiva (4,00 €/h) — corrisponde?
9. Ore contrattuali mensili (169) — soglia straordinario corretta?
10. `stima_netto` usa sempre maggiorazione 18% — ok come semplificazione?

---

## File chiave per review

Ordine consigliato per leggere/verificare i calcoli:

1. `backend/server.py` — funzioni canoniche
2. `frontend/src/algorithms/calcoli.ts` — mirror 1:1
3. `frontend/src/services/offlineApi.ts` — flusso timbra offline
4. `frontend/src/db/localDb.ts` — SQLite locale
5. `frontend/app/(tabs)/index.tsx` — dashboard + timbratura rapida
6. `frontend/app/(tabs)/timbrature.tsx` — lista/edit timbrature

---

*Consolidato 2026-04-16 da `algoritmi-verifica.md` (2026-03-21) + `APP_RIASSUNTO_ALGORITMI.txt` (2026-03-30).*
