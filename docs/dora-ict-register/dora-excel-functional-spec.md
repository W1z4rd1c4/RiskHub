# DORA Registr aktiv a dodavatelů — Functional Reproduction Spec

Extracted from the openpyxl builder at
`<external-workbook-export>/builder/`
(`build.py`, `sheets_core.py`, `sheets_vendors.py`, `sheets_out.py`, `seed.py`,
`prep_source.py`, `ui.py`, `verify.py`, `source_data.json`, `build_expected.json`)
plus `README.md`. **The builder source is the ground truth**; the `.xlsx` was not
opened. All line numbers below refer to files in that directory. Sheet-name
constants used throughout: `S_PROC=03_Procesy`, `S_AKT=04_Aktiva`,
`S_VPA=05_Vazby_proces_aktivum`, `S_VAA=06_Vazby_aktivum_aktivum`,
`S_DOD=07_Dodavatelé`, `S_SML=08_Smlouvy`, `S_SUB=09_Subdodávky`,
`S_VAD=10_Vazby_aktivum_dodavatel`, `S_VPD=11_Vazby_proces_dodavatel`,
`S_HRZ=12_Hrozby`, `S_RIZ=13_Rizika`, `S_ROI=14_RoI_příprava`,
`S_DQ=15_Kontroly_kvality`, `S_DASH=16_Dashboard`, `S_MAP=17_DORA_mapování_a_zdroje`,
`S_CRO=18_CRO_přehled` (`seed.py:35-57`).

> **Read this note before anything else.** The workbook has gone through a "v6"
> refactor that reorganized wide sheets (03/04/07/13) into *visible logical
> blocks* with a per-block letter assignment (`seed.py:381-646`), and a
> post-build pass (`ui.remap_cross_refs`, `ui.py:396-421`) rewrites every
> qualified cross-sheet formula from "old" (v5) column letters to the new
> block layout. **Excel column letters (A, B, …, AQ, BN, …) are therefore an
> implementation artifact of this reorg and carry no semantic meaning.** A web
> reimplementation should key everything off the **field name** (e.g. `tier`,
> `h_rank`, `cif_ret`), never off a column letter. Where source formulas below
> use a literal letter (e.g. `$AM$7`), a parenthetical gives the field key.

---

## 0. Workbook geometry & conventions

19 sheets, in this fixed order (`seed.py:55-57`):

| # | Sheet | Role | Tab color |
|---|---|---|---|
| 00 | Úvod | intro / 8-step map | grey (`TAB_INTRO`) |
| 01 | Metodika | methodology narrative (live parameter text) | grey |
| 02 | Číselníky | parameters, enum lists, S-codes, RoI CZ→EN converter | grey |
| 03 | Procesy | process/function register | blue (`TAB_REG`) |
| 04 | Aktiva | ICT asset register | blue |
| 05 | Vazby_proces_aktivum | process↔asset M:N links | green (`TAB_MAP`) |
| 06 | Vazby_aktivum_aktivum | asset↔asset dependency links (empty register) | green |
| 07 | Dodavatelé | vendor register | blue |
| 08 | Smlouvy | contractual arrangements | blue |
| 09 | Subdodávky | subcontracting chain links (empty register) | green |
| 10 | Vazby_aktivum_dodavatel | asset↔vendor M:N + ICT services | green |
| 11 | Vazby_proces_dodavatel | direct process↔vendor links (manual) + full derived cascade | green |
| 12 | Hrozby | threat catalog | blue |
| 13 | Rizika | risk register (gross→net→acceptance) | blue |
| 14 | RoI_příprava | ITS 2024/2956 B_01–B_07 + B_99 output tables | orange (`TAB_OUT`) |
| 15 | Kontroly_kvality | 52 DQ checks | orange |
| 16 | Dashboard | operational KPIs | orange |
| 17 | DORA_mapování_a_zdroje | regulation→sheet traceability matrix | orange |
| 18 | CRO_přehled | executive summary (heatmap, top-N, KPIs) | orange |

**Row geometry** (`seed.py:14-33`): row 6 = header row (`HDR`), row 7 = first
data row (`D0`). Wide registers (03/04/07/13) additionally use row 5 for a
merged "block title" strip. Data ranges are fixed-capacity blocks, always
larger than the imported row count (registers grow by appending rows at the
bottom only — IDs are frozen, never renumbered):

| Register | Capacity constant | Capacity | Imported/seeded rows | Open queue rows |
|---|---|---|---|---|
| Procesy | `PROC_N` | 200 | 148 | 52 |
| Aktiva | `AKT_N` | 250 | 183 | 67 |
| Dodavatelé | `DOD_N` | 100 | 30 (1 BIZ DATA + 29 candidates) | 70 |
| Vazby_proces_aktivum | `VPA_N` | 1300 | 1000 | 300 |
| Vazby_aktivum_aktivum | `VAA_N` | 500 | 0 (empty by design) | 500 |
| Vazby_aktivum_dodavatel | `VAD_N` | 300 | 2 (Veris→BIZ DATA ×2 roles) | 298 |
| Smlouvy | `SMLV_N` | 200 | 1 (BIZ DATA master contract) | 199 |
| Subdodávky | `SUB_N` | 300 | 0 (empty by design) | 300 |
| Hrozby | `HRZ_N` | 30 | 16 (curated `THREATS`) | 14 |
| Rizika | `RIZ_N` | 300 | 8 (curated `RISKS`) | 292 |
| Vazby_proces_dodavatel §1 (manual) | `VPD_MAN_N` | 600 (rows 7–606) | 358 | 242 |
| Vazby_proces_dodavatel §2 (derived) | `VPD_DER_N` | 1500 (rows 611–2110) | fully computed, ≤106 populated | n/a |

Cell-styling convention used everywhere (`ui.py:120-134`): white/unlocked
border-only cell = manual **input**; light-blue-filled (`FILL_CALC`,
`#DEEAF6`) cell = **live formula, do not edit**. Sheets are protected
password-less (`ui.protect_sheet`, `ui.py:60-69`): formula cells stay locked,
input cells are individually unlocked; filter/sort/format remain allowed.
Every sheet has `fullCalcOnLoad=True` (`build.py:247`). No cell comments are
used in the shipped workbook (README: "žádné komentáře buněk"); `ui.headers`
supports a `comments` param but no caller passes one.

---

## 1. Entities & fields

For every field below: **E** = entered (manual input cell, may be
pre-seeded with a literal value at build time), **D** = derived (live Excel
formula, recomputed on every load). Where a field is "input-typed" (unlocked,
free text/list) **but Python pre-fills a value at generation time**, that is
called out explicitly — it is not a live formula and will not recompute if
upstream data changes; a web port must decide whether to replicate it as a
one-time seed or turn it into a real derivation.

### 1.1 `03_Procesy` — 34 fields (33 visible across 7 blocks + 1 hidden helper)

Field dict: `PROC_FIELDS`, `seed.py:423-442`. Blocks (`PROC_BLOCKS`,
`seed.py:448-457`): **A·IDENTIFIKACE**, **B·VLASTNICTVÍ**, **C·DOPADY (1–5)**,
**D·KRITIČNOST A CIF**, **E·ROI/REGULACE**, **F·KONTINUITA (BCM/DR)**,
**G·POSOUZENÍ A STAV**.

| Key | Header | E/D | Meaning / seed behaviour |
|---|---|---|---|
| `id` | ID procesu | D | `"PR-"+row` for imported rows written as a literal string at build time (`sheets_core.py:155`); for queue rows beyond the 148 imported, a live formula `=IF($C{r}="","","PR-"&TEXT(ROW()-6,"000"))` (`:157`) |
| `l0` | L0 oblast | E | list `L0Oblasti`; seeded from source |
| `l1` | L1 proces | E | seeded from source |
| `l2` | L2 podproces / varianta | E | seeded from source (often blank) |
| `vlastnik` | Vlastník procesu | E | free text; seeded from source's most-common owner per process (`prep_source.py:130`) |
| `utvar` | Vlastnický útvar | E | list `VlastnickyUtvar`; **deterministic prefill** via `OWNER_UTVAR_MAP[owner]` only where owner is unambiguous (`sheets_core.py:219-223`) — 64 of 148 left blank (DQ-43) |
| `d_klient` | Dopad na klienta (1–5) | E | int 1–5; **not seeded** (no per-axis data in source) |
| `d_trh` | Tržní / provozní dopad (1–5) | E | int 1–5; not seeded |
| `d_reg` | Regulatorní dopad (1–5) | E | int 1–5; not seeded |
| `d_fin` | Finanční dopad (1–5) | E | int 1–5; not seeded |
| `d_rep` | Reputační dopad (1–5, informativní) | E | int 1–5; **read by no formula anywhere** (verified: only match in codebase is its own header/validation) — purely informative, deliberately excluded from `skore`/`cif` |
| `mtpd` | MTPD (hod) | E | not seeded |
| `skore` | Skóre kritičnosti | D | see §2.1 |
| `predbezna` | Předběžná třída | E | seeded from source `src_class` (`sheets_core.py:231`) — fallback class while `d_*`/`mtpd` are empty |
| `trida` | Třída kritičnosti | D | see §2.1 |
| `cif_ovr` | CIF override (Ano/Ne) | E | list `AnoNe`; seeded from source `kdf_override` (itself computed in `prep_source.py:132` as `"Ano" if (row CIF flag OR crit_rank>=4) else ""`) |
| `cif` | CIF – zásadní nebo důležitá funkce | D | see §2.1 |
| `fkod` | F-kód (RoI) | D | `="F"&(ROW()-6)` — sequential function id, `F1..F200` |
| `lic` | Licencovaná činnost | E | list `LicCinnost`; **pre-seeded in Python** (not a formula) — `"Podpůrné funkce"` if `l0` is one of 7 support-area names, else `"Neživotní pojištění"` (`sheets_core.py:225-230`) |
| `rto` | RTO (hod) | E | not seeded |
| `rpo` | RPO (hod) | E | not seeded |
| `kontrola_rto` | Kontrola RTO vs MTPD | D | `GAP: RTO > MTPD` if `rto>mtpd` else `OK` |
| `bcm` | BCM vazba | E | list `BcmVazba`; seeded from source |
| `kontrola_bcm` | Kontrola BCM | D | `GAP: CIF bez BCM` if `cif="Ano"` and `bcm<>"Ano"`, else `OK` |
| `dr_test` | Poslední DR test | E | date; not seeded |
| `dr_vysl` | Výsledek DR testu | E | list `VysledekDR`; not seeded |
| `dopad_prer` | Dopad přerušení funkce | E | list `DopadPreruseni`; not seeded |
| `datum` | Datum posouzení | E | date; not seeded |
| `pristi` | Příští posouzení | D | `=datum + 1 year` |
| `aktiva_n` | Aktiva (počet) | D | `COUNTIF(05!ID procesu = this)` |
| `dod_n` | Dodavatelé (počet) | D | `COUNTIF(11§1.ID procesu=this) + COUNTIF(11§2.ID procesu=this)` |
| `hotovo` | Hotovo? | D | `✓`/`⚠` completeness flag over owner/impacts/mtpd/rto/rpo/dopad_prer/datum |
| `poznamka` | Poznámka | E | free text |
| `dup` (hidden) | pomocné duplicity | D | `COUNTIF(ProcesniID, own id)` — duplicate-ID guard |

### 1.2 `04_Aktiva` — 60 fields (56 visible across 9 blocks + 4 hidden helpers)

Field dict: `AKT_FIELDS`, `seed.py:463-496`. Blocks (`seed.py:505-517`):
**A·IDENTIFIKACE**, **B·VLASTNICTVÍ A REGULACE**, **C·PROCES A CIF**,
**D·HODNOTA AKTIVA (CIAA)**, **E·BUSINESS DOPAD**, **F·ZÁVISLOSTI**,
**G·KRITIČNOST**, **H·ŽIVOTNÍ CYKLUS**, **I·VAZBY A KONTROLA**.

