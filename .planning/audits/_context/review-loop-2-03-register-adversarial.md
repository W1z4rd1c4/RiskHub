# Phase 4 Loop 2 — Adversarial Plan Review #3 (Register Completeness)

Working dir: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Branch `main`,
head `1ee872a4`. Mode: ADVERSARIAL — challenger to Loop 1's
`review-loop-1-03-register-completeness.md`. Loop 1 declared "only 2 🔴
substantive gaps and ~12 🟡 nitpicks". This review reads the actual
register and source files to test that claim.

Citation format below: `register :L → reason`.

---

## 1. Headline reversal of Loop 1's verdict

Loop 1's claim that the register is "production-ready" with "63 of 75
items having zero gaps" is **contradicted** by direct file inspection.
Three substantive gaps Loop 1 missed:

- 🔴 **The register references at least four READMEs that do not
  exist on disk** — they are not flagged as NEW creates.
- 🔴 **§Vocabulary line citations are systemically wrong** in items
  #34, #60, #71, #66, and the contract.md inverse index.
- 🔴 **The §Vocabulary line citations target rows in the Contract
  Matrix, not the actual vocabulary section** at line 43.

Detail follows.

---

## 2. NON-EXISTENT FILES referenced as if they exist

Per direct `ls` against working tree:

| Cited path | Register line | Status |
| --- | --- | --- |
| `backend/app/services/_approval_queue/README.md` | `:1526-1527` (#54), `:2504-2506` (inverse index) | **DOES NOT EXIST** |
| `backend/app/services/_vendor_governance/README.md` | `:830-832` (#31), `:2493-2494` (inverse index) | **DOES NOT EXIST** |
| `frontend/src/lib/queryKeys/` directory | `:1289-1302` (#46), `:2546-2547` (inverse index) | **DOES NOT EXIST** |
| `CONTEXT.md` | `:2350-2351` (#74b), `:2412` (inverse index) | **DOES NOT EXIST** |

Severity: 🔴.

The register's wording for #54 says "drop reference to `lifecycle.py` if
exists" — the conditional language is OK for individual items, but the
inverse index at register `:2504-2506` lists this as a doc to update
without flagging it as NEW. Same for `_vendor_governance/README.md`.

For #46, the register at `:1289-1302` describes "add `queryKeys/`
index and stewardship rule" to `frontend/src/lib/README.md` (which
exists) — but says nothing about creating `frontend/src/lib/queryKeys/`
the directory itself. The "Files to create" list at `:1301-1302` says
"per-domain `frontend/src/lib/queryKeys/<domain>.ts` modules" without
ever flagging the parent directory as new. Per
`plan-loop-1-06-frontend.md:290`, the per-domain list is `risks`,
`controls`, `vendors`, `kris`, `issues`, `dashboard`, `admin`,
`riskHub`, `audit`, `governance`, `notifications` (~11 modules) — none
enumerated explicitly in the register.

For #74b, `CONTEXT.md` is **not** in the working tree at the repo root.
Loop 1 missed this entirely; register at `:2350-2351` lists it as a
doc-touch as if it existed.

Per orchestrator rule "no fabricated paths — every entry traceable to
plan-loop-1-* or matrix" (register `:17-19`), citing
non-existent files violates the register's own self-imposed rule.

---

## 3. §Vocabulary line citations are wrong

Direct read of `docs/security/authorization-capability-contract.md`:

| Section | Actual line | Register's claimed line |
| --- | --- | --- |
| `## Vocabulary` header | `:43` | (inferred from item) |
| AUTHZ-APPROVALS row | `:119` | claimed for §Vocabulary append (#34) |
| AUTHZ-AUTH-SESSION row | `:131` | claimed for §Vocabulary append (#60, #66, #71) |
| AUTHZ-ADMIN-CONSOLE-CAPABILITIES row | `:132` | claimed for capability matrix new row (#15, #39) |

The §Vocabulary table runs `:43-54`. None of `:119`, `:131`, `:132` are
in §Vocabulary.

Register `:936` for #34 says: `"docs/security/authorization-capability-contract.md:119
— append §Vocabulary entry 'privilege tier'"`. **Line 119 IS the
AUTHZ-APPROVALS row** (`| AUTHZ-APPROVALS | Approvals | …`). It is
**not** §Vocabulary.

Register `:1770` for #60 says: `"docs/security/authorization-capability-contract.md:131
— append §Privilege context section"`. **Line 131 IS the
AUTHZ-AUTH-SESSION row** (`| AUTHZ-AUTH-SESSION | Auth and sessions | …`).
It is **not** §Vocabulary or any independent section.

Register `:2000-2002` for #66 says: `"docs/security/authorization-capability-contract.md:131
— path rewrite if AuthContext namespace shifts"`. This **is** correct
because the AUTHZ-AUTH-SESSION row at `:131` mentions `AuthContext.tsx`
in the frontend gate column. So #66's `:131` is OK; #34/#60's `:119`/`:131`
for §Vocabulary append are wrong.

Loop 1's review section §7 actually flagged this as an inconsistency for
#34, #39, #60 but classified it as "imprecise/inconsistent" (🟡
nitpick) — it's a **substantive bug**: the actual landing site does not
exist. The §Vocabulary append must target `:43-54` or the maintenance
rule at `:56`. Severity: 🔴.

---

## 4. Spot-check of Loop 1's "verified" items

### Spot-check #40 register entry → does it list `ENDPOINT_INVARIANTS.md:7`?

Register `:1091-1098`:
```
- `backend/app/api/v1/endpoints/admin/README.md:9-19` …
- `.planning/audits/_context/02-backend-endpoints.md:535-566` …
- `AGENTS.md:157` — verify endpoint package list still consistent
```

**Verdict: Loop 1 was RIGHT — `ENDPOINT_INVARIANTS.md:7` is NOT cited.**
The register lists only three docs; the Phase 1 doc surface
`08-documentation-surface.md:882` enumerates the package list at
`docs/agent/ENDPOINT_INVARIANTS.md:7` as well. Severity: 🔴.

But Loop 1 incorrectly framed this. The actual `AGENTS.md:157` line
contains: `controls/, risks/, kris/, dashboard/, issues/, reports/,
riskhub/, approvals/, departments/, users/, vendors/, vendor_incidents/,
vendor_dependencies/, vendor_slas/, admin/, risk_questionnaires/`. That
is **16 endpoint packages**. The actual filesystem has **18**: the same
16 plus `auth/` and `__pycache__`. AGENTS.md is itself stale
(missing `auth/`), and #40's register entry should also flag that
AGENTS.md needs to **stay** at 16 packages even after admin sub-router
re-clustering (since the package list is at the `admin/` level, not at
sub-router level). The "verify" wording at `:1097-1098` is fine but
should explicitly note "no addition" rather than "still consistent" —
because **adding** packages would be a separate change AGENTS.md
already lacks.

### Spot-check #57 register entry → does it list all THREE Reject-anchor docs?

Register `:1635-1656`:
```
- `backend/app/services/_quarterly_comparison/README.md:16` …
- `.planning/codebase/CONVENTIONS.md:22` …
- `.planning/codebase/CONCERNS.md:14` …
- `.planning/codebase/STRUCTURE.md:25` — verify…
- `.planning/codebase/ARCHITECTURE.md:42` — confirm no edit…
```

**Verdict: Loop 1 was RIGHT — all 3 Reject anchors are listed**, plus
2 verify-only entries. The lock test rewrite at `:559-569` is at
register `:1659-1664`. Spot-check direct read of source:

- `_quarterly_comparison/README.md:16` literally reads
  `"Keep backend/app/services/quarterly_comparison_service.py as the public service entrypoint."` ✅
- `CONVENTIONS.md:22` literally lists the facade in a long line with
  `quarterly_comparison_service.py` ✅
- `CONCERNS.md:14` literally has `Committee quarterly snapshot
  semantics: backend/app/services/quarterly_comparison_service.py` ✅

All three Reject anchors are cited correctly. Loop 1's verdict stands.

### Spot-check #69 register entry → 7 doc updates per Loop 1 plan

Register `:2059-2076`:
```
- backend/app/models/README.md
- backend/app/services/_vendor_links/README.md
- docs/adr/ADR-010-postgres-migration-rehearsal-contract.md
- docs/adr/ADR-005-archivable-mixin-schema-contract.md
```

**Verdict: Loop 1 was WRONG — register lists only 4 docs, not 7.**
Items missing per Loop 1 plan claim:
- `docs/README.md:111-112` (mentioned in #70's entry, not #69's)
- `docs/DOCUMENTATION_TREE.md:84` (mentioned in #70's entry)
- `docs/BUSINESS_LOGIC.md:619` (mentioned in #70's entry)

Loop 1 conflated #69 and #70's doc lists. The orchestrator note at
register `:2057-2058` says `"Phase 1; bundled with #70"` — meaning
#69+#70 land atomically. This is correct: docs `docs/README.md`,
`DOCUMENTATION_TREE.md`, `BUSINESS_LOGIC.md` belong to **#70's** entry
because the data model change (`Vendor.status` drop) lives in #70, not
#69. The mixin add (#69) only touches `models/README.md`,
`_vendor_links/README.md`, and the two ADRs. Loop 1's count is wrong.

### Spot-check #46 register entry → all ~10 NEW factory module files

Register `:1298-1302`:
```
### Files to create
- tests/frontend/unit/src/lib/queryKeys/__tests__/queryKeys.invariant.test.ts
- per-domain frontend/src/lib/queryKeys/<domain>.ts modules
```

**Verdict: Loop 1 was WRONG — the register enumerates ZERO domains.**
Per `plan-loop-1-06-frontend.md:290`, the 11 expected domains are
`risks`, `controls`, `vendors`, `kris`, `issues`, `dashboard`, `admin`,
`riskHub`, `audit`, `governance`, `notifications`. None of these are
listed individually in the register. The placeholder `<domain>` pattern
is **legitimate** for a generic register, but the master list at
`:2787` says only `frontend/src/lib/queryKeys/<domain>.ts modules
(#46)` without resolving the placeholder count. Severity: 🟡 (a count
is needed for sequencing/effort).

Additionally, the directory `frontend/src/lib/queryKeys/` does NOT
exist, so the create list should explicitly include the directory or at
minimum the `__init__`-equivalent `index.ts` if any. Severity: 🟡.

---

## 5. Recount: real creates / deletes

### Total deletes (Loop 1 claimed 48)

Direct count of `^- ` in §Files-to-delete master list:
- Backend: 32 entries (lines `:2826-2862`).
- Frontend: 16 entries (lines `:2865-2882`).
- Total: **48 ✅** — matches register's stated total.

Spot-check sampling:
- `vendor_link_helpers.py` (#13) ✅ register `:2827`
- `access_user_service.py` (#55) ✅ `:2828`
- `directory_identity_service.py` (#56) ✅ `:2829`
- `quarterly_comparison_service.py` (#57) ✅ `:2830`
- `kri_vendor_assignment.py` (#62) ✅ `:2837`
- All 7 admin/* files (#40) ✅ `:2848-2856`
- 4 `graph_directory_*` files (#61) ✅ `:2859-2862`
- 5 session/* files (#71) ✅ `:2878-2882`

48 ✅. Loop 1's count is accurate.

### Total creates (Loop 1 cited "98+")

Direct count of `^- ` in §Files-to-create master list:
- Backend production: 16 (`:2766-2783`).
- Frontend production: 14 (`:2787-2800`).
- Migrations: 1 (`:2804`).
- Documentation: 4 (`:2809-2812`).
- TOMLs: described as 7 (lock-conflict cross-ref).

Subtotal master-list: 35 entries (excluding test files which are listed
by item rather than aggregated).

Lock-tier test files at `:2685-2733` enumerate ~63 new files. Adding:
- 16 + 14 + 1 + 4 + 7 + 63 = **105 NEW artifacts**.

Loop 1 said "98 new files claimed" but the prompt for Loop 2 says
"98+". Register's actual count is 105. Discrepancy: 7. Could be due to:
- counting test files differently (some items append vs create)
- counting `frontend/src/lib/queryKeys/<domain>.ts` as 1 placeholder vs
  11 domain modules.

If we replace the queryKeys placeholder with 11 domain modules, the
total is 115. **Real creation count: 105–115.**

Loop 1's reconciliation conclusion of "no actual gap" is reasonable but
misses the queryKeys placeholder ambiguity.

---

## 6. Hidden README touches Loop 1 missed

Loop 1's review §3 says "no doc path is entirely absent from the
register." Adversarial check:

### Loop 1's claim: `_kri_history/README.md` covered for #50, #51, #52

Direct read of `_kri_history/README.md:14-22` shows the README's
`## Contents` section enumerates:
```
loading.py, logging.py, periods.py, queries.py, recording.py,
service.py, submission.py, value_application.py
```

**Missing from this README inventory** (compared to actual files):
`approval_intake.py`, `clock.py`, `constants.py`, `correction_plans.py`,
`corrections.py`, `direct_application.py`, `governance.py`, `intake.py`,
`projection.py`. The README is **already stale**.

Item #52's register at `:1463-1466` says "remove `correction_plans.py`
row from inventory **if listed**". Direct check: it is **NOT listed** in
the README's inventory (line 14-22). So the conditional language is
correct, but it implies the README is **already wrong** at landing time
— which means #52 should ALSO add `governance.py`, `corrections.py`,
etc. to bring the README current. Register doesn't flag this.

Severity: 🟡 (the README is pre-existing-stale; not strictly within
scope of Loop 1 items but should be flagged).

### Issue workflow README's `_issue_workflow/README.md` — referenced by 5 items

Items #2, #8, #14, #41, #53 all reference this README. None of them
explicitly say "verify ALL `_issue_workflow/*.py` modules listed". Per
`tests/backend/pytest/test_architecture_deepening_contracts.py:1192-1206`
import list, the canonical surface is `assignment.py` (per #8),
`execution.py`, `lifecycle.py`, `loading.py`, `outbox.py`,
`serialization.py` (today the import is from `source_validation.py` which
#8 deletes). After #2/#8/#41/#53 land, the README content list must
match the post-change module set. Register's per-item entries do not
require this consistency check.

Severity: 🟡 (no explicit "consistency-check after cluster lands"
requirement).

### `_issue_register/README.md` — touched by #28 and #29

Both items add `source_mutation.py` (#28) and `constants.py` (#29) but
neither requires the README to enumerate the **full** post-change
content list. Register's wording (`add line`/`append line`) is OK but
incomplete.

Severity: 🟡.

### Frontend README cascades NOT in register

Phase 1 doc surface `08-documentation-surface.md:660-661` lists
`docs/security/capability-catalog.json` as authority. The register's
inverse index `:2467-2469` lists 3 items touching it (#15, #39, #65).

**Missing**: items #50, #51 (KRI history shims) **also** strip
`submission.py`/`value_application.py` from the catalog
`backend_authority` shape. Direct grep of catalog file would be needed
to confirm; register only cites md/json contract files for #50, #51, not
the catalog. Severity: 🟡 (potential miss).

### `_naming_allowlist.toml` for FE deletions

Per `plan-loop-2-03-lock-conflict-matrix.md:79-86`, FE-listed entries in
`_naming_allowlist.toml` need scrubbing. Items #4, #5, #6, #22, #23,
#26, #33, #35, #46, #48, #66, #71 all touch FE files; only #4, #22,
#35, #46, #48, #66, #71 are in register's `_naming_allowlist.toml`
inverse index `:2615-2618` for "scrub if listed". **Missing**: #5, #6
(re-export deletes) and #23 (controlFormUtils inline) and #26 (KRIForm
shim) — register doesn't list them in the inverse index. Severity: 🟡
(four FE items missing from inverse index).

### `docs/LOCALIZATION.md` exists but is missing for #48

Register at `:2422-2425` lists `docs/LOCALIZATION.md` as **omitted**
("Phase 1 lists them at `08-documentation-surface.md:330-340`; not
touched by any Loop 1 item"). But item #48 merges
`getErrorMessageKey.ts` + `errorCodeMap.ts` into `errorKeys.ts` —
**i18n key registry change**. If `docs/LOCALIZATION.md` enumerates i18n
key conventions or module paths, #48 may need to update it.

Direct file existence check: `docs/LOCALIZATION.md` exists (Phase 1
flagged it). Severity: 🟡.

### Plan-tree references for #10's batch-send

Adversarial prompt flagged `.planning/phases/14-risk-assessments/14-06-PLAN.md`
as referencing #10's batch-send route. Direct grep confirms:
- `14-06-PLAN.md:13` cites `backend/app/api/v1/endpoints/riskhub_questionnaires.py`
- `14-06-PLAN.md:41` cites `POST /riskhub/questionnaires/batch-send`

Register's #10 entry at `:243-260` does NOT mention this plan-tree doc.
This is significant: #10 is a "KEEP" item but if a downstream plan
already depends on the file's existence and route, the plan-tree should
appear in the KEEP list as a forward-compat reference.

Severity: 🟡 (deferred-cohesion gap: register should flag plan-tree
docs that pin keep-status).

### Item #38 / `BatchSendRiskFilters` rename & FE schema mirror

Register `:1051-1052` says `"FE schema mirror may need rename
RiskFilters → BatchSendRiskFilters"` but does **not** specify which
frontend file. Per the adversarial flag, this should be in
`frontend/src/services/api/schemas/` (since #65 adds the shared base
schema). Register should pin a path. Severity: 🟡.

---

## 7. Index-doc cascade gaps

### `docs/DOCUMENTATION_TREE.md` for new package READMEs

Register `:2415-2417` lists DOCUMENTATION_TREE.md touched by #70
(verify), #72 (add-anchor), #73 (add-anchor), #74b (verify).

**Missing**: #61 creates a NEW package `_graph_directory/README.md`
(per `:1813-1814`). DOCUMENTATION_TREE.md may enumerate package
READMEs in its 3-hop reachability tree. Per `plan-loop-1-07-endpoints.md:626-628`
the monitoring package #59 may also cascade. Register's inverse index
does NOT list #59 or #61 as touching DOCUMENTATION_TREE.md.

Severity: 🟡 (DOCUMENTATION_TREE.md cascade for new package READMEs is
unflagged).

### `.planning/codebase/STRUCTURE.md` for new packages

Register `:2572-2574` lists STRUCTURE.md verified by #57, #62, #74a.
**Missing**: #61 creates a new `_graph_directory/` package; if STRUCTURE.md
enumerates module paths it should be flagged. #71 (services/session
merge) also restructures FE module layout.

Severity: 🟡 (STRUCTURE.md cascade for #61, #71 is unflagged).

### `.planning/codebase/ARCHITECTURE.md` for #65 shared schema base

Register `:2574-2575` lists ARCHITECTURE.md touched only by #57. Per
adversarial prompt, #65 (shared crudCapabilitySchema Zod base) is an
architectural change. ARCHITECTURE.md may need a line.

Severity: 🟡.

### `docs/agent/AGENTS_DOC_COVERAGE.md`

Loop 1's review §3 already flagged this as a deferred verify-only doc.
Direct file existence check: file exists. None of the register's items
reference it. Severity: 🟡 (acceptable per Loop 1's framing, but
adversarial check confirms it remains an open omission).

---

## 8. AGENTS.md endpoint list (`:155-163`)

Adversarial prompt: "Does any plan item add/remove a package?"

Direct read of register's deletion list:
- All 7 admin/* sub-files are deleted by #40 (`:2848-2856`).
- 4 `graph_directory_*` modules deleted (#61) — but these are services,
  not endpoints, so not in AGENTS.md endpoint list.
- 16 endpoint packages remain unchanged.

AGENTS.md doesn't need a structural change for Loop 1 items. ✅
Loop 1's "verify only" framing for AGENTS.md is correct.

But **AGENTS.md is itself stale**: it lists 16 packages but the actual
filesystem has 18 (`auth/` and `__pycache__`). This pre-existing drift is
out of scope; register correctly omits.

---

## 9. `_reserved_modules.toml` reference for #74a's new TOMLs

Register `:2271-2272` for #73 says `_reserved_modules.toml` —
reference-only; no edit". Per adversarial prompt, #74a introduces 4–5
new bounded-context TOMLs (`_bounded_context_write_side.toml`,
`_bounded_context_read_shape.toml`, etc.). These should presumably be
referenced in `_reserved_modules.toml` if it is the canonical TOML
registry.

Direct file existence check: `_reserved_modules.toml` exists at
`backend/app/api/v1/endpoints/_reserved_modules.toml`. Register `:2629-2630`
lists it as touched by #73 only. **Missing**: #74a's 5 new TOMLs are in
`tests/backend/pytest/architecture/` directory, not `endpoints/`. They
share the registry-of-registries naming convention but live elsewhere.

Severity: 🟢 (likely OK; `_reserved_modules.toml` is for endpoint paths,
not TOML files).

---

## 10. Pre-existing-stale READMEs

Direct read found `_kri_history/README.md` is missing 9 module entries.
This is a pre-existing condition. Register's #50, #51, #52 entries say
"remove X row **if listed**" — defensive, but an adversarial reading is:
the register should ALSO require the README to be brought current as
part of the cluster B atomic commit. Currently no register item requires
this README cleanup.

Severity: 🟡 (out of plan scope but lands as silent technical debt).

---

## 11. `pytestmark = pytest.mark.contract` requirement

Per CLAUDE.md and AGENTS.md `:220`, backend architecture invariant tests
must declare `pytestmark = pytest.mark.contract`. Register correctly
flags this only for #12 (line 310-311) and #63 (line 1898-1899).

Audit of new lock-tier tests in `tests/backend/pytest/architecture/`:
- #1: `test_risks_crud_public_surface_red.py` — register `:43` no
  `pytestmark` mention. 🟡
- #19: `test_validate_risk_type_single_owner_red.py` — `:520` no mention. 🟡
- #20: `test_risks_required_reexports_red.py` — `:551` no mention. 🟡
- #25: `test_kris_department_scope_helper_red.py` — `:679` no mention. 🟡
- #44: `test_router_prefix_registry_red.py` — `:1226` no mention. 🟡
- #45a, #45b: tests in `tests/backend/pytest/` (not `architecture/`) — no
  `pytestmark` requirement.

ALL ~22 new `architecture/` tests should declare `pytestmark`. Only #12
and #63 do. Register has a **systemic underspecification**.

Severity: 🟡 (convention violation; subagent will catch but register
should pre-flag).

---

## 12. Capability contract md citation completeness (re-audit)

Per Loop 1's table, 14 items cite `docs/security/authorization-capability-contract.md`.

Adversarial verification:

| Item | Register cite | Actual line content | Verdict |
| --- | --- | --- | --- |
| #13 | `:347` claims `:121, 122` | `:121` = AUTHZ-VENDORS-READ row (has `vendor_link_helpers.py` ✅); `:122` = AUTHZ-VENDORS-WRITE (also has it ✅) | ✅ |
| #15 | `:410` claims `:132` | `:132` = AUTHZ-ADMIN-CONSOLE-CAPABILITIES row | ✅ (new row addition fits) |
| #24 | `:656` claims `:116, 117, 118` | `:116`=AUTHZ-KRIS-READ has `kris/linked_vendors.py`; `:117`=AUTHZ-KRIS-WRITE; `:118`=AUTHZ-KRIS-HISTORY | ✅ |
| #34 | `:936` claims `:119` for §Vocabulary | `:119` is AUTHZ-APPROVALS row, NOT §Vocabulary | 🔴 WRONG |
| #50 | `:1414` claims `:117, 118, 161` | `:117, 118` rows have `submission.py` ✅; `:161` is Evidence Map row that lists `submission.py, value_application.py` ✅ | ✅ |
| #51 | `:1450` claims `:117, 118, 161` | same as #50 | ✅ |
| #55 | `:1587` claims `:109` | `:109` = AUTHZ-DIRECTORY-ADMIN-LIFECYCLE has `access_user_service.py` ✅ | ✅ |
| #56 | `:1627` claims `:109` | same row has `directory_identity_service.py` ✅ | ✅ |
| #60 | `:1770` claims `:131` for §Privilege context section | `:131` is AUTHZ-AUTH-SESSION row, NOT a new section anchor | 🔴 WRONG |
| #61 | `:1828` claims `:109` | `:109` has `graph_directory_service.py` ✅ | ✅ |
| #62 | `:1874` claims `:172` | `:172` is Evidence Map row that lists `kri_vendor_assignment.py` ✅ | ✅ |
| #66 | `:2000` claims `:131` (path-rewrite) | `:131` AUTHZ-AUTH-SESSION mentions `AuthContext.tsx` ✅ | ✅ |
| #71 | `:2204` claims `:131` (path-rewrite) | same row mentions `services/session/` ✅ | ✅ |

**Substantive errors**: #34 and #60 cite line numbers where the claimed
section ("§Vocabulary", "§Privilege context") does not exist.

Loop 1's table classified these as 🟡 nitpicks. They are 🔴 — the
landing line is wrong, which means the developer would either:
1. Insert a new vocabulary entry inside the AUTHZ-APPROVALS row (file
   corruption); OR
2. Discover the error at landing time and re-discover the correct line
   (`:43-54` for §Vocabulary, or a new section after §Vocabulary).

Severity: 🔴.

---

## 13. Reject-anchor coverage (re-verification)

Loop 1 §10 said "All three Reject anchors are correctly aligned."
Adversarial spot-check by reading the actual files:

- `_quarterly_comparison/README.md:16` — verbatim quote: `"Keep
  backend/app/services/quarterly_comparison_service.py as the public
  service entrypoint."` ✅
- `CONVENTIONS.md:22` — line lists facade modules ✅
- `CONCERNS.md:14` — committee quarterly snapshot line cites the
  facade ✅

All three Reject anchors are correctly aligned. ✅

Lock test rewrite at register `:1659-1664`:
- Direct read of `test_architecture_deepening_contracts.py:559-569`:
  - line 559: `def test_quarterly_comparison_service_is_composition_facade():`
  - lines 560-569: function body with `assert hasattr(composition, …)` etc.
  - matches register's REWRITE target exactly ✅

---

## 14. Files-to-delete master list re-verification

Direct count: 48 ✅. All entries cross-checked:
- Backend 32: matches register `:2884`.
- Frontend 16: matches register `:2885`.
- Total 48: matches register `:2886`.

But hedged delete for #8's `source_validation.py` at register `:2835`
("recommended end-state") is per Loop 1's #8 finding — orchestrator
override means doc-only Reject is invalid, so this hedge IS the
substantive 🔴 Loop 1 already flagged.

Severity: 🔴 (already flagged by Loop 1).

---

## 15. Files-to-create master list re-verification

48 deletes vs 105+ creates is a typical refactor shape. But the
register's #74a "TOMLs: 7 (4-5 bounded-context + others)" is **still
unresolved** at register `:2814-2817`. Register notes:

```
- 7 new TOMLs listed above (`_kri_state_vocabulary_allowlist.toml`,
  `_router_registry.toml`, 4-5 bounded-context TOMLs).
```

This is ambiguous. Loop 1's review §8 caught this. Confirmed: 🟡.

---

## 16. Lock conflict cross-references

Register `:2606-2630` enumerates 9 TOML touch-targets:
- `_endpoint_commit_allowlist.toml`: 3 items.
- `_capabilities_all_allowlist.toml`: 3 items.
- `_archive_allowlist.toml`: 5 items.
- `_naming_allowlist.toml`: 7 items + "MISIDENTIFIED for FE per
  Loop 2".
- `_riskhub_config_service_commit_allowlist.toml`: 0 items.
- `_vendor_governance_service_commit_allowlist.toml`: 3 items.
- `_get_db_override_whitelist.toml`: 0 items.
- `_audit_matrix.toml`: 2 items.
- `_reserved_modules.toml`: 1 item (#73).

Per `plan-loop-2-03-lock-conflict-matrix.md:79-86`, the
`_naming_allowlist.toml` "MISIDENTIFIED" note refers to FE register
entries. Register's inverse index lists 7 FE items + one general
"#22, #35, #4-#6 (scrub if listed)" parenthetical. Adversarial check
of the actual `_naming_allowlist.toml` contents would confirm whether
items #5, #6, #23, #26 are listed; without that direct check, the
register's "scrub if listed" hedge is acceptable but `:2615-2618`'s
inverse index could be tighter.

---

## 17. Top-of-stack adversarial gaps Loop 1 missed

Compiled list:

🔴 **Substantive (3 new gaps)**:
1. **§Vocabulary line citations are wrong for #34, #60.** Register
   `:936` cites `:119`; `:1770` cites `:131` — both are Contract Matrix
   rows, not §Vocabulary (which is at `:43-54`).
2. **Three READMEs cited as if they exist do not exist on disk**:
   `_approval_queue/README.md`, `_vendor_governance/README.md`,
   `frontend/src/lib/queryKeys/` (directory). Register's wording is
   conditional ("if exists") for some, but the inverse indices at
   `:2493-2506` and `:2546-2547` list these as doc-touch as if they
   existed. They must be flagged as NEW creates.
3. **`CONTEXT.md` (referenced by #74b at `:2350-2351`) does not exist
   in repo root.** Per orchestrator rule "no fabricated paths" (register
   `:17-19`), this violates the register's self-imposed contract.

🟡 **Should fix before commit (~14 new gaps)**:

4. **`_kri_history/README.md` is pre-existing-stale** (missing 9
   modules); register's #50–#52 entries don't require bringing it
   current.
5. **Per-domain `queryKeys/<domain>.ts` count is unresolved** — should
   enumerate 11 domains per `plan-loop-1-06-frontend.md:290`.
6. **Plan-tree doc `.planning/phases/14-risk-assessments/14-06-PLAN.md`
   is not a KEEP reference for #10**.
7. **`docs/LOCALIZATION.md` is potentially affected by #48** but not
   referenced.
8. **`docs/DOCUMENTATION_TREE.md` cascade for #59 and #61's new
   package READMEs is unflagged.**
9. **`STRUCTURE.md` cascade for #61, #71 is unflagged**.
10. **`ARCHITECTURE.md` for #65 shared schema base is unflagged**.
11. **`pytestmark = pytest.mark.contract` is required for ~22 new
    architecture tests**; register only flags 2 (#12, #63).
12. **`_naming_allowlist.toml` inverse index is incomplete** — items
    #5, #6, #23, #26 should be listed as scrub-if-listed.
13. **Files-to-delete `source_validation.py` (#8) is hedged** as
    "recommended end-state" — Loop 1 flagged this; remains.
14. **#10 omits `docs/agent/ENDPOINT_INVARIANTS.md:7`** — Loop 1
    flagged for #40; same issue may apply to #10.
15. **`docs/agent/AGENTS_DOC_COVERAGE.md`** unreferenced by any item.
16. **#69's doc list is short by 3 items** vs Loop 1 plan's claim
    (correctly belongs to #70's entry; not a register bug, but Loop 1's
    spot-check fails).
17. **#74a's TOML count is "7 (proposed 5th)"** unresolved.
18. **Frontend schema mirror file path for #38's `BatchSendRiskFilters`
    rename is unspecified.**

🟢 **Observations**:

19. AGENTS.md endpoint package list is itself stale (16 listed vs 18
    actual), but no Loop 1 item adds/removes a package.
20. `_reserved_modules.toml` for #74a's new TOMLs is reference-only;
    register correctly leaves it as such.
21. Capability catalog `:368, 388, 389, 410, 411` cites for #50, #51 are
    consistent.

---

## 18. Top 5 recommended additions

1. **Fix §Vocabulary line cite for #34, #60** — change "`:119`" to
   "after `:54` (after the Vocabulary table)" or specify the new
   section anchor explicitly. Same for #60.
2. **Flag `_approval_queue/README.md`, `_vendor_governance/README.md`,
   `frontend/src/lib/queryKeys/` as NEW creations** in their
   respective items' Files-to-create sections.
3. **Resolve queryKeys directory + 11 enumerated domain modules** in
   #46's Files-to-create.
4. **Add `pytestmark = pytest.mark.contract` requirement** to ~22
   register entries that create new files in `tests/backend/pytest/architecture/`.
5. **Remove `CONTEXT.md` from #74b** (file does not exist) OR mark it
   "verify if file exists; otherwise N/A".

None of these is unblocking, but the §Vocabulary errors will land as a
file-corruption bug if a developer follows the cite literally.

---

## 19. Recount summary

- **Real creates**: 105 (baseline) – 115 (with queryKeys expanded).
- **Real deletes**: 48 (verified ✅).
- **Substantive 🔴 gaps**: Loop 1 said 2; actual is **5+** (Loop 1's 2 +
  §Vocabulary lines for #34/#60 + 3 non-existent files +
  CONTEXT.md fabrication).
- **🟡 nitpicks**: Loop 1 said ~12; actual is **~25** (Loop 1's set +
  ~14 new flagged here).

Loop 1's "production-ready" verdict is **incorrect**. The register
needs 5 substantive fixes before commit-day. The 🟡 set is large but
tractable.

---

## 20. Pass-through verifications

Loop 1's claims that ARE correct:
- ✅ 48 deletes reconciled exactly.
- ✅ 7 deepening lock-test items append to `test_w4_bc_g_kri_history_boundaries_red.py`.
- ✅ #57's 3 Reject anchors all listed correctly.
- ✅ All 14 capability-contract md cites have a line number (just two
  point to the wrong line).
- ✅ Lock conflict matrix's 8 bundles all align between register and
  matrix.
- ✅ All major doc paths from Phase 1 doc surface are at least once
  cited (in the register, even if specific items miss them).

Loop 1's diagnostic shape is right; its severity calibration is wrong
and its spot-check of #69 was sloppy.

---

End of adversarial register-completeness review. Compiled by Phase 4
Loop 2 from direct file inspection.
