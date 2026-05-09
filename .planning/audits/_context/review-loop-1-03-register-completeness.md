# Phase 4 Loop 1 — Constructive Plan Review #3 (Register Completeness)

Working dir: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Branch `main`,
head `1ee872a4`. Mode: CONSTRUCTIVE — surface gaps in
`plan-loop-3-05-readme-lock-register.md` (the canonical Loop 3 register).
Single sequential developer; TDD; doc/lock-only Reject is invalid; defers
planned.

Source-of-truth files audited:
- `plan-loop-3-05-readme-lock-register.md` (subject)
- `plan-loop-2-04-doc-touch-matrix.md` (cross-reference)
- `plan-loop-2-03-lock-conflict-matrix.md` (cross-reference)
- `08-documentation-surface.md` (Phase 1 doc map)
- `04-architecture-locks.md` (Phase 1 locks map)
- All 8 Loop-1 plans

Item count reconciliation: prompt says 79; register Header at
`plan-loop-3-05-readme-lock-register.md:8` says "77 Phase-2 items"; actual
distinct headings 1…75 with #45a/#45b and #74a/#74b sub-letter pairs
(`plan-loop-3-05-readme-lock-register.md:31-2369`). Treating 75 register
entries as the audit base.

Citation format below: `register :L → expected :L (per <plan>:L)`.

---

## 1. Per-item gap inventory

### Item #1 — A-N1
- ✅ All references covered. README & test creation aligned with
  `plan-loop-3-05-readme-lock-register.md:31-50`.

### Item #2 — B-N1
- 🟡 **Missing lock reference**. Register at
  `plan-loop-3-05-readme-lock-register.md:60-66` proposes a NEW file
  `test_issue_workflow_no_underscored_self_aliases_red.py`, but
  `plan-loop-2-03-lock-conflict-matrix.md:317` lists it as "(or appended
  in deepening contracts)" and the doc-touch matrix at
  `plan-loop-2-04-doc-touch-matrix.md:1009` lists #2 in the
  "ratchet ledger" section that targets `test_architecture_deepening_contracts.py`.
  Register should explicitly note the alternative single-line append into
  the deepening-contracts file (no Files-to-create entry) and let the
  developer pick. Quote
  `plan-loop-1-01-issues.md:53` `"new test asserting underscore aliases gone"`.
- Gap kind: **Wrong change kind** (forced-create vs append-or-create).

### Item #3 — S3.11
- ✅ All references covered for `test_w4_bc_g_kri_history_boundaries_red.py`
  append (`plan-loop-3-05-readme-lock-register.md:82`).

