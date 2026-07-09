# 16_Dashboard + 18_CRO_přehled — Tile Inventory (ICT Risk Committee page contract)

Companion to `dora-excel-functional-spec.md`, which deliberately characterized but
did not enumerate these two sheets. This document enumerates **every KPI tile,
table, chart and text block** on `16_Dashboard` and `18_CRO_přehled`, in layout
order, and is the reproduction contract for the **ICT Risk Committee page**
(issue #51).

Extracted from the openpyxl builder at
`/Users/stefanlesnak/Antigravity/Personal Assistant/exports/dora-registr-aktiv-2026/builder/`
(`sheets_out.py:588-655` = `build_dashboard`, `sheets_out.py:794-966` =
`build_cro`, helpers in `ui.py`, ranking helpers in `sheets_vendors.py`,
layout maps in `seed.py:381-646`). **The builder source is the ground truth.**
Unlike the functional spec, this extraction additionally **cross-checked the
shipped workbook itself**
(`/Users/stefanlesnak/Antigravity/Personal Assistant/exports/dora-registr-aktiv-2026/DORA_registr_aktiv_a_dodavatelu.xlsx`,
sheet XML `sheet17.xml` = 16_Dashboard, `sheet19.xml` = 18_CRO_přehled, plus
`chart1.xml`/`chart2.xml`/`drawing1.xml`): every formula quoted below was
verified byte-identical against the shipped file. **The workbook is referenced
by that external absolute path only; it is not in the repo and must never be
committed** (test-locked no-Excel posture; see issue #38 Out of Scope).

> **Column-letter convention.** Formulas are quoted **as emitted in the shipped
> workbook**, i.e. *after* the v6 post-build cross-ref remap
> (`ui.remap_cross_refs`, `ui.py:396-421`) rewrote references into 03/04/07/13
> to the new block-layout letters. Letters are an implementation artifact — a
> parenthetical always gives the **field key** (per `seed.py` FIELDS dicts),
> which is the only stable identifier the committee page should key on.
> References into sheets 05/08/09/11/15 are not remapped (those sheets were
> never reordered); their letters are quoted with the column's header text.

Fixed row ranges recurring in every formula (capacity constants, `seed.py:17-32`):
`03_Procesy` rows 7–206, `04_Aktiva` 7–256, `07_Dodavatelé` 7–106,
`13_Rizika` 7–306, `05_Vazby_proces_aktivum` 7–1306, `08_Smlouvy` 7–206,
`09_Subdodávky` 7–306, `11_Vazby_proces_dodavatel` §1 7–606,
`15_Kontroly_kvality` 7–58 (`dq_last=58`, returned by `build_dq`,
`sheets_out.py:579-584`, recorded in `build_expected.json:"dq_last"`).

---

## 0. The two sheets at a glance

| | `16_Dashboard` | `18_CRO_přehled` |
|---|---|---|
| Position / tab color | sheet 17 of 19, orange `TAB_OUT` | sheet 19 of 19 (last), orange `TAB_OUT` |
| Row-1 band title (verbatim) | `KROK 8 z 8  ·  16_Dashboard — Provozní přehled správce registru` | `KROK 8 z 8  ·  18_CRO_přehled — Manažerské shrnutí pro CRO / VŘR / představenstvo` |
| Audience (EN gloss) | operational view for the register steward (Risk Manager) | executive summary for CRO / risk committee / board — the ICT Risk Committee page's direct ancestor |
| Input cells | **none** — every data cell is a live formula | **none** — every data cell is a live formula (or a static label) |
| Content inventory | 2 sections: 10 register-state tiles + 6 key-metric rows = **16 KPI tiles**, 0 tables beyond those, 0 charts, 0 conditional formatting | **6 KPI tiles, 2 matrices, 2 ranked tables, 5 live narrative sentences, 2 aggregate mini-tables, 2 bar charts, 5 conditional-formatting blocks** |
| Freeze panes | `A6` (rows 1–5 frozen; shipped XML `ySplit="5"`) | `A6` (same) |
| Row 5 navigation | 2 `HYPERLINK` cells: `◀ 15_Kontroly_kvality` / `Pokračujte: 17_DORA_mapování_a_zdroje ▶` (`sheets_out.py:595`) | none — final sheet, no `next_prev` call in `build_cro` |

Rows 2–4 narrative mini-guide (verbatim; `U.narrative` prefixes row 2 with
`"Co tu uděláte: "`, `ui.py:93-97`):

- **16_Dashboard** (`sheets_out.py:591-594`): row 2 `JAK PRACOVAT: nic
  nevyplňujte — sledujte postup a otevřené nálezy; manažerský pohled je na
  listu 18.`; row 3 `AUTOMATIKA: vše se počítá samo ze všech listů.`; row 4
  `Vlastník: Manažer pro řízení rizik`.
- **18_CRO_přehled** (`sheets_out.py:797-800`): row 2 `JAK PRACOVAT: nic
  nevyplňujte — list je podklad pro risk report (OS 18: VŘR projedná,
  představenstvo schvaluje).`; row 3 `AUTOMATIKA: heatmapa, migrační matice,
  top rizika, koncentrace, BCM gapy i závěry se počítají samy.`; row 4
  `Vlastník: Manažer pro řízení rizik · Kadence: čtvrtletně / před VŘR`.

Seeded values quoted below come from `build_expected.json` /
`source_data.json.profile` (the builder's own gate-3 LibreOffice-recalc
assertions) or from the functional spec's §5 DQ table; they are exact for the
shipped seed data.

---

## 1. `16_Dashboard` — Provozní přehled správce registru

### 1.1 Block "Stav registrů" (register state), heading `A6`, tiles rows 7–16

Layout: label in column A, value in column B (`FILL_CALC`), one tile per row
(`sheets_out.py:598-622`). Column widths A–E = 30/12/44/8/34
(`sheets_out.py:652-653`).

| # (row) | CZ label (verbatim) | EN gloss | Reads | Formula (as shipped) | Builder | Seeded |
|---|---|---|---|---|---|---|
| 1 (7) | Procesy | Process register row count | `03.l1` | `=SUMPRODUCT(--('03_Procesy'!$C$7:$C$206<>""))` | `sheets_out.py:601` | 148 |
| 2 (8) | Aktiva | Asset register row count | `04.nazev` | `=SUMPRODUCT(--('04_Aktiva'!$B$7:$B$256<>""))` | `sheets_out.py:602` | 183 |
| 3 (9) | Vazby proces–aktivum | Process↔Asset Link relations count | `05!B` (ID procesu) | `=SUMPRODUCT(--('05_Vazby_proces_aktivum'!$B$7:$B$1306<>""))` | `sheets_out.py:603` | 1000 |
| 4 (10) | Dodavatelé | Vendor register row count | `07.nazev` | `=SUMPRODUCT(--('07_Dodavatelé'!$B$7:$B$106<>""))` | `sheets_out.py:604` | 30 |
| 5 (11) | Záznamy aktiv k revizi | Asset records flagged for review | `04.stav_revize` | `=COUNTIF('04_Aktiva'!$BJ$7:$BJ$256,"K revizi")` | `sheets_out.py:605` | 36 (≡ DQ-09) |
| 6 (12) | Přímé vazby k revizi (list 11) | direct Process↔Vendor links pending review | `11§1!C` (ID dodavatele, manual section) | `=SUMPRODUCT(--('11_Vazby_proces_dodavatel'!$C$7:$C$606<>""))` | `sheets_out.py:606` | 358 |
| 7 (13) | Smlouvy (v rozsahu RoI) | Contracts in RoI scope | `08!B` (Ref. smlouvy (RoI)), `08!K` (Služba IKT v rozsahu RoI) | `=COUNTIFS('08_Smlouvy'!$B$7:$B$206,"<>",'08_Smlouvy'!$K$7:$K$206,"Ano")` | `sheets_out.py:607` | 1 (SML-001 seeds `K="Ano"`, `sheets_vendors.py:302`) |
| 8 (14) | Subdodavatelské vazby (řetězce) | Sub-outsourcing links (chains) | `09!B` (Smlouva (ID)) | `=SUMPRODUCT(--('09_Subdodávky'!$B$7:$B$306<>""))` | `sheets_out.py:608` | 0 (empty register) |
| 9 (15) | Aktiva bez klasifikace dat | Assets without data classification | `04.nazev`, `04.klasdat` | `=SUMPRODUCT(('04_Aktiva'!$B$7:$B$256<>"")*(('04_Aktiva'!$O$7:$O$256="")+('04_Aktiva'!$O$7:$O$256="Neposouzeno")))` | `sheets_out.py:609-610` | 182 (≡ DQ-46) |
| 10 (16) | Krit./význ. dodavatelé bez exit plánu | Critical/Significant Vendor tier without exit plan in an orderly state | `07.tier`, `07.exit` | `=SUMPRODUCT((('07_Dodavatelé'!$AU$7:$AU$106="Kritický dodavatel")+('07_Dodavatelé'!$AU$7:$AU$106="Významný dodavatel"))*('07_Dodavatelé'!$AI$7:$AI$106<>"Návrh")*('07_Dodavatelé'!$AI$7:$AI$106<>"Schválen")*('07_Dodavatelé'!$AI$7:$AI$106<>"Testován")*('07_Dodavatelé'!$AI$7:$AI$106<>"K revizi"))` | `sheets_out.py:611-614` | 25 (≡ DQ-49) |

### 1.2 Block "Klíčové metriky" (key metrics), heading `A17`, header row 18, rows 19–24

A 5-column table: `Metrika | Hodnota | Interpretace | Zdroj | Akce`
(`sheets_out.py:624-651`). Only **Hodnota** (column B) is live; Interpretace /
Zdroj / Akce are static strings, quoted verbatim below — they are content, not
chrome, and belong on the committee page (or its tooltips) as the tile's
explanation, source-register link, and call-to-action.

| # (row) | Metrika (verbatim) | EN gloss | Reads | Formula (as shipped) | Interpretace (verbatim) | Zdroj | Akce (verbatim) | Builder | Seeded |
|---|---|---|---|---|---|---|---|---|---|
| 1 (19) | CIF funkce | CIF count | `03.cif` | `=COUNTIF('03_Procesy'!$T$7:$T$206,"Ano")` | `Zásadní nebo důležité funkce (DORA čl. 3(22))` | 03 | `Potvrdit s business + MŘR` | `sheets_out.py:630-631` | 79 (`n_kdf`) |
| 2 (20) | Procesy bez ohodnocení dopadů | Processes without impact assessment | `03.l1`, `03.skore` | `=SUMPRODUCT(('03_Procesy'!$C$7:$C$206<>"")*('03_Procesy'!$P$7:$P$206=""))` | `Dokud platí Předběžná třída` | 03 | `Krok 2: ohodnotit dopady` | `sheets_out.py:632-633` | 148 (≡ DQ-04) |
| 3 (21) | Kritická aktiva | Assets with resulting Criticality class Kritická | `04.vysledna` | `=COUNTIF('04_Aktiva'!$AS$7:$AS$256,"Kritická")` | `Evidence kritických aktiv dle čl. 8(4)` | 04 | `Prioritní ochrana a DR` | `sheets_out.py:634-635` | — |
| 4 (22) | Kritičtí dodavatelé | Vendors with Vendor tier Kritický dodavatel | `07.tier` | `=COUNTIF('07_Dodavatelé'!$AU$7:$AU$106,"Kritický dodavatel")` | `Podporují CIF → čl. 30(3) + exit plán` | 07 | `Doplnit právní údaje, exit, ex-ante` | `sheets_out.py:636-637` | 26 (`n_krit_vendors`) |
| 5 (23) | Rizika nad toleranci | Risks above tolerance | `13.vs_tolerance` | `=COUNTIF('13_Rizika'!$S$7:$S$306,"NAD TOLERANCI")` | `Čisté riziko > P_Tolerance` | 13 | `Akční plán nebo formální akceptace` | `sheets_out.py:638-639` | — |
| 6 (24) | Otevřené kontroly | open DQ findings | **`15_Kontroly_kvality` Stav column** | `=COUNTIF('15_Kontroly_kvality'!$F$7:$F$58,"NÁLEZ")` | `Pracovní zásoba registru` | 15 | `Odpracovat dle vlastníků` | `sheets_out.py:640-641` | 23 (checks with count > 0 in the §5 DQ table) |

`16_Dashboard` has **no charts and no conditional formatting** (verified: no
`conditionalFormatting` element and no drawing rel in shipped `sheet17.xml`).

---

## 2. `18_CRO_přehled` — Manažerské shrnutí pro CRO / VŘR / představenstvo

Layout order top-to-bottom: KPI strip (rows 6–7) → heatmap + migration matrix
side by side (rows 10–16) → Top-10 risks + vendor-concentration Top-5 side by
side (rows 19–30) → management conclusions (rows 33–38) → aggregate mini-tables
(rows 41–45) feeding two bar charts (anchored row 48).

### 2.1 KPI strip — 6 tiles, labels row 6 / values row 7, columns A, C, E, G, I, K

One blank spacer column between tiles; label bold centered; value styled
`Font(size=16, bold=True, color=C_DARK)` on `FILL_CALC`, column width 15
(`sheets_out.py:803-822`).

| # (cell) | CZ label (verbatim) | EN gloss | Reads | Formula (as shipped) | Builder | Seeded |
|---|---|---|---|---|---|---|
| 1 (A7) | Rizik celkem | total Risks | `13.id_subj` | `=SUMPRODUCT(--('13_Rizika'!$C$7:$C$306<>""))` | `sheets_out.py:804` | 8 (`n_risks`) |
| 2 (C7) | Materiální | material Risks | `13.material` | `=COUNTIF('13_Rizika'!$AL$7:$AL$306,"Ano")` | `sheets_out.py:805` | — |
| 3 (E7) | Nad toleranci | Risks above tolerance | `13.vs_tolerance` | `=COUNTIF('13_Rizika'!$S$7:$S$306,"NAD TOLERANCI")` | `sheets_out.py:806` | — |
| 4 (G7) | Akceptovaná nad toleranci | accepted above tolerance | `13.vs_tolerance`, `13.odezva` | `=COUNTIFS('13_Rizika'!$S$7:$S$306,"NAD TOLERANCI",'13_Rizika'!$U$7:$U$306,"Akceptace")` | `sheets_out.py:807` | 1 (curated `RISKS` acceptance record) |
| 5 (I7) | CIF bez BCM | CIF Processes with a BCM gap | `03.kontrola_bcm` | `=COUNTIF('03_Procesy'!$AC$7:$AC$206,"GAP*")` | `sheets_out.py:808` | 3 (≡ DQ-05) |
| 6 (K7) | Otevřené kontroly kvality | open DQ findings | **`15_Kontroly_kvality` Stav column** | `=COUNTIF('15_Kontroly_kvality'!$F$7:$F$58,"NÁLEZ")` | `sheets_out.py:809` | 23 |

Note: "Rizik celkem" counts non-empty `id_subj` (column C), not `id` — consistent
with the register's own row-ID rule `=IF($C{r}="","","RIZ-"&TEXT(ROW()-6,"000"))`
(`sheets_vendors.py:640`): a risk row exists iff its subject ID is filled.

### 2.2 Heatmap "Heatmapa hrubého rizika" — title `A10`, matrix `B12:F16`

Title (verbatim): `Heatmapa hrubého rizika (pravděpodobnost × hodnota subjektu,
počty rizik)`; axis caption `A11` = `Pravděpodobnost ↓ / Hodnota →`
(`sheets_out.py:824-830`). 5×5 count matrix: **rows 12–16 = probability 5 down
to 1** (row labels in column A), **columns B–F = subject value 1 to 5** (column
labels row 11). Every cell (`sheets_out.py:836-837`), e.g. `B12` as shipped:

```
=COUNTIFS('13_Rizika'!$K$7:$K$306,5,'13_Rizika'!$E$7:$E$306,1)
```

i.e. `COUNTIFS(13.pravdep = i, 13.hodnota_subj = j)`. Conditional formatting:
3-point ColorScale over `B12:F16`, `num 0 → FFFFFF`, `num 2 → FFEB84`,
`num 4 → F8696B` (`sheets_out.py:840-844`).

Two structural facts:

- `hodnota_subj` is derived 2–5 only (vendor → 5/4/2 by Vendor tier, else
  `MATCH(h_trida, TridyKrit, 0)+1` over the 4-value `TridyKrit` list,
  `sheets_vendors.py:653-656`, `seed.py:96`), so **the "Hodnota = 1" column is
  structurally always zero**; the workbook still renders the full 5×5 grid.
- The builder's gate 3 asserts **sum of `B12:F16` = number of risks**
  (`verify.py:200-204`) — every Risk with `pravdep` and `hodnota_subj` filled
  lands in exactly one cell. Useful invariant for the committee page.

### 2.3 Migration matrix "Migrační matice" — title `H10`, matrix `I12:L15`

Title (verbatim): `Migrační matice: pásmo hrubého → pásmo čistého rizika (efekt
kontrol)`; axis caption `H11` = `Hrubé ↓ / Čisté →`. 4×4 count matrix over
bands `["Nízké", "Střední", "Vysoké", "Kritické"]`: rows 12–15 = gross band
(labels column H), columns I–L = net band (labels row 11)
(`sheets_out.py:846-861`). Every cell, e.g. `I12` as shipped:

```
=COUNTIFS('13_Rizika'!$M$7:$M$306,"Nízké",'13_Rizika'!$R$7:$R$306,"Nízké")
```

i.e. `COUNTIFS(13.pasmo_hrube = gross_band, 13.pasmo_ciste = net_band)`.
Conditional formatting: ColorScale over `I12:L15`, `num 0 → FFFFFF`,
`num 2 → FFEB84`, `num 5 → F8696B` (`sheets_out.py:862-866`).

### 2.4 Table "Top 10 rizik podle čistého rizika" — title `A19`, header row 20, rows 21–30

EN gloss: Top-10 Risks by net risk. Header (verbatim): `# | ID | Subjekt |
Hrozba | Hrubé | Čisté | Pásmo | Tolerance | Stav` (`sheets_out.py:870-873`).
The `#` column is a **static literal 1–10** (`sheets_out.py:876`), not a formula.

Ranking mechanic (`sheets_out.py:874-884`): the k-th row's key is
`IFERROR(LARGE('13_Rizika'!$AV$7:$AV$306,k),"")` — column AV is the hidden
helper **`13.h_zebr`** (see §3) — and every display cell is
`=IF(key="","",INDEX(column_range, MATCH(key, '13_Rizika'!$AV$7:$AV$306, 0)))`.
`B21` as shipped (one representative instance; all 80 cells follow the pattern):

```
=IF(IFERROR(LARGE('13_Rizika'!$AV$7:$AV$306,1),"")="","",INDEX('13_Rizika'!$A$7:$A$306,MATCH(IFERROR(LARGE('13_Rizika'!$AV$7:$AV$306,1),""),'13_Rizika'!$AV$7:$AV$306,0)))
```

Display columns (shipped letter → field key, per `sheets_out.py:881-882`):
`A → id`, `D → subj_nazev`, `H → hrozba_nazev`, `L → hrube`, `Q → ciste`,
`R → pasmo_ciste` (the "Pásmo" column shows the **net** band),
`S → vs_tolerance`, `AR → stav`. With only 8 seeded risks, ranks 9–10 render
blank (the `IFERROR(...,"")` guard). Conditional formatting: `G21:G30` =
`CRIT_N` exact-match fills (Nízké `C6EFCE`/`006100`, Střední `FFEB9C`/`9C6500`,
Vysoké `FCE4D6`/`C55A11`, Kritické `FFC7CE`/`9C0006`, `ui.py:186-187`);
`H21:H30` = `TOL` (V toleranci green, NAD TOLERANCI red, `ui.py:196`)
(`sheets_out.py:887-888`).

### 2.5 Table "Koncentrace: top 5 dodavatelů dle CIF vazeb (čl. 29)" — title `K19`, header row 20, rows 21–25, columns K–N

EN gloss: concentration — top-5 Vendors by CIF links (DORA art. 29). Header
(verbatim): `# | Dodavatel | CIF procesů | Klasifikace`
(`sheets_out.py:892-894`); `#` is a static literal 1–5. Same
LARGE/MATCH/INDEX mechanic keyed on the hidden vendor helper **`07.h_zebr`**
(shipped column CB; see §3): `L21` as shipped:

```
=IF(IFERROR(LARGE('07_Dodavatelé'!$CB$7:$CB$106,1),"")="","",INDEX('07_Dodavatelé'!$B$7:$B$106,MATCH(IFERROR(LARGE('07_Dodavatelé'!$CB$7:$CB$106,1),""),'07_Dodavatelé'!$CB$7:$CB$106,0)))
```

Display columns (`sheets_out.py:902-904`): `B → nazev`, `AS → cif_proc_n`,
`AU → tier`. The ranked quantity `cif_proc_n` counts a Vendor's CIF
process↔vendor pairs across **both** sections of sheet 11 (manual §1 + derived
§2), `sheets_vendors.py:103-105`:

```
=IF($A{r}="","",COUNTIFS(vpd_c,$A{r},vpd_f,"Ano")+COUNTIFS(vpd_hc,$A{r},vpd_hf,"Ano"))
```

Conditional formatting: `N21:N25` = `TIER_C` (Kritický dodavatel red, Významný
dodavatel orange, Standardní dodavatel green, `ui.py:190-192`;
`sheets_out.py:907`).

### 2.6 Text block "CIF pokrytí, BCM a manažerské závěry" — title `A33`, rows 34–38

EN gloss: CIF coverage, BCM and management conclusions. Five **live sentences**
— string-concatenation formulas on `FILL_CALC`, each merged across columns A–M
(`sheets_out.py:911-932`). Verbatim as shipped:

`A34` (CIF coverage; reads `03.cif` (T), `03.l1` (C), `03.bcm` (AB)):
```
="CIF funkcí: "&COUNTIF('03_Procesy'!$T$7:$T$206,"Ano")&" z "&SUMPRODUCT(--('03_Procesy'!$C$7:$C$206<>""))&" procesů; s BCM evidencí: "&COUNTIFS('03_Procesy'!$T$7:$T$206,"Ano",'03_Procesy'!$AB$7:$AB$206,"Ano")
```

`A35` (Critical-Vendor readiness; reads `07.tier` (AU), `07.exit` (AI), `07.idk` (E)):
```
="Kritických dodavatelů: "&COUNTIF('07_Dodavatelé'!$AU$7:$AU$106,"Kritický dodavatel")&"; se schváleným či testovaným exit plánem: "&SUMPRODUCT(('07_Dodavatelé'!$AU$7:$AU$106="Kritický dodavatel")*((('07_Dodavatelé'!$AI$7:$AI$106="Schválen")+('07_Dodavatelé'!$AI$7:$AI$106="Testován"))>0))&"; s doplněnými právními údaji: "&COUNTIFS('07_Dodavatelé'!$AU$7:$AU$106,"Kritický dodavatel",'07_Dodavatelé'!$E$7:$E$106,"<>")
```

`A36` (tolerance breaches; reads `13.vs_tolerance` (S), `13.odezva` (U), parameter `P_Tolerance`):
```
="Rizika nad přípustnou odchylkou ("&P_Tolerance&"): "&COUNTIF('13_Rizika'!$S$7:$S$306,"NAD TOLERANCI")&", z toho formálně akceptováno: "&COUNTIFS('13_Rizika'!$S$7:$S$306,"NAD TOLERANCI",'13_Rizika'!$U$7:$U$306,"Akceptace")
```

`A37` (Sub-outsourcing chains; reads `09!B` (Smlouva (ID)), `07.uroven_ret` (AV) values `B`/`C`):
```
="Subdodavatelské řetězce (list 09): "&SUMPRODUCT(--('09_Subdodávky'!$B$7:$B$306<>""))&" článků; dodavatelů v roli subdodavatele: "&(COUNTIF('07_Dodavatelé'!$AV$7:$AV$106,"B")+COUNTIF('07_Dodavatelé'!$AV$7:$AV$106,"C"))&" (RTS 2025/532: řetězec musí být identifikovatelný)."
```

`A38` (tolerance-approval caveat; reads only `P_Tolerance` — the sole register-independent block):
```
="Poznámka: přípustná odchylka rizika (P_Tolerance = "&P_Tolerance&") je výchozí hodnota, kterou musí schválit představenstvo v návaznosti na rizikový apetit (DORA čl. 6(8)(b))."
```

### 2.7 Aggregate mini-tables (rows 41–45) + two bar charts (row 48)

Two small chart-staging tables (`sheets_out.py:934-949`):

- **`A41` "Aktiva dle výsledné kritičnosti"** (Assets by resulting Criticality
  class): rows 42–45 = `Nízká / Střední / Vysoká / Kritická`, value B42–B45 =
  `=COUNTIF('04_Aktiva'!$AS$7:$AS$256,"<band>")` (`04.vysledna`).
- **`D41` "Rizika dle pásem (hrubé vs čisté)"** (Risks by band, gross vs net):
  `E41`=`Hrubé`, `F41`=`Čisté`; rows 42–45 = `Nízké / Střední / Vysoké /
  Kritické`; `E` = `=COUNTIF('13_Rizika'!$M$7:$M$306,"<band>")`
  (`13.pasmo_hrube`), `F` = `=COUNTIF('13_Rizika'!$R$7:$R$306,"<band>")`
  (`13.pasmo_ciste`).

Two native Excel clustered-column `BarChart` objects (`sheets_out.py:951-964`;
shipped `chart1.xml`/`chart2.xml`, anchored per `drawing1.xml`):

| Chart | Title (verbatim) | Anchor | Data / categories | Legend |
|---|---|---|---|---|
| ch1 | `Aktiva dle výsledné kritičnosti` | `A48` (h=7, w=12) | values `B42:B45`, categories `A42:A45` | none (`ch1.legend = None`) |
| ch2 | `Rizika dle pásem: hrubé vs. čisté` | `H48` (h=7, w=14) | values `E41:F45` with `titles_from_data=True` (series names from `E41`/`F41`), categories `D42:D45` | right |

---

## 3. Top-10 ranking tiebreaker — confirmed

The functional spec's quoted mechanic (`ciste + ROW()/1e6`, spec §1.7 `h_zebr`)
is **confirmed against both the builder and the shipped workbook**, with the
literal divisor `1000000`. Two instances of the same mechanic:

**Risks** — `13_Rizika.h_zebr` (hidden, shipped column AV), `sheets_vendors.py:711-712`, verbatim builder template:

```python
U.fill_col(ws, R["h_zebr"], r0, r1,
    f'=IF(${R["ciste"]}{{r}}="","",${R["ciste"]}{{r}}+ROW()/1000000)', "calc")
```

emitted per row as `=IF($Q7="","",$Q7+ROW()/1000000)` (`Q` = `ciste`).

**Vendors** — `07_Dodavatelé.h_zebr` (hidden, shipped column CB), `sheets_vendors.py:155-156`, verbatim:

```python
U.fill_col(ws, D["h_zebr"], r0, r1,
    f'=IF($A{{r}}="","",N(${D["cif_proc_n"]}{{r}})+ROW()/1000000)', "calc")
```

Precise semantics (all consequences of the shipped formulas):

1. **Sort key = ranked quantity + ROW()/1000000.** Ranked quantity: net risk
   `ciste` for the Top-10; CIF-pair count `cif_proc_n` for the Top-5
   concentration. `ROW()` is the sheet row (data rows 7–306 / 7–106), so the
   epsilon is ≤ 0.000306 — it can never reorder distinct integer values of the
   ranked quantity (both are non-negative integers: `ciste` is `ROUND(...,0)`,
   `cif_proc_n` a count).
2. **Purpose: key uniqueness.** With duplicate `ciste` values, `LARGE(...,k)`
   and `LARGE(...,k+1)` would return the same value and `MATCH` would resolve
   both to the same first row, duplicating a row in the Top-10. The row epsilon
   makes every key unique, so each rank position resolves to a distinct row.
3. **Tie direction: the higher sheet row wins.** For equal `ciste`, the row
   with the larger `ROW()` has the larger key and takes the better (lower-k)
   rank — i.e. among ties, **the later register row ranks first**. This is an
   arbitrary but deterministic order; the committee page must reproduce a
   deterministic tie order (issue #38 pre-decides this mechanic).
4. **Blank handling differs between the two tables.** Risks: `h_zebr=""` when
   `ciste=""` → text keys are ignored by `LARGE`, so incomplete risks never
   rank; with 8 seeded risks, ranks 9–10 are blank. Vendors: `h_zebr=""` only
   when the ID cell `$A` is empty; `N()` coerces a blank `cif_proc_n` to 0, so
   **every existing Vendor row ranks even with zero CIF links** (key =
   `ROW()/1000000`) — the Top-5 always shows 5 vendors once ≥5 vendor rows
   exist, zero-CIF vendors ordered among themselves by descending row.

---

## 4. DQ dependency verdict

**YES — both sheets read the DQ checks sheet.** Exactly one tile on each:

- `16_Dashboard` row 24, "Otevřené kontroly":
  `=COUNTIF('15_Kontroly_kvality'!$F$7:$F$58,"NÁLEZ")` (`sheets_out.py:640`).
- `18_CRO_přehled` cell K7, "Otevřené kontroly kvality": the identical formula
  (`sheets_out.py:809`).

Both count rows of `15_Kontroly_kvality` column F (Stav) equal to `"NÁLEZ"` —
column F is itself `=IF($D{r}="","",IF($D{r}>$E{r},"NÁLEZ","OK"))` over all 52
checks (`sheets_out.py:570`). So the committee page needs, at minimum, the
**count of firing DQ checks** (seeded: 23 of 52). No tile reads any *individual*
DQ finding, drill-down list, or severity — only the aggregate NÁLEZ count.

Consequence for sequencing: **ticket #50 (DQ engine) blocks ticket #51
(committee page)** at least for this one figure on each surface — unless #51
ships the tile stubbed/last, the DQ findings feed must exist first.

Precision note: several other tiles **re-derive DQ-equivalent rules inline
against the registers and do not read the DQ sheet**: Dashboard rows 11/15/16
≡ DQ-09/DQ-46/DQ-49, Dashboard metric row 20 ≡ DQ-04, CRO tile I7 ≡ DQ-05
(each reproduces the check's counting rule verbatim, sourced from 03/04/07
directly). In-app these should be the same derivation invoked twice, not two
implementations — but as a dependency they need only the derivation engine,
not the DQ findings surface.

---

## 5. Implementation notes for the ICT Risk Committee page (Excel-specific facts)

Things that exist in the workbook but cannot transfer literally; stated as
fact, no design decisions made here:

1. **Conditional formatting lives only on 18_CRO_přehled** (5 blocks;
   16_Dashboard has none): two 3-point ColorScales (heatmap `B12:F16` white
   `FFFFFF` at 0 → `FFEB84` at 2 → `F8696B` at 4; migration `I12:L15` same
   colors with max at 5) and three exact-match fill sets (`G21:G30` net-band
   `CRIT_N`, `H21:H30` tolerance `TOL`, `N21:N25` Vendor-tier `TIER_C`; colors
   in §2.4/§2.5, `ui.py:184-197`). These are presentation rules keyed on cell
   values, not data.
2. **Charts are native Excel objects fed by on-sheet staging tables.** The two
   mini-tables at `A41:B45` / `D41:F45` exist solely as chart data sources
   (openpyxl `Reference` ranges); a web page reads the same four-band
   aggregates directly and the staging indirection has no functional content.
   Chart geometry (anchors `A48`/`H48`, sizes 7×12 / 7×14 cm, ch1 legendless,
   ch2 legend right with series names from `E41`/`F41`) is Excel layout.
3. **No sparklines, no print areas, no page setup** anywhere in the builder or
   the shipped file (verified: no match for `sparkline|print_area|pageSetup`
   in `builder/*.py`; no `*Print_Area` defined names in `workbook.xml`).
4. **Frozen chrome rows 1–5**: row 1 title band (`KROK 8 z 8 · …` — both sheets
   are step 8 of the Úvod 8-step map, `sheets_out.py:1024`), rows 2–4 narrative
   mini-guide (§0), row 5 `HYPERLINK` prev/next navigation (Dashboard only).
   Freeze panes `A6` on both. This is workbook navigation chrome, not content.
5. **Zero input cells.** Both sheets are fully derived and sheet-protected
   (passwordless, `ui.py:60-69`); every value cell is `FILL_CALC` light blue
   (`#DEEAF6`). The committee page is correspondingly a pure read-model
   (issue #38 already fixes this).
6. **Column letters in cross-refs are v6-remapped artifacts.** All references
   into 03/04/07/13 quoted above use post-remap letters
   (`ui.remap_cross_refs`, `ui.py:396-421`); key any reimplementation on the
   field keys given in parentheses, never on letters (functional-spec §0 rule).
7. **Structurally-empty heatmap column**: the value axis renders 1–5 but
   `hodnota_subj` derivation yields only 2–5, so the `Hodnota = 1` column is a
   permanent zero column in the workbook's rendering (§2.2).
8. **Rank `#` columns are static literals** (1–10 / 1–5), independent of data;
   with fewer ranked rows than positions the remaining cells go blank while
   their `#` labels stay.
9. **Useful reproduction invariants from the builder's own gates**
   (`verify.py:200-204`, `build_expected.json`): heatmap cell-sum = risk count
   (8); `n_kdf=79` (Dashboard "CIF funkce"), `n_krit_vendors=26` ("Kritičtí
   dodavatelé"), open DQ findings = 23 — exact expected values for a
   characterization test over the cutover-imported seed data.

---

## Source

Workbook (never committed; reference by external path only):
`/Users/stefanlesnak/Antigravity/Personal Assistant/exports/dora-registr-aktiv-2026/DORA_registr_aktiv_a_dodavatelu.xlsx`
— generated by the openpyxl builder in the sibling `builder/` directory, whose
source files and line numbers are cited throughout this document.
