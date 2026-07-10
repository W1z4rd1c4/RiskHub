# ICT Register cutover record (issue #53)

**RiskHub is now the system of record for the DORA ICT operational-resilience
register. The source workbook is retired as a source of truth and is kept as
a read-only historical reference at its external path — it is never committed
to this repository and is never read by the runtime.**

This record documents the one-time, out-of-runtime cutover import: what was
imported, from which workbook version, when, through which code path, the
parameter derivations, the idempotency proof, and the full fidelity
characterization against the workbook's documented profile.

## 1. Source provenance

| Item | Value |
|---|---|
| Workbook | `DORA_registr_aktiv_a_dodavatelu.xlsx` **v6 (2026-07-07)**, 19 sheets, 1 058 390 bytes, modified 2026-07-07 15:31 |
| External path (read-only, NEVER committed) | `/Users/stefanlesnak/Antigravity/Personal Assistant/exports/dora-registr-aktiv-2026/` |
| Workbook SHA-256 | `29a364885cc7d1c1abbc389a988cc85487f5b081d63f75051478e27a78d4bf04` |
| Machine-readable source actually read | the workbook **builder's data module** — `builder/seed.py` + `builder/source_data.json` — never the xlsx |
| `builder/seed.py` SHA-256 | `9b635405b06668a45253a9bd5e977158a81ea23e6b391b94c048af89fd086110` |
| `builder/source_data.json` SHA-256 | `0508dcd986d4780965ca3ea0f2f2b6fe97e58412c439ced8bbccffdd9f2c0d91` |
| Expected profile | `builder/build_expected.json` SHA-256 `58d66b14227ee5dbb39e036c9ebce0a5a675826ca717bb394c993453284ab242` |
| Import executed | **2026-07-10**, scratch PostgreSQL 16.13 (`riskhub_ict` @ 127.0.0.1:5433), branch `dora` @ `dd8ffe06` + this change |
| Import actor | `risk.manager@riskhub.local` (seeded risk-manager, the #38 maintenance role); every row create/update is on the audit trail under this actor |

The workbook binary was never opened: the builder generated the workbook FROM
these data structures, so they are the authoritative machine-readable form.
No xlsx parsing occurs anywhere in the importer. The builder module's single
`openpyxl.utils.get_column_letter` import (used only for layout dicts the
importer ignores) is satisfied by the environment's module when present —
openpyxl 3.1.5 exists in the backend *dev* venv as a test dependency; the
runtime ban on Excel emission/ingestion is untouched — and otherwise by a
pure, characterization-tested stub
(`backend/scripts/_ict_register_import_helpers.py::get_column_letter`), so
the import also runs on a clean environment without openpyxl.

## 2. Code path

- **Importer**: `backend/scripts/import_ict_register_workbook.py` — one-time,
  out-of-runtime CLI (`--source <external dir>`, requires an explicit
  `DATABASE_URL`). No in-app upload endpoint exists or was introduced.
- **Service layer only**: every row goes through the production lifecycle
  functions with a real session and the authorized import user —
  `create/update_vendor_detail`, `create/update_vendor_contract_detail`,
  `create/update_process_detail`, `create/update_asset_detail`,
  `add_asset_process_link`/`update_asset_process_link`,
  `add_asset_vendor_link`, `add_process_vendor_link`,
  `create/update_threat_detail`, `create_risk_detail`/`update_risk_detail`,
  `add_risk_threat_link`, `add_risk_asset_link`, `add_risk_process_link`,
  `link_vendor_target(kind="risk")`. Closed lists are therefore enforced at
  the same API-grade validation the UI uses; every mutation is audited.
- **Idempotent upsert-by-natural-key** (the `seed_e2e_ict_register` pattern):
  Process `(l0_area, l1_process, l2_subprocess)` — l1 alone is NOT unique in
  the workbook (33 duplicated l1 names); Asset `name`; Vendor `name`;
  Contract `(vendor, contract_reference)`; links by their identity pairs/
  triples; Threat `name`; Risk `risk_id_code` (`RIZ-001`…`RIZ-008`).
  A failed run leaves no *terminal* partial state: re-running converges
  (second run created=0, below), which is the one-shot guard.
- Anything the service layer rejects is a **reported data finding**, never a
  silent skip. The live run produced **zero** findings.

## 3. What was imported (first run, 2026-07-10)

| Register (workbook sheet) | created | updated | unchanged |
|---|---:|---:|---:|
| Parameter overlay (`global_config`) | 0 | 4 | 0 |
| Vendors (07_Dodavatelé) — BIZ DATA full record + 29 faithful DOD stubs | **30** | 0 | 0 |
| Contracts (08_Smlouvy) — SML-2020-001 | **1** | 0 | 0 |
| Sub-outsourcing (09_Subdodávky) — ships empty | 0 | – | – |
| Processes (03_Procesy) | **148** | 0 | 0 |
| Assets (04_Aktiva) | **183** | 0 | 0 |
| Process↔Asset links (05, significance `Neposouzeno`) | **1000** | 0 | 0 |
| Asset↔Asset links (06) — ships empty | 0 | – | – |
| Asset↔Vendor links (10) — Veris→BIZ DATA S02 + S14 | **2** | 0 | 0 |
| Process↔Vendor §1 links (11, note `k revizi`) | **358** | 0 | 0 |
| Threats (12_Hrozby) | **16** | 0 | 0 |
| Risks (13_Rizika) | **8** | 0 | 0 |
| Risk link relations (threat/subject) | **16** | 0 | 0 |
| **Total rows created** | **1762** | | |

Every asset received exactly one primary-Process designation on its 05 link
(183 `is_primary` rows — the workbook's build-time pick, now the live
user-controlled attribute per #38). RoI F-codes were assigned by the service
layer as `F{id}`; on the cutover database they coincide with the workbook's
row-based `F1`…`F148`. (On a database whose `processes` ids do not start at
1 they would not coincide — F-codes are stable unique identifiers, not
workbook-value-locked, per the #38 RoI surface decision.)

### Re-run proof (idempotency / one-shot guard)

Second run, same command, immediately after the first — exit 0:

```
parameter overlay (global_config): created=0, updated=0, unchanged=4
vendors (07):                      created=0, updated=0, unchanged=30
contracts (08):                    created=0, updated=0, unchanged=1
processes (03):                    created=0, updated=0, unchanged=148
assets (04):                       created=0, updated=0, unchanged=183
process-asset links (05):          created=0, updated=0, unchanged=1000
asset-vendor links (10):           created=0, updated=0, unchanged=2
process-vendor §1 links (11):      created=0, updated=0, unchanged=358
threats (12):                      created=0, updated=0, unchanged=16
risks (13):                        created=0, updated=0, unchanged=8
risk links (13):                   created=0, updated=0, unchanged=16
TOTAL created: 0
```

## 4. Parameter cutover (ADR-008 config overlay)

All 23 workbook parameters were cross-checked against the app's seeded
registry (`_ict_register_reference/parameters.py`): **19 match verbatim** and
stay at their seeded defaults (including `P_RefDatum=2026-07-03`,
`P_Entita`, `P_LEI=LEI-DOPLNIT`). The four risk-band parameters CANNOT be
used verbatim — #50's finding: the workbook's 13_Rizika scores live on a
three-factor 1-125 scale (`hrubé = hodnota_subjektu(≤5) × zranitelnost(≤5) ×
pravděpodobnost(≤5)`), while the app's `Risk.net_score` is two-factor 1-25
(`probability × impact`). Defaults 40/80 are unreachable on 1-25.

**Proportional derivation** (scale factor 25/125 = exactly 1/5), applied as
`global_config` overrides in category `ict_register_parameters` (the seeded
row is authoritative per the ADR-008 pattern; code defaults untouched):

| Parameter | Workbook (1-125) | App override (1-25) | Derivation |
|---|---:|---:|---|
| `P_RizStr` (Střední from) | 15 | **3** | 15 × 1/5 — exact |
| `P_RizVys` (Vysoké from) | 40 | **8** | 40 × 1/5 — exact |
| `P_RizKrit` (Kritické from) | 80 | **16** | 80 × 1/5 — exact |
| `P_Tolerance` (net ≤ tolerance) | 39 | **7** | floor(39 × 1/5) = 7.8→7 — a *ceiling* must floor: the workbook's 39 sits just under the Vysoké floor (40), so "within tolerance ⇔ below the Vysoké band" is the semantic invariant; rounding up to 8 would flip workbook-flagged scores (40 ⇔ 8) to within-tolerance |

Band floors scale to exact integers (asserted in code — a non-integer floor
aborts the import for a PM decision). Derivation implemented and
characterization-tested in `backend/scripts/_ict_register_import_helpers.py`
(`scale_risk_band_thresholds`) and
`tests/backend/pytest/test_ict_register_import_helpers.py`.

## 5. Risk mapping (13_Rizika → the app Risk, per the #50 dispositions)

Scores are computed at import time from the **live derived register** —
exactly how the workbook's XLOOKUPs read its live derived columns:
`hodnota_subjektu` comes from the subject's engine-derived class/tier
(Aktivum → resulting criticality, Proces → criticality class, Dodavatel →
tier: Kritický=5/Významný=4/else 2), then the verbatim workbook formulas
produce hrubé/čisté on 1-125 (Excel half-away-from-zero rounding), and each
score is factored onto the app's two 1-5 axes **preserving the risk band and
the tolerance verdict exactly** (preferring the workbook's entered
pravděpodobnost as the probability factor).

| Code | Subject (derived class → E) | zran×prob, účinnost | Workbook hrubé/čisté (band) | App gross/net | Verdict |
|---|---|---|---|---|---|
| RIZ-001 | Aktivum Veris (Kritická → 5) | 3×3, 60 % | 45 / 18 (Vysoké / Střední) | 3×3=9 / 3×1=3 | V toleranci |
| RIZ-002 | Aktivum e-mail (Kritická → 5) | 4×4, 50 % | 80 / 40 (Kritické / Vysoké) | 4×4=16 / 4×2=8 | **NAD TOLERANCI** |
| RIZ-003 | Aktivum LAN/internet (Kritická → 5) | 3×2, 50 % | 30 / 15 (Střední / Střední) | 2×3=6 / 2×2=4 | V toleranci |
| RIZ-004 | Aktivum VPN (Kritická → 5) | 3×3, 50 % | 45 / 23 (Vysoké / Střední; Excel 22.5→23) | 3×3=9 / 3×2=6 | V toleranci |
| RIZ-005 | Aktivum doménový server (Kritická → 5) | 3×2, 50 % | 30 / 15 (Střední / Střední) | 2×3=6 / 2×2=4 | V toleranci |
| RIZ-006 | Dodavatel BIZ DATA (Kritický → 5) | 4×2, 50 % | 40 / 20 (Vysoké / Střední) | 2×4=8 / 2×2=4 | V toleranci |
| RIZ-007 | Dodavatel BIZ DATA (Kritický → 5) | 4×3, 20 % | 60 / 48 (Vysoké / Vysoké) | 3×4=12 / 3×3=9 | **NAD TOLERANCI, accepted** (full trio: MŘR + představenstvo, odůvodnění, 2026-06-30) |
| RIZ-008 | Proces DORA reporting (Nízká → 2) | 3×3, 30 % | 18 / 13 (Střední / Nízké) | 3×1=3 / 2×1=2 | V toleranci |

Field dispositions: `net=ciste` (band-preserving, above); the acceptance trio
maps to the #47 columns; entering the trio IS the "Akceptace" response and
the complete trio IS "Akceptováno" (per the #50 loader); every
entered-but-unmapped workbook column (kontroly, účinnost %, odezva, trigger,
fáze, poslední kontrola účinnosti, materialita VK/výpadek, datum posouzení,
vlastník, termín akčního plánu, stav) is preserved verbatim inside the
imported Risk's description, together with the original 1-125 scores.

**App-required fields absent from the workbook** (documented inventions,
constant and greppable): Vendor `process="ICT registr"`,
`vendor_type="ict"`, `outsourcing_owner_user_id=<import actor>`; Risk
`process="ICT registr"`, `subprocess="<subject type>: <subject>"`,
`name="<threat> — <subject>"`, `risk_type="operational"`. Vendor stub rows
carry exactly the workbook's three entered columns (name, výskyt →
`reference_occurrence_count`, procesy orientačně → `reference_process_count`)
plus those required fields — nothing else is invented.

## 6. Fidelity characterization (`--verify`, 2026-07-10)

Read-only pass through the service-layer loaders + derivation engine,
asserted against `builder/build_expected.json` and the source profile.

### Register and engine profile — all OK

| Assertion | Expected | Actual |
|---|---:|---:|
| Processes / Assets / Vendors / Contracts / Sub-outsourcing | 148 / 183 / 30 / 1 / 0 | ✅ identical |
| Links 05 / 06 / 10 / 11 §1 | 1000 / 0 / 2 / 358 | ✅ identical |
| Threats / ICT-linked Risks | 16 / 8 | ✅ identical |
| CIF processes (`n_kdf`) | 79 | **79** |
| Critical vendors (`n_krit_vendors`) | 26 | **26** |
| Critical-vendor **identity** (DOD-01 + the 25 `krit_candidates`) | exact set | ✅ exact set match |
| Derived §2 pairs (`pairs_total`) | 106 | **106** |
| Veris resulting criticality / CIF | Kritická / Ano | ✅ |
| BIZ DATA tier / main contract / country category | Kritický dodavatel / SML-2020-001 / ČR | ✅ |

### DQ profile — 51 of 52 checks exact

All 23 expected-non-zero checks reproduce exactly: DQ-03=35, DQ-04=148,
DQ-05=3, DQ-08=65, DQ-09=36, DQ-15=358, DQ-16/17/18/19=25, DQ-29=182,
DQ-30=183, DQ-32=25, DQ-35=87, DQ-41=29, DQ-43=64, DQ-44=19, DQ-45=1000,
DQ-46=182, DQ-48=182, DQ-49/50=25, DQ-52=26. All structurally-zero checks
read 0.

### 🔴 The one divergence — DQ-20 (expected 0, actual 1) — PM decision

`DQ-20 Vysoké/kritické čisté riziko bez akčního plánu` fires once, on
**RIZ-002** (net 8 = Vysoké, not accepted). **Root cause — data
representation, not engine behaviour**: the workbook's `termín akčního
plánu` column has **no column on the app's Risk** (a #50 disposition:
`action_plan_date` loads as `None` in production). In the workbook RIZ-002
carries `termin=2026-09-30`, so the workbook's DQ-20 reads 0; the app cannot
store that date (it survives only inside the imported description text), so
the verbatim check counts the row. Consequently the "checks with findings"
tally reads 24 vs the workbook's 23.

Deliberately **not** tuned away. Two honest resolutions, PM to choose:

1. **Accept as a live finding** — in the retired-workbook world the system
   of record genuinely has no machine-readable action plan for RIZ-002, so
   the finding is truthful and actionable (enter/track the action plan
   in-app once such a column ships).
2. **Add an action-plan date column to Risk** (app-code change, out of #53's
   scope by the concurrency brief) and re-run the import — the importer and
   this check would then read 0.

## 7. How the production cutover is run

```bash
cd backend
DATABASE_URL=postgresql+asyncpg://<prod-db>  SECRET_KEY=<prod> \
  ./venv/bin/python -m scripts.import_ict_register_workbook \
  --source "/Users/stefanlesnak/Antigravity/Personal Assistant/exports/dora-registr-aktiv-2026"
# re-run the same command: must print "TOTAL created: 0"
# then the one-time fidelity proof:
DATABASE_URL=... SECRET_KEY=... ./venv/bin/python -m scripts.import_ict_register_workbook \
  --source "..." --verify
```

Prerequisites: `alembic upgrade head` and `python -m app.db.seed` (the import
aborts if the risk-manager user or a diverging parameter default is found).
The scratch rehearsal recorded here used PostgreSQL 16.13 at 127.0.0.1:5433,
`alembic upgrade head` → `python -m app.db.seed` → import → import (created=0)
→ `--verify`, full logs captured during the run of 2026-07-10.

## 8. Retirement statement

As of this import, **the workbook is reference-only**. The register — its
entered rows, every derived value (criticality cascade, CIF, vendor tiers,
§2 expansion, RoI codes), and all 52 DQ checks — lives in RiskHub and is
maintained ONLY through RiskHub (user story #38/44: exactly one source of
truth). The workbook file remains at its external path for audit history; no
future data flows from it. Recurring imports are explicitly out of scope
(#38); this script remains in `backend/scripts/` as the documented record of
how cutover happened and as the `--verify` characterization tool.
