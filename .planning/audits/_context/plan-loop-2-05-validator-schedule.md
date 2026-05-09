# Phase 3 Loop 2 — Validator Run Schedule (Capability Contract)

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Anchor commit: `1ee872a4`.

This plan identifies every Loop 1 item that touches the capability-contract surface
and produces a per-item validator-run schedule. The validator under
`scripts/security/validate_authz_capability_contract.py:170-175` MUST be run
locally between `pytest` (red→green) and the commit, on every item below. This
plan is the developer-facing pre-commit gate; CI is a backstop, not the gate.

---

## Validator pipeline (anchor)

> "Delegates to `authz_contract_validator.runner.run_validation`"
> (`scripts/security/validate_authz_capability_contract.py:149-167`)

Seven checks (per `runner.py:35-60` and Loop 1 Phase-1 Agent 5 transcription in
`05-adrs-capability-contract.md:209-241`):

1. **Existence pre-check** on `authorization-capability-contract.md`,
   `authorization-capability-contract.json`, `capability-catalog.json`
   (`runner.py:35-43`).
2. **Manifest schema + path-existence + sensitive-change-paths coverage**
   (137 entries) (`contract_manifest.py:137-219`).
3. **Discovery cross-check** — regex scans backend endpoints/services/schemas
   + frontend `*.ts*` (`discovery.py:43-104`).
4. **Capability-catalog field-shape parity** (Pydantic ↔ Zod)
   (`capability_catalog.py:143-230`).
5. **Markdown matrix parity** — 9 required sections (`markdown_validation.py:11-21`).
6. **Business route nav pinning** — 10 routes (`authz_contract_manifest.py:66-77`).
7. **Diff-aware doc-touch + frontend local-gate per-file pattern allowlist**
   (`runner.py:56-60`).

> "Each discovery must be covered by both contract action paths AND
> sensitive_change_paths" (`discovery.py:79-102` paraphrase ≤15 words)

> "Path references in `backend_authority`/`service_policy`/...; each must exist"
> (`contract_manifest.py:192-212`)

> "Backend: parses Python class body, extracts `field: bool` and
> `field: dict[str, bool]`" (`capability_catalog.py:13-18`)

> "Frontend: parses TS schema body via `passthroughObject(...)` brace-matched"
> (`capability_catalog.py:19-24`)

---

## Master commit-sequence frame (Loop-2 A2 substitute)

