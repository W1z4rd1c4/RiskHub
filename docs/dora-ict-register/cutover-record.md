# ICT Register cutover record (issue #53)

**RiskHub is now the system of record for the DORA ICT operational-resilience
register. The source workbook is retired as a source of truth and is kept as
a read-only historical reference at its external path — it is never committed
to this repository and is never read by the runtime.**

This record documents the one-time, out-of-runtime cutover import: what was
imported, from which workbook version, when, through which code path, the
parameter derivations, the idempotency proof, and the full fidelity
characterization against the workbook's documented profile.

## Authoritative hardened certification (2026-08-11)

The authoritative atomicity, governed-policy-window, idempotency, transaction-
failure logging, and fidelity certification is the immutable issue #53
**candidate17** commit `10a88424e3f596c95ef0bd6c9118a114d348bbe0`
(tree `779d74afa35b64b867c7fefca55f9635bce5328d`, changed-path manifest
SHA-256 `5d29b99d1c0dd976ec125ad92fde5162692b7230b2456472e6907bb99a24ca7d`,
full-tree manifest SHA-256
`903f8664df9f34497e8ff4e6ae7c37a2d25266a6b07dd3cd0706f86b2237c7b1`,
and binary full-index patch SHA-256
`ee5aed31841eae117f00a62f0738b8e550dead6729d9300fd846bdf259c7657e`).
Its durable structured record is
[`cutover-evidence-2026-08-11-candidate17.json`](./cutover-evidence-2026-08-11-candidate17.json).
Candidate17 supersedes candidate13, candidate10, and the July scratch run as
release authority. Those earlier runs are historical only; the July sections
below remain useful descriptions of source mapping and the pre-hardening
fidelity investigation.

On fresh PostgreSQL 16.14 under Python 3.13.3, candidate17 passed the exact
six-file suite (`120 passed, 1 skipped`), PostgreSQL MVCC/fresh-target preflight
(`2 passed`), and completion-marker/digest/non-ICT collision negative contracts
(`7 passed`). Migration and canonical seed exited 0. The first authorized apply
created 1762 rows with no findings or approval requests, populated all 148
Process and 183 Asset accountability mappings, and restored all three protected
scenarios exactly. The identical second apply created 0 rows and left entity
counts unchanged. All eight cutover audits bind the exact synthetic-map SHA.
Both completion markers and a fresh direct read-only digest matched state
SHA-256
`fd0af8acc3f8bb6d1117758c9841f72d75b9e155751cd293525f3b07fc6bfe51`.
The map-backed read-only verification exited 0 with all 52 adjusted DQ checks
and all 22 expected/actual non-zero checks matching. Product logs were clean.

Any final release successor may differ from candidate17 only through four
evidence-document operations: this record and its folder-index link may change,
the candidate13-named JSON may be removed, and the candidate17 JSON may be
added. Every production, backend, script, test, architecture-lock, ADR,
security, manifest, accountability-map, and STRUCTURE blob must remain byte-
identical to candidate17.

The gate preserves three evidence-harness limitations without treating them as
product failures:

1. Dependency installation succeeded, but the first wrapper omitted its
   pipeline-status/footer evidence. The same fresh environment was validated
   with Python 3.13.3, `pip check`, and a complete freeze before tests.
2. A read-only input inventory guessed two nonexistent filenames. The correct
   paths came from candidate17's own manifest and every authoritative hash
   matched before product execution.
3. The first apply emitted about 928 KB of structured audit stdout. The product
   committed and emitted its terminal no-findings line, but the direct output
   budget ended the wrapper before separate exit/footer files were written.
   The product was not retried; persisted counts, four completion audits, the
   completion digest, exact scenario restoration, and the successful identical
   rerun independently prove completion.

## 1. Source provenance

