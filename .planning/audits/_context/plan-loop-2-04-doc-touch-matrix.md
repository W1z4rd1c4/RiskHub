# Phase 3 Loop 2 Plan — Doc/README Touch Matrix

Working dir: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Branch `main`, head `1ee872a4`.

This matrix is a "doc-cell coverage map": for every doc/README that any Loop-1
item touches, list every item that touches it. Single-developer sequential
execution; doc/lock-only Reject is invalid; defers planned (per orchestrator).

Rules honored:
- File:line cites with ≤15-word quotes for every claim.
- Atomic-commit invariant: code + capability-contract + lock + README move
  together. Each doc cell shows whether items can land in one commit or must
  be sequential.
- Single doc cannot be half-edited across two non-adjacent items: if two items
  rewrite the same line, they must be commit-adjacent OR bundled.

Sources synthesized (all 8 plan-loop-1-*.md files plus
`_context/08-documentation-surface.md`).

---

## 1. Reject-anchor docs (orchestrator override)

These doc cells are "Reject anchors" — the developer's defer cited the doc as
load-bearing. Per orchestrator, the doc lock falls and the line is rewritten
in the SAME commit as the code change. No two-step "doc later" path is
allowed.

### Doc: `backend/app/services/_quarterly_comparison/README.md`
- Items touching: [#57 — rewrite-section]
- Citation: `:16` quote `"Keep backend/app/services/quarterly_comparison_service.py as the public service entrypoint."`
- Override rationale: this line is the developer's S8.1 reject evidence (per
  `08-documentation-surface.md:368-376`). Per orchestrator override, the
  facade is deleted and this line is replaced with a pointer at
  `dashboard/quarterly.py` consuming `_quarterly_comparison.composition`
  directly (per `plan-loop-1-05-vendor-quarterly.md:166-167`).
- Total: 1
- Sequencing: independent leaf (cluster F in Vendor/Quarterly plan).
- Atomic-commit recommendation: SAME commit as #57's facade delete +
  endpoint repoint + lock rewrite at `test_architecture_deepening_contracts.py:559-569`.

