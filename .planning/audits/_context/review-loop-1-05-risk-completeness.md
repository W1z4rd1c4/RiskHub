# Phase 4 Loop 1 — Risk Register Completeness Review

Working dir: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Anchor commit: `1ee872a4`.
Mode: CONSTRUCTIVE. Source: `plan-loop-3-04-risk-register.md` (34 risks across 9
categories). Goal: surface risk categories the consolidated register did NOT
cover, plus correct any classification or double-count issues in the existing
34. Each finding cites `file:line` + ≤15-word quote. No new items proposed.

---

## Section 1 — Cross-check of the 34 documented risks

### Classification audit (Loop 3 A4)

The Loop 3 register groups its 34 risks into 9 categories and counts them in
§2 totals (`plan-loop-3-04-risk-register.md:683-691`). The §2 totals say:

| Category | Loop 3 count | Verified count | Note |
|---|---:|---:|---|
| Behavior regression | 4 | 4 | OK (#11, #34 hub, #66 memo, #71 single-flight) |
| Lock churn race | 8 | 8 | OK |
| Doc churn | 8 | 8 | OK |
| Migration safety | 3 | 3 | OK |
| Cross-domain coordination | 6 | 7 | **Off-by-one** (see below) |
| Hub additivity | 1 | 1 | OK (overlapping) |
| Test brittleness | 6 | 6 | OK |
| Validator brittleness | 3 | 3 | OK |
| CI lane regression | 5 | 5 | OK |
| Total distinct | 34 | 34 | OK |

The "Cross-domain coordination" rollup at line 687 enumerates 6 entries but
the in-text register actually has **7** cross-domain coordination risks
(#34 hub, `users/summary.py` 3-way, #46 query-keys, FE Vendor.status, #38
BatchSend, mock files double-rewrite, **plus** issues critical-path stall —
see `plan-loop-3-04-risk-register.md:542-554`). The §2 listing
"6 (#34 hub, `users/summary.py` 3-way, #46 query-keys, FE Vendor.status, #38
BatchSend, mock files double-rewrite, issues critical path)" actually NAMES
seven items in the parenthetical but reports the count as 6. **Minor count
typo**, no missing risk.

### Double-count detection

Several risks span 2 categories (§2 acknowledges this at line 693
`Some risks span 2 categories; numbers above reflect the dominant category`).
Confirmed double-categorisations and verified they're not double-counted in
the §2 total:

1. **#34 Approvals hub** appears in `plan-loop-3-04-risk-register.md:42`
   ("Hub additivity") AND `:710` Top-10 ("MEDIUM impact") AND `:687`
   ("Cross-domain coordination"). The §2 acknowledges this overlap by
   saying "Hub additivity 1 (#34 22+ sites — overlapping with behavior
   regression)" — but the cross-cat says the overlap is with **behavior
   regression**, not hub additivity. The §2 line 688 makes the explicit
   note. **No double-count, but the ambiguity is real:** #34 is
   simultaneously "behavior regression" (privilege-tier semantics drift),
   "hub additivity" (22+ sites), and "cross-domain coordination" (16
   files). The dominant category in §2 is split across all three with
   only one count. This is fine for totaling but confusing for the
   reader.

2. **#74a 31-package census** appears in `:54` ("Lock churn race / Test
   brittleness"). §2 lists it under "Lock churn race"
   (`:684`) only, not Test brittleness. **No double-count.**

3. **#45a tests gating #45b** at `:71` is "Test brittleness / behavior
   regression". §2 lists it once under Test brittleness `:689`. **No
   double-count**, but "behavior regression" listing at `:683` only
   names #11/#34/#66/#71, omitting #45a even though the in-text entry
   explicitly cites a behavior-regression failure mode (`:80` quote
   `"could silently change ownership-resolution semantics"`). This is
   a reporting-mode gap: #45a is a behavior-regression risk that the §2
   summary buries under Test brittleness.

4. **#56+#61 paired wave** at `:311` is "Lock churn race /
   Cross-domain coordination". §2 lists in "Lock churn race" `:684`
   only. **No double-count.**

5. **ADR-011 #72 → 2026-09-01** at `:153` is "CI lane regression / Doc
   churn". §2 lists in "CI lane regression" `:691` only. **No
   double-count.**

6. **ADR-005 + ADR-010 atomic edits in #69+#70** at `:631` is "Doc
   churn / Migration safety". §2 lists in Doc churn `:685`. **No
   double-count.**

7. **18 mock files** at `:455` is "Cross-domain coordination / Test
   brittleness". §2 lists in Cross-domain `:687`. **No double-count.**

**Verdict on double-counts**: The §2 total of **34 distinct risks** is
correct. The category counts per row are correct. Two minor reporting
issues:

- §2 line 687 "Cross-domain coordination 6" actually enumerates 7
  bullet-content (issues critical path is a 7th). Cosmetic; total
  remains 34 because the same risk is counted once in the dominant
  category.
- #45a behavior-regression aspect is hidden under Test brittleness.

### Misclassifications: 0 hard, 2 soft

- **Soft #1** — `Risk: Capability-contract validator runs after every commit`
  at `plan-loop-3-04-risk-register.md:87` is dual-classified as "Validator
  brittleness / CI lane regression". The §2 places it in CI lane regression
  with the validator note. This is fine; both apply.
- **Soft #2** — `Risk: ADR-007 amendment text (#74b) blocked by census drift`
  at `:415` is "Lock churn race". A reading of the entry shows the actual
  failure mode is **ADR-text drift / Doc churn** (the ADR cites the wrong
  package list). Reclassification under "Doc churn" would be more accurate;
  current placement is defensible because the literal lock breaks first.

---

## Section 2 — Missed risks (constructive findings)

**Total missed risks identified: 28.**

