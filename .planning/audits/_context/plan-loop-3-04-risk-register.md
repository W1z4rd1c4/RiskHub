# Phase 3 Loop 3 — Consolidated Risk Register

Working dir: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Anchor commit: `1ee872a4`.
Domain: synthesis of every "Risk note", "Rollback note", "Hidden dependency",
and "Doc/lock burden" annotation collected in Phase 3 Loops 1 + 2 (including
Loop 2 A7 hidden-prereqs).

Constraints honored:
- Single sequential developer; TDD red→green; doc/lock-only Reject is invalid;
  Defers planned (not skipped).
- Every risk cites `file:line` + ≤15-word quote.
- No invented risks — every entry is grounded in a Loop 1 or Loop 2 plan,
  the developer answer, or current code.

Scoring rubric:
- **Likelihood**: HIGH = >50% the failure mode triggers in normal execution;
  MEDIUM = 10–50%; LOW = <10%.
- **Impact**: HIGH = production outage / data corruption / lost work;
  MEDIUM = test failures, doc drift, blocked CI; LOW = code-review catch.
- **Owner role**: dev = single sequential developer running the work;
  reviewer = adversarial Round-2/3 reviewer per CLAUDE.md;
  both = both must check.

---

## Section 1 — Risks listed in detail

### Risk: #11 control-execution `risk.process` → `risk.name` regression
- Category: Behavior regression
- Affected items: #11
- Source: `plan-loop-1-02-risks.md:196-204` quote
  `"truth-in-naming fix … fix the bug at backend/app/services/_control_execution/workflow.py:155"`.