### Doc: `.planning/codebase/CONVENTIONS.md`
- Items touching: [#57 — remove-line, #66 — update-line]
- #57: `:22` quote `"…risk_questionnaire_service.py, quarterly_comparison_service.py,"`
  must drop `quarterly_comparison_service.py` from the facade list (per
  `plan-loop-1-05-vendor-quarterly.md:168`).
- #66: `:43` quote `"Auth state and permissions sourced from AuthContext (frontend/src/contexts/AuthContext.tsx)"`
  must update if AuthContext composes the new SessionProvider/AuthActionsProvider
  facade (per `08-documentation-surface.md:741`,
  `plan-loop-1-06-frontend.md:421-425`).
- Total: 2
- Sequencing: items are non-adjacent (#57 in vendor-quarterly domain, #66 in
  frontend domain). They edit different lines of the same file, so they CAN
  land in independent commits — neither edit conflicts with the other.
- Atomic-commit recommendation: each edit lands with its own code change.
  No bundling required because the two lines (`:22` and `:43`) are disjoint.

### Doc: `.planning/codebase/CONCERNS.md`
- Items touching: [#57 — rewrite-line, #71 — keep, #66 — keep]
- #57: `:14` quote `"Committee quarterly snapshot semantics: …/quarterly_comparison_service.py, …/_quarterly_comparison/, …/dashboard/quarterly.py"`
  must rewrite to drop the facade (per
  `plan-loop-1-05-vendor-quarterly.md:169`).
- #71/#66: `:9` quote `"Risk questionnaire lifecycle, clarification, compare-mode…riskhub_questionnaires.py"`
  KEEPS because #10 keeps `riskhub_questionnaires.py` (per
  `plan-loop-1-07-endpoints.md:23-24`); no edit needed for #10/#38.
- #71: `:40` quote `"keep frontend/src/services/bootstrapSessionCache.ts as a compatibility layer"`
  may need adjustment after the 4-file merge of `services/session/`. Verify
  on landing; likely no edit (the line names a file that survives).
- Total: 1 active rewrite (#57); 0 net edits for #66/#71.
- Sequencing: #57 standalone.
- Atomic-commit recommendation: SAME commit as #57 facade delete.

### Doc: `AGENTS.md`
- Items touching: [#10 — keep, #38 — keep, #40 — verify, #44 — verify, #45b — verify-RBAC, #57 — implicit (no edit), #66 — verify, #72 — add-line, #74b — verify]
- #10/#38: `:162` quote `"app.api.v1.endpoints.riskhub.get_cro_user (used by …riskhub_questionnaires.py)"`
  KEEPS the file (per `plan-loop-1-07-endpoints.md:23-24`). Same commit as
  #38's schema move documents the module's purpose docstring; AGENTS.md
  itself does NOT need edit for the schema move — the re-export invariant
  holds.
- #40: `:157` quote `"controls/, risks/, kris/, dashboard/, issues/, reports/, riskhub/, approvals/, departments/, users/, vendors/, vendor_incidents/, vendor_dependencies/, vendor_slas/, admin/, risk_questionnaires/"`
  endpoint package list must remain consistent after admin sub-router
  re-cluster (per `plan-loop-1-08-crosscut.md:67-72`); admin stays in the
  list. Verify-only.
- #45b: `:191-205` RBAC and Business Logic Guardrails — verify still
  accurate after ownership-resolver factory lands (per
  `08-documentation-surface.md:760, 890`). Likely no edit because the
  factory preserves the public 8-name surface.
- #66: `:212` quote `"Per-row capability data remains on {Risk,Control,Vendor,Issue,KRI}Read.capabilities"`
  KEEPS. Per-row capability shape is unchanged by the AuthContext split
  (per `08-documentation-surface.md:907-913`).
- #72 (ADR-011): add ADR-011 row to the ADR list at `:218-231` (per
  `08-documentation-surface.md:944-949`,
  `plan-loop-1-08-crosscut.md:582-586`).
- #74b: same `:218-231` ADR list — add ADR-007 amendment reference
  (per `08-documentation-surface.md:956-958`).
- Total: 9 items reference; 2 items add lines (#72, #74b); 7 items verify
  the file remains accurate.
- Sequencing: #72 and #74b can be independent commits but both edit the
  same `:218-231` block. To keep diffs clean, land #72 first (P1 doc-only,
  per `plan-loop-1-08-crosscut.md:765-766`), then #74b after the census.
- Atomic-commit recommendation: 2 commits (one per ADR add); other items
  KEEP without edit so no commit churn.

### Doc: `docs/agent/ENDPOINT_INVARIANTS.md`
- Items touching: [#10 — keep, #20 — date-bump, #38 — keep]
- #10/#38: `:13` quote `"app.api.v1.endpoints.riskhub.get_cro_user (used by …riskhub_questionnaires.py)"`
  KEEPS the file path reference (per `plan-loop-1-07-endpoints.md:21-23`).
- #20: `:21-22` quote `"Verification date: 2026-02-16"` — bump to landing
  date as part of #20's doc-only commit (per
  `plan-loop-1-02-risks.md:380-382`).
- Total: 3 items reference; 1 item edits (#20).
- Sequencing: #20 is independent (last in risks domain).
- Atomic-commit recommendation: #20 single commit lands the date bump
  alongside its `_red` test additions.

### Doc: `docs/security/authorization-capability-contract.md` and `.json`

Items that touch these contract files (cells listed below):

| Item | md lines | json lines | Edit kind |
| --- | --- | --- | --- |
| #13 (vendor_link_helpers DELETE) | `:121, :122` | `:55, :479, :502` | remove-line |
| #15 (access_user surface) | `:132` (matrix add) | new entry added | add-line + matrix add |
| #24 (kris/linked_vendors barrel) | `:116, :117, :118` | `:368, :388, :410` | remove-token |
| #34 (privilege tier extract) | `:119` (AUTHZ-APPROVALS row) | `:629` (Vocabulary append) | rewrite-section |
| #37 (build_me_capabilities) | implicit (no token edit) | implicit | verify |
| #39 (admin capabilities builder) | `:132` (AUTHZ-ADMIN-CONSOLE-CAPABILITIES) | `:719` (parallel) | rewrite-row |
| #50 (kri submission delete) | `:117, :118, :161` | `:389, :411` | remove-token |
| #51 (kri value_application delete) | `:117, :118, :161` | `:389, :411` | remove-token |
| #55 (access_user_service delete) | `:109` (AUTHZ-DIRECTORY) | `:106, :229` | remove-token |
| #56 (directory_identity_service delete) | `:109` | `:111, :229` | remove-token |
| #57 (quarterly_comparison facade) | implicit (no contract token) | implicit | verify |
| #60 (PrivilegeContext) | `:119, :131` (vocabulary) | `:629, :692` (Vocabulary append) | rewrite-section |
| #61 (graph_directory move) | `:109` | `:113, :229` | path-rewrite |
| #62 (kri_vendor_assignment relocate) | `:172` (perimeter-pass note) | (verify) | path-rewrite |
| #65 (CRUD capability schema) | (capability-catalog.json owned) | (catalog snapshot) | catalog-snapshot |
| #66 (AuthContext split) | `:131` | (parallel) | path-rewrite |
| #69 (vendor link mixin) | `:121, :122` | (verify backend authority) | verify |
| #70 (Vendor.status drop) | implicit | implicit | verify |
| #71 (session module merge) | `:131` | (parallel) | path-rewrite |

**Totals**:
- `docs/security/authorization-capability-contract.md`: 14 distinct items
  reference; 11 actively edit; 3 verify-only.
- `docs/security/authorization-capability-contract.json`: same 14 items;
  citations on lines `55, 106, 111, 113, 229, 368, 388, 389, 410, 411,
  479, 502, 629, 692, 719`.

**"Must update together" groups**:

1. **AUTHZ-VENDORS-{READ,WRITE} block** (#13, #69):
   - md `:121, :122` and json `:55, :479, :502` cite
     `vendor_link_helpers.py`. #13 deletes the file → drop tokens.
   - #69 introduces `AbstractVendorLink` mixin; backend authority paths in
     md `:121, :122` and json `:479, :502` ALREADY name `_vendor_links/`,
     so no token add is required by #69 itself, but the mixin commit must
     verify the backend authority remains accurate.
   - Sequencing: #13 first (P1 leaf, no migration), then #69+#70 bundled.
   - Atomic-commit recommendation: #13 standalone, then #69+#70 bundled
     migration commit.

2. **AUTHZ-KRIS-{READ,WRITE,HISTORY} block** (#24, #50, #51):
   - md `:116, :117, :118, :161` and json `:368, :388, :389, :410, :411`
     cite `kris/linked_vendors.py`, `_kri_history/submission.py`, and
     `_kri_history/value_application.py`.
   - #24 deletes `kris/linked_vendors.py` (atomic with #51 per
     `plan-loop-1-04-kris.md:54-79`).
   - #50 deletes `_kri_history/submission.py` standalone.
   - #51 deletes `_kri_history/value_application.py` (atomic with #24).
   - Sequencing: #24+#51 bundled (cluster A); #50 standalone before or
     after.
   - Atomic-commit recommendation: 2 commits — one for #24+#51 bundle,
     one for #50.

3. **AUTHZ-DIRECTORY-ADMIN-LIFECYCLE block** (#55, #56, #61):
   - md `:109` and json `:106, :111, :113, :229` cite
     `access_user_service.py`, `directory_identity_service.py`,
     `graph_directory_service.py`.
   - #55 deletes `access_user_service.py` (P2 leaf).
   - #56 + #61 bundled (paired — `_graph_directory/service.py:8` imports
     from the directory_identity shim per
     `plan-loop-1-08-crosscut.md:362-368`).
   - Sequencing: #55 first, then #56+#61 paired.
   - Atomic-commit recommendation: 2 commits — #55 standalone, then
     #56+#61 paired wave (single PR with two commits or one commit).

4. **AUTHZ-APPROVALS Vocabulary** (#34, #60):
   - md `:119` AUTHZ-APPROVALS row + json `:629` cite
     `approval_scenario_policy.py`. Both items append to the §Vocabulary
     entry in md.
   - #34 lands first (extract `resolve_approval_privilege_tier`).
   - #60 wraps it with `Depends(get_privilege_context)` per
     `plan-loop-1-03-approvals.md:217-218`.
   - Sequencing: hub-wave is sequential (#9 → #34 → #60 per
     `plan-loop-1-03-approvals.md:18-23`).
   - Atomic-commit recommendation: 3 sequential commits.

5. **AUTHZ-AUTH-SESSION block** (#66, #71):
   - md `:131` cites `frontend/src/contexts/AuthContext.tsx` and
     `frontend/src/services/session/`.
   - #66 splits AuthContext (FE-only).
   - #71 merges session 8→4 files (FE-only, depends on ADR-011 #72).
   - Sequencing: #66 first (after backend #37+#39), then #71 (after
     ADR-011).
   - Atomic-commit recommendation: 2 commits.

6. **AUTHZ-ADMIN-CONSOLE-CAPABILITIES** (#39, #40):
   - md `:132` and json `:719` parallel. #39 replaces stub with builder.
     #40 deletes `capabilities.py` after #39 (per
     `plan-loop-1-08-crosscut.md:25-29`).
   - Sequencing: #39 → #40.
   - Atomic-commit recommendation: 2 sequential commits.

7. **D-N2 (#15) — access_user surface add**:
   - Adds 8th surface to `docs/security/capability-catalog.json` plus a
     new row in `docs/security/authorization-capability-contract.md` per
     `plan-loop-1-07-endpoints.md:131-167`.
   - Sequencing: independent leaf (no other item edits the same
     catalog entry).
   - Atomic-commit recommendation: standalone.

### Doc: `docs/security/capability-catalog.json`
- Items touching: [#15 — add-surface, #39 — pin-truth-table, #65 — pin-counts]
- #15: add `access_user` surface entry with 7 fields (per
  `plan-loop-1-07-endpoints.md:131-152`).
- #39: pin authoritative truth table for 4 admin capabilities (per
  `plan-loop-1-06-frontend.md:269-271`).
- #65: pin per-entity capability counts for risks/controls/kris/vendors
  (per `plan-loop-1-06-frontend.md:391-394`).
- Total: 3 items (additive).
- Sequencing: #15 → #39 → #65 (avoid re-snapshotting; per
  `plan-loop-1-06-frontend.md:557-558`).
- Atomic-commit recommendation: 3 sequential commits.

---

## 2. Top-tier doc tree (canonical)

### Doc: `docs/README.md`
- Items touching: [#70 — remove-line, #72 — add-line]
- #70: `:111-112` quote `"…outbox/dispatcher.py. ControlStatus.inactive remains a non-archive lifecycle state; vendor inactive is not retained as a lifecycle status."`
  must drop `Vendor.status` reference (per
  `08-documentation-surface.md:546, 931`,
  `plan-loop-1-05-vendor-quarterly.md:259`).
- #72: `:104-112` Migration Rehearsal — add ADR-011 reference (per
  `08-documentation-surface.md:949`).
- Total: 2.
- Sequencing: #70 lands in the bundled vendor migration; #72 is doc-only.
- Atomic-commit recommendation: independent edits to disjoint lines (#70
  edits `:111-112`, #72 edits `:104-112` block); each lands in its own
  commit.

### Doc: `docs/DOCUMENTATION_TREE.md`
- Items touching: [#70 — verify-line, #72 — add-anchor, #73 — add-anchor, #74b — add-anchor]
- #70: `:84` quote `"…ControlStatus.inactive"` — verify line still
  accurate after `Vendor.status` drop (per
  `08-documentation-surface.md:560, 932`).
- #72: `:86-89` ADR section — add ADR-011 anchor (per
  `08-documentation-surface.md:947`).
- #73: same `:86-89` block — add ADR-012 anchor (per
  `08-documentation-surface.md:954`).
- #74b: same `:86-89` block — verify after ADR-007 amendment lands.
- Total: 4 items; 3 active edits (#72, #73, #74b add lines).
- Sequencing: #72, #73 can land independently; #74b after #74a census.
- Atomic-commit recommendation: each ADR add in its own commit.

### Doc: `docs/BUSINESS_LOGIC.md`
- Items touching: [#70 — remove-line]
- #70: `:619` quote `"POST /api/v1/vendors/{id}/restore … status='active' as backward-compat alias"`
  — remove `Vendor.status` backward-compat reference (per
  `08-documentation-surface.md:582, 936`,
  `plan-loop-1-05-vendor-quarterly.md:263`).
- Total: 1.
- Sequencing: bundled with #69+#70 vendor migration.
- Atomic-commit recommendation: SAME commit as the bundled migration.

### Doc: `docs/TESTING.md`
- Items touching: [#10 — keep]
- #10: `:19` quote `"…test_riskhub_questionnaires.py"` KEEPS (per
  `plan-loop-1-07-endpoints.md:23, 56-57`).
- Total: 0 active edits.
- Sequencing: n/a.
- Atomic-commit recommendation: no commit.

### Doc: `docs/AUTHZ_LIST_POLICY.md`
- Items touching: [potentially #34 — verify, #60 — verify]
- Listed as canonical core doc (`docs/README.md:42`); behavior contract for
  list scoping. Touched indirectly by changes in `_register_listings/`,
  `_permissions/`, or per-row capability shape (per
  `08-documentation-surface.md:1015-1016`).
- Total: 0 active edits planned in Loop 1.
- Sequencing: n/a.
- Atomic-commit recommendation: no commit.

### Doc: `docs/GLOSSARY.md`
- Items touching: [#34, #60 — potential vocabulary additions]
- Could host §Vocabulary entries for "privilege tier" and "privilege context"
  if `authorization-capability-contract.md` references them.
- Total: 0 active edits planned (both items append to authz contract
  directly per their plans).
- Sequencing: n/a.
- Atomic-commit recommendation: no commit.

---

## 3. ADR docs (`docs/adr/*`)

### Doc: `docs/adr/README.md`
- Items touching: [#72 — add-row, #73 — add-row, #74b — add-line]
- #72: add ADR-011 row to index (per
  `08-documentation-surface.md:946`,
  `plan-loop-1-08-crosscut.md:585`).
- #73: add ADR-012 row to index (per
  `08-documentation-surface.md:953`,
  `plan-loop-1-04-kris.md:337`).
- #74b: add ADR-007 amendment cross-reference (per
  `plan-loop-1-08-crosscut.md:695-696`).
- Total: 3.
- Sequencing: ADR-011, ADR-012, and ADR-007-amend can be drafted
  independently. #74b waits for #74a (31-package census).
- Atomic-commit recommendation: 3 commits — #72 first (P1, unblocks
  #66/#71 cross-domain), #73 standalone, #74b after #74a green.

### Doc: `docs/adr/ADR-007-bounded-context-taxonomy.md`
- Items touching: [#74a — verify, #74b — append-amendment]
- #74a does NOT touch this file (census is in TOMLs).
- #74b: append an amendment section per
  `plan-loop-1-08-crosscut.md:683-688`.
- Sequencing: strict — #74a green → #74b text.
- Atomic-commit recommendation: #74b is its own commit.

### Doc: `docs/adr/ADR-005-archivable-mixin-schema-contract.md`
- Items touching: [#69 — append-line, #70 — rewrite-section]
- #69: note vendor-link tables share `AbstractVendorLink`; mixin is
  independent of archive (per `plan-loop-1-05-vendor-quarterly.md:208`).
- #70: `:13-19` rewrite — `Vendor.status` retired; archive state is
  `is_archived` only across all three register entities (per
  `08-documentation-surface.md:597-599, 933`,
  `plan-loop-1-05-vendor-quarterly.md:261`).
- Total: 2.
- Sequencing: bundled with #69+#70 vendor migration.
- Atomic-commit recommendation: SAME commit as the bundled migration.

### Doc: `docs/adr/ADR-010-postgres-migration-rehearsal-contract.md`
- Items touching: [#69 — append-revision, #70 — append-revision]
- #69 + #70 bundled migration appends a single revision row to the
  forward-only ledger (per `plan-loop-1-05-vendor-quarterly.md:207, 262`).
- Total: 2 (in same commit).
- Sequencing: bundled.
- Atomic-commit recommendation: SAME commit as the bundled migration.

### Doc: `docs/adr/ADR-002-service-owned-transactions.md`
- Items touching: [#63 — verify-line]
- #63: `:44` quote `"consolidated into backend/app/services/outbox/dispatcher.py:24-25,37-38"`
  — refresh if dispatcher line numbers shift after `SchedulerJobRun`
  instrumentation (per
  `08-documentation-surface.md:778-780, 786-788`,
  `plan-loop-1-07-endpoints.md:701-703`).
- Total: 1 (verify only; line numbers may not need update).
- Sequencing: bundled with #63 commit.
- Atomic-commit recommendation: same commit.

### Doc: `docs/adr/ADR-003-domain-exception-taxonomy.md`
- Items touching: [#19 — cross-link]
- #19 strengthens ADR-003 by routing risk-type validation through
  `ValidationError` (per `plan-loop-1-02-risks.md:506-510`). No file edit
  required; cross-link goes in commit body.
- Total: 0 active edits.
- Atomic-commit recommendation: no commit.

### Doc (NEW): `docs/adr/ADR-011-auth-scheme-and-session-model.md`
- Items touching: [#72 — create]
- Author full draft per `verify-loop-a-08-crosscut.md:640-731` with Loop B
  framing correction (per `plan-loop-1-08-crosscut.md:572-574`).
- Total: 1.
- Sequencing: P1 doc-only, unblocks #66 (FE) and #71 (FE-session merge).
- Atomic-commit recommendation: standalone single commit (doc-only).

### Doc (NEW): `docs/adr/ADR-012-kri-time-series-period-algebra.md`
- Items touching: [#73 — create]
- Author full draft per `plan-loop-1-04-kris.md:316-322`.
- Total: 1.
- Sequencing: independent leaf; included in #73 commit alongside lock test
  + TOML + classify collapse + ConfigDefaults pruning.
- Atomic-commit recommendation: SAME commit as #73's broader change.

---

## 4. Backend service READMEs

### Doc: `backend/app/services/_quarterly_comparison/README.md`
Already covered in §1 (Reject-anchor docs).

### Doc: `backend/app/services/_vendor_links/README.md`
- Items touching: [#13 — verify, #62 — extend, #69 — rewrite]
- #13 (delete `vendor_link_helpers.py`): no edit needed — README does not
  cite the shim.
- #62 (KRI vendor assignment): extend the coverage statement at `:13`
  quote `"Link visibility, active-vendor validation, duplicate prevention…"`
  to include KRI assignment (per
  `08-documentation-surface.md:899-902`). The relocation also adds
  `kri_assignment.py` to the contents at `:9` (per
  `plan-loop-1-04-kris.md:261, 274`).
- #69 (vendor link mixin): rewrite to note the three concrete tables share
  `AbstractVendorLink` (per
  `plan-loop-1-05-vendor-quarterly.md:206-207`).
- Total: 3.
- Sequencing: #13 first → #62 → #69+#70 bundled.
- Atomic-commit recommendation: 3 commits — each lands its README change
  with the corresponding code change.

### Doc: `backend/app/services/_authorization_capabilities/README.md`
- Items touching: [#60 — verify]
- #60 (PrivilegeContext): `:5, :21` quote `"Resource-specific backend capability builders used by the public authorization capability facade"`
  + `"Keep …authorization_capabilities.py as the stable facade"` —
  verify still accurate after `PrivilegeContext` is added (per
  `08-documentation-surface.md:893-897`). Likely no edit because
  `_authorization_capabilities.py` remains the facade.
- Total: 1 (verify only).
- Atomic-commit recommendation: no commit.

### Doc: `backend/app/services/_kri_history/README.md`
File EXISTS (verified at `/Users/stefanlesnak/Antigravity/RiskHubOSS/backend/app/services/_kri_history/README.md`).
- Items touching: [#3 — none, #24 — none, #50 — remove-line, #51 — remove-line, #52 — remove-line, #62 — none, #73 — append-line]
- File content (current): `:21` lists `submission.py`, `:22` lists
  `value_application.py`. (Verified via Read.)
- #50 (delete `submission.py`): remove `submission.py` row at `:21` (per
  `plan-loop-1-04-kris.md:154`).
- #51 (delete `value_application.py`): remove `value_application.py` row
  at `:22` (per `plan-loop-1-04-kris.md:155`, atomic with #24).
- #52 (delete `correction_plans.py`): the README does not list
  `correction_plans.py` today (verified). Phase 4 should re-check before
  edit; if it appears in inventory, drop.
- #73 (ADR-012): append "see ADR-012" link (per
  `plan-loop-1-04-kris.md:339`).
- #3 (delete `kriFormWorkflow.ts`), #24 (delete kris/linked_vendors.py),
  #62 (relocate `kri_vendor_assignment.py`): no edit — README scope is
  `_kri_history/`, not endpoint or vendor packages.
- Total: 3 active edits + 1 verify.
- Sequencing: #50 standalone; #24+#51 bundled (cluster A); #73 in its own
  commit.
- Atomic-commit recommendation: 3 commits — #50, then #24+#51 bundle,
  then #73.

### Doc: `backend/app/models/README.md`
- Items touching: [#69 — add-line, #70 — verify]
- #69 (mixin): add `AbstractVendorLink` to the mixin inventory; cross-link
  to `_archivable.py` (per
  `plan-loop-1-05-vendor-quarterly.md:204-205`).
- #70 (Vendor.status drop): if README enumerates `VendorStatus` enum,
  remove. Verify-only because models README is module-shape, not
  enum-by-enum.
- Total: 2.
- Sequencing: bundled with #69+#70 vendor migration.
- Atomic-commit recommendation: SAME commit as the bundled migration.

### Doc (NEW): `backend/app/services/_graph_directory/README.md`
- Items touching: [#61 — create]
- Adapter package overview; cite ADR-007 amendment Adapter category; cite
  ADR-003 domain-exception-translation as adapter responsibility (per
  `08-documentation-surface.md:861`,
  `plan-loop-1-08-crosscut.md:471, 510-512`).
- Total: 1.
- Sequencing: created in #56+#61 paired wave.
- Atomic-commit recommendation: SAME commit as the move.

### Doc: `backend/app/services/_issue_workflow/README.md`
- Items touching: [#2 — verify, #8 — add-line, #14 — verify, #41 — verify, #53 — refresh-list]
- #2 (delete underscore aliases): no edit (per
  `plan-loop-1-01-issues.md:62-63`).
- #8 (B-N2 split): add `assignment.py` description (per
  `plan-loop-1-01-issues.md:103`).
- #14 (S4.4 outbox-only): no edit unless the README enumerates
  `notifications.py`.
- #41 (B-N3): `serialization.py` already listed; no edit (per
  `plan-loop-1-01-issues.md:370`).
- #53 (S4.1 collapse `IssueWorkflowService`): drop `service.py`, refresh
  module list (per `plan-loop-1-01-issues.md:413-415`).
- Total: 5 items; 2 active edits (#8, #53).
- Sequencing: #8 lands first (alias clean), then #53 collapse.
- Atomic-commit recommendation: 2 commits (per the issues domain plan).

### Doc: `backend/app/services/_issue_register/README.md`
- Items touching: [#28 — add-line, #29 — append-line]
- #28 (S4.3 collapse): "`source_mutation.py` — canonical owner of vendor/department resolution and IssueLink department aggregation" (per
  `plan-loop-1-01-issues.md:218-219`).
- #29 (S4.6 source_type_value): "`constants.py` — UNKNOWN_*_LABEL strings and source_type_value coercer (canonical)" (per
  `plan-loop-1-01-issues.md:271`).
- Total: 2.
- Sequencing: #29 after #28 (canonical helper sits next to its main
  consumer per `plan-loop-1-01-issues.md:235`).
- Atomic-commit recommendation: 2 commits.

### Doc: `backend/app/services/_vendor_governance/README.md`
- Items touching: [#31 — add-line]
- #31 (extract row formatters): describe `reports.py` extension (per
  `plan-loop-1-05-vendor-quarterly.md:140`).
- Total: 1.
- Atomic-commit recommendation: SAME commit as #31.

### Doc: `backend/app/services/outbox/README.md`
- Items touching: [#63 — append-note]
- #63: append note that dispatch records `SchedulerJobRun` rows when
  batch is non-empty (per `plan-loop-1-07-endpoints.md:699-701`).
- Total: 1.
- Atomic-commit recommendation: SAME commit as #63.

### Doc: `backend/app/services/_monitoring_response/README.md` (NEW)
- Items touching: [#59 — create]
- Declare projection-layer responsibility; cite
  `MonitoringResponseContext`, `serialize_*` family (per
  `plan-loop-1-07-endpoints.md:615-617`).
- Total: 1.
- Sequencing: after #17 (shim removal) → after #49 (wrapper inline).
- Atomic-commit recommendation: SAME commit as #59 (after #17 and #49).

### Doc: `backend/app/services/_monitoring_status/README.md`
- Items touching: [#59 — sharpen-line]
- #59: `:5-7` sharpen "state queries" framing (per
  `plan-loop-1-07-endpoints.md:619-621`).
- Total: 1.
- Atomic-commit recommendation: SAME commit as #59.

### Doc: `backend/app/services/README.md`
- Items touching: [#55 — remove-row, #56 — remove-row, #61 — rewrite-row]
- #55: drop facade row if listed (per
  `plan-loop-1-08-crosscut.md:319-320`).
- #56: drop top-level `directory_identity_service.py` line (per
  `plan-loop-1-08-crosscut.md:405-407`).
- #61: drop `graph_directory_service.py` (per
  `plan-loop-1-08-crosscut.md:509-511`); add `_graph_directory/`.
- Total: 3 (each a row edit).
- Sequencing: #55 standalone → #56+#61 paired wave.
- Atomic-commit recommendation: 2 commits — #55 standalone, then #56+#61
  paired.

### Doc: `backend/app/api/v1/endpoints/admin/README.md`
- Items touching: [#40 — rewrite-contents]
- #40: `:9-19` rewrite Contents listing after admin sub-router re-cluster
  (per `plan-loop-1-08-crosscut.md:69-70`).
- Total: 1.
- Sequencing: after #39 lands.
- Atomic-commit recommendation: SAME commit as #40.

### Doc: `backend/app/api/v1/endpoints/issues/_shared/README.md`
- Items touching: [#14 — verify, #27 — remove-line, #28 — remove-line, #30 — refresh-list]
- #14: keep `notifications.py` only if `_get_active_user_with_permissions`
  survives (per `plan-loop-1-01-issues.md:142`).
- #27: strike `loading.py` from contents at `:13` (per
  `plan-loop-1-01-issues.md:181`).
- #28: strike `links.py` from contents at `:12` if file is deleted (per
  `plan-loop-1-01-issues.md:218`).
- #30: refresh contents list to reflect surviving files (per
  `plan-loop-1-01-issues.md:333-334`).
- Total: 4. All edit the same Contents block; sequential.
- Sequencing: #27 → #14 → #28 → #30 per issues domain plan.
- Atomic-commit recommendation: per-item commits; the Contents list is
  rewritten incrementally. Each commit's README edit is small and
  targeted.

### Doc: `backend/app/api/v1/endpoints/risk_questionnaires/README.md`
- Items touching: [#10 — verify]
- #10 keeps `riskhub_questionnaires.py` (sibling file, not a package
  member). README does not enumerate the sibling file (per
  `08-documentation-surface.md:469-472`); no edit.
- Total: 0.
- Atomic-commit recommendation: no commit.

### Doc: `backend/app/api/v1/endpoints/riskhub/README.md`
- Items touching: [#10 — verify]
- Same — no mention of `riskhub_questionnaires.py` (per
  `08-documentation-surface.md:474-477`); no edit.
- Total: 0.
- Atomic-commit recommendation: no commit.

### Doc: `backend/app/core/_permissions/README.md`
- Items touching: [#45b — verify-line]
- #45b: `:9-16` lists 6 permission internal modules including
  `ownership.py`. Factory preserves the public 8-name surface, so likely
  no edit; verify on landing (per
  `08-documentation-surface.md:761-764, 887-889`).
- Total: 1 (verify only).
- Atomic-commit recommendation: SAME commit as #45b if edit is needed.

### Doc: `backend/app/api/v1/endpoints/issues/_shared/README.md` (already covered above).

### Doc: `backend/app/api/v1/endpoints/README.md`
- Items touching: [#10 — optional-clarify, #44 — add-subsection]
- #10: optional one-line clarification that `riskhub_questionnaires.py`
  is a sibling-of-package single file with one CRO route (per
  `plan-loop-1-07-endpoints.md:53-54`).
- #44: add an "Endpoint registry" subsection referencing
  `_router_registry.toml` (per
  `plan-loop-1-07-endpoints.md:441-442`).
- Total: 2.
- Sequencing: independent leaves.
- Atomic-commit recommendation: 2 commits.

### Doc: `backend/app/api/v1/endpoints/users/README.md`
- Items touching: [(none in Loop 1)]
- Total: 0.

### Doc: `backend/app/api/v1/endpoints/auth/README.md`
- Items touching: [(none in Loop 1)]
- Total: 0.

---

## 5. Frontend READMEs

### Doc: `frontend/src/contexts/README.md`
- Items touching: [#66 — update-listing]
- #66: `:9-12` update contents list; describe the 3-provider split (per
  `08-documentation-surface.md:907`,
  `plan-loop-1-06-frontend.md:423-425`).
- Total: 1.
- Atomic-commit recommendation: SAME commit as #66.

### Doc: `frontend/src/contexts/auth/README.md`
- Items touching: [#66 — rewrite-line, #71 — update-paths]
- #66: `:5, :20` rewrite "composition glue" framing (per
  `08-documentation-surface.md:908-909`).
- #71: `:21-23` update path references (the canonical client auth state
  lives in `frontend/src/services/session/store.ts`); after merge, point
  at `coordinator.ts` (per `08-documentation-surface.md:940-941`).
- Total: 2.
- Sequencing: #66 first (after backend prereqs), #71 after ADR-011 +
  #66 + #47.
- Atomic-commit recommendation: 2 commits.

### Doc: `frontend/src/services/session/README.md`
- Items touching: [#71 — rewrite-section]
- #71: `:1-13` rewrite contents after the 8→4 file merge (per
  `08-documentation-surface.md:939`,
  `plan-loop-1-06-frontend.md:498-499`). Call out the module-scope
  cooldown invariant.
- Total: 1.
- Atomic-commit recommendation: SAME commit as #71's coordinator merge.

### Doc: `frontend/src/components/dashboard/README.md`
- Items touching: [#68 — rewrite-contents]
- #68: `:9-30` rewrite contents listing; document `WidgetShell` as a new
  contract (per `08-documentation-surface.md:916-917`,
  `plan-loop-1-06-frontend.md:471`).
- Total: 1.
- Atomic-commit recommendation: SAME commit as #68 commit (3).

### Doc: `frontend/src/components/governance/README.md`
- Items touching: [#5 — strike-line]
- #5 (delete `orphanResolutionPresentation.ts`): strike any
  `orphanResolutionPresentation` mention (per
  `plan-loop-1-06-frontend.md:48`).
- Total: 1.
- Atomic-commit recommendation: SAME commit as #5.

### Doc: `frontend/src/components/notifications/README.md`
- Items touching: [#6 — strike-line]
- #6 (delete `notifications/resourcePath.ts`): drop any `resourcePath`
  mention (per `plan-loop-1-06-frontend.md:70`).
- Total: 1.
- Atomic-commit recommendation: SAME commit as #6.

### Doc: `frontend/src/components/control-form/README.md`
- Items touching: [#4 — strike-line, #22 — declare-canonical, #23 — note-inlined]
- #4 (delete `controlFormWorkflow.ts`): remove reference if present (per
  `plan-loop-1-06-frontend.md:23`).
- #22 (delete `ControlForm.tsx` shim): declare `ControlFormContainer` as
  canonical entrypoint (per `plan-loop-1-06-frontend.md:100`).
- #23 (inline `controlFormUtils`): note utils were inlined (per
  `plan-loop-1-06-frontend.md:124`).
- Total: 3.
- Sequencing: #4 → #22 → #23 (control-form area mechanical sequence).
- Atomic-commit recommendation: 3 commits.

### Doc: `frontend/src/components/kri-form/README.md`
- Items touching: [#26 — remove-prose, #33 — verify]
- #26 (delete `KRIForm.tsx` shim): remove "public facade" prose
  referencing `KRIForm.tsx` (per `plan-loop-1-04-kris.md:130`).
- #33 (unify approval-queued banner): remove any reference to
  `KriApprovalQueuedBanner` if listed (per
  `plan-loop-1-03-approvals.md:127`).
- Total: 2.
- Sequencing: independent.
- Atomic-commit recommendation: 2 commits.

### Doc: `frontend/src/components/forms/README.md`
- Items touching: [#33 — note-canonical]
- #33: if banner siblings are enumerated, add note that the KRI form uses
  this canonical component (per
  `plan-loop-1-03-approvals.md:125-126`).
- Total: 1.
- Atomic-commit recommendation: SAME commit as #33.

### Doc: `frontend/src/components/vendors/README.md`
- Items touching: [#32 — describe-shell]
- #32 (extract generic vendor linked-entity tab): describe the new shell
  + config contract (per `plan-loop-1-06-frontend.md:147`).
- Total: 1.
- Atomic-commit recommendation: SAME commit as #32.

### Doc: `frontend/src/lib/README.md`
- Items touching: [#46 — add-index]
- #46 (query-key factories): add `queryKeys/` index and stewardship rule
  (per `plan-loop-1-06-frontend.md:295`).
- Total: 1.
- Atomic-commit recommendation: final commit of #46's per-domain wave.

### Doc: `frontend/src/services/api/README.md`
- Items touching: [#47 — note-policy, #64 — note-singleton]
- #47 (session-refresh policy): note the new policy seam, explicitly
  stating it is session-refresh-specific (per
  `plan-loop-1-06-frontend.md:319`).
- #64 (QueryClient extract): note the singleton (per
  `plan-loop-1-06-frontend.md:368`).
- Total: 2.
- Sequencing: independent leaves.
- Atomic-commit recommendation: 2 commits.

### Doc: `frontend/src/services/api/schemas/README.md`
- Items touching: [#65 — describe-base]
- #65 (CRUD capability schema): describe the shared base + the issues
  exception (per `plan-loop-1-06-frontend.md:396`).
- Total: 1.
- Atomic-commit recommendation: SAME commit as #65 setup commit.

### Doc: `frontend/src/i18n/README.md`
- Items touching: [#48 — note-merge]
- #48 (merge errorKeys): note the merged module (per
  `plan-loop-1-06-frontend.md:346`).
- Total: 1.
- Atomic-commit recommendation: SAME commit as #48.

### Doc: `frontend/src/hooks/README.md`
- Items touching: [#35 — remove-entry, #67 — describe-hook]
- #35 (delete `usePermissions.ts`): remove the entry (per
  `plan-loop-1-06-frontend.md:191`).
- #67 (extract `useResourcePanelQuery`): describe the generic hook (per
  `plan-loop-1-06-frontend.md:447`).
- Total: 2.
- Sequencing: independent leaves.
- Atomic-commit recommendation: 2 commits.

### Doc: `frontend/src/authz/README.md`
- Items touching: [#36 — describe-factory]
- #36 (BusinessRouteGuards factory): describe the factory (per
  `plan-loop-1-06-frontend.md:219`).
- Total: 1.
- Atomic-commit recommendation: SAME commit as #36.

### Doc: `tests/backend/pytest/api/v1/README.md`
- Items touching: [#10 — keep]
- #10: `:25` quote `"test_riskhub_questionnaires.py"` KEEPS (per
  `08-documentation-surface.md:683-684`,
  `plan-loop-1-07-endpoints.md:23`). #38 also keeps (file stays).
- Total: 0 active edits.
- Atomic-commit recommendation: no commit.

---

## 6. Planning-tree code-binding docs

### Doc: `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/CONCERNS.md`
Already covered in §1 (Reject-anchor docs).

### Doc: `.planning/codebase/STRUCTURE.md`
- Items touching: [#57 — verify, #74a — verify, #62 — verify]
- #57: `:25` lists `_quarterly_comparison` as a recognized helper package
  — KEEPS the line (the package survives; only the facade is deleted)
  (per `08-documentation-surface.md:639-640`,
  `plan-loop-1-05-vendor-quarterly.md:170-171`).
- #74a: 31-package census output is in TOMLs, not STRUCTURE.md; verify
  STRUCTURE.md still aligns.
- #62 (`kri_vendor_assignment.py` relocate): if STRUCTURE.md enumerates
  module paths, update from `services/kri_vendor_assignment.py` to
  `services/_vendor_links/kri_assignment.py`.
- Total: 3 verify-only.
- Atomic-commit recommendation: each verify in the corresponding code
  commit; no separate doc commit needed unless verification reveals an
  edit.

### Doc: `.planning/codebase/ARCHITECTURE.md`
- Items touching: [#57 — verify]
- #57: `:42` quote `"quarterly comparison period/snapshot/change helpers (backend/app/services/_quarterly_comparison/)"`
  — already references the package, not the facade. Verify-only (per
  `08-documentation-surface.md:698-699`,
  `plan-loop-1-05-vendor-quarterly.md:171`).
- Total: 0 active edits.
- Atomic-commit recommendation: no commit.

### Doc: `.planning/codebase/TESTING.md`
- Items touching: [#10 — keep]
- #10: `:70` quote `"…test_riskhub_questionnaires.py"` KEEPS (per
  `08-documentation-surface.md:643-645`,
  `plan-loop-1-07-endpoints.md:23`).
- Total: 0 active edits.
- Atomic-commit recommendation: no commit.

### Doc: `.planning/audits/_context/01-backend-services.md`
- Items touching: [#19 — add-line, #11 — add-line]
- #19: record `validate_risk_type` as the single-owner risk-type validator
  (per `plan-loop-1-02-risks.md:163-165`).
- #11: add a line to `_control_execution` section that
  `linked_risk_names_for_visible_ids` returns `risk.name` (per
  `plan-loop-1-02-risks.md:267-268`).
- Total: 2.
- Sequencing: #19 first, then #11.
- Atomic-commit recommendation: 2 commits (each lands with its own code
  change).

### Doc: `.planning/audits/_context/02-backend-endpoints.md`
- Items touching: [#1 — add-note, #19 — replace-line, #20 — record-decision, #40 — refresh-table]
- #1: add a one-line note that the package no longer re-exports
  `validate_risk_type` (per `plan-loop-1-02-risks.md:62-66`).
- #19: drop the line about `crud/_shared.validate_risk_type`; replace with
  pointer to service-policy owner (per
  `plan-loop-1-02-risks.md:166-169`).
- #20: record the doc-only decision that implementation is co-located in
  the endpoint package (per `plan-loop-1-02-risks.md:382-389`).
- #40: refresh the route table after admin rename (per
  `08-documentation-surface.md:875`,
  `plan-loop-1-08-crosscut.md:69-71`).
- Total: 4.
- Sequencing: #1 → #19 → #20; #40 independently after #39.
- Atomic-commit recommendation: per-item commits.

### Doc: `.planning/audits/_context/03-frontend-architecture.md`
- Items touching: [#22 — remove-shim, #35 — note-removal, #66 — refresh-diagram]
- #22: drop `ControlForm.tsx` from the shim list (per
  `plan-loop-1-06-frontend.md:101`).
- #35: note the hook is gone (per `plan-loop-1-06-frontend.md:192`).
- #66: refresh diagram after AuthContext split (per
  `plan-loop-1-06-frontend.md:425`).
- Total: 3.
- Sequencing: independent leaves.
- Atomic-commit recommendation: 3 commits.

### Doc: `.planning/audits/_context/06-test-surface.md`
- Items touching: [#11 — add-cross-ref, #20 — add-cross-ref]
- #11: add cross-reference between `test_executions.py:325` and
  `test_reports_audit.py:185-186` (per
  `plan-loop-1-02-risks.md:271-275`).
- #20: add a cross-reference noting two test files depend on the package
  facade for `generate_risk_id_code` (per
  `plan-loop-1-02-risks.md:390-393`).
- Total: 2.
- Sequencing: #11 then #20.
- Atomic-commit recommendation: 2 commits.

---

## 7. New docs to create

| Path | Created by | Notes |
| --- | --- | --- |
| `docs/adr/ADR-011-auth-scheme-and-session-model.md` | #72 | Standalone P1 doc-only (per `plan-loop-1-08-crosscut.md:586-594`). |
| `docs/adr/ADR-012-kri-time-series-period-algebra.md` | #73 | In #73 commit alongside lock + TOML + classify collapse. |
| `backend/app/services/_graph_directory/README.md` | #61 | Created in #56+#61 paired wave (per `plan-loop-1-08-crosscut.md:471, 510-512`). |
| `backend/app/services/_monitoring_response/README.md` | #59 | After #17 + #49 (per `plan-loop-1-07-endpoints.md:615-617`). |

(Optional) New TOMLs accompanying ADR-007 amendment (#74a, not markdown):
- `_bounded_context_write_side.toml`
- `_bounded_context_read_shape.toml`
- `_bounded_context_workflow_pairs.toml`
- `_bounded_context_adapters.toml`
- `_bounded_context_policy.toml` (proposed 5th — per
  `plan-loop-1-08-crosscut.md:668-682`).

---

## 8. Doc cells with the highest item count (Top 10)

(Sorted by distinct items touching the doc.)

| Rank | Doc | Items touching | Active edits |
| --- | --- | --- | --- |
| 1 | `docs/security/authorization-capability-contract.md` | 14 | 11 |
| 2 | `docs/security/authorization-capability-contract.json` | 14 | 11 |
| 3 | `AGENTS.md` | 9 | 2 (#72, #74b) |
| 4 | `backend/app/api/v1/endpoints/issues/_shared/README.md` | 4 | 4 |
| 5 | `docs/DOCUMENTATION_TREE.md` | 4 | 3 |
| 6 | `backend/app/services/_kri_history/README.md` | 4 | 3 |
| 7 | `docs/adr/README.md` | 3 | 3 |
| 8 | `backend/app/services/_vendor_links/README.md` | 3 | 3 |
| 9 | `frontend/src/components/control-form/README.md` | 3 | 3 |
| 10 | `backend/app/services/README.md` | 3 | 3 |

---

## 9. Atomic-commit groups (cross-doc bundles)

These are cross-domain bundles where multiple docs (and locks) MUST land
together to preserve the architecture-lock contract:

### Bundle A: Vendor migration (#69 + #70 — single commit)
- Code: `_vendor_link_mixin.py`, three concrete vendor-link models,
  Vendor model `status` drop, 9 prod/seed sites scrub, new Alembic
  revision.
- Lock: `tests/backend/pytest/architecture/test_vendor_link_mixin_red.py`,
  `test_vendor_status_drop_red.py`, Postgres-lane migration tests.
- Docs: `backend/app/models/README.md`,
  `backend/app/services/_vendor_links/README.md`,
  `docs/adr/ADR-005-archivable-mixin-schema-contract.md`,
  `docs/adr/ADR-010-postgres-migration-rehearsal-contract.md`,
  `docs/README.md:111-112`, `docs/DOCUMENTATION_TREE.md:84`,
  `docs/BUSINESS_LOGIC.md:619`.
- Justification: ADR-010 forward-only contract; one migration window.

### Bundle B: KRI history barrel + alias (#24 + #51 — single commit)
- Code: delete `kris/linked_vendors.py`, delete
  `_kri_history/value_application.py`, repoint 4 endpoint importers + 2
  service importers.
- Lock: `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`,
  drop `test_architecture_deepening_contracts.py:976-980, 998-1000`.
- Docs: `docs/security/authorization-capability-contract.md:116, 117, 118`,
  `.json:368, 388, 389, 410, 411`,
  `backend/app/services/_kri_history/README.md:22`.
- Justification: both rewrite the same line `kris/linked_vendors.py:3`.

### Bundle C: Directory + Graph (#56 + #61 — paired wave)
- Code: delete `directory_identity_service.py`, move
  `graph_directory_*.py` → `_graph_directory/`, rewrite 8 prod importers
  + 1 script + 2 test files (multi-monkeypatch).
- Lock: `tests/backend/pytest/architecture/test_directory_identity_service_removed_red.py`,
  `test_graph_directory_package_move_red.py`, drop
  `test_architecture_deepening_contracts.py:227-238`.
- Docs: `docs/security/authorization-capability-contract.md:109`,
  `.json:111, 113, 229`, `backend/app/services/README.md`, NEW
  `_graph_directory/README.md`.
- Justification: cross-import dependency between the two files.

### Bundle D: Approvals hub wave (#9 → #34 → #60 — three sequential commits)
- Each commit appends to `approval_scenario_policy.py` additively.
- Each commit updates `docs/security/authorization-capability-contract.{md,json}`.
- Justification: single-developer sequential additive flow keeps the hub
  file from churning.

### Bundle E: Quarterly facade delete (#57 — single commit)
- Code: delete `quarterly_comparison_service.py`, repoint
  `dashboard/quarterly.py:12`.
- Lock: rewrite `test_architecture_deepening_contracts.py:559-569`.
- Docs: `_quarterly_comparison/README.md:16`,
  `.planning/codebase/CONVENTIONS.md:22`,
  `.planning/codebase/CONCERNS.md:14`.
- Justification: orchestrator override; doc anchors fall together with
  the code delete.

### Bundle F: Issues domain barrel cleanup (sequenced commits)
- Order: #2 → #41 → #53 → #29 → #14 → #27 → #8 → #28 → #30 (per
  `plan-loop-1-01-issues.md:458-470`).
- Each commit edits its own slice of
  `backend/app/api/v1/endpoints/issues/_shared/README.md` Contents block
  AND `backend/app/services/_issue_workflow/README.md`.
- Lock: structural assertions per item.
- Justification: incremental commits; each touches only the lines it
  owns.

### Bundle G: ADR adds (#72, #73, #74b — three commits)
- #72 standalone (P1 doc-only), #73 with KRI code change, #74b after
  #74a green.
- Each adds a row to `docs/adr/README.md` and an anchor to
  `docs/DOCUMENTATION_TREE.md:86-89`.
- Justification: ADRs are independent; each commit is small and isolated.

### Bundle H: Capability catalog adds (#15 → #39 → #65)
- Three sequential commits on `docs/security/capability-catalog.json`.
- Each pins a different sub-tree (access_user surface, admin truth table,
  per-entity counts).
- Justification: `scripts/security/validate_authz_capability_contract.py`
  must be re-run after each.

---

## 10. Sequencing constraints (single-developer, sequential)

The Loop-1 plans recommend an aggregate execution order. From the doc-cell
matrix, the following hard constraints emerge:

1. **#56 + #61 must be a paired wave** (single commit or single PR with
   two commits): both touch `directory_identity_service.py` re-exports
   and `graph_directory_service.py:8` import.
2. **#69 + #70 must be a single bundled commit**: ADR-010 forward-only
   migration + bundled doc updates.
3. **#24 + #51 must be a single bundled commit**: shared
   `kris/linked_vendors.py:3` rewrite.
4. **#9 → #34 → #60 must be three sequential commits**: hub-wave
   additivity in `approval_scenario_policy.py`.
5. **#39 → #40**: #40 depends on `AdminConsoleCapabilities` real builder.
6. **#17 → #49 → #59**: monitoring shim → wrapper inline → README
   separation.
7. **#74a → #74b**: 31-package census must be green before ADR-007
   amendment text.
8. **#37 + #39 → #66**: backend capability builders must be the single
   source of truth before the bootstrap context splits.
9. **#72 (ADR-011) → #71**: ADR ratification before session module merge.
10. **#46 → {#65, #67, #68}**: query-key factories before downstream
    consumers.
11. **#2 → #8 → #28 → #30**: issues underscore-alias clean → owner-validation
    split → triplicate collapse → barrel prune.
12. **#14, #27 → #30**: notifications + loading dedup before barrel prune.

---

## 11. README/lock-only ratchet ledger (cross-domain)

Items that **only** ratchet a TOML allowlist or test-architecture-lock
without touching markdown docs:

- #2, #41, #53 — issue-workflow alias deletes; lock added in
  `test_architecture_deepening_contracts.py`.
- #11 — control-execution truth-in-naming; existing lock at
  `:178` unchanged.
- #17, #21, #49, #50, #52, #58 — service-shim/wrapper deletes; lock added
  in `test_w4_bc_g_kri_history_boundaries_red.py` or sibling.

These items are listed for completeness; they do NOT contribute to the
doc touch matrix.

---

## End of doc/README touch matrix

Compiled by Phase 3 Loop 2 (sequencing) for cross-cutting doc-edit
coordination across all 8 Loop 1 plans plus
`08-documentation-surface.md`. All doc citations verified against the
working tree at branch `main`, head `1ee872a4`.