These are ordered by severity, with category, affected items, likelihood,
impact, detection, and mitigation. NEW risk categories proposed: 6
(Performance regression; Backward compatibility; i18n key consistency;
Browser/route caching; DB index regression; Reviewer cognitive overload;
Logging volume regression; Test fixture churn; Adversarial-fatigue race;
Worktree dirty-state hazard; Allowlist-discipline drift; Time-zone /
timestamp regression; Build-cache poisoning).

---

## Missed risk: #66 AuthContext split — extra renders on every keypress in form children

- Category: **NEW: Performance regression**
- Affected items: #66, #68
- Source: `plan-loop-1-06-frontend.md:411-412` quote
  `"the current 'AuthContext.Provider value={{ ... }}' (lines 50-67) is a fresh object every render"`;
  `:415` quote `"Memoise the value strictly"`.
- Likelihood: MEDIUM. Each new `SessionProvider` / `AuthActionsProvider` /
  `PreferencesProvider` MUST wrap its `value` in `useMemo` with stable deps
  AND each callback in `useCallback`. Sloppy migration of even one
  provider breaks the very re-render isolation the test pins.
- Impact: HIGH. A regression here doesn't fail the unit test
  `SessionProvider.split.test.tsx` if the test only counts re-renders
  under preference-mutation; it can still ship a regression where typing
  in a form re-renders sidebar counters because `AuthActionsProvider`'s
  `login`/`logout` callbacks aren't wrapped in `useCallback` and the
  Sidebar consumes both. The Loop 3 register flags MEMO RACE for
  permission flags but not for ACTION callbacks.
- Detection: render-count assertion specifically on the pages most
  affected (KRI form, Issue form, Risk form) under typing scenarios.
  The current Loop 1 plan only pins re-render isolation under
  PREFERENCE mutation (`plan-loop-1-06-frontend.md:411`).
- Mitigation: amend #66 TDD shape to add a third re-render isolation
  test: `tests/frontend/unit/src/contexts/__tests__/AuthActions.callbackStability.test.tsx`
  asserting `useAuthActions().login` and `.logout` are referentially
  stable across re-renders (i.e. wrapped in `useCallback` with empty
  deps).

---

## Missed risk: #46 query-key factory rebuilds on every render

- Category: **NEW: Performance regression**
- Affected items: #46
- Source: `plan-loop-1-06-frontend.md:282` quote
  `"45 inline queryKey: literals across 22 files into per-domain factory modules"`;
  no mention of factory-call memoization.
- Likelihood: MEDIUM. If `riskQueryKeys.list(filters)` is called inline in
  a `useQuery` arg AND `filters` is a fresh object literal, the resulting
  array is a fresh `[]` every render. React Query's `queryKey` shallow-
  equals; if any nested object reference changes per render, the query
  key churns and refetches storm.
- Impact: MEDIUM. Continuous refetching on listing pages; user-visible
  flicker; backend load multiplier on filter-bound endpoints.
- Detection: only via load testing or e2e — not caught by the proposed
  invariant test (`plan-loop-1-06-frontend.md:288` only asserts no inline
  literals remain, not that calls produce stable references).
- Mitigation: amend #46 invariant test
  `queryKeys.invariant.test.ts` to also assert factory output uses
  `Object.freeze` or a memoization helper for object-keyed args; OR
  document that all factory call sites must wrap in `useMemo`.

---

## Missed risk: #69+#70 dropping `ix_vendors_status` index — orphan queries silently scan

- Category: **NEW: DB index regression**
- Affected items: #69, #70
- Source: `plan-loop-2-06-migration-window.md:48` quote
  `"op.create_index(op.f('ix_vendors_status'), 'vendors', ['status'], unique=False)"`;
  the migration drops it (`:224` quote `"op.drop_index('ix_vendors_status'"`).
- Likelihood: MEDIUM. The Loop 1 plan enumerates 8 prod sites + 6 seed
  sites that reference `vendor.status` and removes them. But:
  any **dynamic SQL** (`text("SELECT ... WHERE status='active'")`),
  any **ORM filter built at runtime** (e.g.
  `query.filter(Vendor.status == ...)` if a follow-up commit accidentally
  reintroduces the column), or any **reporting export view** that joins
  `vendors` and projects status — would all silently fail post-migration.
- Impact: HIGH. Sequential scan on `vendors` if any consumer survives
  the cutover; if the column is gone but a query references it,
  `UndefinedColumn` exception 5xx.
- Detection: the Loop 3 register mentions row-count post-upgrade
  (`plan-loop-3-04-risk-register.md:608-617`) but NOT a query-shape
  scan. The `_register_listings/vendors.py:200` quote `"status": Vendor.status,`
  removal is enumerated but a `grep` for `Vendor.status` across the
  whole tree (including reports) is not.
- Mitigation: pre-migration step: `git grep -E "Vendor\\.status|vendor\\.status|\\bstatus['\"]\\s*:\\s*[a-z_]*vendor"` returns ONLY the
  enumerated 8 prod sites + 6 seed sites; if anything else surfaces, the
  migration is blocked until those sites also drop the reference. Add
  this to the pre-flight checklist.

---

## Missed risk: #69+#70 dropping `Vendor.status` breaks frontend Zod parse for legacy responses