Loop 2 A2 (overall master sequence) is not yet authored. To assign commit numbers,
this plan uses **domain-cluster ordering**, where each cluster is taken from its
Loop-1 plan's "Recommended sequential execution order" section and clusters are
ordered to minimise contract-surface churn (KRI cluster touches
`md:117,118,161` + `json:389,411` repeatedly; defer the ADR-007 amendment until
late since it pre-classifies adapters that #56/#61 land first).

**Cluster ordering (most-impactful contract churn first; trailing items least):**

```
P1 (doc-only, unblocks others)
  C1: #72  ADR-011 doc + index            (no contract files touched; M)
  C2: #15  access_user catalog gap        (NEW catalog surface; M)

P2 (backend leaf surface deletes — small contract scrubs)
  C3: #56  directory_identity_service      (md:109 + json:106,229; S, paired w/ #61)
  C4: #61  graph_directory move            (md:109 + json:113,229; M, paired w/ #56)
  C5: #55  access_user_service             (md:109 + json:106,229; S)

P3 (vendor link helpers + KRI surface bulk)
  C6: #13  vendor_link_helpers shim        (md:121,122 + json:55,479,502; S)
  C7: #51 + #24 atomic                     (md:116,117,118,161 + json:368,388,389,
                                             410,411; S+S → S/M bundle)
  C8: #50  kri_history submission          (md:117,118,161 + json:389,411; S)
  C9: #62  kri_vendor_assignment relocate  (md:172 + json path token; M)

P4 (governance + capability builders)
  C10: #34 resolve_approval_privilege_tier (md vocabulary §; M, governance hub)
  C11: #60 PrivilegeContext + Depends      (md vocabulary §; M, layered on C10)
  C12: #37 _can_view_governance mirror     (md note; S, gates #66)
  C13: #39 AdminConsoleCapabilities builder (catalog NEW admin surface; M, gates #66)

P5 (frontend authz + capability-schema)
  C14: #65 crudCapabilitySchema base       (catalog field-shape parity; M)
  C15: #66 AuthContext split               (md:131; M, depends C12+C13)

P6 (KRI ADR + bounded contexts)
  C16: #73 ADR-012 KRI period algebra      (no contract surface; M)
  C17: #74a 31-package census              (no contract surface; M-L)
  C18: #74b ADR-007 amendment              (no contract surface; M, depends C17)

P7 (vendor model migration window)
  C19: #69 + #70 bundle                    (md:121,122 + ADR-010 doc; L)
  C20: #57 quarterly_comparison_service    (no `service_policy` cite; S)
```

This ordering keeps every Pydantic ↔ Zod parity-introducing item (#15, #39, #65)
sequenced AFTER any item that deletes its sensitive paths, so Check 4 sees a
stable code-side surface when the catalog gains its new entry.

---

## Per-item validator concerns (in cluster order)

### Item #15 — access_user catalog gap (new surface) — **Commit C2**

- Validator concerns: **check 1**, **check 2** (sensitive_change_paths must list
  `backend/app/schemas/access.py` + `frontend/src/types/access.ts`), **check 3**
  (discovery scan must align with new contract paths), **check 4** (the
  Pydantic ↔ Zod field-shape parity for the new 8th surface — 7 expected fields
  per `plan-loop-1-07-endpoints.md:144-152`), **check 5** (markdown matrix must
  list `access_user` row).
- Specific lines touched:
  `docs/security/capability-catalog.json` — append 8th surface object
  (insertion after current 7-surface list at `:7-215`).
  `docs/security/authorization-capability-contract.md` — new matrix row for
  `access_user`.
  `docs/security/authorization-capability-contract.json` — add
  `backend/app/schemas/access.py` to `sensitive_change_paths` and any new
  `AUTHZ-ACCESS-USER` action entries the catalog requires.
- Pre-commit gate: must run
  `python3 scripts/security/validate_authz_capability_contract.py` and pass.
- Failure mode if skipped: **check 4 (Pydantic ↔ Zod parity)** would emit
  `capability_catalog_backend_field_missing` /
  `capability_catalog_backend_field_extra` /
  `capability_catalog_frontend_field_missing` /
  `capability_catalog_frontend_field_extra` (`capability_catalog.py:269-306`)
  if any of the 7 fields drift between `backend/app/schemas/access.py:66-72`
  and `frontend/src/types/access.ts:51`. Also **check 2** would fail if the
  catalog points at a non-existent path.

### Item #56 — directory_identity_service shim — **Commit C3**

- Validator concerns: **check 2** (drop
  `backend/app/services/directory_identity_service.py` from
  `sensitive_change_paths`), **check 3** (discovery sweep finds `Capabilities`
  pattern in directory paths post-move; ensure new path is covered).
- Specific lines touched:
  `docs/security/authorization-capability-contract.md:109` — remove
  `directory_identity_service.py` token from `service_policy` row.
  `docs/security/authorization-capability-contract.json:106` (sensitive_change_paths)
  + `:229` (`service_policy` blob).
- Pre-commit gate: must run
  `python3 scripts/security/validate_authz_capability_contract.py` and pass.
- Failure mode if skipped: **check 2** would emit `contract_path_missing` for
  the deleted shim when other actions still cite it; **check 7 doc-touch**
  would emit `authz_contract_not_updated` if the service file delete touched
  a `sensitive_change_paths` member without atomic md/json edits
  (`contract_manifest.py:241-251`).

### Item #61 — graph_directory move — **Commit C4** (paired with #56)

- Validator concerns: **check 2** (path rewrite from
  `backend/app/services/graph_directory_service.py` →
  `backend/app/services/_graph_directory/service.py`), **check 3** (discovery
  pattern `Capabilities|...Capabilities` in moved files must remain covered).
- Specific lines touched:
  `docs/security/authorization-capability-contract.md:109` — rewrite
  `graph_directory_service.py` → `_graph_directory/service.py`.
  `docs/security/authorization-capability-contract.json:113` (sensitive_change_paths)
  + `:229` (`service_policy` blob).
- Pre-commit gate: must run
  `python3 scripts/security/validate_authz_capability_contract.py` and pass.
- Failure mode if skipped: **check 2** would emit `contract_path_missing` for
  the old path; **check 3** could emit `discovered_authz_path_not_contractual`
  if the new files are picked up by discovery scan but absent from contract.

### Item #55 — access_user_service facade — **Commit C5**

- Validator concerns: **check 2** (drop facade from sensitive_change_paths and
  service_policy strings), **check 7** (atomic doc-touch when
  `endpoints/access.py` import flips).
- Specific lines touched:
  `docs/security/authorization-capability-contract.md:109`,
  `docs/security/authorization-capability-contract.json:106` (sensitive_change_paths),
  `:229` (service_policy blob).
- Pre-commit gate: must run
  `python3 scripts/security/validate_authz_capability_contract.py` and pass.
- Failure mode if skipped: **check 2** `contract_path_missing` for deleted
  `access_user_service.py`; **check 7** `authz_contract_not_updated` if
  `endpoints/access.py:19,209` is touched without simultaneous
  `contract.{md,json}` edits.

### Item #13 — vendor_link_helpers shim delete — **Commit C6**

- Validator concerns: **check 2** (drop shim from sensitive_change_paths +
  `AUTHZ-VENDORS-READ` and `AUTHZ-VENDORS-WRITE` `service_policy`).
- Specific lines touched:
  `docs/security/authorization-capability-contract.md:121,122` — remove the
  two lines citing the shim.
  `docs/security/authorization-capability-contract.json:55` (sensitive_change_paths)
  + `:479` (`AUTHZ-VENDORS-READ.service_policy`)
  + `:502` (`AUTHZ-VENDORS-WRITE.service_policy`).
- Pre-commit gate: must run
  `python3 scripts/security/validate_authz_capability_contract.py` and pass.
- Failure mode if skipped: **check 2** `contract_path_missing` for the deleted
  endpoint shim path that still appears in two action `service_policy` strings.

### Items #51 + #24 — KRI value_application + linked_vendors barrel atomic — **Commit C7**

- Validator concerns: **check 2** (drop the two paths from sensitive_change_paths
  and from three AUTHZ-KRI* `backend_authority` cells), **check 3** (discovery
  must still cover canonical `_kri_history/direct_application.py` post-repoint),
  **check 7** (atomic doc-touch — both `.md` and `.json` edited in same commit
  since changed files match sensitive_change_paths).
- Specific lines touched:
  `docs/security/authorization-capability-contract.md:116,117,118` — three
  `backend_authority` cells listing `kris/linked_vendors.py`.
  `docs/security/authorization-capability-contract.md:117,118,161` — three
  `service_policy`/inventory cells listing `value_application.py`.
  `docs/security/authorization-capability-contract.json:368,388,410` — three
  JSON `backend_authority` strings (linked_vendors).
  `docs/security/authorization-capability-contract.json:389,411` — two
  JSON `service_policy` strings (value_application).
- Pre-commit gate: must run
  `python3 scripts/security/validate_authz_capability_contract.py` and pass.
- Failure mode if skipped: **check 2** `contract_path_missing` for both
  deleted files; **check 7** `authz_contract_not_updated` because the file
  deletes match `sensitive_change_paths` and would require atomic md/json
  edits (`contract_manifest.py:241-251`).

### Item #50 — kri_history submission wrapper — **Commit C8**

- Validator concerns: **check 2** (drop `submission.py` from three md cells +
  two json cells).
- Specific lines touched:
  `docs/security/authorization-capability-contract.md:117,118,161` — three
  service-policy/inventory cells.
  `docs/security/authorization-capability-contract.json:389,411` — two JSON
  service_policy strings.
- Pre-commit gate: must run
  `python3 scripts/security/validate_authz_capability_contract.py` and pass.
- Failure mode if skipped: **check 2** `contract_path_missing` for the
  deleted file string that remains in 5 doc-citation locations.

### Item #62 — kri_vendor_assignment relocation — **Commit C9**

- Validator concerns: **check 2** (path rewrite from
  `backend/app/services/kri_vendor_assignment.py` →
  `backend/app/services/_vendor_links/kri_assignment.py`), **check 7**
  (atomic doc-touch).
- Specific lines touched:
  `docs/security/authorization-capability-contract.md:172` — perimeter-pass
  note path update.
  `docs/security/authorization-capability-contract.json` — verify no token in
  `sensitive_change_paths` cites the old path; if so, rewrite (per
  `plan-loop-1-04-kris.md:277-278`).
- Pre-commit gate: must run
  `python3 scripts/security/validate_authz_capability_contract.py` and pass.
- Failure mode if skipped: **check 2** `contract_path_missing` for the
  pre-move path if cited; **check 7** if any sensitive_change_paths member
  is touched without doc edits.

### Item #34 — resolve_approval_privilege_tier — **Commit C10**

- Validator concerns: **check 5** (markdown vocabulary section must add
  "privilege tier" entry — markdown matrix is governed by 9 required
  sections at `markdown_validation.py:11-21` including `## Vocabulary`).
- Specific lines touched:
  `docs/security/authorization-capability-contract.md` — append
  `## Vocabulary` "privilege tier" entry; AUTHZ-APPROVALS row references
  the new helper alongside `approval_scenario_policy.py`.
  `docs/security/authorization-capability-contract.json` — refresh as
  needed (per `plan-loop-1-03-approvals.md:169-170`).
- Pre-commit gate: must run
  `python3 scripts/security/validate_authz_capability_contract.py` and pass.
- Failure mode if skipped: **check 5** would emit a markdown-section finding
  if the Vocabulary edit broke section parity; **check 2** path-existence
  if the new `service_policy` cite is mistyped.

### Item #60 — PrivilegeContext + Depends(get_privilege_context) — **Commit C11**

- Validator concerns: **check 5** (markdown vocabulary — adds "privilege context"
  alongside #34's "privilege tier").
- Specific lines touched:
  `docs/security/authorization-capability-contract.md` — append Vocabulary
  "privilege context" entry; AUTHZ-APPROVALS row cites
  `get_privilege_context` as request-scoped facade.
  `docs/security/authorization-capability-contract.json` — refresh.
- Pre-commit gate: must run
  `python3 scripts/security/validate_authz_capability_contract.py` and pass.
- Failure mode if skipped: **check 5** vocabulary-section drift; **check 2**
  if `app/api/deps.py` becomes a sensitive-path candidate.

### Item #37 — _can_view_governance mirror replaced — **Commit C12**

- Validator concerns: **check 4** (Pydantic side `MeCapabilities` retains
  `can_view_governance: bool`; runtime now derives from one builder, but the
  catalog field-shape is unchanged so check 4 should pass without change).
- Specific lines touched: contract markdown note that
  `can_view_governance` has only one source of truth (per
  `plan-loop-1-06-frontend.md:245`); no schema/json edits required.
- Pre-commit gate: must run
  `python3 scripts/security/validate_authz_capability_contract.py` and pass.
- Failure mode if skipped: low — but **check 4** would surface any silent
  field-rename in `MeCapabilities` if the cleanup accidentally removed a
  field from the Pydantic class.

### Item #39 — AdminConsoleCapabilities builder — **Commit C13**

- Validator concerns: **check 4 (Pydantic ↔ Zod parity)** — current catalog
  has 7 surfaces (per `05-adrs-capability-contract.md:179-186`); this item
  promotes the static stub to a real builder that may add/lock fields on
  `AdminConsoleCapabilities`. The 4 admin capability fields per
  `plan-loop-1-06-frontend.md:268-270` must be reflected on a NEW catalog
  surface (`admin_console`) or in `me_capabilities` (verify which).
  **check 2** sensitive_change_paths must include
  `backend/app/services/_authorization_capabilities/admin.py` (the new file)
  and `backend/app/api/v1/endpoints/admin/capabilities.py`.
- Specific lines touched:
  `docs/security/capability-catalog.json` — pin authoritative truth tables
  for the 4 admin capabilities (`plan-loop-1-06-frontend.md:270`).
  `docs/security/authorization-capability-contract.md` — document the new
  builder seam.
  `docs/security/authorization-capability-contract.json` — sensitive_change_paths
  add `_authorization_capabilities/admin.py`.
- Pre-commit gate: must run
  `python3 scripts/security/validate_authz_capability_contract.py` and pass.
- Failure mode if skipped: **check 4 (parity)** would emit
  `capability_catalog_backend_field_missing` /
  `capability_catalog_frontend_field_missing` if the new admin-builder
  fields drift between Pydantic and Zod (this is the Pydantic ↔ Zod parity
  failure mode for #39). **check 2** path-missing if the new file is not in
  sensitive_change_paths.

### Item #65 — crudCapabilitySchema FE shared base — **Commit C14**

- Validator concerns: **check 4 (Pydantic ↔ Zod parity)** — refactor MUST
  preserve `passthroughObject` / `z.boolean()` patterns recognised by
  `BACKEND_BOOL_FIELD_PATTERN` (`capability_catalog.py:13-18`) and
  `extract_typescript_schema_body` (`capability_catalog.py:112-140`). The
  validator parses the TS schema body brace-matched, so `crudCapabilitySchema.merge(...)`
  composition must still expose all per-entity fields when the TS resolver
  reads them (the parser walks the `merge` chain via brace matching).
- Specific lines touched: NO contract markdown/json edits; only
  `docs/security/capability-catalog.json` field-list pinning per
  `plan-loop-1-06-frontend.md:393`.
  Affected catalog surfaces: `risk` (19 fields), `control` (20 fields),
  `kri` (23 fields per catalog; Loop B notes 14 — verify on landing per
  `plan-loop-1-06-frontend.md:378`), `vendor` (14 fields). Issues schema is
  intentionally unchanged.
- Pre-commit gate: must run
  `python3 scripts/security/validate_authz_capability_contract.py` and pass.
- Failure mode if skipped: **check 4 (parity)** is the dominant failure mode
  — if `crudCapabilitySchema` introduces a base field set
  `{can_read, can_update}` and any of the 4 entities forgets to merge their
  remaining fields, the validator emits
  `capability_catalog_frontend_field_missing` for every dropped flag
  (`capability_catalog.py:299-306`).

### Item #66 — AuthContext split — **Commit C15**

- Validator concerns: **check 7 (frontend local-gate per-file allowlist)** —
  current FRONTEND_LOCAL_GATE_CLASSIFICATIONS at
  `scripts/security/authz_contract_manifest.py:13-63` lists only
  `frontend/src/authz/policy.ts`, `useAuthz.ts`, `routing/business.tsx`,
  `components/layout/Sidebar.tsx`, `hooks/usePermissions.ts`. The new
  `SessionContext.tsx`, `PreferencesContext.tsx`, `AuthActionsContext.tsx`
  may inherit local-gate-like patterns (e.g., `hasPermission` consumption);
  if so, the allowlist must be extended in the same commit.
- Specific lines touched: only if new contexts contain authz tokens —
  `docs/security/authorization-capability-contract.md:131` (frontend gate row
  for `useAuth` consumption); validator may also flag
  `frontend/src/contexts/AuthContext.tsx` if its memoisation refactor
  surfaces `hasPermission` calls in lines matched by
  `FRONTEND_AUTHZ_TOKEN_PATTERN` (`contract_manifest.py:31`).
- Pre-commit gate: must run
  `python3 scripts/security/validate_authz_capability_contract.py` and pass.
- Failure mode if skipped: **check 7** `frontend_local_gate_pattern_disallowed`
  if the new contexts ship a permission-check pattern not in the per-file
  allowlist (`frontend_local_gates.py`). **check 5** matrix parity if
  `## Vocabulary` references `useAuth` semantics that drift.

### Item #57 — quarterly_comparison_service facade — **Commit C20**

- Validator concerns: **check 2** (no sensitive_change_paths cite the facade,
  per `plan-loop-1-05-vendor-quarterly.md:165`; verify on landing); **check 7**
  doc-touch parity — facade deletion plus endpoint repoint.
- Specific lines touched: facade is NOT in `sensitive_change_paths` (Loop B
  confirmed); the `_quarterly_comparison/composition` package is. No
  contract md/json edits required for this item.
- Pre-commit gate: must run
  `python3 scripts/security/validate_authz_capability_contract.py` and pass.
- Failure mode if skipped: low — primarily safeguarded by deepening lock
  rewrite at `test_architecture_deepening_contracts.py:559-569`. Validator
  is run as a defence-in-depth gate.

### Items #69 + #70 bundle — Vendor mixin + Vendor.status drop — **Commit C19**

- Validator concerns: **check 2** — `models/vendor.py` and the new
  `models/_vendor_link_mixin.py` may be in sensitive_change_paths (per
  `authorization-capability-contract.json:55,479,502` cites
  `vendor_link_helpers.py` — verify on landing whether vendor models are
  cited too). **check 7** doc-touch if the vendor capability projection
  cells need editing.
- Specific lines touched: existing `docs/security/authorization-capability-contract.md`
  rows for vendor are at `:121-123`; this bundle does NOT change the
  capability contract surface (Vendor is dropped from response shape, but
  `VendorCapabilities` Pydantic class — the catalog-checked one — is
  unchanged).
- Pre-commit gate: must run
  `python3 scripts/security/validate_authz_capability_contract.py` and pass.
- Failure mode if skipped: low — `VendorCapabilities` field-shape parity is
  unaffected by the Vendor model column drop. The bundle's primary risk is
  Postgres migration safety (ADR-010), not capability contract.

### Item #74b — ADR-007 amendment — **Commit C18**

- Validator concerns: NONE directly — this item touches ADRs and
  classification TOMLs only. The validator does not parse ADRs or TOMLs.
- Specific lines touched: no contract-surface changes.
- Pre-commit gate: must run
  `python3 scripts/security/validate_authz_capability_contract.py` and pass
  as a regression check (no expected change).
- Failure mode if skipped: nil — the validator runs as defence-in-depth.

### Item #34 / #60 — duplicate listing reminder

#34 and #60 both edit `## Vocabulary`. Sequence #34 (C10) before #60 (C11) to
keep markdown deltas additive; running the validator after each ensures the
9-section invariant (`markdown_validation.py:11-21`) is intact.

---

## Items requiring validator (count + summary table)

**Count: 16 items in scope.**

| Cluster | Item | Title | Validator concern (primary check) | Pydantic↔Zod parity? |
|---------|------|-------|------------------------------------|---------------------|
| C2  | #15  | access_user catalog gap          | check 4 (NEW surface) | **YES** |
| C3  | #56  | directory_identity_service       | check 2 + 7           | no |
| C4  | #61  | graph_directory move             | check 2 + 7           | no |
| C5  | #55  | access_user_service              | check 2 + 7           | no |
| C6  | #13  | vendor_link_helpers              | check 2 + 7           | no |
| C7  | #51+#24 | KRI value_application + linked_vendors atomic | check 2 + 7 (5 cells md, 5 strings json) | no |
| C8  | #50  | kri_history submission           | check 2 + 7           | no |
| C9  | #62  | kri_vendor_assignment            | check 2 + 7           | no |
| C10 | #34  | resolve_approval_privilege_tier  | check 5 (vocabulary)  | no |
| C11 | #60  | PrivilegeContext                 | check 5 (vocabulary)  | no |
| C12 | #37  | governance capability builder    | check 4 (regression)  | no (regression-only) |
| C13 | #39  | AdminConsoleCapabilities builder | check 4 (NEW fields)  | **YES** |
| C14 | #65  | crudCapabilitySchema (FE)        | check 4 (4 surfaces)  | **YES** |
| C15 | #66  | AuthContext split                | check 7 (FE allowlist)| no |
| C19 | #69+#70 | vendor mixin + status drop bundle | check 2 + 7 (low)  | no |
| C20 | #57  | quarterly_comparison facade      | check 2 + 7 (low)     | no |

**Pydantic ↔ Zod parity items (failure mode = check 4):**
- **#15** access_user — adds 8th catalog surface (7 fields).
- **#39** AdminConsoleCapabilities — promotes static stub; pins the 4-field
  admin builder against the catalog.
- **#65** crudCapabilitySchema — introduces shared Zod base; risks dropping
  fields from any of `risks`/`controls`/`kris`/`vendors` if `merge()` chain
  is wrong.

**Items NOT in scope (no contract surface touched), confirmed via Loop 1 plans:**
#2, #3, #4, #5, #6, #7, #8, #9, #14, #16, #17, #18, #21, #22, #23, #25, #26, #27,
#28, #29, #30, #31, #32, #33, #35, #36, #38, #40, #41, #42, #43, #44, #45a, #45b,
#46, #47, #48, #49, #52, #53, #54, #58, #59, #63, #64, #67, #68, #71, #72, #73,
#74a, #75. (Validator should still run as defence-in-depth on commits that touch
sensitive_change_paths members; per Loop 1 grep these items do not.)

---

## Special considerations for new ADRs (#72 / #73 / #74b)

The validator runs after each ADR's locks land, but the validator itself does
not gate ADR text. Concretely:

- **#72 ADR-011 (C1)**: validator must pass after the ADR + index update.
  Expected output: zero findings (no contract surface touched). Run as
  defence-in-depth.
- **#73 ADR-012 (C16)**: validator must pass after the ADR + lock TOML +
  classify collapse. Expected output: zero findings (KRI period algebra
  is not in the contract surface — `REPORTING_GRACE_DAYS` is governed by
  ADR-012, not the catalog). Run as defence-in-depth.
- **#74a + #74b ADR-007 amendment (C17 + C18)**: validator must pass after
  each PR. Expected output: zero findings. Adapter classification TOMLs
  are not contract artefacts.

---

## Recommended pre-commit hook addition (runbook step)

Add a step to the developer's local `make pre-commit` (if it exists) or to a
new `scripts/dev/precommit.sh`:

```sh
#!/usr/bin/env bash
set -euo pipefail
echo "==> Running architecture locks…"
make -f scripts/Makefile test-architecture-locks
echo "==> Running capability contract validator…"
python3 scripts/security/validate_authz_capability_contract.py
```

For the items above, the developer's local pre-commit checklist is:

1. `pytest <new-RED-test>.py` — confirm RED.
2. Implement fix.
3. `pytest <new-RED-test>.py` — confirm GREEN.
4. `pytest <full domain test suite>` — no regressions.
5. **`python3 scripts/security/validate_authz_capability_contract.py`** —
   exit 0 required.
6. `make -f scripts/Makefile test-architecture-locks` — exit 0 required.
7. `git add` + `git commit`.

The validator is the **gate** between `pytest` and `git commit` for every
item in the table above. CI re-runs the validator (per AGENTS.md) but is a
backstop, not the gate.

---

## Risk register

- **C7 (#51+#24 atomic)** — highest doc-edit volume in any single commit
  (5 md cells + 5 json strings); a missed cell triggers
  `authz_contract_not_updated` (`contract_manifest.py:241-251`). Mitigation:
  run validator twice — once after staging the file deletes, once after
  staging the doc edits — to catch incomplete sweeps.
- **C13 (#39)** — first item to introduce a NEW capability surface
  (`admin_console`) that the catalog must validate. Mitigation: add the
  new catalog surface, the Pydantic class, and the Zod schema in
  separable commits IF the validator can be made to skip catalog parity
  via env var (it cannot, per current code); otherwise atomic single
  commit.
- **C14 (#65)** — refactor risk: `passthroughObject({ ... }).merge(...)`
  composition must produce the same brace-matched body that
  `_extract_typescript_schema_body` (`capability_catalog.py:112-140`) walks.
  Mitigation: behavioural test on field-set equality (per
  `plan-loop-1-06-frontend.md:383-385`) BEFORE landing the validator step.

End of validator-run schedule.
