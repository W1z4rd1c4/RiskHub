# Phase 3 Loop 2 — Hidden Cross-Domain Prerequisites Hunter

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Build commit ref: `1ee872a4`.

Method: re-read all 8 Loop 1 plans plus the verify-loop-{a,b}-NN files for each
domain, then traced cross-domain seams that the per-domain agents could have
missed. Every claim cites `file:line` and quotes ≤15 words from plans or
current code. No invented dependencies — only edges grounded in actual plan
text or repository state.

The 18 numbered checks below correspond to the orchestrator's specific
verification questions; findings (verified + missing-dep) for each follow.

---

## 1. #34 (privilege tier extract) scope

The orchestrator asked: "Loop B confirmed 22+ sites including
`_entity_mutation_lifecycle/{approval, archive}_plans.py`,
`_kri_history/{governance, intake}.py`, `endpoints/{notifications,
users/summary}.py`. Does the Approvals plan claim to handle ALL these, or do
some belong to KRI/Endpoints/Cross-cut domains?"

Verification:

- Approvals plan `plan-loop-1-03-approvals.md:148-166` lists the 16-file
  migration set. Quote `:148-149` "Migrate **call sites** (Loop B's verified
  22+, grouped by file)" with the per-file enumeration including all of:
  - `_entity_mutation_lifecycle/approval_plans.py:69,162,267` (`:159`)
  - `_entity_mutation_lifecycle/archive_plans.py:110,186,255` (`:160`)
  - `_kri_history/governance.py:238` (`:161`)
  - `_kri_history/intake.py:42` (`:162`)
  - `endpoints/notifications.py:127` (`:150`)
  - `endpoints/users/summary.py:24-26` (`:151`)
- Approvals plan `:321-322` cross-domain note: quote "this plan being the
  single owner of `can_resolve_approvals` migration".
- KRI plan `plan-loop-1-04-kris.md` does NOT touch
  `_kri_history/governance.py:238` or `intake.py:42` for tier work — confirmed
  by grepping the file for `can_resolve_approvals` or `privilege_tier`: zero
  hits.
- Cross-cut plan `plan-loop-1-08-crosscut.md` does NOT touch any of these
  sites — confirmed by grep.
- Endpoints plan `plan-loop-1-07-endpoints.md` Item #12 narrows blanket-except
  in `users/summary.py:48,62` only; does NOT touch the
  `can_resolve_approvals` predicate at `:24-26`. There is no overlap here —
  but **see Missing-dep #A below for sequencing**.

Verdict: ✅ Approvals plan owns the FULL 22+ site migration. KRI/Endpoints/
Cross-cut plans correctly disclaim ownership.

But there is a sequencing concern with Endpoints #12 — see Missing-dep #A.

---

## 2. #39 → #40 admin reorg handoff

Verification:

- Frontend plan `plan-loop-1-06-frontend.md:255-265` owns #39: quote `:263`
  "NEW `backend/app/services/_authorization_capabilities/admin.py` —
  `build_admin_capabilities(user: User) -> AdminConsoleCapabilities`".
- Cross-cut plan `plan-loop-1-08-crosscut.md:18-26` declares the handoff:
  quote `:21` "#39 (capability builder real implementation) must land first";
  `:58-59` "DELETE `capabilities.py` (one-route stub returning empty
  `AdminConsoleCapabilities()`)".
- Master DAG `plan-loop-2-01-master-dag.yaml:550` "blocks: ['40', '66']" for
  #39 — verified.

Verdict: ✅ Both plans agree. #39 lands first (Frontend plan), then Cross-cut
#40 reorganizes admin and deletes `capabilities.py`. Handoff is explicit.

---

## 3. #74a (31-package census) → #56, #61, #74b

The orchestrator asked: "Does any package-move item (#56
directory_identity_service delete, #61 graph_directory move) require #74a's
classification (e.g., to decide which TOML the new `_graph_directory` package
goes into)?"

Verification:

- Cross-cut plan `:432-435` says #61 cross-links to #74: quote `:434`
  "ADR-007 amendment text must reference the post-move name `_graph_directory`
  (not `graph_directory_*`)".
- Cross-cut plan `:885` master DAG entry for #74b: quote
  `cross_domain_deps: ["61"]` — yes, **#74b** is gated by #61 (already
  captured).