| Item | Value |
|---|---|
| Workbook | `DORA_registr_aktiv_a_dodavatelu.xlsx` **v6 (2026-07-07)**, 19 sheets, 1 058 390 bytes, modified 2026-07-07 15:31 |
| External path (read-only, NEVER committed) | `<external-workbook-export>/` |
| Workbook SHA-256 | `29a364885cc7d1c1abbc389a988cc85487f5b081d63f75051478e27a78d4bf04` |
| Machine-readable source actually read | the workbook **builder's data module** — `builder/seed.py` + `builder/source_data.json` — never the xlsx |
| `builder/seed.py` SHA-256 | `9b635405b06668a45253a9bd5e977158a81ea23e6b391b94c048af89fd086110` |
| `builder/source_data.json` SHA-256 | `0508dcd986d4780965ca3ea0f2f2b6fe97e58412c439ced8bbccffdd9f2c0d91` |
| Expected profile | `builder/build_expected.json` SHA-256 `58d66b14227ee5dbb39e036c9ebce0a5a675826ca717bb394c993453284ab242` |
| Synthetic ICT Register accountability sidecar | [`ict-register-accountability-map.synthetic.json`](./ict-register-accountability-map.synthetic.json), 148 exact Process plus 183 exact Asset natural keys and source-owner provenance, SHA-256 `56eadf535139ce38815f1448c87b03b17faa46c44bb0057f385b5f2373e50a5a` |
| Historical pre-hardening import | **2026-07-10**, scratch PostgreSQL 16.13 (`riskhub_ict` @ 127.0.0.1:5433), branch `dora` @ `dd8ffe06` + this change |
| Authoritative hardened certification | **2026-08-11**, immutable candidate17 `10a88424e3f596c95ef0bd6c9118a114d348bbe0`; see the [structured evidence record](./cutover-evidence-2026-08-11-candidate17.json) |
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
  re-running converges (second run created=0, below), which remains the
  repeatability proof.
- **One composite transaction**: nested production-service transaction
  boundaries flush during the import, and only the outer named
  `ict_register_cutover_import` boundary commits after every phase completes.
  Any exception, cancellation/interruption, or reported finding rolls back the
  parameter overlay, register rows, links, and audit facts together. A run
  stops at its first finding before dependent phases, returns exit status 2,
  and leaves no imported state.
- **Explicit governed apply window**: apply mode is PostgreSQL-only and
  requires `--cutover-authorized-by <active-CRO-email>` plus
  `--authorization-reference '#53'` and the explicit digest-pinned
  `--accountability-map <path>`. The CRO must be active and distinct from
  the seeded Risk Manager actor. Before mutation, the importer accepts only a
  fresh target or an exact natural-key/parameter match for this manifest. It
  row-locks the three fixed protected scenarios, audits authorization and
  temporary suspension, restores their complete snapshots before the outer
  commit, records an append-only digest of every cutover-owned persisted field,
  and never creates approval requests. An exact re-run must match that digest,
  the synthetic-map digest, and the full state digest, so same-key field drift
  or a different accountability map is rejected before mutation. Read-only
  `--verify` does not require the CRO flags and never changes policy, but it
  does require and validate the same explicit map for fidelity.
- Anything the service layer rejects is a **reported data finding**, never a
  silent skip. The recorded live run produced **zero** findings.

## 3. What was imported (certified profile; hardened run 2026-08-11)

| Register (workbook sheet) | created | updated | unchanged |
|---|---:|---:|---:|
| Parameter overlay (`global_config`) | 0 | 0 | 4 |
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

### Synthetic Process and Asset accountability for the authorized demo cutover

The workbook carries presentation-only `owner` text, not canonical User or
Department identities. Issue #53 explicitly authorizes the committed synthetic
sidecar for this demo cutover. Every one of the 148 exact Process natural keys
and 183 exact Asset natural keys retains its original `source_owner` text in the
sidecar. All Process Owner assignments and all Asset Business Owner and ICT Owner
assignments map to the active, non-admin seeded Risk Manager
`risk.manager@riskhub.local`; every Owning Department maps to the active seeded
Risk Management Department (`code=RISK`). The importer resolves database IDs
from those stable identities and still calls the normal Process and Asset
service layers; no user, Department, approval request, schema, or runtime/API
bypass is created.

This mapping is synthetic accountability data. It is not evidence that the
seeded Risk Manager is the real accountable owner of every Process or Asset.
Because Process and Asset visibility and mutation authority can depend on
accountable ownership and Department scope, a production adoption must replace
it with approved real accountability data under separate governance. There is
no automatic fallback:
a missing, changed, incomplete, duplicate, extra, source-owner-drifted, or
identity-invalid map aborts before database mutation. The raw map digest is
recorded in authorization, suspension/restoration and completion audit facts;
the completion marker binds it to the full-state digest for exact re-runs.