### Item #4 — FE-deadcode-1 (controlFormWorkflow.ts)
- 🟡 **Missing lock reference**. Register at
  `plan-loop-3-05-readme-lock-register.md:108-109` is vague about whether
  the FE TOML scrub actually applies. `plan-loop-2-03-lock-conflict-matrix.md:65`
  says "no FE files listed" so explicit clarification ("no edit needed,
  scrub-if-listed verified empty") is preferable to "verify if listed".

### Item #5 — FE-deadcode-2
- ✅ Covered.

### Item #6 — FE-deadcode-3
- ✅ Covered.

### Item #7 — C-N1
- ✅ Covered.

### Item #8 — B-N2
- 🔴 **Missing lock reference for `_audit_matrix.toml`/audit emit helper**
  IF #8's source-validation split lands the canonical link helpers.
  `plan-loop-3-05-readme-lock-register.md:189-217` lists the
  `_issue_workflow/README.md` add-line, deepening-contract assertions, and
  capability-contract refresh — but does NOT mention the doc-touch
  matrix's section §1 group **#8 adds canonical link helpers
  consolidation** (per `plan-loop-1-01-issues.md:84-103`) which, per
  Loop 2, may relax existing aliases inside
  `test_architecture_deepening_contracts.py` beyond `:1192-1206`. Register
  cites only `:1192-1206`. Quote
  `plan-loop-2-03-lock-conflict-matrix.md:291`
  `"both #8 and #53 must update that import list"`. No conflict, but the
  Files-to-delete entry at
  `plan-loop-3-05-readme-lock-register.md:206-208` for
  `source_validation.py` is hedged ("recommended end-state") — it should
  be unambiguous given orchestrator override of "doc-only Reject".

### Item #9 — S6.5
- ✅ Covered.

### Item #10 — S8.5
- ✅ All 6 doc anchors listed (`AGENTS.md`, `ENDPOINT_INVARIANTS.md`,
  `CONCERNS.md`, `TESTING.md` planning + docs, `tests/.../README.md`).
  Register at `plan-loop-3-05-readme-lock-register.md:243-260` is
  comprehensive.
- 🟢 Optional addition: `docs/TESTING.md:19` is in
  `plan-loop-2-04-doc-touch-matrix.md:277-282` but #10's KEEP-list at
  `plan-loop-3-05-readme-lock-register.md:256-260` doesn't include
  `docs/TESTING.md` (only `.planning/codebase/TESTING.md`). Cite
  `plan-loop-2-04-doc-touch-matrix.md:280` `"…test_riskhub_questionnaires.py KEEPS"`.

### Item #11 — S2.7
- ✅ Covered.

### Item #12 — D-N3
- 🟡 **Wrong change kind**. Register at
  `plan-loop-3-05-readme-lock-register.md:307-318` lists the new
  architecture test as optional but the doc-touch matrix and
  Phase 1 doc surface do not flag any README touch — yet register lists
  no doc edit at all. That's correct, but the register should explicitly
  mark `backend/app/api/v1/endpoints/users/README.md` as
  "no edit needed" given Phase 1 doc surface
  `08-documentation-surface.md:458-461` flags users/README.md as
  load-bearing. Cite
  `08-documentation-surface.md:459`
  `"users/README.md:25-31: explicit per-file semantics"`.

### Item #13 — S5.1
- ✅ Capability contract md/json fully cited at
  `plan-loop-3-05-readme-lock-register.md:347-358`.

### Item #14 — S4.4
- ✅ Covered.

### Item #15 — D-N2
- ✅ All capability-catalog and contract md additions cited
  (`plan-loop-3-05-readme-lock-register.md:405-414`). Phase-1 line
  `08-documentation-surface.md:660-661` confirms catalog as authority.

### Item #16 — S8.10
- ✅ Two security-reports docs listed at
  `plan-loop-3-05-readme-lock-register.md:421-425`.
- 🟡 **Missing line number**. Register specifies `:25` and `:81` for the
  two docs but does NOT list any line for the `_archive_allowlist.toml`
  scrub (Phase 1 lock map at `04-architecture-locks.md` could add a line
  cite). Minor.

### Item #17 — S2.1
- ✅ Covered (`plan-loop-3-05-readme-lock-register.md:451-472`). Lock test
  ambiguity ("`test_monitoring_response_endpoint_shim_removed_red.py` (or
  `test_monitoring_response_shim_removed_red.py`)") appears at `:464`;
  developer should pick.

### Item #18 — S6.2
- ✅ Covered.

### Item #19 — S1.4
- ✅ Two `.planning/audits/_context/*` doc updates listed at
  `plan-loop-3-05-readme-lock-register.md:504-510`. Cross-link to ADR-003
  in commit body noted.

### Item #20 — S1.6
- ✅ Three doc updates listed (`ENDPOINT_INVARIANTS.md`,
  `02-backend-endpoints.md`, `06-test-surface.md`) at
  `plan-loop-3-05-readme-lock-register.md:534-543`.

### Item #21 — S2.6
- ✅ Covered.

### Item #22 — S2.8
- ✅ Two doc updates listed (`control-form/README.md`,
  `03-frontend-architecture.md`) at
  `plan-loop-3-05-readme-lock-register.md:584-591`.
- 🟡 **Wrong change kind**: register at `:594-597` calls the
  `_naming_allowlist.toml` action "leave entry only if sibling shims
  remain; otherwise scrub" — the doc-touch matrix at
  `plan-loop-2-04-doc-touch-matrix.md:1014` lists this in the
  "ratchet ledger" without precise edit kind. Recommend scrub-only.

### Item #23 — S2.9
- ✅ Covered.

### Item #24 — S3.4
- ✅ Capability contract md (`:116, 117, 118`) and json (`:368, 388, 410`)
  fully cited at `plan-loop-3-05-readme-lock-register.md:656-661`.
- 🟡 **Missing doc reference**: `_kri_history/README.md:22` IS NOT listed
  in #24's READMEs section (`:636-638`). The register defers it to #51.
  This is consistent with Loop 2's "atomic with #51" framing
  (`plan-loop-2-04-doc-touch-matrix.md:165-167`), but if cluster A is one
  commit, both items' docs land together — register should make that
  explicit by saying "(see #51 for `_kri_history/README.md:22`)".

### Item #25 — S3.7
- ✅ Covered.

### Item #26 — S3.9
- 🟡 **Missing lock reference**. Register at
  `plan-loop-3-05-readme-lock-register.md:697-702` lists the
  `test_w4_bc_g_kri_history_boundaries_red.py` append AND the eslint pin
  removal; doc-touch matrix
  `plan-loop-2-04-doc-touch-matrix.md:678-682` says "Note: must update if
  banner siblings enumerated" — register should call out that
  `forms/README.md` may need verify-only check (NOT in current entry,
  only in #33). Minor.

### Item #27 — S4.2
- ✅ Covered.

### Item #28 — S4.3
- ✅ Two READMEs listed (`_shared/README.md:12`,
  `_issue_register/README.md`) plus contract refresh (`md:128`,
  `json:629`).

### Item #29 — S4.6
- ✅ Covered.

### Item #30 — S4.10
- ✅ Covered.

### Item #31 — S5.5
- ✅ Covered.

### Item #32 — S5.8
- ✅ Covered. Note the `Files to create` for production source
  (`useVendorLinkedEntityTab.ts`, `VendorLinkedEntityTab.tsx`) is at
  `plan-loop-3-05-readme-lock-register.md:868-871`.

### Item #33 — S6.4
- ✅ Two READMEs (`forms/README.md`, `kri-form/README.md`).

### Item #34 — S6.6
- ✅ Three READMEs cited (`authz-cap-contract.md`,
  `_approval_execution/README.md`, `_authorization_capabilities/README.md`).
- 🟡 **Missing line number**. Register cites
  `docs/security/authorization-capability-contract.md` AUTHZ-APPROVALS
  row but does NOT specify line `:119` for the row, even though the
  doc-touch matrix at `plan-loop-2-04-doc-touch-matrix.md:124, 187-196`
  flags `:119`. Register at
  `plan-loop-3-05-readme-lock-register.md:915-916` says "AUTHZ-APPROVALS
  row" without `:119`; the §Vocabulary append at `:936` does cite
  `:119`. Reconcile to a single cite.

### Item #35 — S7.3
- ✅ Covered.

### Item #36 — S7.4
- ✅ Covered.

### Item #37 — S7.10
- ✅ Covered. The
  `docs/security/authorization-capability-contract.md` "single source of
  truth" note at `plan-loop-3-05-readme-lock-register.md:1004-1006` is
  correct but does not specify a line; doc-touch matrix
  `plan-loop-2-04-doc-touch-matrix.md:126` calls #37 "implicit (no token
  edit)" which means no specific line — fine.

### Item #38 — S8.6
- 🟡 **Missing doc reference**. Register at
  `plan-loop-3-05-readme-lock-register.md:1027-1052` says "none required"
  for READMEs but the doc-touch matrix's `AGENTS.md:162` keep
  (`plan-loop-2-04-doc-touch-matrix.md:74-79`) covers #38; register's #10
  entry already lists `AGENTS.md`/`ENDPOINT_INVARIANTS.md` keeps but #38
  does NOT mirror them. Should explicitly confirm "AGENTS.md:162 verify
  no edit (re-export invariant holds)" per
  `plan-loop-2-04-doc-touch-matrix.md:75-79`.

### Item #39 — S8.7
- ✅ Capability-contract `:719` and capability-catalog cited.
  `_capabilities_all_allowlist.toml` cap pressure flagged.

### Item #40 — S8.11
- ✅ All known docs listed (`admin/README.md`, `02-backend-endpoints.md`,
  `AGENTS.md:157`).
- 🔴 **Missing doc reference**: `docs/agent/ENDPOINT_INVARIANTS.md:7`,
  per Phase 1 doc surface
  `08-documentation-surface.md:93-97, 882`
  `"controls/, risks/, kris/, dashboard/, issues/, reports/, riskhub/, approvals/, departments/, users/, vendors/, admin/"`.
  Register entry `:1097-1098` only lists `AGENTS.md:157`; it must also
  list `docs/agent/ENDPOINT_INVARIANTS.md:7` since the admin re-cluster
  may shift route table sentinels. Cite
  `08-documentation-surface.md:882` `"docs/agent/ENDPOINT_INVARIANTS.md:7 (same)"`.
- Gap kind: **Missing doc reference**.

### Item #41 — B-N3
- ✅ Covered.

### Item #42 — BE-N2
- ✅ Covered.

### Item #43 — BE-N4
- ✅ Optional README at `backend/app/core/audit/` correctly noted as
  optional (per `plan-loop-1-07-endpoints.md:389-391`).

### Item #44 — BE-N6
- ✅ Covered. Note new TOML
  `backend/app/api/v1/_router_registry.toml` listed.
- 🟡 **Missing line reference**: register at
  `plan-loop-3-05-readme-lock-register.md:1212-1213` says "add an
  Endpoint registry subsection" without specifying the section anchor.
  Doc-touch matrix at
  `plan-loop-2-04-doc-touch-matrix.md:592-595` is similarly vague.
  Minor.

### Item #45a — BE-N8a
- ✅ Three new tests listed; correctly notes "no production code changes".

### Item #45b — BE-N8b
- ✅ Covered. Cross-checks `test_w12_resource_permissions_keys_match_capability_contract_red.py`.
- 🟡 **Missing doc reference**: `AGENTS.md:191-205` (RBAC guardrails) per
  `08-documentation-surface.md:760, 890` is not in #45b's README list
  (`plan-loop-3-05-readme-lock-register.md:1262-1265` only cites
  `_permissions/README.md`). The doc-touch matrix at
  `plan-loop-2-04-doc-touch-matrix.md:84-87` lists #45b as "verify only"
  for AGENTS.md but the verify is still a deliverable. Add note.

### Item #46 — FE-N1
- ✅ Covered.

### Item #47 — FE-N4
- ✅ Covered.

### Item #48 — FE-N6
- ✅ Covered.

### Item #49 — S2.2
- ✅ Both deepening lock lines (`:188, 192`) cited.

### Item #50 — S3.2
- ✅ Capability-contract md (`:117, 118, 161`) and json (`:389, 411`)
  fully cited; `_kri_history/README.md:21` listed.

### Item #51 — S3.3
- ✅ All references covered.
- 🟡 **Missing line number**: register at
  `plan-loop-3-05-readme-lock-register.md:1438-1440` says
  `:999-1000` but doc-touch matrix
  `plan-loop-2-04-doc-touch-matrix.md:165` says `:368, 388, 389, 410, 411`
  for json plus `:976, 979, 980` for the test source. Lock-conflict matrix
  `plan-loop-2-03-lock-conflict-matrix.md:228-247` confirms `:976, 979,
  980, 998-1000`. Register at #51 lists `:976, 979, 980` for the source
  delete (`:1435-1437`) and `:999-1000` separately. Tighter cite would be
  `:976-980, 998-1000`.

### Item #52 — S3.5
- ✅ All references covered.

### Item #53 — S4.1
- ✅ Covered.

### Item #54 — S6.3
- ✅ Three deepening contract lines cited (`:1005, 1025, 1041`).
- 🟡 **Missing line number**: `_approval_queue/README.md` at
  `plan-loop-3-05-readme-lock-register.md:1526-1527` does not specify the
  line; doc-touch matrix entry is missing for this README in
  `plan-loop-2-04-doc-touch-matrix.md` (no §dedicated to it). Fine, but
  flag: register entry `:1526` is the only cite.

### Item #55 — S7.5
- ✅ Capability contract md (`:109`) + json (`:106, 229`) cited.

### Item #56 — S7.6
- ✅ All cites correct.

### Item #57 — S8.1
- ✅ All 5 doc anchors listed (`_quarterly_comparison/README.md:16`,
  `CONVENTIONS.md:22`, `CONCERNS.md:14`, `STRUCTURE.md:25`,
  `ARCHITECTURE.md:42`).

### Item #58 — S8.3
- ✅ Covered.

### Item #59 — S2.10
- ✅ Both READMEs (`_monitoring_response/README.md` NEW,
  `_monitoring_status/README.md`) listed.

### Item #60 — PrivilegeContext
- ✅ Three READMEs listed (`auth-cap-contract.md`, `api/README.md`,
  `_authorization_capabilities/README.md`).
- 🟡 **Missing line number**: register at
  `plan-loop-3-05-readme-lock-register.md:1745-1747` says "AUTHZ-APPROVALS
  row" without `:119`. The doc-touch matrix at
  `plan-loop-2-04-doc-touch-matrix.md:124` says `:119` for vocabulary;
  the §Vocabulary append at register `:1770` cites `:131` (different
  anchor). Inconsistent.

### Item #61 — S7.7
- ✅ Capability contract md (`:109`) + json (`:113, 229`) cited.

### Item #62 — S5.9
- 🟡 **Missing line number**: register cites
  `docs/security/authorization-capability-contract.md:172` at
  `plan-loop-3-05-readme-lock-register.md:1874` (perimeter-pass note)
  consistent with doc-touch matrix `:135`. STRUCTURE.md verify at
  `:1849-1850` lacks a line cite; doc-touch matrix
  `plan-loop-2-04-doc-touch-matrix.md:773-775` says "if STRUCTURE.md
  enumerates module paths"; register should specify "verify
  STRUCTURE.md:25" if applicable.

### Item #63 — BE-N7
- ✅ Two docs (`outbox/README.md`, `ADR-002:44`).

### Item #64 — FE-N2
- ✅ Covered.

### Item #65 — FE-N3
- ✅ Covered.

### Item #66 — FE-N5
- ✅ Four READMEs listed (`contexts/README.md`, `contexts/auth/README.md`,
  `CONVENTIONS.md:43`, `03-frontend-architecture.md`).

### Item #67 — FE-N7
- ✅ Covered.

### Item #68 — FE-N8
- ✅ Covered.

### Item #69 — S5.2 (Vendor link mixin)
- ✅ Four READMEs/ADR docs listed (`models/README.md`,
  `_vendor_links/README.md`, `ADR-010`, `ADR-005`).

### Item #70 — S5.7 (Vendor.status drop)
- ✅ Six docs listed (`docs/README.md:111-112`, `DOCUMENTATION_TREE.md:84`,
  `ADR-005:13-19`, `ADR-010:23-30`, `BUSINESS_LOGIC.md:619`,
  `models/README.md`).

### Item #71 — S7.8
- ✅ Three READMEs listed (`session/README.md:1-13`,
  `contexts/auth/README.md:21-23`, `CONCERNS.md:40`).

### Item #72 — ADR-011
- ✅ Five docs listed.

### Item #73 — ADR-012
- ✅ Four docs listed.
- 🟡 **Missing doc reference**: register at
  `plan-loop-3-05-readme-lock-register.md:2256-2257` says
  `docs/security/authorization-capability-contract.md` "no edit
  required" — that's correct per `plan-loop-1-04-kris.md:338` but the
  register should also note `AGENTS.md:218-231` ADR list keep (per
  doc-touch matrix `plan-loop-2-04-doc-touch-matrix.md:316-319` which
  groups #72/#73/#74b for the ADR-list block).

### Item #74a — ADR-007 (a) census
- ✅ Five new TOMLs and the classification test all listed.
- 🟡 **Missing doc reference**: register at
  `plan-loop-3-05-readme-lock-register.md:2295-2297` says "none — census
  output goes into TOMLs" — but the doc-touch matrix at
  `plan-loop-2-04-doc-touch-matrix.md:766-779` lists #74a as
  STRUCTURE.md verify-only. Register should mirror "STRUCTURE.md verify"
  even if no edit.

### Item #74b — ADR-007 (b) amendment
- ✅ Five docs cited (`ADR-007.md`, `adr/README.md`, `AGENTS.md:218-231`,
  `DOCUMENTATION_TREE.md:86-89`, `CONTEXT.md`).

### Item #75 — Bonus auto_reject
- ✅ Covered.

---

## 2. Top 10 most-incomplete items

Ranked by gap-count (🔴 = 3 weight, 🟡 = 1 weight):

| Rank | Item | Gaps | Weight |
| --- | --- | --- | --- |
| 1 | #40 — S8.11 admin re-cluster | 1🔴 missing `ENDPOINT_INVARIANTS.md:7` | 3 |
| 2 | #8 — B-N2 source-validation split | 1🔴 hedged delete + 1🟡 audit-matrix | 3 |
| 3 | #2 — B-N1 underscore aliases | 1🟡 wrong change kind | 1 |
| 4 | #4 — FE-deadcode-1 | 1🟡 vague TOML scrub | 1 |
| 5 | #10 — S8.5 keep | 1🟡 docs/TESTING.md keep missing | 1 |
| 6 | #12 — D-N3 narrow excepts | 1🟡 users/README.md verify | 1 |
| 7 | #16 — S8.10 legacy excel | 1🟡 archive_allowlist line | 1 |
| 8 | #22 — S2.8 ControlForm shim | 1🟡 wrong change kind for TOML | 1 |
| 9 | #24 — S3.4 linked_vendors barrel | 1🟡 missing #51 cross-ref | 1 |
| 10 | #26 — S3.9 KRIForm shim | 1🟡 missing forms/README.md verify | 1 |
| 10 | #34 — S6.6 privilege tier | 1🟡 missing :119 cite | 1 |
| 10 | #38 — S8.6 inline pydantic | 1🟡 missing AGENTS.md:162 verify | 1 |
| 10 | #45b — ownership factory | 1🟡 missing AGENTS.md verify | 1 |
| 10 | #51 — value_application delete | 1🟡 line range tightening | 1 |
| 10 | #54 — approval_queue lifecycle | 1🟡 missing README line | 1 |
| 10 | #60 — PrivilegeContext | 1🟡 :119 vs :131 reconcile | 1 |
| 10 | #62 — kri_vendor_assignment | 1🟡 STRUCTURE.md line | 1 |
| 10 | #73 — ADR-012 | 1🟡 missing AGENTS.md:218 keep | 1 |
| 10 | #74a — ADR-007 census | 1🟡 STRUCTURE.md verify | 1 |

Most items (≥55 of 75) have zero gaps — register is comprehensive.

---

## 3. Missing doc paths

Audit output: NO doc path present in Phase 1 doc surface or doc-touch
matrix is **entirely** absent from the register. All canonical doc files
are cited at least once. Specific gap is **scoped per-item** (item missed
the doc, not the register missed the doc).

The following doc paths from Phase 1 are referenced by the register but
**not** mapped to any specific item — they remain as future-touch
candidates; this is acceptable since no Loop 1 item touches them:

- `docs/E2E_TESTING.md`, `docs/PERFORMANCE_BASELINE.md`,
  `docs/LOCALIZATION.md` — Phase 1 lists them at
  `08-documentation-surface.md:330-340`; not touched by any Loop 1 item.
  Register correctly omits.
- `backend/app/api/v1/endpoints/auth/README.md` — register at
  `plan-loop-3-05-readme-lock-register.md:603-604` correctly says "none
  in Loop 1".
- `backend/app/api/v1/endpoints/users/README.md` — register at `:599-601`
  correctly says "none in Loop 1" but per #12 spot-check, it could host
  a verify (per `08-documentation-surface.md:458-461`). Minor.
- `docs/agent/AGENTS_DOC_COVERAGE.md` per `08-documentation-surface.md:1018-1020`
  — sibling to AGENTS.md; register does NOT mention it. If any AGENTS.md
  edit (e.g. #72, #74b) lands, this coverage doc may need a line. **Gap
  kind: missing doc reference (deferred — verify-only)**.

---

## 4. Missing lock paths

The register's "Lock × items" inverse index at
`plan-loop-3-05-readme-lock-register.md:2602-2735` is comprehensive.

One small omission in the per-item entries (already cross-referenced in
the inverse index but not in the per-item lists):

- **`tests/backend/pytest/test_authz_capability_contract_validator.py`**
  — touched by #55 (line 502), #56 (line 500), #61 (line 504) per
  `plan-loop-3-05-readme-lock-register.md:2659-2661`. Per-item entries
  for #55, #56, #61 DO list this file (`:1561-1563`, `:1601-1603`,
  `:1794-1797`). ✅ All three present.

The new TOMLs list (7 total) at `:2664-2679` matches Loop 2's count
(6 plus optional 5th) per `plan-loop-2-03-lock-conflict-matrix.md:462`.
✅ Reconciled.

Architecture-test files: register lists 24+ NEW backend lock test files
at `:2685-2735` matching Loop 2's count
(`plan-loop-2-03-lock-conflict-matrix.md:459` says ~24). ✅.

---

## 5. test_architecture_deepening_contracts.py line-citation audit (11 items)

Register `:2634-2650` claims 15+ items touch this file at distinct line
ranges. Verifying the 11 most-active ones:

| Item | Lines per register | Lines per Loop 2 conflict matrix | Match? |
| --- | --- | --- | --- |
| #11 | `:178` (existing, no edit) | `:178` (#178 unchanged) | ✅ |
| #49 | `:188, 192` DROP | `:188, 192` relax | ✅ |
| #56 | `:227-238` DELETE/REWRITE | `:226-240` (`:227-238` body) | ✅ |
| #55 | `:243-272` (`:246-257`) | `:243-272` (`:246-257`) | ✅ |
| #57 | `:559-569` REWRITE | `:559-569` rewrite | ✅ |
| #52 | `:956, 962` | `:956, 962` | ✅ |
| #51 | `:976, 979, 980` + `:999-1000` | `:976-980, 998-1000` | 🟡 partial |
| #50 | `:998` (in entry; really `:997-1002`) | `:997-1002` | 🟡 partial |
| #54 | `:1005, 1025, 1041` | `:1005-1071` (3 funcs) | ✅ |
| #8 | `:1192-1206` (`:1193`) | `:1192-1206` (`:1193`) | ✅ |
| #53 | `:1192-1206` (`:1193`) + `:1237` | `:1192-1206` + `:1237` | ✅ |

🟡 #50/#51 line ranges should be normalized; the inverse index at
register `:2643` says `:997-1002` but the per-item entries list only
single-line subsets. No actual mismatch — just nitpick.

---

## 6. test_w4_bc_g_kri_history_boundaries_red.py (7 items)

Per `plan-loop-2-03-lock-conflict-matrix.md:362-377`, 7 items append
file-non-existence assertions to this file:

| Item | Append? | Register cite |
| --- | --- | --- |
| #3 | yes | `plan-loop-3-05-readme-lock-register.md:82` ✅ |
| #24 | yes | `:641` ✅ |
| #25 | yes | `:673` ✅ |
| #26 | yes | `:697` ✅ |
| #50 | yes | `:1399` ✅ |
| #51 | yes | `:1432` ✅ |
| #52 | yes | `:1469` ✅ |

✅ All 7 present. **Append-only is correctly implied** because the file
gets new `assert` statements with no rewrites of existing assertions.
Register inverse index at `:2654-2655` confirms.

---

## 7. Capability contract md citation completeness (14 items)

Per doc-touch matrix `plan-loop-2-04-doc-touch-matrix.md:121-148`, 14
items touch `docs/security/authorization-capability-contract.md`:

| Item | md lines per matrix | md cites in register | Match? |
| --- | --- | --- | --- |
| #13 | `:121, 122` | `:347` (121,122) | ✅ |
| #15 | `:132` | `:410` (132) | ✅ |
| #24 | `:116, 117, 118` | `:656` (116,117,118) | ✅ |
| #34 | `:119` | `:936` (119); but row cite at `:915` lacks line | 🟡 |
| #37 | implicit | `:1004` ("note") | ✅ |
| #39 | `:132` | `:1059` ("document new builder seam") | 🟡 missing :132 |
| #50 | `:117, 118, 161` | `:1414` (117,118,161) | ✅ |
| #51 | `:117, 118, 161` | `:1450` (117,118,161) | ✅ |
| #55 | `:109` | `:1587` (109) | ✅ |
| #56 | `:109` | `:1627` (109) | ✅ |
| #60 | `:119, 131` | `:1770` (131); `:119` not specifically cited | 🟡 |
| #61 | `:109` | `:1828` (109) | ✅ |
| #62 | `:172` | `:1874` (172) | ✅ |
| #66 | `:131` | `:2000` (131) | ✅ |
| #71 | `:131` | `:2204` (131) | ✅ |
| #69 | `:121, 122` (verify) | `:2097` (121,122) | ✅ |
| #70 | implicit | `:2159` (121,122 verify) | ✅ |

🟡 Three items (#34, #39, #60) have line cites missing or inconsistent
in the per-item entry. Register would benefit from explicit `:119` for
#34, `:132` for #39, and reconciling #60's `:119` vs `:131`.

---

## 8. Files-to-create master list reconciliation

Register at `plan-loop-3-05-readme-lock-register.md:2759-2818` lists:

- **Backend production**: 16 entries.
- **Frontend production**: 14 entries.
- **Migrations**: 1 (Alembic revision for #69+#70).
- **Documentation**: 4 ADR/READMEs.
- **TOMLs**: 7.
- **Lock-tier tests**: ~63 per `:2734`.

Total = 16 + 14 + 1 + 4 + 7 + 63 ≈ **105**.

Prompt says "98 new files claimed". Register's totals exceed; but
register's "63 lock-tier" includes both `architecture/` (~24) and
non-architecture (~17) backend tests + ~22 frontend tests, plus the
"Total NEW lock-tier artifacts: ~63 test files + 6 TOML registries"
phrasing at `plan-loop-2-03-lock-conflict-matrix.md:464`. Counting only
**unique** new test files plus TOMLs plus prod source plus docs:

| Category | Count |
| --- | --- |
| Backend production | 16 |
| Frontend production | 14 |
| Backend tests (architecture/ + non-arch) | ~41 |
| Frontend tests | ~22 |
| Migrations | 1 |
| Documentation | 4 |
| TOMLs | 7 |
| **Total** | **~105** |

**Reconciliation**: register's number is HIGHER than the prompt's "98",
likely because the prompt counted only unique production/doc/TOML
deliverables (excluding test files). Reasonable. No actual gap — register
is over-comprehensive.

🟡 Register's #74a optional 5th TOML
(`_bounded_context_policy.toml`) appears in `:2312-2314` but is marked
"optional" — count is 7 if included, 6 otherwise. Reconcile to one
authoritative count.

---

## 9. Files-to-delete master list reconciliation

Register at `plan-loop-3-05-readme-lock-register.md:2821-2887` lists:

- Backend deletes: 32 (matches `:2884`).
- Frontend deletes: 16 (matches `:2885`).
- **Total: 48** (matches `:2886` and the prompt's "48 files claimed").

✅ Reconciled exactly.

Cross-check spot-list:
- `vendor_link_helpers.py` (#13) ✅ register `:2827`
- `access_user_service.py` (#55) ✅ `:2828`
- `directory_identity_service.py` (#56) ✅ `:2829`
- `quarterly_comparison_service.py` (#57) ✅ `:2830`
- `orphaned_item_service.py` (#58) + `_orphaned_items/service.py` ✅
- `issue_workflow_service.py` (#53) + `_issue_workflow/service.py` ✅
- `source_validation.py` (#8) ✅ `:2835` ("recommended end-state")
- `kri_vendor_assignment.py` (#62 — relocated) ✅
- 3 KRI history files (`submission`, `value_application`,
  `correction_plans`) ✅ #50/#51/#52
- `_approval_queue/lifecycle.py` (#54) ✅
- `_control_execution/monitoring.py` (#49) ✅
- `_monitoring_response.py` endpoint shim (#17) ✅
- `kris/linked_vendors.py` (#24) ✅
- `_shared/loading.py` (#27) + `_shared/links.py` (#28) ✅
- `legacy_excel.py` (#16) ✅
- 7 admin/* files (#40) ✅ all 7 present
- `risks/crud/_shared.py` (#19 — if empty) ✅
- 4 `graph_directory_*` files (#61) ✅
- 8 frontend deletes (#3, #4, #5, #6, #22, #23, #26, #33, #35) ✅
- 5 session/* files (#71) ✅
- 2 i18n files (#48) ✅

Register is comprehensive — all 48 file deletions accounted for.

---

## 10. Reject-anchor coverage

Per orchestrator override (per `plan-loop-2-04-doc-touch-matrix.md:22-71`),
3 Reject-anchor docs must land atomically with #57:

1. `_quarterly_comparison/README.md:16` — register `:1636-1640` ✅
2. `.planning/codebase/CONVENTIONS.md:22` — register `:1642-1645` ✅
3. `.planning/codebase/CONCERNS.md:14` — register `:1646-1649` ✅

✅ All three Reject anchors are correctly aligned.

---

## 11. Bundle / atomic-commit groups

Doc-touch matrix §9 enumerates 8 cross-cutting bundles
(`plan-loop-2-04-doc-touch-matrix.md:889-970`):

- Bundle A (#69+#70): 7 docs cited ✅ matches register #69+#70 entries.
- Bundle B (#24+#51): cluster A ✅ register `:634, :1424`.
- Bundle C (#56+#61): paired wave ✅ register `:1593, :1781`.
- Bundle D (#9→#34→#60): 3 sequential ✅ register `:220, :912, :1742`.
- Bundle E (#57): single commit ✅ register `:1633`.
- Bundle F (issues sequence): ✅ ordered per
  `plan-loop-1-01-issues.md:458-470`.
- Bundle G (ADR adds #72/#73/#74b): ✅
- Bundle H (catalog adds #15→#39→#65): ✅

✅ All 8 bundles align between doc-touch matrix and register.

---

## 12. Project-level cross-reference health

Inverse indices at register `:2402-2735`:
- ✅ `AGENTS.md` references 9 items (matches doc-touch matrix §1).
- ✅ `docs/security/authorization-capability-contract.md` references 17
  items (register `:2452-2462`); doc-touch matrix says 14. Register
  is **more comprehensive** because it includes #8, #28, #30 that
  append-token to `:128`. ✅.
- ✅ `docs/security/capability-catalog.json` references 3 items.
- ✅ Kris history README references 4 items (#50, #51, #52, #73).

🟢 Health: register's inverse indices are MORE comprehensive than the
doc-touch matrix's. No gap at project level.

---

## 13. Summary statistics

- **Register completeness**: 75 items, ~63 with zero gaps, ~12 with
  minor 🟡 nitpicks (line-cite tightening), 2 with 🔴 substantive gaps
  (#40, #8).
- **Missing doc references (substantive)**: 1 (item #40 missing
  `docs/agent/ENDPOINT_INVARIANTS.md:7`).
- **Missing line numbers**: ~9 minor instances across #34/#39/#54/#60/
  #62/#73/#74a; none blocking.
- **Wrong change kinds**: 2 (#2 lock-test create vs append; #22
  TOML scrub vs leave).
- **Missing file creates**: 0.
- **Missing file deletes**: 0 (48 reconciled exactly).
- **Reject anchors covered**: 3/3 ✅.
- **Bundles aligned**: 8/8 ✅.
- **Capability contract md cites**: 14/14 items with line cites; 3 have
  imprecise/inconsistent line numbers (#34, #39, #60).
- **Kri history boundaries lock items**: 7/7 append-only ✅.

---

## 14. Recommendations (constructive)

For Loop 2 of Phase 4 (or for the developer integrating the register):

1. **Add `docs/agent/ENDPOINT_INVARIANTS.md:7` to #40's README list**
   (currently only `AGENTS.md:157` is cited).
2. **Promote #8's `source_validation.py` deletion from
   "recommended end-state" to "delete"** — orchestrator override means
   doc-only Reject is invalid; the `Files to delete` line should not
   hedge.
3. **Tighten line cites for items #34, #39, #60** on the capability
   contract md — currently mixing AUTHZ-row references and §Vocabulary
   `:119/:131/:132` cites.
4. **Add explicit "verify AGENTS.md ADR list at :218-231"** to #73's
   docs section (currently only #72 and #74b have it).
5. **Specify final TOML count for #74a** — register says "5 (proposed
   5th)" but the optionality should be resolved to a specific number for
   commit planning.
6. **Cross-link #24's README list to #51's README list** explicitly
   (since cluster A bundles them).

None of the recommendations is a blocker; the register is **production-
ready** as a sequencing reference for the developer.

---

End of register-completeness review. Compiled by Phase 4 Loop 1.