- Cross-cut plan `:646-680` #74a census proposes `_directory_identity,
  _directory_sync, _graph_directory` (post-#61) all in
  `_bounded_context_adapters.toml`. Quote `:664-666` "NEW
  `_bounded_context_adapters.toml` — `_directory_identity, _directory_sync,
  _graph_directory` (post-#61), `_admin_telemetry, _activity_log_query,
  _auth_session, _auth_session_workflow`".

So #74a's straw proposal already places `_graph_directory` in the Adapter
allowlist. But #74a's lock test enumerates packages by `glob` (quote `:633-637`
"enumerate `glob("backend/app/services/_*/")` (excluding `__pycache__`); assert
exactly 31 packages today").

If #56/#61 land BEFORE #74a, the package count is 32, not 31 (the new
`_graph_directory/` package is added). If #74a lands BEFORE #56/#61, the
census must classify the soon-to-be-moved files (`graph_directory_service.py`
is a single file, not a package, so it would be skipped by the glob; but the
census's allowlist must reference `_graph_directory` either way).

Verdict: ✅ Plans are consistent — #74b explicitly waits on #61. But
**Missing-dep #B**: #74a's "exactly 31 packages today" assertion drifts the
moment #61 lands. Either (a) #74a lands first (and `_graph_directory` is
pre-listed in the adapter allowlist with a "post-#61" comment), or (b) #74a's
assertion uses a `>=` count or treats `_graph_directory` as a planned package.
Plan-loop-1-08-crosscut already prefers ordering #74a → #61 (master DAG
analysis section `:765-773`), but the assertion phrasing "exactly 31"
contradicts the proposed adapter allowlist that names `_graph_directory`.

---

## 4. #46 → #65 + #67 ordering

Verification:

- Frontend plan `plan-loop-1-06-frontend.md:284` "#46 is structural prereq for
  #65 (shared CRUD capability schema) and #67 (generic
  `useResourcePanelQuery`)".
- `:380` for #65: quote "#46 (per the prompt). Land #46 first so query-key
  factories are stable".
- `:437` for #67: quote "#46 (the new hook must accept a typed `queryKey`
  from a factory module)".
- Master DAG `:561` "blocks: ['65', '67', '68']" on #46.

Verdict: ✅ All three documents agree.

---

## 5. #37 + #39 → #66 (NOT #72)

Verification:

- Frontend plan `:406-407` quote "Loop B confirmed real prereqs are **#37 +
  #39** (`2026-05-09-deepening-audit.md:1610`); ADR-011 (#72) is **NOT** a
  prereq for #66".
- `:533` "#66 ──> #37 + #39 (per audit Tier-2 graph; Loop B-corrected; NOT
  ADR-011)".
- `:557` cross-domain note: "**ADR-011 (#72)** is *not* a prerequisite for
  #66 (Loop B explicit correction; audit `:1610` is `FE-N5 ← S8.7 + S7.10`).
  It IS a prerequisite for #71".
- Master DAG `:614` "in_domain_deps: ['37', '39']" for #66; `:864` no
  reference to ADR-011 in #66's prereqs.

Verdict: ✅ All plans express the corrected dependency.

---

## 6. #72 (ADR-011) → #71 (session merge)

Verification:

- Frontend plan `:482` quote "#71 ... ADR-011 (#72 — NOT in this domain ...)
  ADR-011 ratification is the strict prerequisite for this item".
- `:539` "#71 ──> #47 ... + #66 (split landed) + ADR-011 (#72; cross-domain)".
- Cross-cut plan `:546` "ADR-011 must land BEFORE #66 (FE-N5 AuthContext) and
  #71 (S7.8 session merge)". **Caveat**: this line lists #66 too, but Loop B
  in `verify-loop-b-08-crosscut.md:182` corrected this — "ADR-011 (#72) gates
  #71 only. #66 is gated by #37 + #39 (Tier 2)". The frontend plan absorbs
  this correction; the cross-cut plan still has the older framing in the
  prose at `:546`.
- Master DAG `:648` "cross_domain_deps: ['72']" for #71.

Verdict: ✅ #72 → #71 is captured. Minor tidy: cross-cut plan `:546` should
drop "#66" from the "ADR-011 must land BEFORE..." sentence — but #66's
prereqs in the master DAG already correctly omit #72, so the implementation
sequence is sound.

---

## 7. #17 → #49 → #59 chain

Verification:

- Endpoints plan `plan-loop-1-07-endpoints.md:462` quote "sequence after #17
  (shim deletion). #59 depends on this".
- `:601-603` "#17 must land first (otherwise the shim's reachability shadows
  the package contract). #49 should land before this".
- Master DAG `:740` "in_domain_deps: ['17']" for #49; `:760` "in_domain_deps:
  ['17', '49']" for #59.

Verdict: ✅ Three-link chain is captured exactly.

---

## 8. #14 → #30 weakness check

Orchestrator note: "Loop B noted `_notify_*` test imports go through
`_shared.notifications` submodule, NOT the barrel".

Verification:

- Loop B `verify-loop-b-01-issues.md:192` quote "the test file imports from
  `_shared.notifications` SUBMODULE directly ... NOT from the
  `_shared/__init__.py` barrel. Removing those names from the barrel `__all__`
  does NOT break the test".
- Issues plan `plan-loop-1-01-issues.md:122` quote "MUST land before #30
  because #30's accurate prunable-name count assumes `_notify_*` helpers no
  longer exist (Loop B note: ... so #30 alone does not break the test, but
  #14 cleanly removes the underlying helper)".
- `:287` "Strict prerequisites: #14 (notifications cleanup), #27 (loading
  dedup), #28 (source-mutation collapse) MUST land first".

The dependency is captured but the rationale is now SOFTER than originally
framed: #14 must land before #30 not for test-correctness but for
"prunable-name count" hygiene. Plan correctly captures Loop B's clarification
in the prose.

Verdict: ✅ Issues plan correctly absorbs Loop B's correction. The dep is
documented as soft-required for accurate accounting, not hard-required to
unblock #30's test rewrite. Master DAG `:53` "blocks: ['30']" for #14
preserves the edge.

---

## 9. #8 → #28

Verification:

- Issues plan `:196` quote "#8 (must land first so `update_plans.py` already
  imports `issue_link_department_ids` from somewhere other than
  `source_validation.py`)".
- Master DAG `:71` "in_domain_deps: ['8']" for #28.

Verdict: ✅ Captured.

---

## 10. #45a → #45b

Verification:

- Cross-cut plan `:204` quote "ACCEPT (P4) **conditional on #45a tests being
  green**".
- `:221` "#45a's three characterization tests stay green (proves zero
  behavioral regression)".
- Master DAG `:818` "in_domain_deps: ['45a']".

Verdict: ✅ Captured.

---

## 11. #10 + #38 sequencing

Verification:

- Endpoints plan `:18-19` quote "**Dependencies (in-domain):** #38 (move 3
  inline schemas `riskhub_questionnaires.py:17-34` to
  `backend/app/schemas/riskhub.py`)". Wait — this is item #10 declaring its
  IN-DOMAIN DEP is #38 (the schema-move). Then `:301` for #38 quote
  "**Dependencies (in-domain):** #10 (must keep `riskhub_questionnaires.py`
  alive)".
- Master DAG `:705` "in_domain_deps: ['10']" for #38; `:663` "blocks: ['38']"
  for #10.
- Endpoints plan recommended order at `:741-754` puts #10 first then #38 —
  consistent.

Reading more carefully: Item #10's "Dependencies (in-domain): #38" at line
18-19 is reverse-stating the relationship. The plan IS sequencing #10 first,
then #38 (audit `:752` "1. #10 (S, lock module presence first to prevent
collateral on #38)" / `:752` "2. #38 (M, move schemas — depends on #10 to
ensure file isn't deleted)"). The literal "Dependencies" line in #10 is
imprecise but the rest of the plan is clear.

Verdict: ✅ Sequence is #10 → #38 across all three artifacts (master DAG,
recommended order, dependency notes). Minor wording oddity at endpoints plan
`:18-19` does not change behavior.

---

## 12. #56 + #61 paired wave

Verification:

- Cross-cut plan `:347` quote "PAIRED with #61 — `graph_directory_service.py:8`
  imports `normalize_business_role` from this shim and #61 moves the file
  (path changes simultaneously)".
- `:432` quote "PAIRED with #56".
- Master DAG `:845` "atomic_with: ['61']" for #56; `:856` "atomic_with: ['56']"
  for #61.

Verdict: ✅ Atomic-pair captured both ways.

---

## 13. #69 + #70 single migration window

Verification:

- Vendor plan `plan-loop-1-05-vendor-quarterly.md:184` quote "**bundled with
  #70** (single migration window for vendor* ADR-010 changes)".
- `:225` "**bundled with #69** (single migration window)".
- `:215-216` quote "**single bundled commit with #69** ... `refactor(vendor):
  introduce AbstractVendorLink mixin and drop Vendor.status`. Single migration
  revision touches both".
- Master DAG `:429` "atomic_with: ['70']" for #69; `:440` "atomic_with: ['69']"
  for #70.

Verdict: ✅ Atomic bundling captured both ways.

---

## 14. #24 + #51 atomic cluster

Verification:

- KRI plan `plan-loop-1-04-kris.md:57` quote "**ATOMIC with #51** — both
  rewrite the same line `kris/linked_vendors.py:3`".
- `:171` quote "**ATOMIC with #24** — both rewrite `kris/linked_vendors.py:3`".
- `:77` "**Commit boundary**: SAME COMMIT as #51".
- `:197` "**Commit boundary**: SAME COMMIT as #24".
- Master DAG `:283` "atomic_with: ['51']" for #24; `:327` "atomic_with: ['24']"
  for #51.

Verdict: ✅ Atomic-pair single-commit framing captured.

---

## 15. Cross-domain doc collisions on capability contract

The orchestrator asked: "Do any of these conflict (edit same lines)?"

Cross-domain edits to `docs/security/authorization-capability-contract.md` /
`.json` from the per-domain plans, gathered by direct grep:

**Exact line numbers cited:**

| Domain item | File:line | Operation |
|-------------|-----------|-----------|
| #8 / Issues | `.md:128, .json:629` | APPEND `_issue_workflow/assignment.py` to `service_policy` |
| #28 / Issues | `.md:128, .json:629` | DROP `_shared/links.py` from `service_policy` |
| #30 / Issues | `.md:128, .json:629` | Possibly drop `_shared/serialization.py` |
| #34 / Approvals | `.md` AUTHZ-APPROVALS row | ADD §Vocabulary "privilege tier" |
| #60 / Approvals | `.md` AUTHZ-APPROVALS row | ADD §Privilege context |
| #24 / KRI | `.md:116,117,118; .json:368,388,410` | STRIP `kris/linked_vendors.py` (3 + 3 cells) |
| #50 / KRI | `.md:117,118,161; .json:389,411` | STRIP `submission.py` (3 + 2 cells) |
| #51 / KRI | `.md:117,118,161; .json:389,411` | STRIP `value_application.py` (3 + 2 cells) |
| #62 / KRI | `.md:172` | UPDATE path of `kri_vendor_assignment.py` to `_vendor_links/kri_assignment.py` |
| #13 / Vendor | `.md:121,122; .json:55,479,502` | DROP `vendor_link_helpers.py` (2 MD + 3 JSON) |
| #15 / Endpoints | `.md` matrix | ADD `access_user` row |
| #37 / Frontend | `.md` | NOTE `can_view_governance` SSOT |
| #39 / Frontend | `.json + capability-catalog.json` | ADD admin capability truth tables |
| #55 / Cross-cut | `.md:109; .json:106,229` | DROP `access_user_service.py` (1 MD + 2 JSON) |
| #56 / Cross-cut | `.md:109; .json:111,229` | DROP `directory_identity_service.py` (1 MD + 2 JSON) |
| #61 / Cross-cut | `.md:109; .json:113,229` | REWRITE `graph_directory_service.py` → `_graph_directory/service.py` (1 MD + 2 JSON) |

**Hot lines (touched by ≥2 items):**

- **`.md:117`** — #24 (line strip) AND #50/#51 (different strips). All three
  edits operate on the same `service_policy` paragraph. The current file
  spans paragraphs by service area; if all four KRI items land in different
  commits, each commit re-grep-s the paragraph. **Coordination needed:**
  either bundle into the atomic cluster A (since #24+#51 are already paired)
  or land #50 first/last so the diff windows don't overlap.
- **`.md:118`** — same overlap as `:117`.
- **`.md:128, .json:629`** — Issues domain. #8 (append `assignment.py`), #28
  (drop `_shared/links.py`), #30 (possibly drop `_shared/serialization.py`)
  all edit the same `service_policy` enumeration. Issues plan correctly
  sequences #8 → #28 → #30 and notes atomic-edits in same commit at line 100,
  215, 331.
- **`.md:109, .json:229`** — Cross-cut domain hot row. #55 (drop
  `access_user_service.py`), #56 (drop `directory_identity_service.py`), #61
  (rewrite `graph_directory_service.py` path) all edit the **same row** of
  `service_policy` blob. Three separate commits. **Missing-dep #C below.**

Verdict: 🟡 The cross-cut plan's three items #55, #56, #61 (and the paired
move) all touch the same `service_policy` row. KRI plan already notes the
collision at line 383: quote "the 6 doc citations in
`docs/security/authorization-capability-contract.{md:116,117,118,
json:368,388,410}` cross the documentation-surface domain. Coordinate with
the docs-domain plan loop to ensure no parallel rewrite collides on the same
MD/JSON cells". But there is no analogous collision callout in the cross-cut
plan for #55/#56/#61.

See **Missing-dep #C** below.

---

## 16. #73 ADR-012 → KRI domain SSOT preservation

The orchestrator asked: "Does the KRI plan correctly preserve the SSOT and
remove the duplicate? Or does it have it backwards?"

Verification:

- KRI plan `:294` quote "Loop B established that `_kri_history/constants.py:2`
  IS the SSOT (it is consumed by `periods.py:9`, `kri_history_service.py:8`,
  and across the package). The duplicate to collapse via ADR-012 is
  `_config/lookup.py:26 ConfigDefaults.REPORTING_GRACE_DAYS = 15`".
- `:299-301` quote "WRITE `docs/adr/ADR-012-kri-time-series-period-algebra.md`
  declaring `_kri_history/periods.py` (and `_kri_history/constants.py`) as the
  SSOT".
- `:331` quote "Edit `backend/app/services/_config/lookup.py:26` — REMOVE the
  `REPORTING_GRACE_DAYS = 15` line from `ConfigDefaults`".
- Loop B `verify-loop-b-04-kris.md:244-245` confirms: SSOT is constants.py,
  duplicate is `_config/lookup.py:26`.

Verdict: ✅ KRI plan has the direction correct (preserves
`_kri_history/constants.py`, removes `_config/lookup.py:26`).

---

## 17. #72 (ADR-011) → auth/ allowlist work

The orchestrator asked: "does the plan address the 8 auth-flow allowlist
entries that expire 2026-09-01? Is there a plan item for migrating those
commits to service-owned tx?"

Verification:

- Cross-cut plan `:548-549` quote "**Cross-domain prerequisites**: NONE for
  the ADR text itself. Cross-link: `_endpoint_commit_allowlist.toml` already
  pins 8 auth-flow entries with `expires_at = 2026-09-01`".
- `:574-580` quote "EDIT `docs/adr/README.md` — add ADR-011 row ... **Lock/
  TOML/contract updates**: NONE in #72 itself. The Enforcement section names
  new locks (`get_current_user`-import scan, body-call `_require_*`
  non-increasing count, `_endpoint_commit_allowlist.toml` auth-flow sunset
  enforcement) — those locks are *separate follow-up items* in other domains'
  plans".

The ADR-011 plan **declares** the migration as out-of-scope follow-ups but
does NOT enumerate them as numbered items in any of the 8 plans. The audit
identifies the sunset risk but no plan item exists to migrate the 8
auth-flow `db.commit` sites to service-owned transactions before
`expires_at = 2026-09-01`.

Verdict: 🟡 **Missing-dep #D below.** ADR-011 declares the 2026-09-01
sunset as an enforcement clause but no follow-up item to actually do the
migration is listed. The expires_at date will arrive whether or not the
ADR is ratified, so the migration work needs a tracked item.

---

## 18. #75 (bonus) coordination with #34/#9

Verification:

- Approvals plan `:24` quote "`#7`, `#18`, `#33`, `#54`, `#75` are independent
  of the hub wave and can interleave freely with each other or before the
  wave".