> Five different "criticality" fields live on this sheet — see the worked
> walkthrough in §2.2 before implementing any one of them in isolation:
> `proc_krit` (inherited from ONE primary process), `krit_skore` (from this
> asset's own weighted score), `predbezna` (manual/BIA-seeded input),
> `bus_krit` (MAX of 4 business impacts), `vysledna` (MAX of all four
> preceding + a CIF floor — the one that matters downstream).

| Key | Header | E/D | Meaning / seed behaviour |
|---|---|---|---|
| `id` | ID aktiva | D | `"AKT-"+row`, literal for the 183 imported, formula beyond |
| `nazev` | Název aktiva | E | seeded from source `display` |
| `typ` | Typ aktiva | E | list `TypAktiva`; seeded (Veris forced to `"Aplikace"` via overlay) |
| `uroven` | Úroveň aktiva | E | list `UrovenAktiva` (A/B/C); **only Veris seeded** (`"A – primární"`) |
| `popis` | Popis / účel | E | free text; only Veris seeded |
| `klas8` | Klasifikace (čl. 8 odst. 1) | D | `"Kritické"` if `vysledna` ∈ {Kritická, Vysoká} else `"Nekritické"` — **not** the same axis as `klasdat` (data classification) or CIF |
| `umisteni` | Umístění (fyzické) | E | free text; only Veris seeded |
| `model` | Model nasazení | E | list `ModelNasazeni`; only Veris seeded (`"On-premise"`) |
| `bus_vlastnik` | Business vlastník | E | seeded from source owner or Veris overlay |
| `utvar` | Vlastnický útvar | E | list `VlastnickyUtvar`; deterministic prefill via `OWNER_UTVAR_MAP` |
| `ict_vlastnik` | ICT vlastník | E | only Veris seeded |
| `gdpr` | GDPR relevance | E | list `AnoNeNeurceno`; seeded from source |
| `ai` | AI relevance | E | list `AnoNeNeurceno`; seeded from source |
| `klasdat` | Klasifikace dat | E | list `KlasifikaceDat`; **only Veris seeded** (rest = DQ-46 queue) |
| `proc_id` | Primární proces (ID) | E* | list `ProcesniID`; **pre-seeded in Python** to the asset's single "primary process" — the most-critical process this asset was mapped to in the source, tie broken by first-seen row (`prep_source.py:157-165`). Not recomputed live. |
| `proc_nazev` | Primární proces (název) | D | `XLOOKUP(proc_id → 03!l1 [& " – " & l2])` |
| `proc_krit` | Kritičnost primárního procesu | D | `XLOOKUP(proc_id → 03!trida)` — inherits from the ONE primary process only, not an aggregate over all linked processes |
| `cif` | Podporuje CIF – odvozeno | D | see §2.3 (ANY-true cascade over 05) |
| `cif_pocet` | Počet CIF procesů | D | `COUNTIFS(05.asset=this, 05.processCIF="Ano")` |
| `cif_vycet` | Podporované CIF procesy | D | `TEXTJOIN` of matching process names |
| `c`,`i`,`a`,`au` | Důvěrnost/Integrita/Dostupnost/Autenticita (1–5) | E | only Veris seeded (5/5/5/5) |
| `hodnota` | Hodnota aktiva (CIAA) | D | `=MAX(c:au)` |
| `d_klient` | Dopad na klienta (1–5) | E | only Veris seeded (5) |
| `d_reg` | Regulatorní dopad (1–5) | E | only Veris seeded (5) |
| `d_provoz` | Provozní dopad (z procesu) | D | `XLOOKUP(proc_id → 03!d_trh)` — inherited from the ONE primary process |
| `d_fin` | Finanční dopad (z procesu) | D | `XLOOKUP(proc_id → 03!d_fin)` |
| `bus_krit` | Business kritičnost | D | class of `MAX(d_klient,d_reg,d_provoz,d_fin)` — see §2.2 |
| `nahr` | Nahraditelnost (1–5) | E | only Veris seeded (5) |
| `zavis` | Závislost na dodavateli (1–5) | E | only Veris seeded (4) |
| `ext_zavis` | Externí závislost | D | `Ano` if `dod_n>0` else `Ne` |
| `spof` | SPOF | D | `Ano` if any 05-link has SPOF=Ano |
| `internet` | Vystaveno internetu | E | list `AnoNe`; only Veris seeded (`"Ne"`) |
| `skore` | Vážené skóre aktiva | D | weighted formula, see §2.2 |
| `krit_skore` | Kritičnost ze skóre | D | class of `skore` vs `P_AktNizka/Stredni/Vysoka` |
| `predbezna` | Předběžná kritičnost | E | **pre-seeded** from `BIA_CRIT_TO_TRIDA[bia_crit]` (per-asset BIA triage aggregate) else source `src_class` (`sheets_core.py:451-453`) |
| `vysledna` | Výsledná kritičnost | D | `CHOOSE(h_rank,...)` — the MAX aggregation, see §2.2 |
| `stav` | Stav / životní cyklus | E | list `StavAktiva`; Veris=`"V provozu"` (overlay), others default `"V provozu"` |
| `konec_radne`,`konec_rozs`,`konec_prizp` | Konec řádné/rozšířené/přizpůsobené podpory | E | dates; none seeded |
| `legacy` | Legacy systém | D | `Ano` if `stav="Legacy"` OR (`konec_radne` filled AND `<P_RefDatum`) |
| `legacy_posl` | Poslední posouzení rizika legacy | E | date; none seeded |
| `rto_ded` | RTO děděné z procesu (hod) | D | `XLOOKUP(proc_id → 03!rto)` |
| `vazby_aktiv` | Vazby na jiná aktiva (odvozeno) | D | `TEXTJOIN` from 06 (asset↔asset deps) |
| `dod_seznam` | Dodavatelé (seznam) | D | `TEXTJOIN` of vendor names from 10 |
| `ict_sluzby` | ICT služby (S-kódy, odvozeno) | D | `TEXTJOIN` of S-codes from 10 |
| `smlouvy` | Smlouvy (odvozeno) | D | `TEXTJOIN` of contract refs from 10 |
| `proc_n` | Procesy (počet) | D | `COUNTIF(05.asset=this)` |
| `dod_n` | Dodavatelé (počet) | D | `COUNTIF(10.asset=this)` |
| `hotovo` | Hotovo? | D | completeness flag |
| `stav_revize` | Stav revize | E | list `StavRevize`; seeded `"K revizi"` when `prep_source.py` flagged a naming/owner conflict (36 assets) |
| `poznamka` | Poznámka | E | free text |
| `alt_nazvy` | Alternativní názvy | E | seeded from source `aliases` |
| `h_rank`,`h_par`,`h_rizika`,`h_dup` (hidden) | pomocný rank / pár / rizika / duplicity | D | ranking/count helpers, see §2.2 and DQ table |

### 1.3 `07_Dodavatelé` — 78 fields (72 visible across 7 blocks + 6 hidden helpers)

Field dict: `DOD_FIELDS`, `seed.py:523-566`. Blocks (`seed.py:578-594`):
**A·IDENTIFIKACE**, **B·SMLOUVA (odvozeno z listu 08)**, **C·DATA A LOKACE**,
**D·SUBSTITUCE A EXIT**, **E·VAZBY A KLASIFIKACE (odvozeno)**,
**F·POSOUZENÍ RIZIKA A VÝZNAMNOSTI**, **G·STAV A POZNÁMKY**.
Row 1 (`DOD-01`) = BIZ DATA, the only fully-populated real vendor; rows
`DOD-02..DOD-30` = 29 "provider candidate" stubs (only `nazev`, `vyskyt`,
`proc_orient` seeded); rows 31–100 fully open.

| Key | Header | E/D | Meaning / seed behaviour |
|---|---|---|---|
| `id` | ID dodavatele | D | `"DOD-"+row` (2-digit, e.g. `DOD-01`) |
| `nazev` | Právní název | E | seeded for BIZ DATA + all 29 candidates |
| `latinka` | Název latinkou | E | none seeded |
| `typ_osoby` | Typ osoby | E | list `TypOsoby`; BIZ DATA only |
| `idk` | ID kód | E | BIZ DATA only (`"12345678"`) |
| `typ_idk` | Typ ID kódu | E | list `TypKodu`; BIZ DATA only (`"IČO (CRN)"`) |
| `zeme` | Země sídla (ISO) | E | list `ZemeList`; BIZ DATA only (`"CZ"`) |
| `kat_zeme` | Kategorie země | D | `INDEX(ZemeKategorie, MATCH(zeme, ZemeList))` — static CZ/EU/non-EU lookup, see §3.4 |
| `adresa`,`kontakt_osoba`,`kontakt` | Adresa / kontaktní osoba / kontakt | E | **never seeded** — no contact register exists in the source (README) |
| `up_nazev`,`up_lei` | Ultimate parent název/LEI | E | none seeded |
| `sml_ref` | Ref. smlouvy | D | `XLOOKUP` main contract (Hlavní=Ano) on 08 → its ref |
| `typ_ujedn` | Typ ujednání | D | ditto → contract's arrangement type |
| `nadraz` | Nadřazená smlouva (ref.) | D | ditto |
| `zahajeni`,`ukonceni` | Zahájení/Ukončení smlouvy | D | ditto (dates) |
| `vyp_e`,`vyp_p` | Výpovědní doba entita/poskytovatel (dny) | D | ditto |
| `pravo` | Rozhodné právo (ISO) | D | ditto |
| `naklad` | Roční náklad | D | ditto |
| `mena` | Měna (ISO 4217) | D | ditto |
| `ulozeni`,`zeme_posk`,`lok_dat`,`lok_zprac`,`citlivost` | Uložení dat / Země poskytování / Lokace dat / Lokace zpracování / Citlivost dat | E | **entered directly on 07, NOT derived from 08** (moved into the "DATA A LOKACE" block in v6); BIZ DATA only |
| `subst` | Substituovatelnost | E | list `Substituce`; BIZ DATA only (`"Nenahraditelný"`) |
| `duvod_subst` | Důvod obtížné substituce | E | list `DuvodSubst`; BIZ DATA only |
| `audit` | Poslední audit | E | date; BIZ DATA only |
| `exit` | Exit plán – stav | E | list `ExitPlanStav`; BIZ DATA only (`"K revizi"`) |
| `reint` | Možnost reintegrace | E | list `Reintegrace`; BIZ DATA only |
| `dopad_sluzby` | Dopad přerušení služby | E | list `DopadSluzby`; BIZ DATA only |
| `alt_posk`,`alt_nazev` | Alternativní poskytovatelé / název | E | list `AltPosk`; BIZ DATA only (`alt_posk="Ne"`) |
| `ctpp` | CTPP dle ESA | E | list `AnoNeNeurceno`; BIZ DATA=`"Ne"` — ESA-designated status, informative only, **not** used in `tier` |
| `cif` | Podporuje CIF | D | see §2.3 |
| `aktiva_n`,`proc_n`,`cif_proc_n` | Aktiva/Procesy/CIF procesy (počet) | D | link counts, see §2.3 |
| `max_krit` | Max kritičnost aktiv | D | `CHOOSE(h_rank,...)` from `MAXIFS` over 10, see §2.3 |
| `tier` | Klasifikace dodavatele | D | **the** vendor-tier rule, see §2.3 |
| `ea_op..ea_konc` (9 fields) | Ex-ante: operační/právní/IKT/reputační/důvěrnost/dostupnost dat/lokace dat/lokace poskytovatele/koncentrace IKT | E | list `ExAnteHodn` (OK/Riziko/Nerelevantní); BIZ DATA fully seeded (8×OK, 1×Riziko) |
| `ea_datum` | Ex-ante posouzení (datum) | E | BIZ DATA only |
| `faze` | Fáze posouzení | E | list `Faze`; BIZ DATA=`"Průběžná"` |
| `dd_stav` | Due diligence – stav | E | list `DueDiligenceStav`; BIZ DATA=`"Dokončeno s výhradami"` |
| `monitoring` | Poslední monitoring (datum) | E | BIZ DATA only |
| `hotovo` | Hotovo? | D | completeness flag, incl. ex-ante-date requirement for Kritický/Významný |
| `poznamka` | Poznámka | E | free text |
| `vyskyt` | Výskyt (orientačně) | E | **static import count**, seeded from source `occ` — a for-reference count from the original raw import, distinct from the live `aktiva_n`/`proc_n` |
| `proc_orient` | Procesy (orientačně) | E | ditto, source `nproc` |
| `uroven_ret` | Úroveň v řetězci (odvozeno) | D | `A` if vendor has own contract/asset/process links, `B` if subcontractor rank 2 anywhere, `C` if subcontractor at all, else blank |
| `subdod`,`subdod_n` | Subdodavatelé (přímí) / počet | D | `TEXTJOIN`/`COUNTIF` from 09 |
| `cif_ret` | Podporuje CIF (řetězec) | D | see §2.3 |
| `vyz_povoleni`,`vyz_reg`,`vyz_kvalita`,`vyz_fin`,`vyz_povest`,`vyz_kumul` (6 fields) | Významnost: podmínky povolení / regulatorní požadavky / kvalita služeb klientům / finanční-provozní dopad / pověst-stabilita-kontinuita / kumulativní dopad více outsourcingů | E | list `AnoNeNerel`; **blank by design for every row** (per DQ-52 comment) — EBA/GL 2019/02 6-criteria outsourcing-significance test |
| `vyz_vysledek` | Výsledek: rozhodující/významný outsourcing | D | `Ano` if ANY of the 6 criteria = `Ano`, else `Ne` |
| `vyz_oduv` | Odůvodnění výsledku | E | free text |
| `h_rank`,`h_zebr`,`h_rizika`,`h_dup`,`h_smluv`,`h_hlavni` (hidden) | pomocný rank / žebříček / průběžná rizika / duplicity / smlouvy / hlavní smlouvy | D | see §2.3, and DQ-39/41 |

### 1.4 `08_Smlouvy` — 25 columns (21 visible + 4 hidden helpers)

`SML_COLS`, `sheets_vendors.py:228-237`. One row = one contractual
arrangement. **This is the sole source of contract truth** — vendor-sheet
contract fields are always derived from here, never entered directly.

| Col | Header | E/D | Notes |
|---|---|---|---|
| A | ID smlouvy | D | `"SML-"+row`; row 1 hardcoded literal `"SML-001"` |
| B | Ref. smlouvy (RoI) | E | seeded `"SML-2020-001"` for BIZ DATA's contract |
| C | Interní číslo smlouvy (TAS/SAP) | E | none seeded |
| D | Systém evidence | E | list `SystemEvidence` (TAS/SAP/Jiné) |
| E | Dodavatel (ID) | E | list `DodavateleID`; seeded `"DOD-01"` |
| F | Dodavatel (název) | D | `XLOOKUP` |
| G | Typ ujednání | E | list `TypUjednani`; seeded `"Rámcové (master)"` |
| H | Hlavní smlouva | E | list `AnoNe`; seeded `"Ano"` — **exactly one `Ano` row per vendor is expected** (guarded by DQ-39) |
| I | Nadřazená smlouva (ref.) | E | list `SmlouvyRef` |
| J | Předmět / popis | E | seeded |
| K | Služba IKT v rozsahu RoI | E | list `AnoNe`; seeded `"Ano"` — **this flag gates which RoI B_02.01/B_02.03/B_03.x/B_04.01 rows get populated** (see §4) |
| L, M | Zahájení / Ukončení | E | dates; seeded (`konec="9999-12-31"` = open-ended) |
| N, O | Výpovědní doba entita/poskytovatel (dny) | E | seeded 180/180 |
| P | Rozhodné právo (ISO) | E | seeded `"CZ"` |
| Q | Roční náklad | E | seeded 4 500 000 |
| R | Měna (ISO 4217) | E | seeded `"CZK"` |
| S | Řetězec subdodávek (odvozeno) | D | `vendor & " → " & TEXTJOIN(rank-2 subs) & " → " & TEXTJOIN(rank-3 subs)` — **display only goes 2 tiers deep**, even though the underlying rank chain on 09 can recurse further |
| T | Poznámka | E | |
| U | Kontrola duplicit | D | `DUPLICITA` if >1 row shares the same Ref. smlouvy |
| V (hidden) | pomocná hlavní | D | `=vendor_id if H="Ano" else ""` |
| W (hidden) | pomocné CIF smlouvy | D | `XLOOKUP(vendor → 07.cif, default "Ne")` — the contract's primary vendor's own CIF flag, propagated down to subcontracting rows |
| X (hidden) | pomocné duplicity | D | `COUNTIF` |
| Y (hidden) | pomocný dodavatel existuje | D | `COUNTIF(DodavateleID, vendor)` |

### 1.5 `09_Subdodávky` — 17 columns (12 visible + 5 hidden helpers), empty register

`SUB_COLS`, `sheets_vendors.py:327-332`. 1 row = 1 link in a subcontracting
chain, scoped to a specific contract. **No rows are seeded** — this is a pure
working queue.

| Col | Header | E/D | Notes |
|---|---|---|---|
| A | ID vazby | D | `"SUB-"+row` |
| B | Smlouva (ID) | E | list `SmlouvyID` |
| C | Smlouva (ref.) | D | `XLOOKUP` |
| D | Dodavatel smlouvy (ID) | D | `XLOOKUP(contract → 08.E)` — the contract's own primary vendor |
| E | Nadřazený poskytovatel (ID) | E | list `DodavateleID` — for a direct subcontract this equals D |
| F | Subdodavatel (ID) | E | list `DodavateleID` |
| G | Subdodavatel (název) | D | `XLOOKUP` |
| H | Služba (S-kód) | E | list `SKodyKod` |
| I | Rank (odvozeno) | D | recursive chain resolution, see §2.3(3b) |
| J | Kritická služba (odvozeno) | D | `XLOOKUP(contract → 08.W)` |
| K | Kontrola duplicit | D | `DUPLICITA` \| `CHYBA ŘETĚZCE` (predecessor not found) \| `OK` |
| L | Poznámka | E | |
| M (hidden) | pomocný klíč | D | `=B&"\|"&F` (contract\|subcontractor) — self-join key for I |
| N (hidden) | pomocné duplicity | D | `COUNTIF(M)` |
| O (hidden) | pomocný rozsah RoI | D | `XLOOKUP(contract → 08.K "v rozsahu RoI")` |
| P, Q (hidden) | pomocný nadřazený/subdodavatel existuje | D | `COUNTIF(DodavateleID,...)` |

### 1.6 `12_Hrozby` — 7 columns

`HRZ_COLS`, `sheets_vendors.py:590-591`: `ID hrozby`(D, `"HR-"+row`),
`Hrozba`(E, seeded from `THREATS`), `Kategorie`(E, list `KategorieHrozeb`),
`Popis`(E), `Typické zranitelnosti`(E), `Relevantní subjekt`(E),
`Poznámka`(E). 16 of 30 capacity rows seeded from the static `THREATS` list
(`seed.py:256-289`) — see §7.3.

### 1.7 `13_Rizika` — 41 fields (39 visible across 8 blocks + 2 hidden helpers)

Field dict: `RIZ_FIELDS`, `seed.py:601-621`. Blocks (`seed.py:629-638`):
**A·PŘEDMĚT**, **B·HROZBA**, **C·HRUBÉ RIZIKO**, **D·KONTROLY A ČISTÉ RIZIKO**,
**E·ODEZVA A AKCEPTACE**, **F·PŘEZKUM**, **G·MATERIALITA**, **H·STAV A PLÁN**.

| Key | Header | E/D | Meaning / seed behaviour |
|---|---|---|---|
| `id` | ID rizika | D | `"RIZ-"+row` |
| `typ_subj` | Typ subjektu | E | list `SubjektTyp` (Proces/Aktivum/Dodavatel) |
| `id_subj` | ID subjektu | E | dependent dropdown: `INDIRECT(IF(Proces,"ProcesniID",IF(Aktivum,"AktivaID","DodavateleID")))` |
| `subj_nazev` | Subjekt (název) | D | `XLOOKUP` into whichever of 03/04/07 matches `typ_subj` |
| `hodnota_subj` | Hodnota subjektu (2–5) | D | see §2.4 |
| `id_hrozby` | ID hrozby | E | list `HrozbyID` |
| `hrozba_nazev` | Hrozba (název) | D | `XLOOKUP` into 12 |
| `zranit` | Zranitelnost (1–5) | E | int 1–5 |
| `pravdep` | Pravděpodobnost (1–5) | E | int 1–5 |
| `hrube` | Hrubé riziko | D | `=hodnota_subj × zranit × pravdep` |
| `pasmo_hrube` | Pásmo hrubého rizika | D | banded on `P_RizStr/Vys/Krit` |
| `kontroly` | Klíčové kontroly / opatření | E | free text |
| `ucinnost` | Účinnost kontrol (%) | E | percent; blank ⇒ net = gross |
| `ciste` | Čisté riziko | D | `=ROUND(hrube×(1-ucinnost),0)` if `ucinnost` given else `=hrube` |
| `pasmo_ciste` | Pásmo čistého rizika | D | same bands, on `ciste` |
| `vs_tolerance` | Vs. přípustná odchylka | D | `"V toleranci"` if `ciste<=P_Tolerance` else `"NAD TOLERANCI"` |
| `odezva` | Odezva na riziko | E | list `Odezvy` (Akceptace/Zmírnění kontrolami/Zmírnění přenosem/Vyvarování se) |
| `akc_schval`,`akc_oduv`,`akc_datum` | Akceptace: schvalovatel/odůvodnění/datum | E | required together when `odezva="Akceptace"` and over tolerance (enforced by `hotovo` + DQ-21) |
| `prezkum_do` | Přezkum akceptace do | D | `=akc_datum + 1 year` |
| `pz_zmeneno`,`pz_mitigace`,`pz_oduv_plati` | Přezkum: riziko změněno? / nové mitigace? / odůvodnění platí? | E | list `AnoNe`, annual-review checklist |
| `trigger` | Trigger posouzení | E | list `Triggery` (Periodické/Velká změna/Po incidentu/Legacy) |
| `faze` | Fáze (dodavatelé) | E | list `Faze` (Ex ante/Průběžná/Nerelevantní) |
| `kontr_ucin_datum`,`kontr_ucin_vysl` | Kontrola účinnosti – datum/výsledek | E | list `VysledekUcin` |
| `verze_met` | Verze metodiky | E | list `VerzeMet=["1.0"]`; seeded `"1.0"` per row — **not** wired to the `P_Verze` parameter (see §8) |
| `mat_dopad`,`mat_vypadek` | Materialita: dopad > 4 % VK / výpadek > 24 h | E | list `AnoNe` — **manual judgment calls**; the `P_VKProc`/`P_Vypadek` thresholds are documentary only and are never read by a live formula (see §8) |
| `material` | Materiální riziko | D | `Ano` if either of the two above = `Ano` |
| `datum_pos` | Datum posouzení | E | date |
| `pristi` | Příští posouzení | D | `=EDATE(datum_pos, IF(material="Ano",6,12))` |
| `vlastnik` | Vlastník rizika | E | free text |
| `termin` | Termín akčního plánu | E | date |
| `stav` | Stav | E | list `StavRizika` (Otevřené/V řešení/Uzavřené/Akceptováno) |
| `hotovo` | Hotovo? | D | completeness + acceptance-package check |
| `poznamka` | Poznámka | E | |
| `h_trida`,`h_zebr` (hidden) | pomocná třída / žebříček | D | subject-class lookup helper; `ciste + ROW()/1e6` ranking tiebreaker for CRO Top-10 |

### 1.8 Link sheets 05 / 06 / 10 / 11 — full column lists

**`05_Vazby_proces_aktivum`** (`VPA_COLS`, `sheets_core.py:541-544`, 14 cols):
`ID vazby`(D), `ID procesu`(E, seeded ×1000), `ID aktiva`(E, seeded),
`Proces (název)`(D, XLOOKUP), `Aktivum (název)`(D, XLOOKUP),
`Význam vazby pro proces`(E, list `VyznamVazby`; **all 1000 imported rows
re-seeded to `"Neposouzeno"`** — the source's old "Role závislosti" concept
was retired, DQ-45), `CIF procesu`(D, XLOOKUP 03), `Kritičnost procesu`(D,
XLOOKUP 03), `Výsledná kritičnost aktiva`(D, XLOOKUP 04), `SPOF`(E, list
`AnoNe`), `Kontrola duplicit`(D), `Poznámka`(E), 2 hidden existence-check
helpers (D).

**`06_Vazby_aktivum_aktivum`** (`VAA_COLS`, `sheets_core.py:490-493`, 13
cols, **0 rows seeded**): `ID vazby`(D), `Závislé aktivum (ID)`(E),
`Závislé aktivum (název)`(D), `Podpůrné aktivum (ID)`(E), `Podpůrné aktivum
(název)`(D), `Typ závislosti`(E, list `TypZavislostiAktiv`), `SPOF`(E),
`Kontrola duplicit`(D), `Poznámka`(E), 4 hidden helpers (levels + existence,
feed DQ-37 "podpůrné úroveň < závislé úroveň" direction check).

**`10_Vazby_aktivum_dodavatel`** (`VAD_COLS`, `sheets_vendors.py:400-405`,
17 cols; 2 seed rows, both Veris↔BIZ DATA): `ID vazby`(D), `ID aktiva`(E),
`ID dodavatele`(E), `Aktivum (název)`(D), `Dodavatel (název)`(D), `Role
dodavatele`(E, list `RoleDodavatele`; seed = `Dodává`/`Spravuje`), `Typ ICT
služby (S-kód)`(E, list `SKodyKod`; seed = `S02`/`S14`), `ICT služba
(název)`(D, `INDEX/MATCH` into S-code table), `Ref. smlouvy`(E, list
`SmlouvyRef`; seed `SML-2020-001`), `Míra závislosti (u CIF)`(E, list
`Reliance`; seed `"Úplná závislost"`), `Výsledná kritičnost aktiva`(D,
XLOOKUP 04), `pomocný rank`(D, hidden, `MATCH` into `TridyKrit`),
`Aktivum podporuje CIF`(D, XLOOKUP 04's `cif`), `Kontrola duplicit`(D),
`Poznámka`(E), `pomocný počet procesů`(D, hidden), `pomocný kumulativ`(D,
hidden running sum — feeds the §2 derived-cascade index in 11).

**`11_Vazby_proces_dodavatel`** (`sheets_vendors.py:485-587`) — **two
sections on one sheet**:
- §1 manual, rows 7–606 (`man_cols`, 9 cols): `ID vazby`(D, `VPD-M###`),
  `ID procesu`(E, seeded ×358 from source direct pairs), `ID dodavatele`(E,
  seeded), `Proces (název)`(D), `Dodavatel (název)`(D), `CIF procesu`(D,
  XLOOKUP), `Popis přímé služby`(E), `Poznámka`(E, all 358 seeded `"k
  revizi"`), `pomocná revize v 07`(D, hidden, `COUNTIF` — has this pair
  already been migrated to sheet 10?). Row `VPD_TOT_ROW=608`: `B608 =
  SUM(10.pomocný počet procesů)` — total derived-pair count.
- §2 fully derived, rows 611–2110 (`der_cols`, 11 cols): `Pořadí`,
  `j`/`k`(hidden helpers), `ID procesu`, `Proces (název)`, `CIF procesu`,
  `Kritičnost procesu`, `ID dodavatele`, `Dodavatel (název)`, `Přes aktivum
  (ID)`, `Přes aktivum (název)` — every (process,asset,vendor) triple
  implied by combining 05 (process↔asset) with 10 (asset↔vendor),
  enumerated via nested `INDEX/MATCH/AGGREGATE` against the running
  cumulative count on 10. This is the **full transitive process↔vendor
  expansion**; `build.py:_pairs_total()` computes it in Python as `2 ×
  (# of 05-rows for veris)` (only Veris has VAD seed rows) `= 106`,
  matching `build_expected.json.pairs_total`.

---

## 2. Derivation rules

### 2.1 Process criticality & CIF (`03_Procesy`)

**Score** (`sheets_core.py:165-169`) — sum of exactly 4 impact axes
(reputation excluded) plus an MTPD speed bonus:

```
skore = IF(OR(C="", COUNT(d_klient:d_fin)<4, mtpd=""), "",
        SUM(d_klient:d_fin)
        + IF(mtpd<=P_MTPDKrit, P_BonusKrit,
            IF(mtpd<=P_MTPDStr, P_BonusStr, P_BonusDef)))
```
`d_klient:d_fin` spans exactly `{d_klient, d_trh, d_reg, d_fin}` — **`d_rep`
(reputational) is structurally outside this range** and never summed.
Bonus: MTPD≤4h→+5, MTPD≤24h→+3, else+1 (`P_MTPDKrit=4, P_BonusKrit=5,
P_MTPDStr=24, P_BonusStr=3, P_BonusDef=1`).

**Class** (`:170-173`):
```
trida = IF(skore<>"",
           IF(skore>=P_KritSkore,"Kritická",
             IF(skore>=P_VysSkore,"Vysoká",
               IF(skore>=P_StrSkore,"Střední","Nízká"))),
           predbezna)          -- falls back to the manual/seeded field
```
Thresholds `P_KritSkore=16, P_VysSkore=12, P_StrSkore=8` (score range 5–25:
4 axes × 1–5 + bonus 1–5).

**CIF** (`:175-178`) — override, else any of 3 independent triggers:
```
cif = IF(cif_ovr<>"", cif_ovr,
        IF(OR(trida="Kritická",
              AND(mtpd<>"", mtpd<=P_MTPDKrit),
              MAX(d_klient:d_fin)=5),
           "Ano","Ne"))
```
i.e. CIF = Ano ⇔ manual override, OR class=Kritická, OR MTPD≤4h, OR **any**
single impact axis hits 5 — even if the summed score itself is below the
Kritická threshold. This is the process-level definition of "zásadní nebo
důležitá funkce" (DORA art. 3(22)); assets and vendors never set CIF
directly — they only ever inherit it (§2.3).

### 2.2 Asset value & criticality — the "MAX princip" (`04_Aktiva`)

Walking the five criticality-flavored fields in dependency order
(`sheets_core.py:307-415`):

1. **`hodnota`** (CIAA value) = `MAX(C, I, A, Au)` — blank unless all 4
   scored.
2. **`d_provoz`**, **`d_fin`** = `XLOOKUP(proc_id → 03!d_trh)`,
   `XLOOKUP(proc_id → 03!d_fin)` — inherited unchanged from the single
   primary process, **not** recomputed on the asset.
3. **`bus_krit`** (business kritičnost) = class of
   `MAX(d_klient, d_reg, d_provoz, d_fin)` against `P_AktNizka=2 /
   P_AktStredni=3 / P_AktVysoka=4` (>4 ⇒ Kritická) — same threshold family
   the process side uses, applied to a *different* 4-value set (2 manual +
   2 inherited).
4. **`skore`** (vážené skóre aktiva, `:359-363`) — an explicit weighted
   sum, requiring all 8 named inputs non-blank:
   ```
   skore = ROUND(C*0.1 + I*0.1 + A*0.2 + Au*0.1
                 + d_klient*0.2 + d_reg*0.2
                 + nahr*0.05 + zavis*0.05, 2)
   ```
   (weights sum to 1.00: 10/10/20/10/20/20/5/5 %). **`krit_skore`** then
   classes this score with the same `P_AktNizka/Stredni/Vysoka` thresholds.
5. **`h_rank`** (hidden, `:369-373`) — the actual MAX aggregation, over 4
   *signals for this one asset row* plus a CIF floor:
   ```
   h_rank = MAX(
       IFERROR(MATCH(proc_krit,  TridyKrit,0),0),   -- primary process's class
       IFERROR(MATCH(krit_skore, TridyKrit,0),0),    -- this asset's weighted score
       IFERROR(MATCH(predbezna,  TridyKrit,0),0),    -- manual/BIA-seeded input
       IFERROR(MATCH(bus_krit,   TridyKrit,0),0),    -- business-impact MAX
       IF(cif="Ano", 2, 0))                          -- CIF floor = "Střední"
   ```
   `TridyKrit = [Nízká,Střední,Vysoká,Kritická]` so `MATCH` returns rank
   1–4; `IFERROR(...,0)` treats a blank/unmatched signal as rank 0 (does
   not pull the max down).
6. **`vysledna`** (Výsledná kritičnost, `:374-376`) = `CHOOSE(h_rank, "Nízká",
   "Střední","Vysoká","Kritická")` — **this is the field everything else
   downstream reads.** Per Metodika sheet 3: *"aktivum podporující CIF
   neklesne pod Střední … aktivum nemůže být méně kritické než proces,
   který nese — vlastní hodnocení kritičnost jen zvyšuje"* — i.e. the rule
   is monotonic-only-upward: nothing on this sheet can lower an asset's
   criticality below what its primary process or CIF status implies.
7. **`klas8`** (`:310-312`, Klasifikace čl. 8 odst. 1) = `"Kritické"` if
   `vysledna` ∈ {Kritická, Vysoká} else `"Nekritické"` — a DORA-art.-8(1)
   binary label derived purely from `vysledna`, distinct from both `cif`
   and `klasdat` (data classification, a separate manually-entered enum).

Asset-level cascade fields (§2.3 covers the CIF one):
- **`spof`** = `Ano` if any 05-link has `SPOF="Ano"` (ANY-true).
- **`ext_zavis`** = `Ano` if `dod_n>0` (has any vendor link).

### 2.3 The cascade: process → asset → vendor (aggregation rules)

This is the many-to-one rollup the whole workbook hinges on. Four distinct
aggregation *shapes* appear; none of them is a weighted average or a sum of
values — only OR/ANY-true, MAX, or single-parent inheritance:

**(1) Process → Asset, via `05_Vazby_proces_aktivum` (true M:N)**
- `04!cif` ("Podporuje CIF – odvozeno") = **ANY-true / OR** over every
  linked process (`sheets_core.py:324-325`):
  ```
  cif = IF(COUNTIFS(05.assetID=this, 05.processCIF="Ano")>0, "Ano","Ne")
  ```
- `04!proc_krit`, `d_provoz`, `d_fin`, `rto_ded` are **not** aggregates —
  each is a single `XLOOKUP` against the ONE `proc_id` (primary process),
  chosen once at build time in Python (`prep_source.py:157-165`: the
  process with the highest `crit_rank` among all processes this asset was
  mapped to in the source; ties keep the first process encountered in
  source-row order — **an arbitrary but deterministic tie-break**, not a
  business rule).
- `04!vysledna` = MAX over several *signals of the same asset row*
  (§2.2 step 5–6), one of which (`proc_krit`) is itself a single-parent
  inheritance, not a many-to-one aggregate.

**(2) Asset → Vendor, via `10_Vazby_aktivum_dodavatel` (true M:N)**
- `07!cif` ("Podporuje CIF") = **ANY-true / OR**, over TWO independent
  paths at once (`sheets_vendors.py:96-98`):
  ```
  cif = IF( COUNTIFS(10.vendorID=this, 10.assetCIF="Ano")        -- via asset cascade
          + COUNTIFS(11§1.vendorID=this, 11§1.processCIF="Ano")  -- via direct process link
          > 0, "Ano","Ne")
  ```
- `07!max_krit` = **MAX**, exactly one line (`sheets_vendors.py:153-154,
  106-108`):
  ```
  h_rank(hidden) = IFERROR(MAXIFS(10.assetCriticalityRank, 10.vendorID=this), 0)
  max_krit        = CHOOSE(h_rank, "Nízká","Střední","Vysoká","Kritická")
  ```
  `10.assetCriticalityRank` is itself `MATCH(04!vysledna, TridyKrit)` computed
  per-link on sheet 10 — so this is a MAX-of-MAX: the vendor's `max_krit`
  is the highest `vysledna` rank among every asset it is linked to.
- `07!aktiva_n / proc_n / cif_proc_n` are plain `COUNTIF`/`COUNTIFS` tallies
  (link counts, not value aggregates).

**(3) Vendor tier — `07!tier` ("Klasifikace dodavatele"), the single most
important derived value in the workbook** (`sheets_vendors.py:109-115`):

```
tier = IF(cif_ret="Ano", "Kritický dodavatel",
        IF(OR(N(h_rank)>=3,                                    -- max linked-asset rank ≥ Vysoká
              subst="Nenahraditelný",
              subst="Velmi obtížně nahraditelný",
              COUNTIFS(10.vendorID=this,10.Skod,"S17")
            + COUNTIFS(10.vendorID=this,10.Skod,"S18")
            + COUNTIFS(10.vendorID=this,10.Skod,"S19") > 0),    -- any IaaS/PaaS/SaaS link
           "Významný dodavatel", "Standardní dodavatel"))
```
In plain terms:
- **Kritický dodavatel** ⇔ supports CIF (directly or via the subcontracting
  chain, see (3a) below) — this is the ONLY gate for the top tier; nothing
  else can produce it and nothing else is checked once it's true.
- **Významný dodavatel** ⇔ (not CIF) AND ANY of: max linked-asset
  criticality ≥ **Vysoká** (rank≥3, from the MAX in (2) above), OR manual
  `subst` ∈ {Nenahraditelný, Velmi obtížně nahraditelný} (top 2 of the
  4-value `Substituce` enum), OR the vendor provides any cloud service
  tagged S17/S18/S19 (IaaS/PaaS/SaaS) to any linked asset (ANY-true across
  10).
- **Standardní dodavatel** = everything else.

**(3a) CIF down the subcontracting chain — `07!cif_ret`**
(`sheets_vendors.py:124-126`):
```
cif_ret = IF(cif="Ano", "Ano",
             IF(COUNTIFS(09.subcontractorID=this, 09.contractCIF="Ano")>0,
                "Ano","Ne"))
```
where `09.contractCIF` (`08!W`, hidden) = the **contract's own primary
vendor's** `cif` flag, looked up once per contract and then read by every
subcontracting row under that contract — i.e. CIF status propagates from
the top-level contract's prime vendor down to every subcontractor tier
uniformly; it is **not** re-derived per subcontractor tier.

**(3b) Subcontract rank — `09!I` ("Rank (odvozeno)")**
(`sheets_vendors.py:362-365`) is a **linked-list walk**, not an
aggregation: a direct subcontractor (`Nadřazený poskytovatel = Dodavatel
smlouvy`) is rank 2; any deeper row looks up the predecessor by the
`contract|subcontractor` compound key `M = B&"|"&F` and takes
`predecessor_rank + 1`; if no predecessor row exists, the cell shows
`"?"` and `09!K` flags `"CHYBA ŘETĚZCE"` (DQ-38). `08!S`
("Řetězec subdodávek") only *displays* ranks 2 and 3 (2 tiers), even
though `09!I` itself can recurse arbitrarily deep.

### 2.4 Risk scoring (`13_Rizika`)

Subject value scale is **not the same 4-point scale on both sides** — note
the asymmetry (`sheets_vendors.py:653-656`):
```
hodnota_subj = IF(typ_subj="Dodavatel",
                  IF(tier="Kritický dodavatel", 5,
                    IF(tier="Významný dodavatel", 4, 2)),      -- Standardní skips straight to 2
                  MATCH(h_trida, TridyKrit)+1)                 -- Nízká→2, Střední→3, Vysoká→4, Kritická→5
```
- Gross risk (`:663-665`): `hrube = hodnota_subj × zranit × pravdep`.
- Bands (`:666-668`): `>=P_RizKrit(80)`→Kritické, `>=P_RizVys(40)`→Vysoké,
  `>=P_RizStr(15)`→Střední, else Nízké — same bands for gross and net.
- Net risk (`:671-673`): `ciste = ROUND(hrube×(1−ucinnost),0)` if
  `ucinnost` given, **else `ciste = hrube` unchanged** (no assumed control
  effect).
- Tolerance (`:677-679`): `"V toleranci"` if `ciste<=P_Tolerance(39)` else
  `"NAD TOLERANCI"`.
- Materiality (`:694-696`): `material = Ano` if either manual
  `mat_dopad="Ano"` or `mat_vypadek="Ano"` — **these two flags are pure
  manual judgment**, not computed from financial/outage figures (see §8).
- Review cadence (`:698-700`): `pristi = EDATE(datum_pos, IF(material="Ano",
  6, 12))` — 6-month cycle for material risks, else 12 months.

### 2.5 Worked example (golden path — used by the builder's own gate-3 assertions, `verify.py:157-171`)

**Veris** (asset `AKT-006`, primary process = *Prodej a distribuce › Sjednání
pojištění › Česko (ČR) – online sjednání*): overlay sets `C=I=A=Au=5,
klient=reg=5, nahr=5, zavis=4` (`seed.py:235-241`).
- `hodnota` = MAX(5,5,5,5) = **5**.
- `skore` (weighted) = `5·0.1+5·0.1+5·0.2+5·0.1+5·0.2+5·0.2+5·0.05+4·0.05` =
  **4.95** → `krit_skore` = Kritická (>`P_AktVysoka=4`).
- `predbezna` = `BIA_CRIT_TO_TRIDA[4]` = **Kritická** (source `bia_crit=4`).
- `bus_krit` = MAX(klient=5, reg=5, d_provoz, d_fin) = **Kritická** (5 alone
  is enough, regardless of the two process-inherited fields).
- `h_rank` = MAX(proc_krit, 4, 4, 4, CIF-floor) = **4** ⇒ `vysledna` =
  **Kritická**. `klas8` = **Kritické**.
- Asset `cif` = Ano (Veris is linked, via 05, to at least one of the 79
  CIF-flagged processes — confirmed by `build.py:58`:
  `vendor_kdf = {"DOD-01"} if asset_kdf.get("veris") else set()`).

**BIZ DATA** (vendor `DOD-01`): via the 2 seeded VAD rows (Veris↔DOD-01,
roles Dodává/Spravuje), `10!K` (Výsledná kritičnost aktiva) = Kritická,
`10!M` (Aktivum podporuje CIF) = Ano ⇒ `07!cif`=Ano ⇒ `cif_ret`=Ano ⇒
**`tier = "Kritický dodavatel"`**. Contract seed: `subst="Nenahraditelný"`,
`exit="K revizi"`, `dd_stav="Dokončeno s výhradami"`, `zeme="CZ"` ⇒
`kat_zeme="ČR"`. All confirmed by `verify.py` gate-3 assertions.

**A load-bearing negative fact discovered while cross-checking the
cascade**: of the 29 imported "provider candidate" rows, only fields
`nazev`/`vyskyt`/`proc_orient` are seeded — no candidate has any `10_VAD`
row or a `subst` value. That means for every candidate, `h_rank`
(`MAXIFS` with no matches) resolves to 0 via `IFERROR(...,0)`, `subst` is
blank, and no S17-19 link exists — so **the "Významný dodavatel" branch of
`tier` is structurally unreachable for any of the 29 seeded candidates
under the current data**; a candidate is either "Kritický" (25 of them,
via a direct §1 process→vendor CIF link — `krit_candidates` in
`build_expected.json`) or falls through to "Standardní" (the remaining 4).
"Významný dodavatel" only becomes reachable once a human enters VAD links
or a `subst` value for a given vendor.

---

## 3. Closed lists / taxonomies

### 3.1 `ENUMS` (45 named lists, `seed.py:91-158`) — verbatim

| Name | Values |
|---|---|
| `AnoNe` | Ano, Ne |
| `AnoNeNeurceno` | Ano, Ne, Neurčeno |
| `AnoNeNerel` | Ano, Ne, Nerelevantní |
| `Skala15` | 1, 2, 3, 4, 5 |
| `TridyKrit` | Nízká, Střední, Vysoká, Kritická |
| `PasmaRizika` | Nízké, Střední, Vysoké, Kritické |
| `TypAktiva` | Aplikace, Databáze, Infrastruktura, Síťový prvek, Hardware, Cloud služba, Datové úložiště, Informační aktivum, Bezpečnostní aktivum, BCM/DR aktivum, Jiné |
| `StavAktiva` | V provozu, Ve vývoji, Utlumováno, Legacy, Vyřazeno |
| `VyznamVazby` | Kritická podpora procesu, Významná podpora procesu, Podpůrná vazba, Nepřímá / sdílená vazba, BCM/DR vazba, Neposouzeno |
| `RoleDodavatele` | Dodává, Provozuje, Hostuje, Spravuje, Podporuje, Zpracovává data, Zálohuje / obnova, Bezpečnostní služba, Jiné |
| `TypOsoby` | Právnická osoba, Fyzická osoba podnikající |
| `TypKodu` | LEI, EUID, CRN, VAT, PNR, NIN |

The application advertises the six CIR identifier codes above. For transitional
compatibility, write APIs still accept the workbook-era values `IČO (CRN)`
(evaluated as `CRN`) and `Jiný`; existing rows remain readable without a data
migration, while neither deprecated value is offered for new UI selections.
| `TypUjednani` | Samostatné, Rámcové (master), Navazující |
| `Substituce` | Nenahraditelný, Velmi obtížně nahraditelný, Středně obtížně nahraditelný, Snadno nahraditelný |
| `DuvodSubst` | Omezená nabídka na trhu, Obtížná migrace, Obojí |
| `Reintegrace` | Snadná, Obtížná, Velmi složitá |
| `DopadSluzby` | Nízký, Střední, Vysoký, Neposouzeno |
| `CitlivostDat` | Nízká, Střední, Vysoká |
| `Reliance` | Nevýznamná, Nízká závislost, Zásadní závislost, Úplná závislost |
| `AltPosk` | Ano, Ne, Neposouzeno |
| `DopadPreruseni` | Nízký, Střední, Vysoký, Neposouzeno |
| `Odezvy` | Akceptace, Zmírnění kontrolami, Zmírnění přenosem, Vyvarování se |
| `Triggery` | Periodické, Velká změna, Po incidentu, Legacy |
| `Faze` | Ex ante, Průběžná, Nerelevantní |
| `KategorieHrozeb` | Dostupnost, Integrita, Důvěrnost, Hodnověrnost, Fyzická, Personální, Třetí strany |
| `SubjektTyp` | Proces, Aktivum, Dodavatel |
| `StavRizika` | Otevřené, V řešení, Uzavřené, Akceptováno |
| `VysledekDR` | Úspěšný, S výhradami, Neúspěšný, Netestováno |
| `VysledekUcin` | Účinné, Částečně účinné, Neúčinné |
| `ExAnteHodn` | OK, Riziko, Nerelevantní |
| `MenaList` | CZK, EUR, USD, GBP |
| `ZemeList` | CZ, SK, DE, AT, NL, PL, GB, US, IE, FR, LU |
| `LicCinnost` | Neživotní pojištění, Podpůrné funkce |
| `VerzeMet` | 1.0 |
| `TierDod` | Kritický dodavatel, Významný dodavatel, Standardní dodavatel |
| `StavRevize` | K revizi, Zkontrolováno |
| `UrovenAktiva` | A – primární, B – podpůrné, C – infrastrukturní |
| `TypZavislostiAktiv` | Běhová (runtime), Datová, Síťová / infrastrukturní, Bezpečnostní, Zálohovací / recovery, Provozní, Jiná |
| `SystemEvidence` | TAS, SAP, Jiné |
| `VlastnickyUtvar` | Obchodní úsek, UW, LPU, Provoz, Finance, Právní a compliance, Risk management, IT, HR, Marketing, Interní audit, Produkt |
| `BcmVazba` | Ano, Ne, Neposouzeno, Nerelevantní |
| `KlasifikaceDat` | Bez dat / nerelevantní, Veřejná data, Interní data, Důvěrná data, Vysoce důvěrná / regulovaná data, Neposouzeno |
| `ModelNasazeni` | On-premise, Cloud, SaaS, PaaS, IaaS, Hybrid, Externě hostováno, Neposouzeno, Nerelevantní |
| `ExitPlanStav` | Není vyžadován, Vyžadován – chybí, Návrh, Schválen, Testován, K revizi, Neposouzen |
| `DueDiligenceStav` | Nerelevantní, Nezahájeno, Probíhá, Dokončeno bez výhrad, Dokončeno s výhradami, K revizi, Neposouzeno |

Additionally: `AnoNeNerel` is also used (beyond `AnoNeNerel` field types) as the
6-criteria list for the outsourcing-significance block (`vyz_povoleni..vyz_kumul`).

### 3.2 `SCODES` — S01–S19 ICT service taxonomy (`seed.py:217-229`, Annex III ITS)

| Code | Label (CZ) |
|---|---|
| S01 | Řízení projektů v oblasti IKT |
| S02 | Rozvoj IKT |
| S03 | Asistenční služby a podpora první úrovně |
| S04 | Služby řízení bezpečnosti v oblasti IKT |
| S05 | Poskytování údajů |
| S06 | Analýza údajů |
| S07 | IKT, zařízení a hostingové služby |
| S08 | Počítačové zpracování |
| S09 | Úložiště dat mimo cloud |
| S10 | Poskytovatel telekomunikačních služeb |
| S11 | Síťová infrastruktura |
| S12 | Hardware a fyzická zařízení |
| S13 | Licencování softwaru |
| S14 | Řízení provozu IKT |
| S15 | Poradenství v oblasti IKT |
| S16 | Řízení rizika v oblasti IKT |
| S17 | Cloudové služby: IaaS |
| S18 | Cloudové služby: PaaS |
| S19 | Cloudové služby: SaaS |

S17/S18/S19 are the three codes checked by the vendor-tier "cloud" trigger
(§2.3-3).

### 3.3 `ROI_MAPS` — CZ→EN conversion tables for RoI (`seed.py:188-215`, ITS 2024/2956 closed lists), verbatim

| Map | CZ → EN pairs |
|---|---|
| `MapSubst` | Nenahraditelný→Not substitutable; Velmi obtížně nahraditelný→Highly complex substitutability; Středně obtížně nahraditelný→Medium complexity of substitutability; Snadno nahraditelný→Easily substitutable |
| `MapDuvod` | Omezená nabídka na trhu→Limited market alternatives; Obtížná migrace→Migration difficulties; Obojí→Both |
| `MapReint` | Snadná→Easy; Obtížná→Difficult; Velmi složitá→Highly complex |
| `MapDopad` | Nízký→Low; Střední→Medium; Vysoký→High; Neposouzeno→Assessment not performed |
| `MapCitl` | Nízká→Low; Střední→Medium; Vysoká→High |
| `MapRel` | Nevýznamná→Not significant; Nízká závislost→Low reliance; Zásadní závislost→Material reliance; Úplná závislost→Full reliance |
| `MapAlt` | Ano→Yes; Ne→No; Neposouzeno→Assessment not performed |
| `MapOsoba` | Právnická osoba→Legal person; Fyzická osoba podnikající→Individual acting in a business capacity |
| `MapUjedn` | Samostatné→standalone arrangement; Rámcové (master)→overarching (master) arrangement; Navazující→subsequent or associated arrangement |
| `MapLic` | Neživotní pojištění→non-life insurance activities; Podpůrné funkce→support functions |

The live conversion formula (`sheets_out.py:24-26`) is a plain
`INDEX/MATCH`: `IFERROR(INDEX(<Map>EN, MATCH(src, <Map>CZ, 0)), src)` —
falls back to the raw CZ value if not found in the map (never blanks).

### 3.4 Static reference tables

**`ZEME_KATEGORIE`** (`seed.py:161-163`) — country→category, paired 1:1
with `ZemeList` order (used via `INDEX(ZemeKategorie, MATCH(zeme,
ZemeList))`, not a dictionary lookup in Excel):
`CZ→ČR; SK,DE,AT,NL,PL,IE,FR,LU→EU; GB,US→mimo EU`.

**`OWNER_UTVAR_MAP`** (`seed.py:167-180`) — deterministic free-text-owner →
department prefill, used identically on both 03 and 04 (`sheets_core.py:219-223,
437-441`); keys outside this map (role-style owners, "X / Y" combinations,
"k ověření") are left blank by design (DQ-43/44 queue):
```
Úsek LPU→LPU · Úsek UW→UW · IT, Úsek IT, Vedoucí IT→IT ·
Provozní úsek→Provoz · Úsek právní a compliance→Právní a compliance ·
Úsek interního auditu→Interní audit · Finanční úsek→Finance ·
Marketing→Marketing · Produktový úsek, Vývoj produktu→Produkt ·
Obchodní úsek→Obchodní úsek · HR úsek→HR · Risk management→Risk management
```

**`BIA_CRIT_TO_TRIDA`** (`seed.py:182-185`) — BIA aggregate-criticality
(`Kalkulačka_rizik_aktiv`, 3-tier scale `{1,3,4}`) → `predbezna` class:
`{1: "Nízká", 3: "Vysoká", 4: "Kritická"}`. Feeds directly into an **input**
cell (`predbezna`), never a formula — see §2.2. Note the numeric gap (no
"2"/"Střední" in the BIA source scale).

---

## 4. RoI output mapping (`14_RoI_příprava`, `sheets_out.py:54-348`)

Builds the official ITS 2024/2956 tables B_01.01 through B_07.01 (plus
B_99.01, documented on the Metodika sheet). Each block is a fixed-height
region; every data row's presence is gated by `IF(<source ref>="","",...)` —
i.e. **empty rows in the source produce empty RoI rows, never `0`/blank
placeholders that would be mis-read as data.**

| RoI table | Row source (capacity) | Gate | Key mappings |
|---|---|---|---|
| B_01.01 Entita vedoucí registr | single row | none | `LEI=P_LEI`, `Název=P_Entita`, `Země="CZ"`, `Typ="Insurance undertaking"`, `Datum=P_RoIDatum` |
| B_01.02 Finanční subjekty | single row | none | mirrors B_01.01; `Hierarchie="not part of a group"`; `Hodnota celkových aktiv` left as a **white manual cell** (Annex IV ITS, not derivable) |
| B_01.03 Pobočky | 3 blank rows | none | fully manual — flagged "K POTVRZENÍ" whether the NL "volmacht" activity counts as a branch |
| B_06.01 Určení funkcí | 1 row per process (`PROC_N`) | `03!A<>""` | `Function id=03!fkod`, `Licenced activity=cz2en(MapLic, 03!lic)`, `Function name=l1[" – "l2]`, `LEI=P_LEI`, `Criticality assessment="Assessment not performed"` if `03!cif=""` else Yes/No, `Reasons="CIF: třída "&trida&" (zdroj: predbezna)&", MTPD "&mtpd&" h"` (capped 300 chars), `Date of last assessment=03!datum` else `9999-12-31`, `RTO/RPO=03!rto/rpo`, `Impact of discontinuing=cz2en(MapDopad, 03!dopad_prer)` |
| B_05.01 Poskytovatelé | 1 row per vendor (`DOD_N`) | `07!A<>""` | `ID kód/Typ/Legal name/Latin name=07!idk/typ_idk/nazev/latinka`, `Type of person=cz2en(MapOsoba, typ_osoby)`, `Přímý poskytovatel?="Ano" if COUNTIF(10.vendor)+COUNTIF(11§1.vendor)>0`, `Roční náklad` shown only if direct>0 |
| B_02.01 Smluvní ujednání | 1 row per contract (`SMLV_N`) | `08!K="Ano"` (RoI-scope flag) | `ref=08!B`, `Type=cz2en(MapUjedn,08!G)`, `Overarching ref=08!I`, `Currency/Annual expense=08!R/Q` |
| B_02.03 Skupinové ujednání | — | N/A | note-only: "solo entity, no intra-group" |
| B_02.02 Smluvní ujednání (služba) | 1 row per asset↔vendor link (`VAD_N`) | **none** (every VAD row, unconditional) | `Contract ref=10!I`, `LEI=P_LEI`, `Provider ID/type=XLOOKUP(vendor→07.idk/typ_idk)`, `Function id=XLOOKUP(asset→04.proc_id)→XLOOKUP(process→03.fkod)`, `Type of service=10!G`, `Start/End=vendor's contract dates`, `CIF?=10!M`, then 8 fields (notice periods, governing law, provisioning country, storage/location/sensitiveness/reliance) **only populated `IF(CIF="Ano")`**, else blank |
| B_03.01 Podepisující subjekt | 1 row per contract | `08!K="Ano"` | `ref=08!B`, `LEI=P_LEI` |
| B_03.02 Podepisující poskytovatel | 1 row per contract | `08!K="Ano"` | `ref=08!B`, `ID kód/typ=XLOOKUP(contract vendor→07.idk/typ_idk)` |
| B_03.03 Skupinové poskytování | — | N/A | note-only |
| B_04.01 Subjekty využívající službu | 1 row per contract | `08!K="Ano"` | `ref=08!B`, `LEI=P_LEI`, `Povaha="not a branch"`, branch code blank |
| B_05.02 Dodavatelský řetězec | rank-1 rows: 1 per VAD link (unconditional); rank-2+ rows: 1 per 09-row | none / none | rank-1: `Contract ref/Type/Provider=10!I/G/vendor`, `Rank=1`, recipient blank; rank-2+: `ref=09.contract ref`, `Type=09.Skod`, `Provider=09.subcontractor via XLOOKUP`, `Rank=09.I`, `Recipient=09.nadřazený poskytovatel via XLOOKUP` |
| B_07.01 Posouzení služeb IKT | 1 row per VAD link (`VAD_N`) | none | `Substitutability=cz2en(MapSubst, vendor.subst)`, `Reason=cz2en(MapDuvod, vendor.duvod_subst)`, `Date of last audit=vendor.audit` else `9999-12-31`, `Exit plan="Yes" if stav∈{Schválen,Testován,K revizi}`, `Reintegration=cz2en(MapReint,...)`, `Impact of discontinuing=cz2en(MapDopad, vendor.dopad_sluzby)`, `Alternative providers=cz2en(MapAlt, vendor.alt_posk)`, `Alternative name=vendor.alt_nazev` |

**Important asymmetry to preserve exactly**: the per-**arrangement** blocks
(B_02.01/B_02.03/B_03.*/B_04.01) are gated by the contract's `08!K` ("Služba
IKT v rozsahu RoI") flag; the per-**service** blocks derived from VAD
(B_02.02/B_05.02 rank-1/B_07.01) are **not** gated by that flag at all —
every asset↔vendor link becomes an output row regardless of whether its
underlying contract is flagged in RoI scope.

**B_99.01** (interior definitions, not an official ITS table — rendered as
narrative rows in `01_Metodika` §6, `seed.py:359-374`): 7 entries, each
`(official field, chosen value, internal justification text)` — e.g.
`Criticality assessment (B_06.01.0060) / Yes / "Funkce splňuje interní CIF
pravidlo (třída Kritická, MTPD ≤ 4 h, dopad = 5, nebo override ze zdrojového
CIF)."` — this is documentation of *why* a given value was chosen, not a
computed table.

---

## 5. Validation / DQ rules (`15_Kontroly_kvality`, `sheets_out.py:352-547`)

52 checks (`DQ-01`..`DQ-52`). Every check has the same shape: column D =
live `SUMPRODUCT`/`COUNTIF` formula counting violating rows; column E
("Práh") is a **literal 0 for all 52 checks** (`ws[f"E{r}"] = 0`,
`sheets_out.py:569`); column F = `"NÁLEZ"` (finding) if `D>E` else `"OK"`.
`build_expected.json` gives the exact live-recalculated count for each
check against the shipped seed data (quoted in the "Seeded value" column
below) — these are the assertions gate 3 checks after a LibreOffice
recalculation, i.e. they are exact and must reproduce identically in any
faithful re-implementation of the rules over the same seed data.

| ID | Area | Check | Formula (as written, sheet vars resolved) | Sev | Seeded value |
|---|---|---|---|---|---|
| DQ-01 | Procesy | Proces bez vlastníka | `COUNTIFS(03.l1<>"", 03.vlastnik="")` | Vysoká | 0 |
| DQ-02 | Procesy | GAP: RTO > MTPD | `COUNTIF(03.kontrola_rto,"GAP*")` | Vysoká | 0 |
| DQ-03 | Procesy | CIF proces bez navázaného aktiva | `SUMPRODUCT((03.cif="Ano")*(03.aktiva_n=0))` | Kritická | 35 |
| DQ-04 | Procesy | Proces bez ohodnocení dopadů (bootstrap) | `SUMPRODUCT((03.l1<>"")*(03.skore=""))` | Střední | 148 |
| DQ-05 | Procesy | CIF proces bez BCM evidence | `COUNTIF(03.kontrola_bcm,"GAP*")` | Vysoká | 3 |
| DQ-06 | Aktiva | Aktivum bez jakéhokoli vlastníka | `SUMPRODUCT((04.nazev<>"")*(bus_vlastnik="")*(ict_vlastnik=""))` | Vysoká | 0 |
| DQ-07 | Aktiva | Primární proces aktiva chybí ve vazbách (05) | `SUMPRODUCT((04.id<>"")*(h_par=0))` | Vysoká | 0 |
| DQ-08 | Aktiva | Kritické aktivum bez identifikovaného rizika | `SUMPRODUCT((vysledna="Kritická")*(h_rizika=0))` | Kritická | 65 |
| DQ-09 | Aktiva | Záznam aktiva k revizi | `COUNTIF(04.stav_revize,"K revizi")` | Střední | 36 |
| DQ-10 | Aktiva | Legacy aktivum bez posouzení rizika | `SUMPRODUCT((legacy="Ano")*(legacy_posl=""))` | Vysoká | 0 |
| DQ-11 | Vazby | Duplicitní vazba proces–aktivum | `COUNTIF(05.dup,"DUPLICITA")` | Střední | 0 |
| DQ-12 | Vazby | Duplicitní vazba aktivum–dodavatel | `COUNTIF(10.dup,"DUPLICITA")` | Střední | 0 |
| DQ-13 | Vazby | Vazba na neexistující ID (05) | `SUMPRODUCT((05.procID<>"")*(procExists=0)) + SUMPRODUCT((05.aktID<>"")*(aktExists=0))` | Vysoká | 0 |
| DQ-14 | Vazby | CIF vazba bez míry závislosti (B_02.02.0180) | `SUMPRODUCT((10.assetCIF="Ano")*(10.aktID<>"")*(10.mira="" ))` | Střední | 0 |
| DQ-15 | Vazby | Přímá vazba (11) bez revize v 10 | `SUMPRODUCT((11§1.vendorID<>"")*(pomocná revize v 07=0))` | Střední | 358 |
| DQ-16 | Dodavatelé | Kritický/Významný dodavatel bez ID kódu | `SUMPRODUCT(((tier="Kritický")+(tier="Významný"))*(idk=""))` | Vysoká | 25 |
| DQ-17 | Dodavatelé | Kritický dodavatel bez funkčního exit plánu | `SUMPRODUCT((tier="Kritický")*(exit<>"Schválen")*(exit<>"Testován")*(exit<>"K revizi"))` | Kritická | 25 |
| DQ-18 | Dodavatelé | Kritický/Významný bez ex-ante posouzení | `SUMPRODUCT(((tier="Kritický")+(tier="Významný"))*(ea_datum=""))` | Vysoká | 25 |
| DQ-19 | Dodavatelé | Kritický bez průběžného rizika (čl. 9(3)) | `SUMPRODUCT((tier="Kritický")*(h_rizika=0))` | Vysoká | 25 |
| DQ-20 | Rizika | Vysoké/kritické čisté riziko bez akčního plánu | `SUMPRODUCT(((pasmo_ciste="Vysoké")+(="Kritické"))*(stav<>"Akceptováno")*(stav<>"Uzavřené")*(termin=""))` | Kritická | 0 |
| DQ-21 | Rizika | Akceptace nad toleranci bez schválení/odůvodnění | `SUMPRODUCT((odezva="Akceptace")*(vs_tolerance="NAD TOLERANCI")*((akc_schval="")+(akc_oduv="")+(akc_datum="")>0))` | Kritická | 0 |
| DQ-22 | Rizika | Přezkum akceptace po termínu (>12 měsíců) | `SUMPRODUCT((prezkum_do<>"")*(prezkum_do<P_RefDatum))` | Vysoká | 0 |
| DQ-23 | Rizika | Posouzení rizika po termínu | `SUMPRODUCT((pristi<>"")*(pristi<P_RefDatum))` | Vysoká | 0 |
| DQ-24 | Integrita | Duplicitní ID v registrech | `SUMPRODUCT(--(N(03.dup)>1)) + SUMPRODUCT(--(N(04.h_dup)>1)) + SUMPRODUCT(--(N(07.h_dup)>1))` | Kritická | 0 |
| DQ-25 | Integrita | Konzistence odvozených vazeb (11) | `= 11!TotalPairs - COUNTIF(11§2.ID_procesu, "?*")` | Kritická | 0 |
| DQ-26 | Integrita | Chybové buňky ve vzorcích | sum of `ISERROR(...)` across all live-formula ranges on every sheet | Kritická | 0 |
| DQ-27 | Aktiva | GDPR relevance chybí/Neurčeno | `SUMPRODUCT((04.id<>"")*((gdpr="")+(gdpr="Neurčeno")))` | Střední | 0 |
| DQ-28 | Aktiva | AI relevance chybí/Neurčeno | analogous, on `ai` | Střední | 0 |
| DQ-29 | Aktiva | Neúplné hodnocení CIAA (C/I/A/Au) | `SUMPRODUCT((id<>"")*(((C="")+(I="")+(A="")+(Au=""))>0))` | Střední | 182 |
| DQ-30 | Aktiva | Neúplné hodnocení business dopadů | analogous, on `d_klient/d_reg/d_provoz/d_fin` | Střední | 183 |
| DQ-31 | Aktiva | Nekonzistence: cif="Ano" ale cif_pocet=0 | `SUMPRODUCT((cif="Ano")*(cif_pocet=0))` | Kritická | 0 |
| DQ-32 | Dodavatelé | Kritický/Významný bez hlavní smlouvy | `SUMPRODUCT(((tier="Kritický")+(tier="Významný"))*(sml_ref=""))` | Vysoká | 25 |
| DQ-33 | Aktiva | Internet-exposed aktivum bez úplného CIAA | `SUMPRODUCT((internet="Ano")*((C="")+(I="")+(A="")+(Au="")>0))` | Vysoká | 0 |
| DQ-34 | Aktiva | AI-relevantní aktivum bez vlastníka | `SUMPRODUCT((ai="Ano")*(bus_vlastnik="")*(ict_vlastnik=""))` | Vysoká | 0 |
| DQ-35 | Aktiva | GDPR aktivum s C pod prahem (P_GdprMinC) | `SUMPRODUCT((gdpr="Ano")*((C="")+((C<>"")*(C<P_GdprMinC))>0))` | Vysoká | 87 |
| DQ-36 | Aktiva | SPOF aktivum bez revize záznamu | `SUMPRODUCT((spof="Ano")*(stav_revize<>"Zkontrolováno"))` | Vysoká | 0 |
| DQ-37 | Vazby | Podezřelý směr závislosti aktiv | `SUMPRODUCT((06.levelJ<>"")*(levelK<>"")*(levelK<levelJ))` | Střední | 0 |
| DQ-38 | Vazby | Chyba v řetězci subdodávek | `COUNTIF(09.K,"CHYBA ŘETĚZCE")` | Vysoká | 0 |
| DQ-39 | Smlouvy | Dodavatel se smlouvami bez právě jedné hlavní | `SUMPRODUCT((07.h_smluv>0)*(h_hlavni<>1))` | Vysoká | 0 |
| DQ-40 | Vazby | Vazba na neexistující ID (06/08/09) | union of 5 existence-check SUMPRODUCTs across 06/08/09 | Vysoká | 0 |
| DQ-41 | Dodavatelé | Dodavatel s vazbami bez evidované smlouvy | `SUMPRODUCT((h_smluv=0)*((aktiva_n>0)+(proc_n>0)>0))` — over the set of **all distinct vendors appearing in `vpd_direct` pairs** | Vysoká | 29 |
| DQ-42 | Smlouvy | Subdodávka na smlouvě mimo rozsah RoI | `COUNTIF(09.pomocný rozsah RoI,"Ne")` | Střední | 0 |
| DQ-43 | Procesy | Proces bez vlastnického útvaru | `SUMPRODUCT((03.l1<>"")*(utvar=""))` | Střední | 64 |
| DQ-44 | Aktiva | Aktivum bez vlastnického útvaru | `SUMPRODUCT((04.nazev<>"")*(utvar=""))` | Střední | 19 |
| DQ-45 | Vazby | Vazba proces–aktivum bez posouzeného významu | `SUMPRODUCT((05.procID<>"")*((vyznam="")+(vyznam="Neposouzeno")))` | Střední | 1000 |
| DQ-46 | Aktiva | Aktivum bez klasifikace dat | `SUMPRODUCT((nazev<>"")*((klasdat="")+(klasdat="Neposouzeno")))` | Střední | 182 |
| DQ-47 | Aktiva | Vysoce důvěrná data s C pod prahem | `SUMPRODUCT((klasdat="Vysoce důvěrná / regulovaná data")*((C="")+((C<>"")*(C<P_GdprMinC))>0))` | Vysoká | 0 |
| DQ-48 | Aktiva | Aktivum bez modelu nasazení | `SUMPRODUCT((nazev<>"")*((model="")+(model="Neposouzeno")))` | Střední | 182 |
| DQ-49 | Dodavatelé | Kritický/Významný bez exit plánu v řádném stavu | `SUMPRODUCT(((tier="Kritický")+(tier="Významný"))*(exit∉{Návrh,Schválen,Testován,K revizi}))` | Vysoká | 25 |
| DQ-50 | Dodavatelé | Kritický/Významný s nezahájenou due diligence | `SUMPRODUCT(((tier="Kritický")+(tier="Významný"))*(dd_stav∈{"","Nezahájeno","Neposouzeno"}))` | Vysoká | 25 |
| DQ-51 | Aktiva | Rozpor: GDPR aktivum s "Bez dat"/"Veřejná data" | `SUMPRODUCT((gdpr="Ano")*((klasdat="Bez dat / nerelevantní")+(klasdat="Veřejná data")>0))` | Vysoká | 0 |
| DQ-52 | Dodavatelé | Kritický/Významný bez posouzené významnosti outsourcingu | `SUMPRODUCT(((tier="Kritický")+(tier="Významný"))*(vyz_vysledek="Ne"))` | Vysoká | 26 |

**Observed grouping**: DQ-01/02/05/43 (Procesy), DQ-06/07/08/09/10/27–31/33–36/44/46–48/51
(Aktiva — the largest cluster, 20 checks), DQ-11–15/37/40/45 (Vazby, 8
checks), DQ-16–19/32/39/41/49/50/52 (Dodavatelé, 9 checks), DQ-20–23
(Rizika, 4), DQ-24/25/26/31 (Integrita/cross-cutting, structural — should
never fire), DQ-38/42 (Smlouvy/Subdodávky, 2).

DQ-24/25/26/31/37 are **structural self-checks** on the workbook's own
formula integrity (duplicate IDs, derived-cascade row-count consistency,
`#REF!`/`#NAME?` cells, CIF/count inconsistency, dependency-direction
sanity) — they are expected to read 0 forever in a correctly-implemented
system; if any of them fire, that indicates a bug in the derivation
implementation itself, not a data-quality gap for business users to fix.

---

## 6. Config constants (`02_Číselníky`, `seed.py:60-88`)

**Numeric/threshold parameters (`PARAMS`)**:

| Name | Value | Meaning |
|---|---|---|
| `P_KritSkore` | 16 | Process class "Kritická": score ≥ |
| `P_VysSkore` | 12 | Process class "Vysoká": score ≥ |
| `P_StrSkore` | 8 | Process class "Střední": score ≥ |
| `P_MTPDKrit` | 4 | MTPD (h) ≤ for critical speed-bonus |
| `P_MTPDStr` | 24 | MTPD (h) ≤ for medium speed-bonus |
| `P_BonusKrit` | 5 | MTPD bonus, critical |
| `P_BonusStr` | 3 | MTPD bonus, medium |
| `P_BonusDef` | 1 | MTPD bonus, default |
| `P_AktNizka` | 2 | Asset score ≤ → Nízká |
| `P_AktStredni` | 3 | Asset score ≤ → Střední |
| `P_AktVysoka` | 4 | Asset score ≤ → Vysoká (else Kritická) |
| `P_RizStr` | 15 | Risk band Střední from (gross/net ≥) |
| `P_RizVys` | 40 | Risk band Vysoké from |
| `P_RizKrit` | 80 | Risk band Kritické from |
| `P_Tolerance` | 39 | Net-risk tolerance ceiling — **default, requires board approval per DORA art. 6(8)(b)** |
| `P_VKProc` | 4 | Materiality: equity-capital impact > (%) — **documentary only, not wired to any live formula** (see §8) |
| `P_Vypadek` | 24 | Materiality: outage > (h) — **documentary only** (see §8) |
| `P_GdprMinC` | 3 | GDPR asset: minimum confidentiality (C) ≥ — proposal, pending MŘR sign-off |

**Text parameters (`PARAM_TXT`)**: `P_Verze="1.0"` (methodology version —
**not** wired to the `VerzeMet` enum list, see §8); `P_Entita="Slavia
pojišťovna a.s."`; `P_LEI="LEI-DOPLNIT"` (placeholder, must be filled before
submission).

**Date parameters (`PARAM_DATE`)**: `P_RefDatum="2026-07-03"` (reference
date for EOL/deadline checks); `P_RoIDatum="2026-12-31"` (RoI as-of date).

All 23 parameters are Excel-defined-names bound to single cells on
`02_Číselníky` (`U.define_name`, `sheets_core.py:39,49,60`) — every formula
in the workbook that references e.g. `P_Tolerance` reads the live cell, so
changing one parameter value recomputes the entire workbook (this is the
mechanism behind the Metodika sheet's `live=True` narrative cells, which
literally concatenate the current parameter value into explanatory prose).

---

## 7. Seeded reference data / source profile

### 7.1 Source provenance counts (`source_data.json.profile`, produced by `prep_source.py`)

| Metric | Value |
|---|---|
| Total raw rows read | 1959 |
| Provider-category rows (→ 29 candidates) | 448 |
| "k ověření" review-queue rows | 48 |
| Dropped rows (business/physical asset categories) | 30 |
| Deduplicated process↔asset link rows (VPA) | 1000 |
| Canonical processes | 148 |
| Canonical assets | 183 |
| Vendor candidates | 29 |
| Direct process↔vendor pairs | 358 |
| Processes flagged CIF/Kritická at import | 79 (`kdf_processes`) |
| Processes/assets with no owner | 0 / 0 |
| Assets with a naming/owner conflict | 36 |
| Assets with a BIA aggregate criticality | 183 (100 %) |
| Assets where BIA upgraded the criticality vs. the rough source mapping | 51 |

Cross-checked against `build_expected.json`: `n_kdf=79` CIF processes,
`n_krit_vendors=26` (25 candidates + BIZ DATA), `n_risks=8`,
`pairs_total=106` derived process↔vendor pairs, `veris_id="AKT-006"`.

### 7.2 Curated overlays (`seed.py:235-254`)

- **`VERIS_OVERLAY`** — the one asset with a full curated RTS-grade record:
  `popis, umisteni, bus/ict vlastník, C=I=A=Au=5, klient=reg=5, nahr=5,
  zavis=4, internet=Ne, stav=V provozu, typ=Aplikace, uroven=A – primární,
  klasdat=Vysoce důvěrná / regulovaná data, nasazeni=On-premise`.
- **`BIZ_DATA`** — the one vendor with a full curated record: legal
  identity, `sml=SML-2020-001` (Rámcové/master, 2020-01-01→9999-12-31,
  180/180-day notice, CZ law, 4 500 000 CZK/yr), data/location fields,
  `citlivost=Vysoká, subst=Nenahraditelný, duvod=Obojí`, 9-field ex-ante
  block (8×OK, 1×Riziko), `exit=K revizi, reint=Velmi složitá,
  dopad=Vysoký, alt=Ne, ctpp=Ne`, `faze=Průběžná, dd=Dokončeno s
  výhradami`.

### 7.3 `THREATS` — 16 curated catalog entries (`seed.py:256-289`)

Each is `(name, category, description, typical vulnerabilities, relevant
subject-type)`. Names: Ransomware/malware; Výpadek datového centra; Selhání
zálohy/obnovy; Únik dat/neoprávněný přístup; DDoS útok; Phishing/BEC;
Zneužití interním uživatelem; Výpadek/selhání dodavatele; Koncentrační
riziko IKT; Chybná změna/release; Zastaralý systém bez podpory; Selhání
integrace/rozhraní; Ztráta klíčových osob; Výpadek cloudové služby; Chyba
integrity dat; Fyzická událost (požár, povodeň).

### 7.4 `RISKS` — 8 curated risk records (`seed.py:314-357`)

5 asset risks (veris, e-mail, lan/internet, vpn, doménový server), 2 vendor
risks (both `__bizdata__`, one accepted-above-tolerance with a full
board-level acceptance rationale), 1 process risk (Regulatorní
reporting/DORA reporting). This is the entirety of the seeded risk
register; `RIZ_N=300` leaves 292 open rows.

---

## 8. Gaps, ambiguities & unused artifacts (things a re-implementer must decide, not copy)

1. **`P_VKProc` (equity-impact %) and `P_Vypadek` (outage hours) are purely
   documentary.** Confirmed by exhaustive grep: both appear only inside
   Metodika narrative-text formulas (`sheets_out.py:1167,1342`) and are never
   read by any formula that gates `13_Rizika!mat_dopad`/`mat_vypadek`. Those
   two materiality flags are 100% manual Ano/Ne judgment calls — a web app
   that "helpfully" auto-derives them from financial/outage figures would
   diverge from the source system's actual behavior.
2. **`P_Verze` (methodology version, "1.0") is disconnected from the
   `VerzeMet` enum** (`ENUMS["VerzeMet"] = ["1.0"]`, `seed.py:136`). Each risk
   row's `verze_met` is seeded from the literal string `"1.0"`
   (`sheets_vendors.py:738`), not from the `P_Verze` cell. If the methodology
   version parameter is ever bumped, the enum list and the per-row seed value
   must be updated by hand in three separate places; nothing recomputes them.
3. **"Významný dodavatel" is unreachable under the shipped seed data.** All
   29 provider-candidate rows lack any `10_VAD` link and any `subst` value,
   so `h_rank=0` and no S17-19 match is possible — every candidate resolves
   to either "Kritický dodavatel" (25, via a direct process link) or falls
   through to "Standardní dodavatel" (4). This tier only activates once a
   human enters linking/substitutability data — worth a reproduction-fidelity
   test case (seed data that actually produces "Významný").
4. **`IMP_N = len(SRC["mirror"])` (`seed.py:33`) is defined but never used
   anywhere else in the codebase** (confirmed by grep across all `.py`
   files) — likely a vestige of an earlier version's "import mirror" sheet
   that no longer exists in the current 19-sheet layout. The 1959-row
   `mirror` array itself is written into `source_data.json` but never
   rendered into any built sheet.
5. **The 48-row "k ověření" (to-be-verified) review queue
   (`SRC["review"]`) is loaded and capacity-checked
   (`build.py:170: "review queue capacity"`) but never surfaced in the
   workbook** — it exists only as a provenance/compaction statistic quoted
   in `README.md`. A web app importing the same raw source would need an
   independent decision about what to do with this queue; the reference
   builder simply discards it beyond the workbook boundary.
6. **The "primary process" selection for each asset is a one-time,
   build-time Python decision, not a live rule.** `prep_source.py:157-165`
   picks the highest-`crit_rank` process an asset was mapped to in the
   source data, with ties broken by source-row iteration order (Python
   dict insertion order) — this is a **stable but not semantically
   motivated** tie-break (e.g., not "most recent," not alphabetical). If
   asset-to-process mappings change, this "primary" choice does not
   recompute; the `proc_id` field is an ordinary (if pre-filled) input cell.
7. **`08_Smlouvy!S` (Řetězec subdodávek display) hardcodes exactly 2
   subcontracting tiers** (rank 2 and rank 3 via `TEXTJOIN`,
   `sheets_vendors.py:276-282`), while the underlying rank formula on
   `09_Subdodávky!I` can recurse to arbitrary depth. A web UI should decide
   whether to keep this 2-tier display cap or generalize it.
8. **RoI gating asymmetry (§4) is deliberate, not a bug**: contract-level
   B_02.01/B_03.x/B_04.01 blocks respect `08!K` ("v rozsahu RoI"), but the
   service-level blocks derived from `10_VAD` (B_02.02, B_05.02 rank-1,
   B_07.01) do not filter on that flag at all. Must be reproduced exactly
   as asymmetric, not "fixed" into a uniform gate.
9. **Two independently-maintained closed lists can drift**: `TierDod`
   enum (`seed.py:137`, generic "3 supplier tier" list) exists separately
   from the live-computed `tier` field's actual output strings — they
   currently match, but nothing enforces that a future edit to one updates
   the other.
10. **`d_rep` (reputational impact) is entered on 03_Procesy but consumed
    nowhere** — confirmed the only matches for the token are its own
    header/definition/validation-range. It exists purely for human
    reporting/discussion; a faithful port must NOT fold it into the process
    score or CIF logic, even though it visually sits beside the other 4
    impact axes in the same UI block.

---

## Appendix: exact Czech ⇄ field-key quick index

For the four wide registers, the field **key** (used throughout this
document and matching the Python source) is the only stable identifier —
Excel column letters shift between the "old" (pre-v6) and "new" (block)
layouts via `PROC_O2N` / `AKT_O2N` / `DOD_O2N` / `RIZ_O2N`
(`seed.py:460,520,598,642`). Do not key any implementation off a column
letter appearing in this document or in the source; always use the field
key (e.g. `tier`, `vysledna`, `cif_ret`, `h_rank`).