- Category: **NEW: Backward compatibility / API contract**
- Affected items: #69, #70
- Source: `plan-loop-2-07-hidden-prereqs.md:624-643` (Missing-dep #F);
  `plan-loop-1-05-vendor-quarterly.md:302` quote
  `"frontend's LinkedVendor / Vendor TypeScript types may carry status?: string"`.
- Likelihood: HIGH if FE redeploy is not lockstep with BE migration.
  Loop 2 §A `plan-loop-2-06-migration-window.md:693` says "no
  mid-deployment skew tolerated". The risk is the **time window**
  during which BE is upgraded but FE is still serving the old bundle
  (cached `index.html`, CDN edge, browser app cache). Old FE expects
  `status` in vendor responses; new BE doesn't send it.
- Impact: MEDIUM-HIGH. If FE Zod schema declares `status: z.string()`
  (literal, not `optional`), every vendor list/detail call returns a
  parse error. Page is unrenderable. If schema declares `status: z.string().optional()`,
  the field is silently undefined and any UI badge shows blank.
- Detection: e2e tests against a deployment-skew scenario (BE+1 / FE+0).
  Loop 3 register touches this at `:443-450` but only flags the
  TS-type breakage, not the Zod-runtime breakage.
- Mitigation: BEFORE migrating, deploy a FE patch making `status`
  optional in the Zod schema. THEN deploy BE migration. THEN deploy FE
  patch removing `status` from the schema entirely. This is a
  three-deploy sequence, not the planned two.

---

## Missed risk: i18n keys orphaned after #48 errorKeys merge

- Category: **NEW: i18n key consistency**
- Affected items: #48, #33 (KRI banner unify)
- Source: `plan-loop-1-06-frontend.md:329` quote
  `"merge ... into a single 'frontend/src/i18n/errorKeys.ts'"`;
  `:334-335` test names the 10 keys but doesn't enumerate dependent
  translation files.
- Likelihood: MEDIUM. RiskHub has multiple locale files (typically
  `frontend/src/i18n/translations/{en,es,fr}/...`). The merge proposes
  to keep the same string keys but renaming or merging files often
  loses `.json` translation entries when their import path changes.
  #33 also drops a KRI-specific banner whose i18n key may still be
  cited in translation files.
- Impact: MEDIUM. Missing translation falls back to English (safest)
  or to the raw key (worst — user sees `errorKeys.unauthorized` in UI).
- Detection: post-merge i18n key-coverage test that asserts every
  `errorKeys.*` literal in the codebase resolves to a translation
  in every locale file.
- Mitigation: amend #48 TDD shape to include a
  `tests/frontend/unit/src/i18n/__tests__/errorKeys.coverage.test.ts`
  asserting every key in `ERROR_CODE_TO_KEY` exists in every locale
  JSON file.

---

## Missed risk: #36 BusinessRouteGuards refactor invalidates browser route cache

- Category: **NEW: Browser/route caching**
- Affected items: #36
- Source: `plan-loop-1-06-frontend.md:208` quote
  `"createBusinessRouteGuard('canViewGovernance')"`;
  `:206` quote `"factory test"`.
- Likelihood: LOW-MEDIUM. The factory rewrite preserves component names
  and exports (`:215` `"Re-export the four named guards"`), so
  React Router's `<Route element={...}>` references survive. But: if
  any user has a service-worker cached version of the old `BusinessRouteGuards.js`
  bundle and the new factory uses different display names, React DevTools
  diffing (or any tool that introspects component name) sees a "different"
  guard and the route may unmount/remount.
- Impact: LOW. Visible flicker; not a security regression because both
  guards consume the same `useAuthz()`.
- Detection: only e2e + manual.
- Mitigation: cache-busting on the new bundle version is automatic via
  Vite's chunk hashing; this risk is essentially absorbed by normal
  deploy. Document in #36 PR body.

---

## Missed risk: #62 KRI vendor assignment per-row audit emits N events for bulk operations

- Category: **NEW: Logging volume regression / Audit-log cardinality**
- Affected items: #62
- Source: `plan-loop-1-04-kris.md:233-241` quote
  `"DECISION: PER-ROW EVENTS"`;
  `:251-256` quote `"3 vendor_link_created events ... 1 vendor_link_deleted ..."`.
- Likelihood: HIGH (definite — the plan is the cause). The decision is
  legitimate per ADR-012 cross-ref but: a KRI assigned to N vendors
  emits N audit events vs. 0 today. For approval-driven bulk apply
  (`_approval_execution/kri_generic_edit.py:16` consumes the assignment),
  any approval that touches a multi-vendor KRI fans out N events.
- Impact: MEDIUM. Audit-log table volume; outbox queue depth; activity
  feed UX cardinality (vendor pages now show N rows for a single user
  action that previously showed 0). Loop 3 register acknowledges this
  legitimately but doesn't classify it as a logging-volume regression
  risk.
- Detection: only post-deploy via observability (audit-log row growth,
  outbox dispatch latency).
- Mitigation: capture **baseline audit-log row volume per day** before
  #62 lands; alert if post-#62 daily volume exceeds 2× baseline within
  the first 7 days. Add to ADR-012 a normative "monitoring budget"
  paragraph.

---

## Missed risk: #63 outbox SchedulerJobRun double-emit if dispatch retried

- Category: **NEW: Logging volume regression / Outbox queue overload**
- Affected items: #63
- Source: `plan-loop-2-08-master-sequence.md:103` quote
  `"Instrument outbox dispatch with SchedulerJobRun"`.
- Likelihood: MEDIUM. `dispatch_outbox` is invoked on a schedule. If the
  instrumentation wraps the dispatch in a `SchedulerJobRun.create(...)`
  call but does NOT idempotency-guard against retries (e.g. if the
  worker crashes after `SchedulerJobRun` is recorded but before dispatch
  completes), the next worker tick will record a SECOND `SchedulerJobRun`
  for the same logical run.
- Impact: MEDIUM. Admin telemetry shows duplicate runs; alerting
  thresholds (e.g. "alert on > 2 runs/min") become noisy.
- Detection: behavioural test simulating a mid-dispatch crash.
- Mitigation: amend #63 TDD shape: `test_outbox_dispatch_scheduler_job_run_red.py`
  must include a "two consecutive dispatch attempts produce one row,
  not two" assertion (idempotency by run_id).

---

## Missed risk: #66 AuthContext split + MSAL token cache invalidation timing

- Category: **NEW: Browser/route caching**
- Affected items: #66
- Source: `plan-loop-1-06-frontend.md:415` quote
  `"NEW frontend/src/contexts/SessionContext.tsx — owns ... bootstrapStatus"`;
  ADR-011 (#72) covers MSAL.
- Likelihood: LOW-MEDIUM. The split moves bootstrap/auth/MSAL token
  refresh into different providers. If `SessionProvider` mounts before
  `AuthActionsProvider` and the bootstrap kicks off an MSAL `acquireTokenSilent`,
  but `AuthActionsProvider`'s context isn't yet ready, the `login()`
  call (if invoked from a deep link in the URL) may race and fire
  twice.
- Impact: MEDIUM. Visible login flicker; possibly a duplicate session
  POST.
- Detection: only e2e in a specific deep-link bootstrap scenario.
- Mitigation: amend #66 TDD shape to add a test for
  bootstrap-then-deep-link-action ordering. Pin via
  `tests/frontend/unit/src/contexts/__tests__/AuthContext.bootstrapOrdering.test.tsx`.

---

## Missed risk: #71 single-flight regression undetected if two test files run in parallel

- Category: **NEW: Race conditions in tests**
- Affected items: #71
- Source: `plan-loop-1-06-frontend.md:486-488` quote
  `"coordinator.singleFlight.test.ts ... invokes 'trySilentSessionRefresh' twice in parallel"`;
  `:561` quote `"NEW frontend/src/services/session/coordinator.ts"`.
- Likelihood: LOW. Vitest runs test FILES in parallel by default but
  tests within a file sequentially. The single-flight invariant is
  per-module, so two test files invoking the merged module would each
  see fresh `let refreshInFlight` state thanks to vitest's module
  isolation. **However**: if the developer accidentally writes the
  test using `globalThis.refreshInFlight` or relies on side effects
  spilling between tests within one file, parallel-suite runs could
  flake.
- Impact: LOW-MEDIUM. Flaky CI; developer wastes time on phantom
  failures.
- Detection: run the test 100× in a loop; if any failure, the test
  is fragile.
- Mitigation: explicit `beforeEach` resets the single-flight state;
  document the invariant.

---

## Missed risk: #43 audit adapter-emitter helper changes CSP/middleware behaviour

- Category: **NEW: CSP / CSRF regression**
- Affected items: #43
- Source: `plan-loop-3-03-rollback-register.md:510` quote
  `"6 audit modules ('risk.py', 'control.py', 'kri.py', 'issue.py', 'approval.py', 'vendor.py')"`;
  the helper is "additive".
- Likelihood: LOW. The helper is described as additive and Loop 1
  asserts the audit-matrix lock stays GREEN. But: if the helper is
  imported into a module that is ALSO referenced by middleware (e.g.
  CSP report-uri handlers), the import graph could grow a cycle and
  cause middleware initialization to fail at boot.
- Impact: HIGH if it triggers (boot failure), LOW likelihood (very
  specific import-graph constraints).
- Detection: app startup smoke test on a clean env.
- Mitigation: ensure the new helper module imports nothing from the
  middleware tree (verify with `grep -r 'app.middleware' backend/app/services/_audit_emitter/` returns 0).

---

## Missed risk: #62 + #69+#70 — DB connection pool exhaustion under per-row event fanout during migration

- Category: **NEW: Database connection pool exhaustion**
- Affected items: #62, #69, #70
- Source: `plan-loop-1-04-kris.md:251-256` (per-row events);
  `plan-loop-2-06-migration-window.md:158-165` (migration drops
  `vendor_*_links` FKs and re-adds with cascade).
- Likelihood: LOW. The migration window is single-developer-managed;
  the dev rehearses on staging.
- Impact: HIGH if it triggers. During the migration window, if any
  bulk vendor reconciliation happens to fire (e.g. a scheduled
  reconciliation cron), the per-row mutations target `vendor_*_links`
  which are mid-DDL. Each row holds a connection. Pool can saturate.
- Detection: only operationally; the rehearsal step exists but doesn't
  specifically test bulk-during-migration.
- Mitigation: per Loop 2 `plan-loop-2-06-migration-window.md:970`
  quote `"Quiesce writes (drain traffic / put app in read-only mode if available)"`.
  Already documented; ensure quiesce step is in the operational runbook.

---

## Missed risk: 79-item plan — reviewer cognitive overload across multiple gates per item

- Category: **NEW: Reviewer cognitive overload**
- Affected items: ALL 79 items
- Source: CLAUDE.md `## Adversarial rounds for high-stakes work` and
  `Round 1 ... Round 2 ... Round 3` paragraphs.
- Likelihood: HIGH. Each commit gates: pytest red→green +
  architecture-locks + capability-validator + (sometimes) Postgres
  lane + (sometimes) FE Vitest. Reviewer must re-verify each gate
  against current code per the user's MEMORY.md note
  `"feedback_audits_validate_current_code.md"`. Across 79 items, the
  cumulative review time approaches the development time itself
  (Loop 2 master-seq says ~484 dev-hours).
- Impact: MEDIUM. Reviewer fatigue → false-flag findings or, worse,
  missed real findings. Loop 3 register's "Round 2 adversarial" calls
  `:770-774` happen per-item; 16 contract-touching items alone need
  Round 2.
- Detection: only via post-mortem ("we missed X in Round 2").
- Mitigation: (a) batch low-risk items (TRIVIAL + DOC-ONLY rollback class
  per `plan-loop-3-03-rollback-register.md:1067-1075` — 9 items total)
  into a single Round 2 sweep; (b) reserve dedicated Round 2 sessions
  for the 11 highest-risk items (CROSS-DOMAIN with validator gating);
  (c) automate the contract-validator + lock + ruff/mypy pre-commit per
  `plan-loop-2-05-validator-schedule.md:483-510`.

---

## Missed risk: #34 Approvals hub partial commit if mid-edit interrupt

- Category: **NEW: Worktree dirty-state hazard**
- Affected items: #34
- Source: `plan-loop-1-03-approvals.md:148-164` quote
  `"22+ sites grouped by file"`;
  `:138` quote `"Migrate atomically (single commit)"`.
- Likelihood: LOW. Single-developer single-commit per the plan.
- Impact: HIGH. If the developer is mid-edit (e.g. 11 of 22 files
  rewritten) and the session ends or worktree shifts, the remaining
  11 sites still call `can_resolve_approvals` while the rewritten
  ones use `resolve_approval_privilege_tier`. If the dev mistakenly
  commits the partial state, production has split brain.
- Detection: pre-commit hook running
  `grep -rn "can_resolve_approvals" backend/` and verifying the count
  is 0 outside `approval_scenario_policy.py` per
  `plan-loop-3-04-risk-register.md:51`.
- Mitigation: enforce as a pre-commit hook (per Top 5 mitigation #1
  in Loop 3). Already proposed; flagging the worktree-state vector
  explicitly.

---

## Missed risk: 24 new `_red.py` test files — allowlist drift in `_archive_allowlist.toml`

- Category: **NEW: Allowlist-discipline drift**
- Affected items: ALL items adding new architecture tests
- Source: `plan-loop-2-03-lock-conflict-matrix.md:459` quote
  `"Total NEW backend lock test files (architecture/): ~24"`;
  CLAUDE.md `_archive_allowlist.toml` reference.
- Likelihood: MEDIUM. Each new `_red.py` test file potentially needs
  an `_archive_allowlist.toml` entry (depending on the lock-test
  pattern). The Loop 1 plans don't enumerate which of the 24 require
  TOML edits and which don't.
- Impact: MEDIUM. If a TOML entry is missed, the test fails for the
  WRONG reason (allowlist absence), masking the real fail.
- Detection: `make -f scripts/Makefile test-architecture-locks`
  diagnostic message.
- Mitigation: pre-flight checklist line for each new test
  ("does this need an `_archive_allowlist.toml` row?"). Document the
  decision rule in `tests/backend/pytest/architecture/README.md` if
  not already.

---

## Missed risk: Test fixture churn in #34 (22+ files) leaves stale mocks

- Category: Test brittleness (Loop 3 acknowledges generally; missing this specific case)
- Affected items: #34
- Source: `plan-loop-1-03-approvals.md:148-164`.
- Likelihood: MEDIUM. Each of the 22+ call sites has tests that mock
  the OLD predicate `can_resolve_approvals`. The Loop 1 plan enumerates
  **production** sites but not their corresponding test sites.
- Impact: MEDIUM. If a test mocks `can_resolve_approvals` but
  production now calls `resolve_approval_privilege_tier`, the mock
  is dead code; the test silently exercises real production code.
  This is the same pattern that caused
  `feedback_audits_validate_current_code.md` (per MEMORY.md).
- Detection: `grep -rn "can_resolve_approvals" tests/backend/pytest/`
  before commit; mock count should drop to 0.
- Mitigation: amend #34 plan to enumerate test mocks alongside prod
  call sites and rewrite both in the same commit. Loop 3 register
  flags the prod-side risk but not the test-mock-side.

---

## Missed risk: #11 control-execution test inversion order — devs commit fix before inverting

- Category: Behavior regression (Loop 3 acknowledges generally; missing this specific timing risk)
- Affected items: #11
- Source: `plan-loop-1-02-risks.md:285-289` quote
  `"test inversion AND workflow fix MUST land in the same commit; splitting is forbidden"`.
- Likelihood: MEDIUM. The rule is stated but not enforced by tooling.
  Single-developer pressure to "see green tests first" can lead to
  committing the fix without the test inversion, then seeing tests pass
  (because the existing assertion `risk.process` still happened to pass
  trivially in some shape).
- Impact: HIGH if missed: the wire-shape is different from the test
  expectation, and the next dev sees a passing test that no longer
  reflects production behaviour.
- Detection: pre-commit hook scanning the diff for `test_executions.py:325` AND `_control_execution/workflow.py:155` in the SAME commit.
- Mitigation: enforce as a pre-commit grep; if either is touched
  without the other, block the commit.

---

## Missed risk: ADR-012 (#73) introduces `_kri_state_vocabulary_allowlist.toml` schema with no consumer outside the lock test

- Category: Lock churn race (Loop 3 acknowledges generally; missing this specific risk)
- Affected items: #73
- Source: `plan-loop-1-04-kris.md:300, :313` quote
  `"new TOML registry tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml"`.
- Likelihood: MEDIUM. The TOML is consumed by exactly one lock test.
  If the schema (sections, key names) drifts during authoring vs.
  consumption, both fail simultaneously.
- Impact: LOW-MEDIUM. Lock test misfires.
- Detection: lock test is the consumer.
- Mitigation: lock test + TOML in same commit; document expected schema
  in test docstring.

---

## Missed risk: #71 module-scope state — TypeScript tree-shaking can elide if unused at module level

- Category: Behavior regression (Loop 3 covers single-flight; missing tree-shake angle)
- Affected items: #71
- Source: `plan-loop-1-06-frontend.md:492` quote
  `"let refreshInFlight: Promise<string | null> | null = null;"`.
- Likelihood: LOW. Vite/Rollup tree-shake is module-aware; module-scope
  `let` with non-side-effect initializer survives unless explicitly
  marked. But: if the developer reorganises the module to lazily-init
  the variable inside a function, it becomes function-scope and the
  single-flight contract breaks.
- Impact: HIGH (same as Loop 3 #71 risk).
- Detection: explicit unit test pinning module-scope (the `coordinator.singleFlight.test.ts` does this implicitly).
- Mitigation: amend #71 commit-2 TDD: explicit test that `coordinator.ts` exports nothing referencing `refreshInFlight` (i.e. it stays private + module-scope).

---

## Missed risk: Two domains (#37, #39) backend changes registered in frontend domain — review attribution mistake

- Category: Cross-domain coordination (Loop 3 acknowledges; missing this specific reviewer-attribution risk)
- Affected items: #37, #39
- Source: `plan-loop-2-08-master-sequence.md:241-243` quote
  `"#37 is listed under frontend in the DAG (cross-domain authority) but is a backend change"`;
  `:243` quote `"#39 same: backend item filed under frontend in DAG because it gates FE-N5"`.
- Likelihood: MEDIUM. If the Round 2 reviewer is "frontend specialist",
  they may de-prioritize backend correctness review for #37/#39 because
  they're filed under frontend.
- Impact: MEDIUM. Capability-builder bug could ship.
- Detection: only via post-mortem.
- Mitigation: per CLAUDE.md "parallelize independent work" — dispatch
  BOTH backend AND frontend Round 2 reviewers for #37/#39. Document
  in master-sequence note.

---

## Missed risk: #74a `==31` vs `>=31` ambiguity — untested mitigation

- Category: Lock churn race (Loop 3 has this; missing the test-coverage gap)
- Affected items: #74a, #61
- Source: `plan-loop-2-07-hidden-prereqs.md:551-558` quote
  `"amend #74a TDD shape to use '>= 31'"`.
- Likelihood: MEDIUM. The mitigation is "use `>=`" but Loop 3 register
  doesn't pin it — the lock test could ship with `==` and the developer
  not realize until #61 lands.
- Impact: MEDIUM (already in Loop 3).
- Detection: code review.
- Mitigation: amend Loop 3 risk register entry (`:54`) to include a hard
  pre-flight check that #74a's lock uses `>=` and not `==` BEFORE landing.

---

## Missed risk: #69+#70 timestamp regression — `created_at` server_default change

- Category: **NEW: Time-zone / timestamp regression**
- Affected items: #69
- Source: `plan-loop-2-06-migration-window.md:96-100` quote
  `"created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now()"`.
- Likelihood: LOW. The mixin codifies `server_default=func.now()` which
  matches existing behaviour. But: if any of the 3 link tables had a
  DIFFERENT default (e.g. `func.current_timestamp()` or a Python-side
  default), the mixin enforces a unified shape. **Verify** before
  landing.
- Impact: MEDIUM if existing rows had different default semantics
  (timezone-naive vs aware).
- Detection: pre-migration query
  `SELECT pg_typeof(created_at), tzinfo FROM vendor_risk_links LIMIT 1`
  to confirm timezone awareness matches.
- Mitigation: include in pre-flight checklist for #69+#70.

---

## Missed risk: Build-cache poisoning — Vite hash collisions for similar modules

- Category: **NEW: Build-cache poisoning**
- Affected items: #46, #48, #65, #66, #71
- Source: indirect — the FE refactors create many new modules that
  may collide in dev-build caches.
- Likelihood: LOW. Vite uses content-hash chunks; collisions are
  vanishingly rare.
- Impact: LOW. Dev-server stale module on local builds.
- Detection: `pnpm build` clean.
- Mitigation: developer documentation: `rm -rf node_modules/.vite` after
  each major FE refactor commit.

---

## Missed risk: #34 + #60 PrivilegeContext two-phase — old contexts in flight during deploy

- Category: Cross-domain coordination (Loop 3 has #34 hub; missing the deploy-skew angle)
- Affected items: #34, #60
- Source: `plan-loop-2-08-master-sequence.md:114` quote
  `"#60 ... Pre-req: #34, #51"`.
- Likelihood: LOW. #34 ships first; #60 ships separately; both ship to
  prod independently. During the time window between #34 deploy and
  #60 deploy, the production code uses the new `resolve_approval_privilege_tier`
  helper but no `PrivilegeContext` dependency yet.
- Impact: LOW. The intermediate state is sound (Loop 3 #34 entry
  asserts no behavior change). But: if a hotfix lands during this
  window and reverts #34, it breaks #60's prereq.
- Detection: code review of any hotfix during the window.
- Mitigation: document in master-sequence: hotfixes between #34 and
  #60 deploys must not touch approval_scenario_policy.

---

## Missed risk: Plan asserts "exactly 31 packages today" but `_graph_directory/` already exists in current tree

- Category: Lock churn race (Loop 3 has #74a; missing the current-state verification)
- Affected items: #74a
- Source: `plan-loop-2-07-hidden-prereqs.md:108-114` quote
  `"the 'exactly 31 packages today' assertion drifts the moment #61 lands"`.
- Likelihood: MEDIUM. This presumes the count is 31 BEFORE #61. The
  current commit `1ee872a4` already has many packages; without
  re-verifying, the lock could ship with the wrong number.
- Impact: MEDIUM. Lock test red on first CI run.
- Detection: `find backend/app/services -maxdepth 1 -type d -name '_*' | wc -l` against current commit BEFORE writing the lock.
- Mitigation: pre-flight: re-run the package count before drafting #74a's
  lock test.

---

## Missed risk: `_endpoint_commit_allowlist.toml` calendar drift — devs forget the 2026-09-01 sunset

- Category: CI lane regression (Loop 3 has this; missing the developer-awareness mitigation)
- Affected items: #72 + future auth/* work
- Source: `plan-loop-2-03-lock-conflict-matrix.md:34` quote
  `"NO room for additional auth/* commits before 2026-09-01 expiry"`.
- Likelihood: HIGH (calendar-driven).
- Impact: HIGH (CI fails on every run after the date).
- Detection: only on the date.
- Mitigation: per Loop 3 #D risk: spawn a NEW Phase-4 follow-up item.
  Already proposed. Add a calendar reminder to the team's tooling
  (e.g. a GitHub issue with `auto-close-after: 2026-08-15`).

---

## Missed risk: KRI `_kri_history/correction_plans.py` deletion (#52) leaves stale README references

- Category: Doc churn (Loop 3 covers contract-md collisions; missing per-domain README orphans)
- Affected items: #52
- Source: `plan-loop-3-03-rollback-register.md:631-633` quote
  `"Restore '_kri_history/README.md' row if present"`.
- Likelihood: MEDIUM. Each of #50, #51, #52, #62 deletes a file
  AND must update the same `_kri_history/README.md`. If two of these
  land sequentially without the README edit, the README references
  files that no longer exist.
- Impact: LOW. Reader-facing only.
- Detection: post-commit grep for the deleted filename in `*.md`.
- Mitigation: amend pre-flight for KRI items: after each delete,
  `grep -rn '<deleted-filename>' backend/app/services/_kri_history/README.md` returns 0.

---

## Missed risk: Frontend test fixture stale after #35 usePermissions removal — 18 mocks rewritten but test ASSERTIONS may stay stale

- Category: Test brittleness (Loop 3 covers mock-rewrite churn; missing assertion-staleness angle)
- Affected items: #35
- Source: `plan-loop-1-06-frontend.md:166-185` (18 mock files listed).
- Likelihood: MEDIUM. The mocks are rewritten to point at
  `@/contexts/AuthContext`. But: the test ASSERTIONS often check
  specific permission strings (e.g. `expect(can('view', 'governance')).toBe(true)`).
  If `useAuth` exposes a slightly different shape than `usePermissions`
  did, assertions may pass but assert against the wrong field.
- Impact: MEDIUM. Tests pass; production has subtle authz drift.
- Detection: each rewritten test must be re-read post-rewrite; not
  automated.
- Mitigation: amend #35 plan: each test rewrite gets a paired commit
  message line `"verified assertion shape against new useAuth() API"`.

---

## Missed risk: Two cross-domain tests write to same TOML (`_capabilities_all_allowlist.toml`)

- Category: Lock churn race (Loop 3 covers #39; missing the multi-touch angle)
- Affected items: #15, #39, #65
- Source: `plan-loop-2-04-doc-touch-matrix.md:230-234` quote
  `"Sequencing: #15 → #39 → #65 (avoid re-snapshotting)"`.
- Likelihood: MEDIUM. Three sequential commits to the same TOML; if any
  re-orders the rows, the lock-test (order-strict) fails.
- Impact: MEDIUM (caught by lock test).
- Detection: lock test.
- Mitigation: pre-flight: each commit's diff against the TOML is APPEND-ONLY
  (no row reordering).

---

## Section 3 — Top 10 missed risks (with mitigations)

Ranked by Likelihood × Impact (HIGH/HIGH > HIGH/MEDIUM > MEDIUM/HIGH > others).

1. **#34 partial commit on worktree interrupt** — LOW likelihood, HIGH
   impact. Mitigation: pre-commit grep gate enforced as hook.

2. **#69+#70 frontend Zod parse breaks during deploy skew** — HIGH
   likelihood (lockstep deploys are hard), MEDIUM-HIGH impact.
   Mitigation: three-deploy sequence (FE-soft → BE-migrate →
   FE-cleanup).

3. **#69+#70 surviving `Vendor.status` query references** — MEDIUM
   likelihood, HIGH impact. Mitigation: full-tree grep before
   migration; block on any unexpected hit.

4. **#11 fix-without-test-inversion** — MEDIUM likelihood, HIGH impact.
   Mitigation: pre-commit grep gate.

5. **#34 test fixture mock staleness** — MEDIUM likelihood, MEDIUM
   impact, but masks real authz drift. Mitigation: enumerate test
   mocks in #34 plan; rewrite in same commit.

6. **#66 AuthActions callback stability** — MEDIUM likelihood, HIGH
   impact (form re-renders every keypress). Mitigation: add a
   third re-render isolation test for action-callback stability.

7. **i18n key coverage after #48 merge** — MEDIUM likelihood, MEDIUM
   impact. Mitigation: add `errorKeys.coverage.test.ts` asserting
   every locale has every key.

8. **Reviewer cognitive overload across 79 items** — HIGH likelihood,
   MEDIUM impact (missed real findings). Mitigation: batch low-risk
   items into one Round 2 sweep; reserve dedicated Round 2 for the 11
   highest-risk CROSS-DOMAIN items.

9. **#62 audit log volume regression** — HIGH likelihood (decision
   ships per-row), MEDIUM impact. Mitigation: capture daily audit-row
   baseline; alert on 2× growth in first 7 days post-deploy.

10. **#74a count-drift untested mitigation** — MEDIUM likelihood,
    MEDIUM impact. Mitigation: amend Loop 3 risk register entry to
    enforce `>=` not `==` BEFORE landing.

---

## Section 4 — New risk categories identified

The Loop 3 register's 9 categories don't cover these dimensions, all of
which surfaced findings in §2:

1. **Performance regression** — re-render churn (#66), refetch storms
   (#46).
2. **Backward compatibility** — API contract drift during deploy skew
   (#69+#70 status drop).
3. **i18n key consistency** — orphan translation keys (#48, #33).
4. **Browser/route caching** — service-worker bundle cache (#36),
   MSAL cache timing (#66).
5. **DB index regression** — dropped index without verifying all
   query consumers (#69+#70 `ix_vendors_status`).
6. **Test fixture churn** — large refactors leave stale mock
   ASSERTIONS, not just mock targets (#34, #35).
7. **Audit-log cardinality** — N events vs 0 events transition (#62).
8. **Outbox queue overload** — double-emit on retry (#63).
9. **Memory leak from React useMemo/useCallback churn** — covered by
   #66 memo race; expanded to action-callback stability.
10. **Single-flight regression** — covered by #71; expanded to
    tree-shake angle.
11. **MSAL token cache invalidation** — bootstrap ordering during
    AuthContext split.
12. **CSP / CSRF regression** — middleware import-cycle (#43).
13. **Logging volume regression** — #62, #63.
14. **Database connection pool exhaustion** — bulk-during-migration
    (#62 + #69+#70 window).
15. **Race conditions in tests** — parallel-suite single-flight (#71).
16. **Reviewer cognitive overload** — 79-item plan.
17. **Worktree dirty-state hazard** — partial-commit on interrupt
    (#34).
18. **Allowlist-discipline drift** — 24 new test files, each may
    need TOML row.
19. **Time-zone / timestamp regression** — `created_at` defaults
    in mixin (#69).
20. **Build-cache poisoning** — Vite stale chunks during heavy FE
    refactors.

---

## Section 5 — Recommendations for global mitigations to add

These are SUPPLEMENTS to the 5 global mitigations in Loop 3 §4
(`plan-loop-3-04-risk-register.md:746-786`).

### Global mitigation #6 — Three-deploy sequence for migration items

For #69+#70: do NOT ship as a single FE+BE deploy.
1. **Deploy 1**: FE patch making `vendor.status` optional in Zod
   schema; FE bundles still expect status field but tolerate its
   absence. Deploy and bake for ≥1h.
2. **Deploy 2**: BE migration drops `vendor.status` column. Deploy
   atomically with the FE bundle from Deploy 1 (no FE change).
3. **Deploy 3**: FE patch removing `status` from Zod schema entirely.

Rationale: the current Loop 2 plan
(`plan-loop-2-06-migration-window.md:693`) says "no mid-deployment
skew tolerated", which is operationally implausible for a Vite-built
SPA where users may have stale browser caches. The three-deploy
sequence accommodates real deploy skew.

### Global mitigation #7 — Pre-commit grep gates for behavior-regression items

For #11 and #34 (and similar truth-in-naming / hub-migration items):
install a pre-commit hook that:

```bash
# #11: test inversion AND fix in same commit
if git diff --cached --name-only | grep -q '_control_execution/workflow.py'; then
  if ! git diff --cached --name-only | grep -q 'test_executions.py'; then
    echo "BLOCK: #11 requires both files in same commit"; exit 1
  fi
fi

# #34: no surviving can_resolve_approvals references
if git diff --cached -- backend/ | grep -q '+.*can_resolve_approvals'; then
  if ! git diff --cached --name-only | grep -q 'approval_scenario_policy.py'; then
    echo "BLOCK: can_resolve_approvals must be replaced; reference outside policy"; exit 1
  fi
fi
```

### Global mitigation #8 — Calendar-tracked sunset reminder

For #72 / 2026-09-01 expiry: open a TRACKED issue in the project
tracker with `auto-close: 2026-08-15` (warning 2 weeks ahead). The
issue body cites
`plan-loop-2-07-hidden-prereqs.md:582-603` and the 8 auth/* `db.commit`
sites that need migration.

### Global mitigation #9 — Round-2 batched review for low-risk items

Per the CLAUDE.md adversarial-rounds protocol: instead of running
Round 2 individually for each of 79 items (estimated ~250 hours), batch
the 9 TRIVIAL + DOC-ONLY items
(`plan-loop-3-03-rollback-register.md:1067-1075`) into ONE Round 2
sweep with a single Opus agent. Reserve individual Round 2 for the 11
CROSS-DOMAIN items with validator gating
(per `plan-loop-2-05-validator-schedule.md:443-446`).

### Global mitigation #10 — Pre-flight grep for cross-domain "stale references"

Before any file delete or relocate, run:
```bash
git grep -n "<filename>" -- '*.md' '*.toml' '*.py' '*.ts' '*.tsx' \
  | grep -v '<allowed-callers>'
```
and confirm the result matches the Loop 1 plan's enumerated callers.
This catches the FE Vendor.status TS / Zod / e2e helper drift, the
KRI README orphans, and any `Vendor.status` survivor query.

### Global mitigation #11 — Audit-log baseline capture before #62 lands

Capture **daily audit-log row volume** for the 7 days BEFORE #62
deploys. After deploy, alert on 2× growth in the first 7 days. This
is the only way to catch a runaway per-row event regression caused by
unanticipated bulk reconciliation paths.

### Global mitigation #12 — `git stash`-based NEW-vs-pre-existing triage discipline

Per CLAUDE.md `## NEW vs PRE-EXISTING triage` and MEMORY.md
`feedback_audits_validate_current_code.md`: every Round-3 lint/type
gate failure MUST go through `git stash` → re-run → diff to determine
whether the failure is from THIS PR or pre-existing baseline. This is
mandatory for #34, #46, #66, #71 (the high-volume edits).

---

## Section 6 — Summary

- **Total risks in Loop 3 register**: 34 (verified count, no
  double-counts).
- **Reporting issues found in Loop 3 §2**: 1 cosmetic count typo
  (Cross-domain enumerates 7 in parenthetical, totals as 6); 1
  reporting-mode gap (#45a behavior-regression aspect buried).
- **Misclassifications found**: 0 hard, 2 soft (validator-runs +
  ADR-007 amendment text classification debatable).
- **Missed risks identified**: 28 (this review).
- **NEW risk categories proposed**: 13.
- **Top 10 missed risks**: ranked in §3.
- **Global mitigations recommended**: 7 supplements (mitigations
  #6–#12) to the existing 5.
- **Most severe missed risks**:
  - #69+#70 deploy-skew → FE Zod parse failure (HIGH likelihood,
    MEDIUM-HIGH impact).
  - #34 worktree-interrupt partial commit (LOW likelihood, HIGH
    impact).
  - Surviving `Vendor.status` query references after #69+#70 (MEDIUM
    likelihood, HIGH impact).

End of completeness review.