- `:252` quote "**Dependencies (in-domain)**: none. Independent of
  #7/#9/#18/#33/#34/#54/#60".
- Master DAG `:253-258` lists #75 with empty `in_domain_deps`,
  `cross_domain_deps`, `blocks`, `atomic_with`.

#75 is a free-pool item (DELETE-AND-CONSOLIDATE
`_auto_reject_kri_approval` into `_approval_execution/results.py`). It does
NOT touch the hub file `approval_scenario_policy.py` and so does not collide
with #9/#34/#60.

But #75 DOES touch `_approval_execution/`, and #34's migration plan rewrites
`approval_execution_service.py:116,222,235,237` plus
`_approval_execution/authorization.py:30`. Different files within the same
package, no shared lines.

#75 also adds `auto_reject_kri_approval` to
`_approval_execution/results.py`. #34 does NOT touch `results.py`. No
conflict.

Verdict: ✅ #75 is genuinely free-pool. Plan correctly treats it as
independent.

---

## Cross-domain doc collisions matrix (recap)

The 5 plans that touch `docs/security/authorization-capability-contract.{md,
json}` are: Issues (#8/#28/#30), Approvals (#34/#60), KRI (#24/#50/#51/#62),
Vendor (#13), Frontend (#37/#39), Endpoints (#15), Cross-cut (#55/#56/#61).

**Hot rows:**

- `service_policy` row at `.md:109, .json:229` — touched by 3 cross-cut items
  (#55, #56, #61).
- `service_policy` row at `.md:117-118` — touched by 3 KRI items (#24, #50,
  #51).
- `service_policy` row at `.md:128, .json:629` — touched by 3 Issues items
  (#8, #28, #30).

Each domain plan declares atomic-edit-in-same-commit. The risk is when two
DIFFERENT-DOMAIN commits touch the SAME line. Mitigation:

- KRI #24+#51 are atomic (same commit) — collapses the 3 KRI items to 2
  commits.
- Cross-cut #55, #56, #61 are 3 separate commits but `:546-552` recommends
  "**#55** (S, independent leaf)", "**#56 + #61** (paired wave, M total)".
  Three commits touch `.md:109` in sequence — each lands cleanly because the
  `service_policy` row is a multi-line blob; each commit removes/rewrites a
  different token.

**Recommendation:** All three "hot rows" are blob-style multi-token cells
(not line-item edits). Sequential commits remove different tokens — no
conflict. The atomic-commit invariant per AGENTS.md is for **code+contract
bundle** atomicity (each commit re-runs the validator), not for cross-domain
serialization. The plans are correctly aligned on this.

---

# Missing dependencies (with recommendations)

## Missing dep: #A (in domain Approvals) → #12 (in domain Endpoints)

- Detection: Approvals plan `:151` "endpoints/users/summary.py:24-26 — same
  [migrate `can_resolve_approvals` → tier helper]". Endpoints #12 plan
  `:96-103` narrows blanket-except in same file at `:48,62`.
- Direction: #34 (Approvals) and #12 (Endpoints) both edit
  `endpoints/users/summary.py`. The lines do not literally overlap (#34 at
  `:24-26` for the predicate; #12 at `:48,62` for the except blocks). But
  both also touch the same import block.
- Risk if uncoordinated: import-block churn — if #12 lands first and narrows
  `except Exception:` to `except HTTPException:`, then #34 lands and removes
  the `can_manage_users` import (#34's plan `:165` "Update each file's
  import block: drop `from app.core.permissions import can_resolve_approvals`
  (where it becomes unused)"), the second commit re-touches the import block
  to remove the unused import. Mechanical, not a logical conflict.
  
  Worse: #37 (Frontend domain item) ALSO edits `users/summary.py` per
  `plan-loop-1-06-frontend.md:237-241`: quote "REMOVE `_can_view_governance`
  (lines 45-50). REMOVE imports of `can_manage_users`,
  `ensure_business_view_access` (line 10)." This is a third commit on the
  same file.
- Recommendation: ADD a sequencing note in `plan-loop-1-03-approvals.md`
  Item #34 cross-domain section that calls out: "Three plans edit
  `users/summary.py`: #12 (Endpoints; narrows excepts), #37 (Frontend;
  removes `_can_view_governance` mirror), #34 (Approvals; tier migration).
  Recommended order: #37 → #12 → #34, since #37 removes
  `_can_view_governance` (which references `ensure_business_view_access`),
  #12 narrows the surviving excepts, and #34 swaps the privileged-predicate
  call". Not a hard blocker (each commit is mechanically isolated) but a
  coordination point for a single sequential developer.

## Missing dep: #B (in domain Cross-cut #74a) → #56/#61 package count drift

- Detection: Cross-cut plan `:633` "enumerate
  `glob('backend/app/services/_*/')` (excluding `__pycache__`); assert
  exactly 31 packages today".
- Direction: #61 (creates `_graph_directory/`) and #56 (deletes
  `directory_identity_service.py` — which is a top-level FILE, not a
  package, so the glob count is unaffected by #56). Only #61 affects the
  glob count. After #61: 32 packages.
- Risk if uncoordinated: The "exactly 31" assertion in #74a's lock test
  becomes red the moment #61 lands. If #74a's lock is committed first, then
  #61 lands and the assertion fails on every CI run until #74b is updated.
  If #61 lands first, then #74a's "exactly 31" assertion is wrong from the
  start.
- Recommendation: AMEND `plan-loop-1-08-crosscut.md` Item #74a TDD-shape to
  use `>= 31` and an explicit allowlist enumeration, OR sequence #74a as
  the first-of-cluster (before #56+#61), with the allowlist already
  including `_graph_directory` (planned). Cross-cut plan recommended order
  at `:765-773` already places #74a (item 5) before #56+#61 (item 6) in the
  P3 wave — but the lock-test wording at `:633` "exactly 31 packages today"
  contradicts the post-#61 reality. Update wording to "31 today, 32 after
  #61, locked via `_bounded_context_*.toml` enumeration".

## Missing dep: #C (in domain Cross-cut) — three commits sharing service_policy MD/JSON cells

- Detection: Cross-cut plan `:316,317,402,403,502,503` all reference
  `docs/security/authorization-capability-contract.md:109` for items #55,
  #56, #61. Quote `:316` "EDIT `docs/security/authorization-capability-
  contract.md:109` `service_policy` row — remove same token".
- Direction: #55 (delete `access_user_service.py`), #56 (delete
  `directory_identity_service.py`), #61 (rewrite path of
  `graph_directory_service.py`) all edit `.md:109`. They also all touch the
  same `service_policy` blob in `.json:229`.
- Risk if uncoordinated: not a conflict because the three tokens being
  removed/rewritten are different. But: the three commits all run
  `python scripts/security/validate_authz_capability_contract.py` in their
  verification; the validator must be tolerant of partial-removal states.
  Loop B did not stress-test this.
- Recommendation: ADD a cross-cut sequencing note in
  `plan-loop-1-08-crosscut.md` that explicitly states the 3 commits land in
  order (#55 → #56+#61) and EACH commit re-runs the validator. Recommended
  sequence at `:765-773` already has this, but the validator-reentry
  invariant should be called out explicitly. Add an item to "validate after
  each commit" rather than "validate at the end".

## Missing dep: #D (no plan item exists) — auth/ allowlist 2026-09-01 sunset migration

- Detection: Cross-cut plan `:548-549` "8 auth-flow entries with `expires_at
  = 2026-09-01`"; `:577-580` "those locks are *separate follow-up items* in
  other domains' plans".
- Direction: ADR-011 (#72) declares the sunset as an enforcement clause but
  the 8 db.commit sites in `auth/refresh.py:177`, `auth/logout.py:101,132`,
  `auth/sso.py:170`, `auth/_sso_helpers.py:48`, `auth/password.py:128,161`,
  `auth/demo.py:67` (per Loop B verification at
  `verify-loop-b-08-crosscut.md:179`) need migration to service-owned tx.
  No plan item exists to do the work.
- Risk if uncoordinated: The `expires_at = 2026-09-01` is a hard date in
  `_endpoint_commit_allowlist.toml` (per ADR-002). When the date arrives,
  CI begins failing on those allowlist entries. ADR-011 ratifies the
  decision but does not schedule the work.
- Recommendation: ADD a NEW item (suggested numbering #76 or list as a
  Phase-4 follow-up explicitly) to: "Migrate 8 auth-flow `db.commit`
  sites to service-owned transactions before 2026-09-01". This belongs in
  the cross-cut plan or the Vendor/Quarterly plan (auth/ is a separate
  endpoint family, but service-owned tx is a cross-cutting concern). The
  Cross-cut plan should explicitly disclaim ownership and create a tracked
  follow-up item rather than leaving it implicit.

## Missing dep: #E (in Frontend domain) → #66 lacks captured #35 ordering

- Detection: Frontend plan `:407-408` quote "#35 (usePermissions removal) is
  *not* a strict prereq but should land first to avoid churn in 18 mock
  files".
- Direction: #35 → #66 is recommended-but-not-required ordering. Master DAG
  `:614` `in_domain_deps: ['37', '39']` for #66 — `#35` is not listed.
- Risk if uncoordinated: If #66 lands first (split AuthContext into 3
  providers), the 18 `vi.mock('@/hooks/usePermissions', ...)` test files
  ALSO need to be rewritten to mock the new providers. Then #35 lands and
  the same 18 test files need a SECOND rewrite to mock `@/contexts/
  AuthContext`. Mechanical churn doubled.
- Recommendation: ADD `#35` as a SOFT in-domain prereq on #66 in the master
  DAG (or annotate `in_domain_deps: ['37', '39']  # soft: ['35']`) so the
  recommended sequential order is unambiguous. Alternative: #66 plan
  `:407-408` already calls this out in prose; orchestrator can simply
  preserve the recommended-order section verbatim. Not a hard miss but the
  master DAG omits the soft edge.

## Missing dep: #F (in Vendor domain) → cross-domain frontend impact of #70

- Detection: Vendor plan `:302` quote "**Frontend impact (out of scope here,
  flag for Loop 6)**: dropping `Vendor.status` from API response payloads
  (#70) and changing 14 monitoring-response endpoint imports (#17 — no
  payload change). The frontend's `LinkedVendor` / `Vendor` TypeScript
  types may carry `status?: string` and need pruning under Loop 6".
- Direction: #70 → frontend type cleanup. No corresponding item in the
  Frontend domain plan addresses `Vendor.status` removal.
- Risk if uncoordinated: After #70 lands (drops `Vendor.status` from API
  response), the frontend's `LinkedVendor` and `Vendor` TS types become
  stale. If they declare `status: string` (not optional), the build
  succeeds but the field is silently `undefined`. If TS types declare
  `status: 'active'` (literal), parsing the API response trips a Zod
  validator (per `_capabilities/...` schema test pattern).
- Recommendation: ADD a follow-up item OR amend `plan-loop-1-06-frontend.md`
  with a small task: "After #70 lands, prune `status?: string` from
  `LinkedVendor` / `Vendor` TS types and Zod schemas". Vendor plan correctly
  flags it but Frontend plan doesn't yet absorb the work item. Add as a
  P3 item in Frontend or let Vendor plan own a Loop-6 follow-up.

## Missing dep: #G (in Endpoints domain) → #38 BatchSendRiskFilters rename impact

- Detection: Endpoints plan `:300-301` quote "rename generic `RiskFilters`
  → `BatchSendRiskFilters` to avoid collision with risk-query schemas".
- Direction: After #38 lands the schema rename, the FE Zod mirror at
  `frontend/src/services/api/schemas/riskHub.ts:147`
  (`batchSendQuestionnairesResponseSchema`) and the request payload mirror
  may reference the old name.
- Risk if uncoordinated: Wire-format break — if BE renames request body
  schema field types and FE keeps old name, request bodies still match
  (Pydantic accepts both shapes since the field structure is the same), but
  TS type-checking fails.
- Recommendation: AMEND `plan-loop-1-07-endpoints.md` Item #38
  Cross-domain prerequisites to call out FE TS impact: "rename
  `RiskFilters` → `BatchSendRiskFilters` in same commit as
  `frontend/src/services/api/schemas/riskHub.ts:147` if any TS type
  references the old name". Endpoints plan mentions verification at
  `:794-797` but doesn't sequence the FE update.

---

# Summary table

| Check | Verdict | Action |
|-------|---------|--------|
| 1. #34 scope (22+ sites) | ✅ Approvals owns all 22+ | None |
| 2. #39 → #40 handoff | ✅ Captured | None |
| 3. #74a → #56/#61 | 🟡 #74a count drift | **Missing-dep #B** |
| 4. #46 → #65 + #67 | ✅ Captured | None |
| 5. #37 + #39 → #66 (NOT #72) | ✅ Captured | None |
| 6. #72 → #71 | ✅ Captured | Tidy cross-cut `:546` |
| 7. #17 → #49 → #59 | ✅ Captured | None |
| 8. #14 → #30 (weak dep) | ✅ Plan absorbs Loop B | None |
| 9. #8 → #28 | ✅ Captured | None |
| 10. #45a → #45b | ✅ Captured | None |
| 11. #10 + #38 sequence | ✅ Captured | Minor wording |
| 12. #56 + #61 paired | ✅ Captured | None |
| 13. #69 + #70 bundled | ✅ Captured | None |
| 14. #24 + #51 atomic | ✅ Captured | None |
| 15. Doc collisions | ✅ Multi-token blobs | **Missing-dep #C** |
| 16. #73 SSOT direction | ✅ Correct | None |
| 17. #72 → auth allowlist | 🟡 No migration item | **Missing-dep #D** |
| 18. #75 free-pool | ✅ Genuinely independent | None |
| #A users/summary 3-way | 🟡 Soft sequencing | **Missing-dep #A** |
| #B 31-package drift | 🟡 Lock wording | **Missing-dep #B** |
| #C cross-cut MD:109 churn | 🟡 Validator re-entry | **Missing-dep #C** |
| #D auth 2026-09-01 sunset | 🟡 Unowned work | **Missing-dep #D** |
| #E #35 → #66 soft | 🟡 Master DAG gap | **Missing-dep #E** |
| #F #70 → FE Vendor.status | 🟡 Cross-plan gap | **Missing-dep #F** |
| #G #38 → FE rename | 🟡 Cross-plan gap | **Missing-dep #G** |

# Recommended plan-file edits

1. **`plan-loop-1-08-crosscut.md`** — amend Item #74a to use a `>= 31`
   assertion or update the "exactly 31 packages today" wording to reflect
   the post-#61 count of 32. Also add validator-re-entry note to #55,
   #56+#61 commit sequence.

2. **`plan-loop-1-08-crosscut.md`** — add a new follow-up item or
   explicit out-of-scope note for the auth/ allowlist 2026-09-01 sunset
   migration (Missing-dep #D).

3. **`plan-loop-1-03-approvals.md`** — Item #34 cross-domain section
   should call out the 3-way file overlap on
   `endpoints/users/summary.py` (with #12 and #37). Recommended
   sequence: #37 → #12 → #34.

4. **`plan-loop-1-06-frontend.md`** — amend Item #66 to note #35 as a
   recommended-precedence soft prereq (avoid double mock rewrite).

5. **`plan-loop-1-06-frontend.md`** OR add to Vendor follow-up: `Vendor.
   status` TS type cleanup after #70 lands (Missing-dep #F).

6. **`plan-loop-1-07-endpoints.md`** — Item #38 should cross-link the
   FE TS rename impact for `RiskFilters → BatchSendRiskFilters`
   (Missing-dep #G).

7. **`plan-loop-1-08-crosscut.md`** — Item #72 has prose at `:546` that
   says "ADR-011 must land BEFORE #66 ... and #71"; correct to "ADR-011
   must land BEFORE #71" (and add note that #66 was originally framed
   the same way but Loop B corrected to #37+#39 prereqs).

End of Phase 3 Loop 2 hidden-prerequisite hunter findings.