- Likelihood: LOW (#11 explicitly co-edits the assertion; commit is single-author single-line).
- Impact: HIGH (CSV/audit export already says `risk.name`; execution-list endpoint silently disagrees today; the fix re-aligns wire shape but a botched edit could flip back).
- Detection: existing assertion at `tests/backend/pytest/test_executions.py:325` quote
  `assert item["linked_risks"] == [risk.process]` plus the audit-trail parity at `test_reports_audit.py:185-186`.
- Mitigation: enforce the "test inversion AND workflow fix MUST land in the
  same commit; splitting is forbidden" rule from `plan-loop-1-02-risks.md:285-289`.
- Owner role: dev.

### Risk: #34 Approvals hub partial migration (22+ sites)
- Category: Hub additivity
- Affected items: #34, #9, #60
- Source: `plan-loop-1-03-approvals.md:14, :138, :148-166` quote
  `"22+ sites enumerated by Loop B"` and `"Migrate atomically (single commit)"`.
- Likelihood: MEDIUM. 16 distinct files, 22+ sites, single-developer single-commit migration is large; partial commit easy to leave behind.
- Impact: HIGH if partial — silent privilege-tier drift across approval read paths; a leftover `can_resolve_approvals` call site that is **not** swapped to `resolve_approval_privilege_tier` returns the legacy answer while the rest of the codebase trusts the new helper, risking unauthorized approve/reject paths.
- Detection: Loop 1 plan adds structural lock `hasattr(approval_scenario_policy, "resolve_approval_privilege_tier")` (`plan-loop-2-03-lock-conflict-matrix.md:329`) plus per-domain pytest sweep.
- Mitigation: (a) keep #9 → #34 → #60 strictly sequential per
  `plan-loop-1-03-approvals.md:18-23`; (b) before commit, run
  `grep -rn "can_resolve_approvals" backend/` and confirm zero matches in production code outside `approval_scenario_policy.py`; (c) add an architecture-lock test asserting `can_resolve_approvals` is **not** imported anywhere except inside the helper.
- Owner role: both (dev plus mandatory reviewer Round-2 grep audit).

### Risk: #74a "exactly 31 packages today" assertion drift after #61
- Category: Lock churn race / Test brittleness
- Affected items: #74a, #61
- Source: Loop 2 hidden-prereq #B at
  `plan-loop-2-07-hidden-prereqs.md:108-114` quote
  `"the 'exactly 31 packages today' assertion drifts the moment #61 lands"`;
  also `plan-loop-2-03-lock-conflict-matrix.md:99` quote
  `"glob('backend/app/services/_*/'); assert exactly 31 packages today"`.
- Likelihood: HIGH (definite — the count is 32 after #61 creates `_graph_directory/`).
- Impact: MEDIUM. Lock test goes red on every CI run between #61 and #74b until the literal is updated.
- Detection: `make -f scripts/Makefile test-architecture-locks` after either commit lands.
- Mitigation: Loop 2 recommendation at `plan-loop-2-07-hidden-prereqs.md:551-558`:
  amend #74a TDD shape to use `>= 31`, OR sequence #74a strictly before
  #56+#61 and pre-list `_graph_directory` in `_bounded_context_adapters.toml`
  with a "post-#61" comment.
- Owner role: dev.

### Risk: #45a tests gating #45b — risk of #45b skipped or tests weakened
- Category: Test brittleness / behavior regression
- Affected items: #45a, #45b
- Source: `plan-loop-1-08-crosscut.md:204` quote
  `"ACCEPT (P4) conditional on #45a tests being green"`;
  `:221` quote `"#45a's three characterization tests stay green (proves zero behavioral regression)"`.
- Likelihood: MEDIUM. Single-developer pressure to ship; if #45a tests
  reveal a behavior nuance, the temptation is to relax the assertion
  rather than adjust the factory.
- Impact: HIGH (false equivalence between legacy resolver and the new factory could silently change ownership-resolution semantics for KRI-archived asymmetry — the exact behaviour the tests pin).
- Detection: Round-2 adversarial review of #45a test diffs vs Round-1 baseline; verify all three assertions in
  `tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py`,
  `test_ownership_resolver_control_join.py`, `test_visible_ids_via_ownership.py` (per `plan-loop-2-03-lock-conflict-matrix.md:450`) remain assert-positive (no `xfail`/`skip`).
- Mitigation: (a) freeze #45a test file content under a `_red.py` invariant lock once #45a is green; (b) #45b PR description must list the SHA of #45a's commit and confirm `git diff <#45a-sha> -- tests/backend/pytest/test_ownership_resolver_*` shows zero hunks.
- Owner role: both.

### Risk: Capability-contract validator runs after every commit (multiple failure surfaces)
- Category: Validator brittleness / CI lane regression
- Affected items: 16 contract-touching items per
  `plan-loop-2-05-validator-schedule.md:425-447` (#13, #15, #24, #34, #37, #39, #50, #51, #55, #56, #57, #60, #61, #62, #65, #66, #69+#70 bundle).
- Source: `plan-loop-2-05-validator-schedule.md:7-9` quote
  `"the validator … MUST be run locally between pytest (red→green) and the commit"`.
- Likelihood: HIGH that at least one of 16 commits forgets to re-stage the
  contract md/json before running the validator. The seven distinct check
  classes (`runner.py:35-60`) each have their own failure mode.
- Impact: MEDIUM. Validator failure blocks the commit; once green it is
  fine. The cumulative cost is a slow developer feedback loop, not a
  production bug. Worst case: developer disables validator (forbidden).
- Detection: `python3 scripts/security/validate_authz_capability_contract.py` exit code.
- Mitigation: `plan-loop-2-05-validator-schedule.md:483-510` — add a
  `scripts/dev/precommit.sh` that runs locks + validator together;
  enforce as a pre-commit hook so the developer cannot accidentally skip it.
  For #51+#24 atomic (5 md cells + 5 json strings), run the validator
  TWICE — once after staging the file deletes, once after staging the
  doc edits — to catch incomplete sweeps (`plan-loop-2-05-validator-schedule.md:516-520`).
- Owner role: dev.

### Risk: Postgres lane catches #69+#70 issues only post-merge
- Category: CI lane regression / Migration safety
- Affected items: #69, #70
- Source: `plan-loop-2-06-migration-window.md:457` quote
  `"pytestmark = pytest.mark.postgres"`;
  `:594-595` quote `"Locally bring up Postgres lane … alembic upgrade head"`.
- Likelihood: MEDIUM. Postgres-lane fixtures exist
  (`tests/backend/pytest/migrations/`) but local Postgres is opt-in. If
  the developer's `make postgres-up` step is skipped, the CI Postgres
  lane catches the regression on day 2, after merge to `main`.
- Impact: HIGH. ADR-010 is forward-only — `downgrade()` raises
  `NotImplementedError` (`plan-loop-2-06-migration-window.md:227-231`).
  A bug discovered post-merge requires a snapshot restore.
- Detection: `tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py` (`plan-loop-2-06-migration-window.md:451-496`) plus row-count rehearsal.
- Mitigation: (a) make Postgres lane mandatory for #69+#70 commit; (b)
  per `plan-loop-2-06-migration-window.md:686-687`, capture pre-upgrade
  row counts and rehearse on a refreshed staging clone before merging;
  (c) Round-3 adversarial: a fresh agent runs the migration on a fresh
  dev DB and confirms `confdeltype='c'` for all 6 FKs.
- Owner role: both (dev + reviewer).

### Risk: Cross-domain doc collision on `docs/security/authorization-capability-contract.md` lines 109, 117-118, 128
- Category: Doc churn
- Affected items: 14 items touch the contract markdown
  (`plan-loop-2-04-doc-touch-matrix.md:122-141`).
- Source:
  - `:109` — #55, #56, #61 (Cross-cut domain) all rewrite the same `service_policy` row.
  - `:117-118` — #24, #50, #51 (KRI domain) all strip different tokens.
  - `:128` — #8, #28, #30 (Issues domain) all edit the same `service_policy` enumeration.
- Likelihood: MEDIUM. Tokens are distinct; the blob-style multi-line cells
  per `plan-loop-2-07-hidden-prereqs.md:496-498` accept sequential
  removals. But: each of the 9 commits independently re-runs the
  validator, and a copy-paste error in any one commit cascades.
- Impact: MEDIUM. Validator failure is loud; the commit fails. Risk is
  developer fatigue across 9 sequential edits to the same paragraph.
- Detection: validator (check 7 `authz_contract_not_updated` per
  `plan-loop-2-05-validator-schedule.md:148-149`).
- Mitigation: (a) atomic clusters where possible — #24+#51 already
  bundled (`plan-loop-2-07-hidden-prereqs.md:485-486`); (b) for the 3-way
  cross-cut sequence (#55 → #56+#61), validate after each commit per
  Loop 2 Missing-dep #C at `plan-loop-2-07-hidden-prereqs.md:560-580`;
  (c) developer keeps the contract markdown open in a separate buffer
  during the wave.
- Owner role: dev.

### Risk: ADR-011 (#72) claims auth/ allowlist migration but no concrete item exists
- Category: CI lane regression / Doc churn
- Affected items: #72 (declares); no successor item exists.
- Source: Loop 2 Missing-dep #D at
  `plan-loop-2-07-hidden-prereqs.md:582-603`;
  `plan-loop-2-03-lock-conflict-matrix.md:34` quote
  `"NO room for additional auth/* commits before 2026-09-01 expiry"`.
- Likelihood: HIGH (date is hardcoded in
  `_endpoint_commit_allowlist.toml`; whether or not migration work is
  scheduled, the date arrives).
- Impact: HIGH. On 2026-09-01, the 8 auth-flow `expires_at` entries
  trigger `test_w5_endpoint_commit_ratchet_red.py` failure on every
  CI run until each `db.commit` site in `auth/refresh.py:177`,
  `auth/logout.py:101,132`, `auth/sso.py:170`, `auth/_sso_helpers.py:48`,
  `auth/password.py:128,161`, `auth/demo.py:67` (per
  `plan-loop-2-07-hidden-prereqs.md:587-591`) is migrated to
  service-owned tx.
- Detection: calendar-based; CI failure on 2026-09-01.
- Mitigation: per Loop 2 Missing-dep #D recommendation
  (`plan-loop-2-07-hidden-prereqs.md:597-603`), add a NEW Phase-4 item
  "Migrate 8 auth-flow `db.commit` sites to service-owned transactions
  before 2026-09-01" to the cross-cut plan. Owner: cross-cut domain.
  Track the calendar date.
- Owner role: both (dev acts before 2026-09-01; reviewer enforces the
  Phase-4 follow-up actually exists).

### Risk: #66 AuthContext split causes re-render regressions (memo dependency)
- Category: Behavior regression / Test brittleness
- Affected items: #66
- Source: `plan-loop-1-06-frontend.md:406-407` quote
  `"#66 ──> #37 + #39"`; the existing AuthContext composition is the
  re-render root for permission-checked routes.
- Likelihood: MEDIUM. 18 mock files (per
  `plan-loop-2-07-hidden-prereqs.md:613-616`) reference the unified
  context; partial migration leaves some test components consuming the
  legacy provider while production uses the split, and re-render isolation
  invariants depend on memo deps.
- Impact: HIGH. Wrong memo deps in `SessionProvider` /
  `AuthActionsProvider` cause cascading re-renders or — worse — stale
  permission flags after token refresh, leading to silently-wrong UI
  permissions.
- Detection: `tests/frontend/unit/src/contexts/__tests__/SessionProvider.split.test.tsx` and `AuthActions.split.test.tsx` (per
  `plan-loop-2-03-lock-conflict-matrix.md:433`).
- Mitigation: (a) keep #66 broken into 4 commits per
  `plan-loop-1-06-frontend.md` recommended sequence; (b) sequence #35
  before #66 (Loop 2 Missing-dep #E at
  `plan-loop-2-07-hidden-prereqs.md:606-622`) so the 18 mock files are
  rewritten once, not twice; (c) Round-2 adversarial review of the
  context tree: confirm `useMemo` dep arrays do not include unstable
  references.
- Owner role: both.

### Risk: #46 query-key factory mechanical refactor (45 sites in 22 files; partial = cache misses)
- Category: Cross-domain coordination / Behavior regression
- Affected items: #46, #65, #67, #68
- Source: `plan-loop-1-06-frontend.md:282` quote
  `"45 inline queryKey: literals across 22 files into per-domain factory modules"`.
- Likelihood: MEDIUM. 45 sites = high diff volume. Single-developer
  single-pass is possible but a missed site means React Query treats
  the inline literal and the factory output as different cache keys
  → cache miss + double-fetch on the affected route.
- Impact: MEDIUM. No data corruption; user sees stale data flicker or
  brief over-fetching. Hard to spot in a code review.
- Detection: `tests/frontend/unit/src/lib/queryKeys/__tests__/queryKeys.invariant.test.ts` (per `plan-loop-2-03-lock-conflict-matrix.md:428`).
- Mitigation: (a) the invariant test should enumerate all 22 files
  via filesystem walk and assert no inline `queryKey:` literal remains;
  (b) Round-2 adversarial: fresh agent runs
  `git grep -n "queryKey:" frontend/src/` and confirms zero hits outside
  the factory modules; (c) sequence #46 strictly before #65, #67, #68
  per `plan-loop-2-08-master-sequence.md:65-66`.
- Owner role: both.

### Risk: #71 session merge `sso.ts:9-11` module-scope state must survive
- Category: Behavior regression
- Affected items: #71
- Source: `plan-loop-1-06-frontend.md:481-484` quote
  `"Module-scope state in sso.ts:9-11 (refreshInFlight, lastRefreshFailureAt, REFRESH_FAILURE_COOLDOWN_MS) MUST survive the merge intact"`;
  `:563` quote `"the single-flight refresh contract in sso.ts:9-11 is the highest landing-time risk"`.
- Likelihood: MEDIUM. A "concatenate the three files and call it
  `coordinator.ts`" merge can lose the closure or accidentally turn
  the module-scope `let` into a function-scope `let`, breaking single-flight.
- Impact: HIGH. Loss of single-flight = simultaneous duplicate token
  refresh requests under load; loss of cooldown = thundering-herd retries
  on auth failures, can DoS the auth endpoint.
- Detection: `coordinator.singleFlight.test.ts` (per
  `plan-loop-1-06-frontend.md:488`) — invokes
  `trySilentSessionRefresh` twice in parallel and asserts a single
  in-flight promise.
- Mitigation: (a) keep the three module-scope variables verbatim per
  `plan-loop-1-06-frontend.md:492` quote
  `"let refreshInFlight: Promise<string | null> | null = null"`;
  (b) split #71 into 3 commits per `:501`: storage merge, coordinator
  merge with single-flight pin test, drop orphans + barrel; (c) Round-2
  adversarial review specifically reads `coordinator.ts` and asserts
  the three variables are at top-level scope, not inside any function.
- Owner role: both.

### Risk: Lock churn race on `test_architecture_deepening_contracts.py`
- Category: Lock churn race
- Affected items: #8, #18, #49, #50, #51, #52, #53, #54, #55, #56, #57
  (11 items per `plan-loop-2-03-lock-conflict-matrix.md:541`).
- Source: `plan-loop-2-03-lock-conflict-matrix.md:333` quote
  `"Most edits cluster on lines :188, 192, 559-569, 956, 962, 976-980, 997-1002, 1005, 1025, 1041, 1029, 1192-1206"`.
- Likelihood: HIGH if items are not strictly ordered. Two items
  (#50, #51) both edit the tuple at `:997-1002`. #8 and #53 both edit
  the import line at `:1193`.
- Impact: MEDIUM. A lock-race triggers `ImportError` on test collection
  (e.g., `from app.services._kri_history import correction_plans` after
  `correction_plans.py` is deleted but before the test is updated).
  Recoverable but blocks the developer until the lock is fixed.
- Detection: `make -f scripts/Makefile test-architecture-locks`.
- Mitigation: per `plan-loop-2-03-lock-conflict-matrix.md:334-345`,
  enforce strict order:
  1. #52 first → `:956, 962`.
  2. #50 next → `:997-1002` submission.py string.
  3. Cluster A (#24+#51) → `:976, 979, 980, 998-1000`.
  4. #57 → `:559-569`.
  5. #54 → `:1005, 1025, 1041`.
  6. #49 → `:188, 192`.
  7. #56 → `:227-238`.
  8. #55 → `:246-257`.
  9. #8 → `:1193`.
  10. #53 → `:1193` follow-up.
- Owner role: dev.

### Risk: `users/summary.py` 3-way cross-domain edit
- Category: Cross-domain coordination
- Affected items: #12 (Endpoints), #34 (Approvals), #37 (Frontend)
- Source: Loop 2 Missing-dep #A at
  `plan-loop-2-07-hidden-prereqs.md:506-535` quote
  `"Three plans edit users/summary.py: #12, #37, #34"`.
- Likelihood: MEDIUM. Three sequential commits on the same file's
  import block; mechanical churn but no logical conflict.
- Impact: MEDIUM. Each commit re-touches the import block; if not
  sequenced correctly, a second commit re-introduces an import the
  first commit removed.
- Detection: `ruff check backend/app/api/v1/endpoints/users/summary.py`
  after each commit catches unused imports.
- Mitigation: per Loop 2 recommendation, sequence #37 → #12 → #34
  (`plan-loop-2-07-hidden-prereqs.md:533-535`).
- Owner role: dev.

### Risk: KRI #24+#51 atomic cluster — high doc-edit volume in single commit
- Category: Doc churn / Test brittleness
- Affected items: #24, #51 (atomic per `plan-loop-1-04-kris.md:54-58`).
- Source: `plan-loop-2-05-validator-schedule.md:516-520` quote
  `"highest doc-edit volume in any single commit (5 md cells + 5 json strings); a missed cell triggers authz_contract_not_updated"`.
- Likelihood: MEDIUM. 5+5 cells across 2 files plus the
  `_kri_history/README.md` row plus the deepening-contract tuple plus
  the new `_red` test; a single missed grep is plausible.
- Impact: MEDIUM. Validator catches in 30s; recoverable.
- Detection: validator + `make -f scripts/Makefile test-architecture-locks`.
- Mitigation: (a) developer drafts the atomic-commit checklist before
  starting — list every file:line that must be edited; (b) run validator
  twice (after delete-stage, after doc-edit-stage) per
  `plan-loop-2-05-validator-schedule.md:516-520`.
- Owner role: dev.

### Risk: #56+#61 paired wave — test_directory_identity_facade_uses_lifecycle_module rewrite
- Category: Lock churn race / Cross-domain coordination
- Affected items: #56, #61 (atomic per `plan-loop-1-08-crosscut.md:347, 432`).
- Source: `plan-loop-2-03-lock-conflict-matrix.md:185-189` quote
  `"HIGH (test introspects the file being deleted). Without rewriting in the same commit, the test raises ImportError"`.
- Likelihood: MEDIUM. The single-commit rewrite is captured in Loop 1
  but the multi-monkeypatch path rewrite (8 prod importers + 1 script
  + 2 test files) is mechanically large.
- Impact: MEDIUM. Test collection fails until the deepening contract
  test is rewritten (`:226-240`).
- Detection: test collection (`pytest --collect-only`).
- Mitigation: per `plan-loop-2-03-lock-conflict-matrix.md:188-189`,
  ensure the deepening-contract rewrite ships in the SAME PR as the
  file delete; Round-2 reviewer runs the full pytest suite collection
  before approving.
- Owner role: both.

### Risk: ADR-010 forward-only — no easy rollback for #69+#70
- Category: Migration safety
- Affected items: #69, #70 (single bundled migration).
- Source: `plan-loop-2-06-migration-window.md:227-231` quote
  `"raise NotImplementedError('Forward-only migration. Restore from snapshot per ADR-010.')"`.
- Likelihood: LOW (Loop 2 plan is detailed; rehearsal step in §4 is mandatory).
- Impact: HIGH. Operational rollback = restore from snapshot per ADR-010
  §"Rollback Strategy"; cannot revert in-place.
- Detection: only post-deploy.
- Mitigation: per `plan-loop-2-06-migration-window.md:684-693`,
  pre-merge requires (a) pre-upgrade snapshot validated as restorable;
  (b) row-count capture for `vendors`, `vendor_risk_links`,
  `vendor_control_links`, `vendor_kri_links`; (c) migration rehearsal
  on a refreshed staging clone with monitoring; (d) frontend redeploy
  must be simultaneous to avoid mid-deployment skew.
- Owner role: both (dev rehearses; reviewer signs off on snapshot).

### Risk: ADR alignment drift between #34/#60 vocabulary and capability contract markdown
- Category: Doc churn
- Affected items: #34, #60 (both append `## Vocabulary`).
- Source: `plan-loop-2-05-validator-schedule.md:419-421` quote
  `"Sequence #34 (C10) before #60 (C11) to keep markdown deltas additive"`;
  validator check 5 `markdown_validation.py:11-21` enforces 9 required sections.
- Likelihood: LOW. Validator catches drift instantly.
- Impact: LOW. Markdown-section drift = validator failure; fix is
  trivial.
- Detection: validator check 5.
- Mitigation: keep #34 → #60 strictly sequential
  (per `plan-loop-1-03-approvals.md:18-23`); each commit re-runs validator.
- Owner role: dev.

### Risk: #62 `kri_vendor_assignment.py` move + `test_w4_bc_c_vendor_governance_boundaries_red.py:16` rename
- Category: Lock churn race
- Affected items: #62
- Source: `plan-loop-2-03-lock-conflict-matrix.md:357-359` quote
  `"HIGH. The lock file lists exact paths; if the file moves without updating the lock, the test crashes on tree = ast.parse(path.read_text(...))"`.
- Likelihood: LOW (single-owner; Loop 1 plan explicitly bundles the lock-line update).
- Impact: MEDIUM. Lock test crashes (not just fails); test collection halts.
- Detection: `make -f scripts/Makefile test-architecture-locks`.
- Mitigation: ONE COMMIT containing the file move AND the lock-line update per `plan-loop-1-04-kris.md:284`.
- Owner role: dev.

### Risk: #39 `_capabilities_all_allowlist.toml` order drift
- Category: Lock churn race
- Affected items: #39
- Source: `plan-loop-2-03-lock-conflict-matrix.md:46-52` quote
  `"Order is asserted strictly. #39 must insert any new admin capability entry into _authorization_capabilities/__init__.py.__all__ AND into _capabilities_all_allowlist.toml in the same commit. Order of [[public_names]] must mirror __all__"`.
- Likelihood: LOW. Single-owner; explicit in Loop 1 plan.
- Impact: MEDIUM. Lock test fails; commit blocked until order is fixed.
- Detection: `test_w10_capabilities_all_allowlist_red.py`.
- Mitigation: atomic single-commit; developer cross-references
  `_authorization_capabilities/__init__.py.__all__` against the TOML
  before committing.
- Owner role: dev.

### Risk: Cap-pressure on commit-allowlist TOMLs (no headroom)
- Category: CI lane regression
- Affected items: #72 (touches reference; no row change), all auth-flow work.
- Source: `plan-loop-2-03-lock-conflict-matrix.md:34` quote
  `"NO room for additional auth/* commits before 2026-09-01 expiry"`;
  `:102` `cap is 2; current is 2`; `:117` `cap is 4; current is 4`.
- Likelihood: LOW for Loop 1 items (none add a row). HIGH for any
  unrelated work that lands during the cleanup.
- Impact: MEDIUM. Any new commit-style work must remove an entry
  before adding one — single-developer must remember the cap.
- Detection: `test_w12_*_ratchet_red.py:40` cap assertions.
- Mitigation: Loop 1 verified no item adds rows; document in
  pre-flight checklist that auth/* commit additions are FORBIDDEN
  during this cleanup wave.
- Owner role: dev.

### Risk: `_naming_allowlist.toml` `paths == []` invariant — accidental FE add
- Category: Lock churn race
- Affected items: #46, #66, #71, #48 (FE additions misidentified per
  `plan-loop-2-03-lock-conflict-matrix.md:79-89`).
- Source: `:75` quote `"paths == [] (empty by invariant)"`;
  `:86` quote `"If any FE item really does add … the paths == [] invariant lock at test_w8a:18 ALSO has to be relaxed"`.
- Likelihood: LOW. Loop 1 prose appears to confuse the BE persistence
  naming TOML with FE filename convention; no real add expected.
- Impact: MEDIUM. If misidentification is acted on, two locks fail
  simultaneously.
- Detection: `tests/backend/pytest/test_w8a_persistence_contracts_red.py:18`.
- Mitigation: Loop 2 recommendation
  (`plan-loop-2-03-lock-conflict-matrix.md:86-88`): treat any FE-driven
  add as a RED FLAG and re-verify before committing.
- Owner role: both.

### Risk: ADR-007 amendment text (#74b) blocked by census drift
- Category: Lock churn race
- Affected items: #74b, #74a, #61.
- Source: `plan-loop-2-07-hidden-prereqs.md:88-92` quote
  `"#74b is gated by #61"`.
- Likelihood: LOW. Master sequence puts #74b after #74a + #61.
- Impact: MEDIUM. If #74b text is drafted before #61 lands, the
  adapter-list cited by the ADR is wrong.
- Detection: code review of #74b PR.
- Mitigation: master DAG enforces ordering
  (`plan-loop-2-08-master-sequence.md:43-44`).
- Owner role: dev.

### Risk: Frontend Vendor.status TS type stale after #70
- Category: Cross-domain coordination
- Affected items: #70 (BE drop), no FE counterpart.
- Source: Loop 2 Missing-dep #F at
  `plan-loop-2-07-hidden-prereqs.md:624-643`;
  `plan-loop-1-05-vendor-quarterly.md:302` quote
  `"frontend's LinkedVendor / Vendor TypeScript types may carry status?: string and need pruning"`.
- Likelihood: MEDIUM. Vendor plan flags this; FE plan doesn't yet absorb the work.
- Impact: MEDIUM. Build succeeds with `status?: string`; field is
  silently `undefined`. Zod parsing may trip if schema declares literal.
- Detection: post-#70 e2e or visual regression.
- Mitigation: per Loop 2 #F recommendation, add a follow-up FE item or
  Loop-6 task; verify before merging #70.
- Owner role: both.

### Risk: #38 `BatchSendRiskFilters` rename — FE TS impact
- Category: Cross-domain coordination
- Affected items: #38
- Source: Loop 2 Missing-dep #G at
  `plan-loop-2-07-hidden-prereqs.md:646-662`.
- Likelihood: LOW. Pydantic accepts both shapes; runtime fine. TS
  type-check fails until FE updates.
- Impact: LOW. Caught at TS compile time, not runtime.
- Detection: `tsc` build.
- Mitigation: amend #38 cross-domain prerequisites to include
  FE TS rename in same commit per Loop 2 #G recommendation.
- Owner role: dev.

### Risk: 18 mock files double-rewrite if #66 lands before #35
- Category: Cross-domain coordination / Test brittleness
- Affected items: #35, #66
- Source: Loop 2 Missing-dep #E at
  `plan-loop-2-07-hidden-prereqs.md:606-622`;
  `plan-loop-1-06-frontend.md:407-408` quote
  `"#35 (usePermissions removal) is not a strict prereq but should land first to avoid churn in 18 mock files"`.
- Likelihood: MEDIUM. Master DAG omits the soft edge from #35 to #66.
- Impact: LOW–MEDIUM. Mechanical churn doubled; no logic regression.
- Detection: PR diff size.
- Mitigation: per Loop 2 #E recommendation, annotate master DAG
  `in_domain_deps: ['37', '39']  # soft: ['35']`; or land #35 in P2
  wave (Seq 34 per `plan-loop-2-08-master-sequence.md:74`) which already
  precedes #66 (Seq 72).
- Owner role: dev.

### Risk: Validator drift between #15 → #39 → #65 catalog snapshot order
- Category: Validator brittleness
- Affected items: #15, #39, #65
- Source: `plan-loop-2-04-doc-touch-matrix.md:230-234` quote
  `"Sequencing: #15 → #39 → #65 (avoid re-snapshotting)"`.
- Likelihood: LOW. Three sequential commits.
- Impact: MEDIUM. Re-snapshot collisions cause check-4 Pydantic ↔ Zod parity failures.
- Detection: validator check 4 (`capability_catalog.py:269-306`).
- Mitigation: enforce sequencing #15 → #39 → #65; Round-2 reviewer
  runs validator after each commit.
- Owner role: dev.

### Risk: #14 → #30 weak prereq misread as hard
- Category: Test brittleness
- Affected items: #14, #30
- Source: `plan-loop-2-07-hidden-prereqs.md:198-217` quote
  `"the test file imports from _shared.notifications SUBMODULE directly … NOT from the _shared/__init__.py barrel"`;
  the dependency is "soft-required for accurate accounting".
- Likelihood: LOW. Loop 1 plan absorbs the correction.
- Impact: LOW. Misordering would still pass tests; only the
  prunable-name count is wrong.
- Detection: code review.
- Mitigation: rely on Loop 1 plan prose; no extra action.
- Owner role: reviewer.

### Risk: Test-infra brittleness — `client_factory` deviations
- Category: Test brittleness
- Affected items: any item adding a backend pytest with a
  `dependency_overrides[get_db]` block.
- Source: `CLAUDE.md` (project instructions) quote
  `"Backend API tests should use client_factory from tests/backend/pytest/conftest.py. Local dependency_overrides[get_db] blocks require an entry in tests/backend/pytest/_get_db_override_whitelist.toml"`;
  `plan-loop-2-03-lock-conflict-matrix.md:127-132` confirms no Loop 1
  item adds new overrides.
- Likelihood: LOW. Loop 1 plans verified compliance.
- Impact: MEDIUM. A deviation requires a TOML allowlist entry plus
  `test_w11a_dependency_override_discipline_red.py` update.
- Detection: `test_w11a_dependency_override_discipline_red.py:13`.
- Mitigation: pre-flight checklist: any new backend test must use
  `client_factory`.
- Owner role: dev.

### Risk: #45a tests too tightly coupled — would break if #45b refactors internals
- Category: Test brittleness
- Affected items: #45a, #45b
- Source: `plan-loop-1-08-crosscut.md:142-198` (#45a authors three
  characterization tests).
- Likelihood: MEDIUM. Characterization tests pin behaviour against
  current internals; if #45b factory uses different internal helpers,
  tests may fail despite preserving public behaviour.
- Impact: MEDIUM. Developer must update tests to assert at the public
  surface, not internals.
- Detection: red tests on #45b commit.
- Mitigation: Round-2 reviewer of #45a explicitly checks that
  characterization tests assert at public surface only (not on
  helper-name presence).
- Owner role: both.

### Risk: Doc-only Reject anchors (#10, #57) — orchestrator override
- Category: Doc churn
- Affected items: #10, #57
- Source: `plan-loop-2-04-doc-touch-matrix.md:22-39` Reject-anchor docs.
- Likelihood: LOW. Orchestrator override is explicit.
- Impact: LOW. The risk is procedural — a developer reads the original
  Reject and skips the doc edit.
- Detection: Round-2 review.
- Mitigation: pre-flight checklist explicitly lists "doc-only Reject is
  invalid; every #10 / #57 / similar item updates the relevant
  `_context/*.md`".
- Owner role: dev.

### Risk: Issues domain critical-path stall (#2 → #8 → #28 → #30)
- Category: Cross-domain coordination
- Affected items: #2, #8, #28, #30, #14, #27
- Source: `plan-loop-2-08-master-sequence.md:154-158` quote
  `"#2 → #8 → #28 → #30 (4 items, 3 edges — strict TDD prerequisites)"`.
- Likelihood: MEDIUM. The 4-edge chain is the single longest linear
  dependency chain. Any one stall blocks all four.
- Impact: MEDIUM. Schedule risk only; no production risk.
- Detection: project-management calendar.
- Mitigation: Loop 1 #14 should land in the P1 wave (Seq 14) BEFORE
  the chain begins; sequence #27 in parallel with #14 since both
  contribute prerequisites for #30.
- Owner role: dev.

### Risk: Capability catalog snapshot churn from #15, #39, #65
- Category: Validator brittleness
- Affected items: #15, #39, #65
- Source: `plan-loop-2-05-validator-schedule.md:106-130` (#15 NEW
  surface), `:299-325` (#39 NEW admin builder), `:326-349` (#65 shared
  base).
- Likelihood: MEDIUM. Three commits land NEW Pydantic ↔ Zod parity
  fields.
- Impact: MEDIUM. Catalog parity failures cascade across validator
  runs.
- Detection: validator check 4.
- Mitigation: behavioural test on field-set equality BEFORE landing
  the validator step (per `plan-loop-2-05-validator-schedule.md:530-531`).
- Owner role: dev.

### Risk: Issues domain `_shared/README.md` Contents block — 4 items edit same block
- Category: Doc churn
- Affected items: #14, #27, #28, #30
- Source: `plan-loop-2-04-doc-touch-matrix.md:545-559`.
- Likelihood: MEDIUM. Four sequential commits on the same Contents block.
- Impact: LOW. Mechanical merge conflict only.
- Detection: developer's git workflow (no CI failure).
- Mitigation: per Loop 2 sequencing #27 → #14 → #28 → #30; each commit's
  README edit is small and targeted.
- Owner role: dev.

### Risk: Frontend AuthContext README diagrams stale across #66, #71
- Category: Doc churn
- Affected items: #66, #71
- Source: `plan-loop-2-04-doc-touch-matrix.md:613-629`.
- Likelihood: MEDIUM. Two commits edit the same `frontend/src/contexts/auth/README.md`.
- Impact: LOW. Reader-facing only.
- Detection: code review.
- Mitigation: sequence #66 first (after backend prereqs), #71 second
  (after ADR-011 + #66 + #47).
- Owner role: dev.

### Risk: New `_red.py` invariant tests not marked `@pytest.mark.contract`
- Category: Test brittleness
- Affected items: ~24 new architecture-tier tests (per
  `plan-loop-2-03-lock-conflict-matrix.md:459`).
- Source: `plan-loop-2-03-lock-conflict-matrix.md:386` quote
  `"any new architecture test file added by Loop 1 must include pytestmark = pytest.mark.contract"`;
  `tests/backend/pytest/architecture/test_w11b_test_infra_polish_red.py:32-43`
  enforces the invariant.
- Likelihood: MEDIUM. 24 new files; an oversight is plausible.
- Impact: LOW. Lock test fails; recoverable.
- Detection: `test_w11b:32-43`.
- Mitigation: pre-flight checklist line "every new architecture test
  has `pytestmark = pytest.mark.contract`".
- Owner role: dev.

### Risk: Postgres-lane row-count mismatch post-#69+#70
- Category: Migration safety
- Affected items: #69+#70
- Source: `plan-loop-2-06-migration-window.md:553-554` quote
  `"pre-upgrade snapshot must capture SELECT COUNT(*) FROM vendors and SELECT COUNT(*) FROM vendor_risk_links"`.
- Likelihood: LOW. Migration is column-drop + FK rebuild; no row deletion.
- Impact: HIGH if rows are silently lost.
- Detection: pre/post row-count capture.
- Mitigation: per `plan-loop-2-06-migration-window.md:594-596`, capture
  counts pre-upgrade and post-upgrade; compare on a fresh staging clone.
- Owner role: both.

### Risk: ADR alignment — #19 strengthens ADR-003 but no ADR file edit
- Category: Doc churn
- Affected items: #19
- Source: `plan-loop-1-02-risks.md:506-510` quote
  `"#19 strengthens ADR-003 (DomainError taxonomy) by routing all risk-type validation through ValidationError rather than raising raw HTTPException at the endpoint edge. Cross-link in the commit body"`.
- Likelihood: LOW. Cross-link in commit body is documented.
- Impact: LOW. ADR text remains accurate; new behaviour is just stricter.
- Detection: ADR review.
- Mitigation: include ADR-003 cross-link in #19 commit body.
- Owner role: reviewer.

### Risk: ADR-005 + ADR-010 atomic edits in #69+#70 bundle
- Category: Doc churn / Migration safety
- Affected items: #69, #70
- Source: `plan-loop-2-04-doc-touch-matrix.md:332-350` (ADR-005 +
  ADR-010 both in same commit).
- Likelihood: LOW. Migration plan is detailed.
- Impact: MEDIUM. Missing ADR-010 entry = forward-only contract drift.
- Detection: ADR review + post-merge audit.
- Mitigation: per `plan-loop-2-06-migration-window.md:551-554`, append
  bullet under "Migration Impact" in same commit.
- Owner role: dev.

### Risk: 6 NEW TOML registries from #44 + #74a + #73
- Category: Lock churn race
- Affected items: #44 (`_router_registry.toml`), #74a (4 bounded-context
  TOMLs + optional 5th), #73 (`_kri_state_vocabulary_allowlist.toml`).
- Source: `plan-loop-2-03-lock-conflict-matrix.md:462`.
- Likelihood: LOW. Single-owner per TOML.
- Impact: MEDIUM. New TOML schema must be matched by consumer test;
  if mismatched, lock fails.
- Detection: lock tests for each new TOML.
- Mitigation: each TOML lands in same commit as its consumer test;
  Round-2 reviewer verifies schema consistency.
- Owner role: both.

### Risk: 24 new backend `_red.py` tests increase pytest collection time
- Category: CI lane regression
- Affected items: all Loop 1 architecture-test additions.
- Source: `plan-loop-2-03-lock-conflict-matrix.md:459` quote
  `"Total NEW backend lock test files (architecture/): ~24"`.
- Likelihood: LOW. Pytest collection scales linearly.
- Impact: LOW. CI time increases marginally.
- Detection: CI duration.
- Mitigation: monitor; if collection slows >10s, parallelize via pytest-xdist.
- Owner role: dev.

### Risk: 22 new frontend `*.test.ts` tests increase Vitest collection time
- Category: CI lane regression
- Affected items: all Loop 1 FE test additions.
- Source: `plan-loop-2-03-lock-conflict-matrix.md:461`.
- Likelihood: LOW.
- Impact: LOW.
- Detection: CI duration.
- Mitigation: monitor.
- Owner role: dev.

---

## Section 2 — Risk count by category

| Category | Count |
|---|---:|
| Behavior regression | 4 (#11, #34 hub, #66 memo, #71 single-flight) |
| Lock churn race | 8 (#74a count, deepening contracts cluster, #62 path, #39 order, naming TOML, #74b, new TOMLs, #56+#61 rewrite) |
| Doc churn | 8 (cap-contract md/json, #34/#60 vocabulary, #24+#51 cluster, doc-only Reject, ADR-003 cross-link, ADR-005/010 atomic, issues `_shared/README`, contexts README) |
| Migration safety | 3 (#69+#70 forward-only, post-upgrade row count, ADR-010 atomic) |
| Cross-domain coordination | 6 (#34 hub, `users/summary.py` 3-way, #46 query-keys, FE Vendor.status, #38 BatchSend, mock files double-rewrite, issues critical path) |
| Hub additivity | 1 (#34 22+ sites — overlapping with behavior regression) |
| Test brittleness | 6 (#45a tight coupling, #45a→#45b weakening, contract marker, #14→#30 weak dep, snapshot order, characterization-test surface) |
| Validator brittleness | 3 (16-item validator, catalog snapshot churn, ADR vocabulary drift) |
| CI lane regression | 5 (Postgres lane, 2026-09-01 sunset, cap-pressure, BE collection, FE collection) |

(Some risks span 2 categories; numbers above reflect the dominant
category for each entry. Total distinct risks listed in §1: **34**.)

---

## Section 3 — Top 10 highest-risk items in the project

Ranking criterion: Likelihood × Impact, with HIGH/HIGH > HIGH/MEDIUM > MEDIUM/HIGH > others. Ties broken by blast radius (number of dependents).

1. **ADR-011 #72 → 2026-09-01 auth/* allowlist sunset (Missing-dep #D)** —
   HIGH likelihood, HIGH impact. Calendar-driven CI failure; no follow-up
   item exists. Source: `plan-loop-2-07-hidden-prereqs.md:582-603`.

2. **#69+#70 vendor migration ADR-010 forward-only** — LOW likelihood,
   HIGH impact. Snapshot-only rollback; rehearsal mandatory. Source:
   `plan-loop-2-06-migration-window.md:227-231`.

3. **#34 Approvals hub 22+ sites partial migration** — MEDIUM likelihood,
   HIGH impact. Silent privilege-tier drift; production authz risk. Source:
   `plan-loop-1-03-approvals.md:14, :138`.

4. **#71 single-flight `sso.ts:9-11` module-scope state** — MEDIUM
   likelihood, HIGH impact. Auth thundering-herd / duplicate refresh.
   Source: `plan-loop-1-06-frontend.md:481-484`.

5. **#66 AuthContext split memo dependencies** — MEDIUM likelihood, HIGH
   impact. Stale permission flags; cascading re-renders. Source:
   `plan-loop-1-06-frontend.md:406-407`.

6. **#74a "exactly 31 packages today" assertion drift after #61
   (Missing-dep #B)** — HIGH likelihood, MEDIUM impact. Definite count
   change; CI red-runs. Source: `plan-loop-2-07-hidden-prereqs.md:108-114`.

7. **Capability-contract validator brittleness across 16 items** — HIGH
   likelihood (cumulative), MEDIUM impact. Slow developer feedback loop
   if not enforced as pre-commit hook. Source:
   `plan-loop-2-05-validator-schedule.md:7-9, :425-447`.

8. **Postgres lane catches #69+#70 issues only post-merge if not run
   locally** — MEDIUM likelihood, HIGH impact. ADR-010 forward-only.
   Source: `plan-loop-2-06-migration-window.md:594-595`.

9. **Lock churn race on `test_architecture_deepening_contracts.py`
   (11 items)** — HIGH likelihood (without strict order), MEDIUM impact.
   Test-collection halt. Source:
   `plan-loop-2-03-lock-conflict-matrix.md:333-345`.

10. **#46 query-key factory partial refactor (45 sites in 22 files)** —
    MEDIUM likelihood, MEDIUM impact. React Query cache misses; user-
    visible stale data. Source: `plan-loop-1-06-frontend.md:282`.

---

## Section 4 — Top 5 global mitigations

1. **Add `scripts/dev/precommit.sh` enforcing both architecture locks and
   the capability-contract validator after every commit.** Per
   `plan-loop-2-05-validator-schedule.md:483-495`. The validator MUST
   run as the gate between `pytest` (red→green) and `git commit` for
   every contract-touching item. The 16 contract-touching items
   (#13, #15, #24, #34, #37, #39, #50, #51, #55, #56, #57, #60, #61,
   #62, #65, #66, #69+#70) all share this gate, so one hook covers all.

2. **Enforce strict ordering on `test_architecture_deepening_contracts.py`
   (11-item cluster).** Per `plan-loop-2-03-lock-conflict-matrix.md:334-345`:
   #52 → #50 → cluster A (#24+#51) → #57 → #54 → #49 → #56 → #55 → #8 →
   #53. Any reorder risks lock-test collection failure. Bake the order
   into the master sequence and have the dev re-confirm before each
   commit in the cluster.

3. **Add a NEW Phase-4 follow-up item for the 2026-09-01 auth/* allowlist
   sunset migration.** Per Loop 2 Missing-dep #D
   (`plan-loop-2-07-hidden-prereqs.md:597-603`). Owner: cross-cut
   domain. Without this item, on 2026-09-01 the 8 auth-flow `expires_at`
   entries trigger CI failure on every run until each `db.commit` site
   is migrated. Track on the calendar; do not let it be implicit.

4. **Round-2 adversarial review on every contract-touching commit AND on
   every behavior-regression-class change (#11, #34, #66, #71).** Per
   CLAUDE.md `## Adversarial rounds for high-stakes work`. Fresh agents,
   each instructed "Round 1 produced false flags; verify each finding
   by reading the current file". For #34 specifically: a fresh agent
   runs `grep -rn "can_resolve_approvals" backend/` and confirms zero
   matches in production code outside `approval_scenario_policy.py`.

5. **Atomic-commit invariant: every code change ships with its lock
   edit + capability-contract edit + README edit in the SAME commit.**
   Per `AGENTS.md` and `plan-loop-2-04-doc-touch-matrix.md:11-15`. Doc
   /lock-only Reject is invalid (orchestrator override). For high-doc-
   churn commits (#24+#51 atomic = 5 md cells + 5 json strings), run
   the validator TWICE: once after staging the file deletes, once after
   staging the doc edits, to catch incomplete sweeps
   (`plan-loop-2-05-validator-schedule.md:516-520`).

---

## Section 5 — Recommended risk-acceptance criteria for the developer

**Hard rules (no exceptions):**

1. **No commit without all three gates green**:
   `pytest <new-RED-test>.py`,
   `make -f scripts/Makefile test-architecture-locks`,
   `python3 scripts/security/validate_authz_capability_contract.py`.
2. **Atomic-commit invariant**: code + lock + contract + README move together.
3. **#9 → #34 → #60 hub wave is sequential**: never parallel, never reordered.
4. **#56 + #61 paired wave is single PR** (Loop 1 plan-loop-1-08:413).
5. **#24 + #51 is single commit** (Loop 1 plan-loop-1-04:54-58).
6. **#69 + #70 is single bundled commit + single Alembic revision**
   (Loop 1 plan-loop-1-05:215). Postgres lane MUST be exercised locally
   before commit; pre-upgrade row counts MUST be captured.
7. **Single-flight test in #71 commit boundary 2 is non-negotiable**
   (Loop 1 plan-loop-1-06:563).

**Soft rules (waivable with documented justification):**

1. Sequence #35 before #66 to avoid 18-mock-file double-rewrite (waivable
   if developer accepts the churn).
2. Sequence #37 → #12 → #34 on `users/summary.py` (waivable if developer
   commits to one cleanup pass).
3. Re-run validator twice on #24+#51 atomic (waivable if developer
   confirms by visual diff that all 5 md + 5 json cells were edited).

**Rejection criteria (do not proceed):**

1. Any item that adds a row to `_endpoint_commit_allowlist.toml` (cap 8,
   current 8) before 2026-09-01.
2. Any FE item that adds a path to `_naming_allowlist.toml` (paths == []
   invariant).
3. Any new pytest with `dependency_overrides[get_db]` not whitelisted in
   `_get_db_override_whitelist.toml`.
4. Any architecture test missing `pytestmark = pytest.mark.contract`.
5. Any `db.commit` introduced in an endpoint module covered by ADR-011.

**Pre-flight checklist (run before every commit):**

```
[ ] RED test exists and was demonstrably red before this commit.
[ ] Test inversion + fix in same commit (for #11 and similar truth-in-naming items).
[ ] All new architecture tests have `pytestmark = pytest.mark.contract`.
[ ] No new `dependency_overrides[get_db]` block (uses client_factory).
[ ] If contract-touching: contract.md + contract.json + capability-catalog.json edited atomically.
[ ] If lock-touching: corresponding TOML allowlist edited atomically.
[ ] If file-deleting: corresponding deepening-contract test rewritten/deleted in same commit.
[ ] If migration: pre-upgrade row counts captured; rehearsal completed on staging clone.
[ ] If FE refactor: no surviving inline `queryKey:` literals (#46), no surviving `usePermissions` (#35), no surviving lost module-scope state (#71).
[ ] Hub-wave additivity: #9 → #34 → #60 strictly sequential.
[ ] Atomic clusters single-commit: #24+#51, #56+#61, #69+#70.
[ ] Validator green: `python3 scripts/security/validate_authz_capability_contract.py` exit 0.
[ ] Locks green: `make -f scripts/Makefile test-architecture-locks` exit 0.
[ ] Pytest green for affected domain: `pytest tests/backend/pytest/<domain>/`.
[ ] Round-2 adversarial review requested for behavior-regression-class items (#11, #34, #66, #71).
```

---

## Section 6 — Cross-references to Loop 1 + Loop 2

- Loop 1 risk seeds: `plan-loop-1-02-risks.md` Item #11
  rollback note, `plan-loop-1-04-kris.md` cluster A risk note,
  `plan-loop-1-05-vendor-quarterly.md` migration window risk register,
  `plan-loop-1-06-frontend.md:563` "highest landing-time risk".
- Loop 2 hidden-prereq seeds: `plan-loop-2-07-hidden-prereqs.md`
  Missing-deps #A–#G.
- Loop 2 conflict matrix: `plan-loop-2-03-lock-conflict-matrix.md` HIGH-risk
  overlap matrix (lines 471-482).
- Loop 2 doc collisions: `plan-loop-2-04-doc-touch-matrix.md` §1
  Reject-anchor docs and §9 atomic-commit groups.
- Loop 2 validator schedule: `plan-loop-2-05-validator-schedule.md` per-item
  validator concerns + risk register at `:514-531`.
- Loop 2 migration window: `plan-loop-2-06-migration-window.md` rollback
  plan at `:684-693`.

End of consolidated risk register.