The immutable `builder/build_expected.json` continues to describe findings in
the raw workbook. Read-only cutover verification derives a separate
post-enrichment expectation from that raw profile and the exact validated map:
all 148 Processes and 183 Assets receive an Owning Department, so raw DQ-43
`64` and DQ-44 `19` become `0` and `0`. DQ-20 is independent of the map. It
becomes `1` because RIZ-002 has app-scale net score `8` (High), while the Risk
model has no action-plan-date field; its workbook date is preserved in the
description but the DQ input correctly remains empty. This is the documented
model disposition and a valid post-import finding, not ownership enrichment.
The expected number of non-zero checks is recalculated from the complete
adjusted 52-check profile (`23 + 1 - 1 - 1 = 22`), never fixed separately.

## 6. Historical raw-profile characterization (`--verify`, 2026-07-10)

This section records the pre-hardening raw-workbook comparison that exposed the
DQ-20 representation decision. It is not the final hardened gate. The
authoritative 2026-08-11 map-backed verification derived the documented
post-enrichment profile, matched all 52 checks including DQ-20=1, DQ-43=0 and
DQ-44=0, matched the non-zero tally 22/22, and exited 0.

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
  --source "<external-workbook-export>" \
  --accountability-map "../docs/dora-ict-register/ict-register-accountability-map.synthetic.json" \
  --cutover-authorized-by "<active-independent-CRO-email>" \
  --authorization-reference '#53'
# re-run the same command: must print "TOTAL created: 0"
# then the one-time fidelity proof:
DATABASE_URL=... SECRET_KEY=... ./venv/bin/python -m scripts.import_ict_register_workbook \
  --source "..." \
  --accountability-map "../docs/dora-ict-register/ict-register-accountability-map.synthetic.json" \
  --verify
```

Prerequisites: `alembic upgrade head` and `python -m app.db.seed` (the import
aborts unless the seeded Risk Manager is active, non-admin, assigned to the
active seeded Risk Management Department (`RISK`), all three protected scenarios exist,
the named authorizer is a distinct active CRO, and the target is fresh or an
exact manifest match).
Before reading `DATABASE_URL`, importing `builder/seed.py`, or opening a database
connection, the command verifies `builder/seed.py`, `builder/source_data.json`, and
`builder/build_expected.json` against the repository-owned
[`cutover-manifest.json`](./cutover-manifest.json). Missing inputs, symlinks, path
escapes, non-regular files, size/hash mismatches, and external `--expected`
overrides are rejected. A source directory is accepted only when it contains the
exact manifest-pinned cutover artifacts.
The sidecar is separately SHA-256-pinned in the offline cutover policy and must
contain exactly the manifest's 148 Process and 183 Asset natural keys, the exact
Asset display labels, and normalized-exact `source_owner` matches for both
registers. Its synthetic metadata, source-manifest identity, authorization
reference, owner email and Department code/name must all match.
The import itself is all-or-nothing: it commits once only after every service
phase completes without findings. Exit status 2 (reported findings) and raised
failures, including task cancellation or operator interruption, roll back the
whole cutover. The same command may still be re-run safely because natural-key
upserts remain idempotent.
The scratch rehearsal recorded here used PostgreSQL 16.13 at 127.0.0.1:5433,
`alembic upgrade head` → `python -m app.db.seed` → import → import (created=0)
→ `--verify`, full logs captured during the run of 2026-07-10.

That July run is retained as historical import/fidelity evidence. It predates
the explicit CRO-authorized policy-window hardening. The authoritative fresh
scratch PostgreSQL run of the exact manifest source — apply twice, then
map-backed `--verify` — passed on 2026-08-11 and is recorded in
[`cutover-evidence-2026-08-11-candidate17.json`](./cutover-evidence-2026-08-11-candidate17.json).

## 8. Retirement statement

As of this import, **the workbook is reference-only**. The register — its
entered rows, every derived value (criticality cascade, CIF, vendor tiers,
§2 expansion, RoI codes), and all 52 DQ checks — lives in RiskHub and is
maintained ONLY through RiskHub (user story #38/44: exactly one source of
truth). The workbook file remains at its external path for audit history; no
future data flows from it. Recurring imports are explicitly out of scope
(#38); this script remains in `backend/scripts/` as the documented record of
how cutover happened and as the `--verify` characterization tool.
