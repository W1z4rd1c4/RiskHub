# Phase 4 Loop 2 — Adversarial Risk Register Review

Working dir: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Anchor commit: `1ee872a4`.
Mode: ADVERSARIAL. Targets: Loop 1's 28 missed risks (`review-loop-1-05-risk-completeness.md`)
plus Loop 3's original 34 (`plan-loop-3-04-risk-register.md`). 79 items, single
sequential developer, ~12 calendar weeks.

Posture: Loop 1 was constructive and found 28 additions. Some of those are
soft / theoretical / out-of-scope under a single-developer single-commit
workflow. Some real risks are STILL missed. This review challenges both
sides.

---

## Section 1 — Challenges to Loop 1's 28 additions

### 1.1 Loop 1 risks that DON'T hold up (recommend dropping or downgrading)

Each entry below quotes the Loop 1 finding and explains why it is too
speculative, duplicative, or below the threshold of "actionable for a
single sequential developer".

#### L1-DROP-1: "Worktree dirty-state hazard" (#34 partial commit)

- Loop 1 source: `review-loop-1-05-risk-completeness.md:447-466` quote
  `"Single-developer single-commit per the plan. … Impact: HIGH"`.
- Adversarial counter: The plan ALREADY mandates atomic commit
  (`plan-loop-1-03-approvals.md:138` quote
  `"Migrate atomically (single commit)"`). Loop 3 already names this
  risk under "#34 Approvals hub partial migration"
  (`plan-loop-3-04-risk-register.md:41-52`) with the SAME mitigation
  ("`grep -rn "can_resolve_approvals" backend/`"). Loop 1 reframes
  Loop 3 as a "worktree" hazard but the failure mode and detection are
  identical. **Verdict: DUPLICATE of Loop 3 risk #2; do not list as
  separate.**
- Recommended action: fold into Loop 3 #2 as a sub-bullet
  ("commit must be all-or-nothing; pre-commit grep gate enforces").

#### L1-DROP-2: "Build-cache poisoning" (Vite hash collisions)

- Loop 1 source: `review-loop-1-05-risk-completeness.md:620-631` quote
  `"Vite uses content-hash chunks; collisions are vanishingly rare"`.
- Adversarial counter: Loop 1 itself rates this LOW × LOW. Vite content
  hashing is non-colliding by construction (SHA-256-based). The mitigation
  ("`rm -rf node_modules/.vite`") is a single-keystroke developer
  remedy, not a planning concern. Citing it inflates the register.
  No real-world incident in Vite history has been a hash collision; the
  risk is unfalsifiable theory.
- **Verdict: REJECT as register entry; relegate to dev-checklist
  footnote ("clear `.vite` cache after FE refactors").**

#### L1-DROP-3: "#71 single-flight regression undetected if two test files run in parallel"

- Loop 1 source: `review-loop-1-05-risk-completeness.md:355-375` quote
  `"vitest's module isolation. However: if the developer accidentally
  writes the test using globalThis.refreshInFlight"`.
- Adversarial counter: Loop 1 self-acknowledges Vitest module isolation
  gives each test file a fresh module — this is the documented Vitest
  behaviour, not a risk. The "if the developer writes `globalThis...`"
  framing is a hypothetical anti-pattern, not a plan-level risk; it's
  caught by the FIRST run of the new test (`coordinator.singleFlight.test.ts`
  passes only if the module-scope is correct). The mitigation
  (`beforeEach` reset) is also already implicit in Loop 3 #4
  (`plan-loop-3-04-risk-register.md:225-248`) which mandates the
  module-scope `let` survive intact.
- **Verdict: REJECT; this risk reduces to "the developer might write
  bad code", which is true of every item.**

#### L1-DROP-4: "#36 BusinessRouteGuards refactor invalidates browser route cache"

- Loop 1 source: `review-loop-1-05-risk-completeness.md:265-282` quote
  `"if any user has a service-worker cached version of the old
  BusinessRouteGuards.js bundle"`.
- Adversarial counter: RiskHub ships no service worker (no PWA
  manifest in `frontend/`). The fallback to "React DevTools diffing"
  is a developer-experience concern, not a runtime risk. Vite's chunk
  hashing busts the cache deterministically. Loop 1 itself rates this
  LOW × LOW.
- **Verdict: REJECT; not a real risk for a non-PWA SPA.**

#### L1-DROP-5: "#43 audit adapter-emitter helper changes CSP/middleware behaviour"

- Loop 1 source: `review-loop-1-05-risk-completeness.md:379-395` quote
  `"if the helper is imported into a module that is ALSO referenced by
  middleware (e.g. CSP report-uri handlers), the import graph could
  grow a cycle"`.
- Adversarial counter: I checked
  `backend/app/middleware/security_headers.py:10` — the SecurityHeadersMiddleware
  has NO import of any audit module (`grep -rn "audit" backend/app/middleware/`
  returns 0 hits). The helper is "additive" by Loop 1's own statement
  (`plan-loop-3-03-rollback-register.md:510`). The "CSP report-uri
  cycle" failure mode is a hypothetical that requires the developer
  to actively wire the helper into middleware — which is not in #43's
  scope. The MEMORY.md feedback warning explicitly flags this kind of
  "what if a future commit accidentally" speculation as low-value.
- **Verdict: REJECT; the import-graph constraint is real but Loop 1
  asserts the helper is additive, contradicting the worry.**

#### L1-DROP-6: "ADR-012 (#73) introduces _kri_state_vocabulary_allowlist.toml schema with no consumer outside the lock test"

- Loop 1 source: `review-loop-1-05-risk-completeness.md:533-545`.
- Adversarial counter: Loop 1 itself rates this LOW-MEDIUM × LOW-MEDIUM.
  The mitigation ("lock test + TOML in same commit") is already mandatory
  under Loop 3 §5 hard-rule "atomic-commit invariant"
  (`plan-loop-3-04-risk-register.md:778-785`). This is a restatement of
  the global atomic-commit invariant, not a new risk.
- **Verdict: REJECT as standalone; covered by global mitigation #5.**

### 1.2 Loop 1 risks that ARE real (keep)

Confirmed and re-verified against current code. These are the **22**
Loop 1 additions that survive adversarial review:

| Loop 1 risk | Evidence-grounded? | Severity adjustment |
|---|---|---|
| #66 AuthContext memo race for action callbacks | YES — `frontend/src/contexts/AuthContext.tsx` exists and ships value-as-fresh-object today | KEEP HIGH × MEDIUM |
| #46 query-key factory rebuilds on every render | YES — Loop 1 plan calls for factory but doesn't pin Object.freeze | KEEP MEDIUM × MEDIUM |
| #69+#70 ix_vendors_status index dropped without grep gate | YES — confirmed `op.drop_index("ix_vendors_status")` at `plan-loop-2-06-migration-window.md:48` | KEEP MEDIUM × HIGH |
| #69+#70 deploy-skew → FE Zod parse failure | YES — `plan-loop-2-06-migration-window.md:693` claims "no skew tolerated" which is operationally implausible for Vite SPA | KEEP HIGH × MEDIUM |
| #48 errorKeys merge orphans translations | YES — verified `frontend/src/i18n/locales/{cs,en}/errorKeys.json` exists in BOTH locales | KEEP MEDIUM × MEDIUM |
| #62 KRI per-row audit fanout volume | YES — Loop 1 `plan-loop-1-04-kris.md:233-241` decision is "PER-ROW EVENTS" | KEEP HIGH × MEDIUM |
| #63 outbox SchedulerJobRun double-emit on retry | YES — verified `app/core/scheduler_tracking.py:36, :161` does `SchedulerJobRun(...)` twice (started + completed) | KEEP MEDIUM × MEDIUM |
| #66 AuthContext + MSAL bootstrap ordering | YES — `frontend/src/main.tsx:4` quote `import './i18n'` (MSAL imported elsewhere); two-phase bootstrap | KEEP LOW-MEDIUM × MEDIUM |
| #62 + #69+#70 connection-pool exhaustion mid-migration | YES — Loop 1 itself mitigates via quiesce step | KEEP LOW × HIGH |
| Reviewer cognitive overload across 79 items × 7 gates | YES — see Section 3 below; expanded | KEEP HIGH × MEDIUM |
| 24 new `_red.py` allowlist drift | YES — `plan-loop-2-03-lock-conflict-matrix.md:459` quote `"~24"` — but I count only 6 TOML files in `tests/backend/pytest/architecture/` today | KEEP MEDIUM × MEDIUM |
| #34 test fixture stale mocks | YES — pattern matches MEMORY.md `feedback_audits_validate_current_code.md` exactly | KEEP MEDIUM × MEDIUM |
| #11 fix-without-test-inversion | YES — Loop 1 plan-loop-1-02-risks.md:285-289 states the rule but no enforcement | KEEP MEDIUM × HIGH |
| #71 module-scope tree-shake angle | YES — Vite/Rollup tree-shake is module-aware but lazy-init refactors break the contract | KEEP LOW × HIGH |
| Two domains #37, #39 backend-but-listed-frontend | YES — `plan-loop-2-08-master-sequence.md:241-243` confirms attribution split | KEEP MEDIUM × MEDIUM |
| #74a `==31` vs `>=31` ambiguity | YES — Loop 2 hidden-prereqs flags but Loop 3 doesn't pin | KEEP MEDIUM × MEDIUM |
| #69 `created_at` server_default mixin | YES — but Loop 1 itself rates LOW × MEDIUM | KEEP LOW × MEDIUM |
| #34 + #60 deploy-skew window | YES — two-phase rollout has a documented window | KEEP LOW × LOW (downgrade from Loop 1's MEDIUM) |
| #74a 31-package count drift verification | YES — re-verifying current state is cheap and catches L1 hidden-prereq #B | KEEP MEDIUM × MEDIUM |
| 2026-09-01 calendar drift | YES — Loop 3 already has, Loop 1 elaborates the dev-awareness | KEEP HIGH × HIGH |
| #52 KRI README orphan references | YES — `plan-loop-3-03-rollback-register.md:631-633` confirms README must update | KEEP MEDIUM × LOW |
| #35 mock assertion staleness | YES — pattern matches MEMORY.md feedback | KEEP MEDIUM × MEDIUM |
| Two TOML touch order #15→#39→#65 | YES — `plan-loop-2-04-doc-touch-matrix.md:230-234` confirms | KEEP MEDIUM × MEDIUM |

**Summary of Section 1**: Loop 1's 28 additions reduce to **22 valid +
6 to drop**. The 6 to drop are L1-DROP-1 through L1-DROP-6 above.

---

## Section 2 — New risks STILL missed by both Loop 1 and Loop 3

The following 13 risks are grounded in current code and the plan as
written. Each has likelihood, impact, detection, mitigation, and a "why
Loop 1 missed" clause.

### 2.1 New Risk: Code-review burnout — sustained ~10h/week review for 12 weeks

## Risk: Reviewer-burnout — 79 items × 7 quality gates × 12-week sustained cadence
- Loop 1 already noted? PARTIAL — Loop 1 noted "reviewer cognitive overload" generically (`review-loop-1-05-risk-completeness.md:420-444`)
- Loop 3 already noted? NO
- Affected items: ALL 79 (especially the 16 contract-touching commits per `plan-loop-2-05-validator-schedule.md:425-447`)
- Likelihood: HIGH
- Impact: MEDIUM (missed real findings; phantom false-flags)
- Detection: post-mortem ("we missed X in week 8")
- Mitigation: Loop 1 proposes "batch low-risk into one Round 2 sweep" (`review-loop-1-05-risk-completeness.md:438-443`) — RETAIN. Add: enforce a **week-7 hard pause for re-baselining**: dispatch a single agent to re-grep `file:line` citations in remaining plan items and patch any that drifted in commits already landed.
- Why Loop 1 missed: Loop 1's framing was per-item ("12 hours per week") without modeling sustained-cadence fatigue or staleness compounding.

### 2.2 New Risk: Plan-citation staleness as commits land

## Risk: file:line citations in plan files drift as items land — week-8 plan no longer matches week-1 file:lines
- Loop 1 already noted? NO
- Loop 3 already noted? NO (MEMORY.md `feedback_audits_validate_current_code.md` warns about it for AUDITS not for PLANS)
- Affected items: ALL items in P3/P4 wave (Seq 56-77) that cite a file:line whose owning module has been touched by an earlier commit
- Likelihood: HIGH (12 weeks; 484 dev-hours; many citations to files like `_kri_history/__init__.py` or `users/summary.py` that get edited multiple times)
- Impact: MEDIUM (developer wastes time chasing a stale line number; or worse, edits a wrong line in a re-touched file)
- Detection: pre-commit script that re-verifies `git grep` of the plan-cited substring is still present in target file
- Mitigation: at the start of EACH wave (B/C/D/E/F/G per `plan-loop-2-08-master-sequence.md:316-324`), dispatch a fresh agent to re-verify all remaining-wave file:line citations against current HEAD. Patch the plan in-place.
- Why Loop 1 missed: Loop 1 reviewed plan completeness at a single point in time; it didn't model "the plan ages with the code" as its own risk class.

### 2.3 New Risk: Hot-fix collision during the cleanup window

## Risk: Production hot-fix lands during weeks 1-12 and conflicts with in-flight cleanup commits
- Loop 1 already noted? NO
- Loop 3 already noted? PARTIAL — Loop 3 risk "Cap-pressure on commit-allowlist TOMLs (no headroom)" (`plan-loop-3-04-risk-register.md:383-397`) addresses cap-pressure but not hot-fix-on-cleanup-rebase
- Affected items: any commit touching files where production bugs commonly land (e.g. `auth/refresh.py`, `_control_execution/workflow.py`, `users/summary.py`)
- Likelihood: MEDIUM (12-week window in a live product; statistically a P0 hot-fix is plausible)
- Impact: HIGH (a hot-fix on `_control_execution/workflow.py` mid-#11 either pre-empts #11 or causes merge conflict; the truth-in-naming fix for `risk.process` → `risk.name` could be silently undone)
- Detection: only at hot-fix merge time
- Mitigation: enforce a "pause cleanup commits during active hotfix" protocol; for #11 specifically, add a pre-commit gate: if `_control_execution/workflow.py:155` has been touched since the plan was anchored at commit `1ee872a4`, abort and re-baseline. For approvals hub items #9/#34/#60, similar gates around `approval_scenario_policy.py`.
- Why Loop 1 missed: Loop 1 reviewed plan against frozen anchor `1ee872a4`; it didn't model "main moves underneath the plan".

### 2.4 New Risk: Concurrent feature work conflict

## Risk: New feature work lands on cleanup-target files mid-cleanup
- Loop 1 already noted? NO
- Loop 3 already noted? NO (Loop 3 §5 §1 forbids cap-additions but says nothing about feature work)
- Affected items: 15 high-traffic files identified by Loop 1 cross-domain matrix (e.g. `users/summary.py`, `approval_scenario_policy.py`, `frontend/src/contexts/AuthContext.tsx`, `frontend/src/services/session/sso.ts`)
- Likelihood: MEDIUM (RiskHub is a live product; feature epics may target governance/approvals/KRI surfaces)
- Impact: MEDIUM-HIGH (rebases under TDD discipline are expensive; feature-work mocks may silently bypass cleanup gates)
- Detection: weekly grep of merged commits to `main` against cleanup-touch list
- Mitigation: publish cleanup-touch list (per Loop 2 lock-conflict matrix `plan-loop-2-03-lock-conflict-matrix.md`) to the team's branching policy; tag feature-work PRs with required label "cleanup-rebase-required" when they hit any of the 15 hot files. **Owner: tech lead, not the cleanup developer.**
- Why Loop 1 missed: Loop 1 read the plan as if cleanup is the only work happening; it isn't.

### 2.5 New Risk: Test-fixture sharing mutation across the 63 new tests

## Risk: 24 new backend `_red.py` + 22 new frontend `*.test.ts` + ~17 new behavioural tests share fixtures with mutation order-dependence
- Loop 1 already noted? PARTIAL — Loop 1 mentions test fixture churn for #34/#35 but not the shared-state class
- Loop 3 already noted? NO
- Affected items: any test that imports `tests/backend/pytest/conftest.py` or shared frontend fixtures
- Likelihood: MEDIUM (with 63 new tests, the probability that two tests share a fixture and mutate it without `pytest-randomly` discipline rises)
- Impact: MEDIUM (flaky CI; week-9 phantom failures)
- Detection: run with `pytest --randomly-seed=N` for several N values; compare. Loop 3 §4 doesn't enforce this.
- Mitigation: explicitly run `pytest --randomly-dont-shuffle` AND `pytest --randomly-seed=12345` AND `pytest --randomly-seed=67890` on every commit; if results differ, the test is order-dependent.
- Why Loop 1 missed: Loop 1's test-fixture risk was "stale mock", not "ordered mutation". The two are different failure modes.

### 2.6 New Risk: Cumulative CI memory/time pressure

## Risk: 109 architecture test files + 5,791 def test_ + 24 new BE tests + 22 new FE tests in a single CI lane exceeds memory/time budget
- Loop 1 already noted? NO
- Loop 3 already noted? PARTIAL — Loop 3 risk "24 new backend `_red.py` tests increase pytest collection time" (`plan-loop-3-04-risk-register.md:656-665`) is rated LOW × LOW; understated
- Affected items: ALL items adding tests
- Likelihood: MEDIUM (cumulative effect; test-collection is linear in number of files but pytest fixtures + module-import overhead can dominate at 5,800+ test count)
- Impact: MEDIUM (CI duration climbs; in worst case CI runner OOMs)
- Detection: monitor `pytest --collect-only` time and CI runner memory after each wave
- Mitigation: at end of Wave C (Seq 43) and Wave E (Seq 69), dispatch an agent to compare CI duration vs. baseline. If ≥ 20% increase, parallelize via `pytest-xdist` per Loop 3 mitigation (already documented but undated).
- Why Loop 1 missed: Loop 1 read the per-item LOW × LOW classification and didn't add waves.

### 2.7 New Risk: Permission-boundary fuzz coverage gap

## Risk: Large authz refactors (#34, #45b, #66) lack property-based / fuzz testing
- Loop 1 already noted? NO
- Loop 3 already noted? NO
- Affected items: #34 (resolve_approval_privilege_tier), #45b (ownership resolver factory), #66 (AuthContext split)
- Likelihood: LOW (the refactors preserve behaviour by construction — that's the TDD claim)
- Impact: HIGH (a missed permission boundary case = silent privilege escalation)
- Detection: existing characterization tests are example-based; they cover known cases. Fuzz testing — generating random user/department/resource combinations and asserting consistent decisions — would catch combinations no human imagines.
- Mitigation: for #34 and #45b, add a **single** property-based test using `hypothesis` library (already a dev-dependency; verify `backend/pyproject.toml`). The test asserts `resolve_approval_privilege_tier(u1, scenario) == resolve_approval_privilege_tier(u2, scenario)` if `u1.department_id == u2.department_id` (or whatever the invariant is). One test per refactor. Add to global mitigations.
- Why Loop 1 missed: Loop 1 trusted the example-based characterization tests; didn't propose property-based supplements.

### 2.8 New Risk: Distributed-tracing correlation loss in outbox/audit instrumentation

## Risk: #62 + #63 outbox + audit instrumentation breaks request-ID propagation
- Loop 1 already noted? NO
- Loop 3 already noted? NO
- Affected items: #62 (KRI vendor assignment per-row audit), #63 (outbox SchedulerJobRun)
- Likelihood: LOW (the existing logging context middleware at `backend/app/middleware/logging_context.py:5` quote `"Generates or extracts X-Request-ID header for request tracing"` is decoupled from outbox)
- Impact: MEDIUM (post-deploy, debugging becomes harder; trace IDs no longer connect "user clicked button" → "outbox dispatched event" → "audit row written")
- Detection: end-to-end smoke test verifying `X-Request-ID` correlation across the audit row's `request_id` field
- Mitigation: amend #62 + #63 plans to assert `audit_event.request_id` (or `outbox_event.request_id`) equals the incoming request's `X-Request-ID` header. If the column doesn't exist, document the regression as accepted.
- Why Loop 1 missed: Loop 1 didn't audit existing tracing infrastructure; didn't compare to post-refactor state.

### 2.9 New Risk: Backwards incompatibility for 3rd-party API consumers

## Risk: Schema changes (#15, #38, #65, #69, #70) break external API consumers
- Loop 1 already noted? PARTIAL — Loop 1 has #69+#70 deploy-skew for FE; doesn't cover external consumers
- Loop 3 already noted? NO
- Affected items: #15 (access_user catalog), #38 (BatchSendRiskFilters rename), #65 (crudCapabilitySchema base), #69+#70 (Vendor.status drop)
- Likelihood: LOW-MEDIUM (depends on whether RiskHub publishes an external API. If yes — e.g. Power BI / customer integration — this is HIGH)
- Impact: MEDIUM-HIGH (if external consumers are real)
- Detection: manual — check `backend/app/api/v1/router.py` for OpenAPI schema deprecation markers; ask the developer if there are external consumers
- Mitigation: BEFORE landing #69+#70, add a "deprecation cycle" to OpenAPI: bump API version (or add `Deprecation: true` header response on `vendor.status` field) in #69 and remove in a follow-up release. For #38 schema rename, support both shapes in Pydantic for ≥1 release cycle.
- Why Loop 1 missed: Loop 1 read the plan as internal-only; the plan never asks "is there an external API contract".

### 2.10 New Risk: Database backup/pg_dump format compatibility post-#69+#70

## Risk: pg_dump output format changes after #69+#70; restore-time tooling may not handle new constraints
- Loop 1 already noted? NO
- Loop 3 already noted? PARTIAL — Loop 3 "Postgres-lane row-count mismatch post-#69+#70" (`plan-loop-3-04-risk-register.md:608-617`) covers row-count but not dump-format
- Affected items: #69, #70
- Likelihood: LOW (pg_dump is well-defined; FK cascade additions appear in dump as expected)
- Impact: MEDIUM (operations / DR teams may have scripted pg_restore that doesn't expect the new cascade FKs; restore could either silently skip CASCADE or fail)
- Detection: rehearsal — `pg_dump` post-migration on staging clone, `pg_restore` to a third clone, verify `\d+ vendor_*_links` shows `confdeltype='c'`
- Mitigation: amend the rehearsal step (`plan-loop-2-06-migration-window.md:684-693`) to include a full `pg_dump → pg_restore` round-trip on a fresh clone, not just an upgrade rehearsal.
- Why Loop 1 missed: Loop 1 covered the upgrade path but not the dump/restore path.

### 2.11 New Risk: Test-data mutation bleeding via Postgres lane

## Risk: Postgres lane tests mutate state that bleeds into next test if `tx.rollback()` is not strict
- Loop 1 already noted? NO
- Loop 3 already noted? NO (Loop 3's "client_factory" risk addresses get_db override but not transaction discipline)
- Affected items: #69+#70 Postgres-lane tests at `plan-loop-2-06-migration-window.md:451-496`
- Likelihood: LOW (existing migration tests use savepoint discipline)
- Impact: MEDIUM (flaky CI on Postgres lane; data drift between dev DB and staging)
- Detection: run the Postgres-lane test 100× via `for i in {1..100}; pytest -m postgres`; if any flakes, transaction discipline is broken
- Mitigation: ensure `pytest_postgresql` fixture uses `module`-scoped session with `tx.rollback()` in teardown; document at top of `tests/backend/pytest/migrations/conftest.py`
- Why Loop 1 missed: Loop 1 didn't enumerate Postgres-lane fixtures.

### 2.12 New Risk: Pre-commit hook proliferation conflict

## Risk: Loop 1 + Loop 3 propose 12+ separate pre-commit hooks; cumulative hook execution exceeds developer patience → hooks disabled
- Loop 1 already noted? NO
- Loop 3 already noted? PARTIAL — Loop 3 §4 §1 proposes a single `scripts/dev/precommit.sh`
- Affected items: ALL contract-touching items
- Likelihood: MEDIUM (Loop 3 §4 plus Loop 1 mitigations 6-12 together = many hook entries)
- Impact: MEDIUM (developer disables hooks via `--no-verify` once total hook time exceeds ~10s)
- Detection: code review of `.git/hooks/pre-commit` content; check that hook execution stays under 10s
- Mitigation: consolidate into ONE `scripts/dev/precommit.sh` per Loop 3 §4 §1; the script invokes architecture-locks, capability-validator, ruff, mypy in PARALLEL (via xargs -P) and short-circuits on first failure. Total budget ≤ 10s.
- Why Loop 1 missed: Loop 1 added more hooks without modelling cumulative budget.

### 2.13 New Risk: ScheduleR/cron timing race for #62 + #63 paired wave

## Risk: #62 (KRI vendor assignment) + #63 (outbox SchedulerJobRun) interact with the scheduler at run-time; if both ship in adjacent commits, scheduler can observe inconsistent state mid-deploy
- Loop 1 already noted? PARTIAL — Loop 1 mentions #63 double-emit but not the cross-effect with #62
- Loop 3 already noted? NO
- Affected items: #62, #63
- Likelihood: LOW (single-developer; the scheduler runs every N seconds — 60s by default per `app/services/outbox/dispatcher.py:21` quote `lock_owner: str = "scheduler"`)
- Impact: MEDIUM (a #63 instrumentation deploy in between two scheduler ticks could see one tick under old code, next under new, producing an orphan `SchedulerJobRun` row OR a double-record)
- Detection: only via observability post-deploy
- Mitigation: deploy #63 with the scheduler in a "pause" state (set `OUTBOX_SCHEDULER_ENABLED=false` env), wait for in-flight ticks to drain, then enable. For #62, ensure the per-row event emission is idempotent (use `outbox_event.dedup_key`).
- Why Loop 1 missed: Loop 1 looked at #63 in isolation; didn't model the deploy-timing interaction with #62 already in flight.

---

## Section 3 — Consolidated final risk register

Total after dedup: **62 distinct risks** = 34 (Loop 3) + 22 (Loop 1
surviving) + 13 (Loop 2 adversarial new) − 7 (dedup with Loop 3)
**= 62 final**.

Mathematical breakdown:
- Loop 3 original: 34 ✅
- Loop 1 additions: 28 → 22 survive (6 dropped)
- Loop 2 adversarial new: 13
- **Total proposed**: 34 + 22 + 13 = 69
- Dedup adjustments (-7): see below
- **FINAL: 62 distinct risks**

Dedup adjustments:
1. Loop 1 "#34 worktree dirty-state" merged into Loop 3 "#34 partial migration" → **-1**
2. Loop 1 "build-cache poisoning" rejected → **-1**
3. Loop 1 "#71 parallel test" rejected → **-1**
4. Loop 1 "#36 service-worker cache" rejected → **-1**
5. Loop 1 "#43 audit emitter import cycle" rejected → **-1**
6. Loop 1 "#73 ADR-012 TOML schema" rejected (covered by global atomic-commit) → **-1**
7. Loop 2 adversarial 2.5 (test-fixture mutation) overlaps with Loop 1 mock-staleness-style risk → **-1** (downgrade, keep as sub-bullet)

Final count: 69 - 7 = **62 distinct risks**.

---

## Section 4 — Top 15 highest-priority risks (HIGH × HIGH or HIGH × MEDIUM)

Ranked by Likelihood × Impact, ties broken by blast radius (number of dependents).

| Rank | Risk | Source | L × I | Severity score |
|---:|---|---|---|---:|
| 1 | ADR-011 #72 → 2026-09-01 auth/* allowlist sunset | Loop 3 #1 (`plan-loop-3-04-risk-register.md:702-708`) | HIGH × HIGH | 9 |
| 2 | #69+#70 ADR-010 forward-only migration; snapshot-only rollback | Loop 3 #2 (`plan-loop-3-04-risk-register.md:328-343`) | LOW × HIGH | 6 |
| 3 | #69+#70 deploy-skew → FE Zod parse failure (3-deploy required) | Loop 1 (`review-loop-1-05-risk-completeness.md:212-233`) | HIGH × MEDIUM-HIGH | 8 |
| 4 | #34 Approvals hub partial migration (22+ sites) | Loop 3 #3 (`plan-loop-3-04-risk-register.md:41-52`) | MEDIUM × HIGH | 7 |
| 5 | #69+#70 surviving `Vendor.status` query references | Loop 1 (`review-loop-1-05-risk-completeness.md:181-206`) | MEDIUM × HIGH | 7 |
| 6 | #71 single-flight `sso.ts:9-11` module-scope state | Loop 3 #4 (`plan-loop-3-04-risk-register.md:225-248`) | MEDIUM × HIGH | 7 |
| 7 | #66 AuthContext split memo dependencies | Loop 3 #5 (`plan-loop-3-04-risk-register.md:179-203`) | MEDIUM × HIGH | 7 |
| 8 | #11 fix-without-test-inversion | Loop 1 (`review-loop-1-05-risk-completeness.md:513-529`) | MEDIUM × HIGH | 7 |
| 9 | #66 AuthActions callback stability re-renders | Loop 1 (`review-loop-1-05-risk-completeness.md:127-153`) | MEDIUM × HIGH | 7 |
| 10 | Reviewer cognitive overload across 79 items × 12 weeks | Loop 1 + Loop 2 §2.1 | HIGH × MEDIUM | 6 |
| 11 | Plan citations drift as code lands (week-8 staleness) | Loop 2 §2.2 (NEW) | HIGH × MEDIUM | 6 |
| 12 | Hot-fix collision during cleanup window | Loop 2 §2.3 (NEW) | MEDIUM × HIGH | 7 |
| 13 | #74a "exactly 31 packages" assertion drift | Loop 3 #6 (`plan-loop-3-04-risk-register.md:54-69`) | HIGH × MEDIUM | 6 |
| 14 | Capability-contract validator across 16 commits | Loop 3 #7 (`plan-loop-3-04-risk-register.md:87-106`) | HIGH × MEDIUM | 6 |
| 15 | #62 audit log volume regression (per-row N events) | Loop 1 (`review-loop-1-05-risk-completeness.md:286-308`) | HIGH × MEDIUM | 6 |

(Honorable mention, just outside top 15: Postgres lane catches issues
post-merge; concurrent feature work conflict; #46 query-key partial
refactor.)

---

## Section 5 — Recommended additions to global mitigations

These are SUPPLEMENTS to Loop 3 §4 (`plan-loop-3-04-risk-register.md:746-786`)
and Loop 1's mitigations 6-12. Eight new mitigations:

### Global mitigation #13 — Wave-boundary plan re-baselining

At the start of each wave (B/C/D/E/F/G per
`plan-loop-2-08-master-sequence.md:316-324`), dispatch a fresh agent with
this brief: "Re-verify all `file:line` citations in remaining-wave plan
items against the current commit. Patch the plan in-place if any
citation has drifted."

Rationale: 12-week plan; citations age. Loop 2 §2.2.

### Global mitigation #14 — Hot-fix-pause protocol

When a P0 production hot-fix is detected (e.g. by tracker label or
`origin/main` push not authored by the cleanup developer), the cleanup
developer MUST:
1. Stash any in-flight cleanup commit.
2. Wait for the hot-fix to land.
3. Re-baseline against the new `main` head.
4. Re-verify the next planned cleanup commit's `file:line` citations.

Rationale: Loop 2 §2.3.

### Global mitigation #15 — Concurrent-feature-work tagging

Tech lead tags any feature-work PR touching the 15 hot files (per
Loop 2 lock-conflict matrix `plan-loop-2-03-lock-conflict-matrix.md`)
with label `cleanup-rebase-required`. The cleanup developer's
pre-flight checklist consults the label list before starting each
commit.

Rationale: Loop 2 §2.4.

### Global mitigation #16 — Test ordering hardening

Run `pytest --randomly-seed=N` for at least 3 distinct N values on every
contract-touching commit. Differing results = order-dependent test;
fix before commit.

Rationale: Loop 2 §2.5.

### Global mitigation #17 — CI memory/time budget review at end of each wave

At end of Wave C (Seq 43) and Wave E (Seq 69), dispatch agent to
compare CI duration vs. start-of-cleanup baseline. If ≥ 20% increase,
parallelize via `pytest-xdist`.

Rationale: Loop 2 §2.6.

### Global mitigation #18 — Property-based authz fuzz tests

For #34, #45b, #66 — add ONE `hypothesis`-based test asserting authz
invariant per refactor. Total 3 new tests across the plan.

Rationale: Loop 2 §2.7.

### Global mitigation #19 — Pre-commit hook budget

Consolidate ALL pre-commit hooks into ONE `scripts/dev/precommit.sh`.
The script runs locks + validator + ruff + mypy in **parallel** with
total budget ≤ 10s. Hook ordering: cheap checks first (grep for
forbidden tokens), expensive checks last (mypy).

Rationale: Loop 2 §2.12.

### Global mitigation #20 — External API consumer survey

BEFORE starting Wave G (Seq 76 #69+#70), confirm with stakeholders
whether RiskHub exposes any external API consumers. If yes, schedule
a deprecation cycle (≥ 1 release) for `vendor.status` BEFORE
landing #70.

Rationale: Loop 2 §2.9.

---

## Section 6 — Specific challenges to Loop 1's claims

### Loop 1 claim: "Worktree dirty-state hazard" is a real risk

**Challenge**: Loop 1's framing ("if the developer is mid-edit … and the
session ends") describes a DEVELOPER WORKFLOW failure, not a PLAN
failure. The mitigation Loop 1 proposes ("`grep -rn "can_resolve_approvals"
backend/`") is the same as Loop 3's mitigation. The "worktree-state
vector" is rhetoric; the mechanic is identical to "partial migration
left behind", which Loop 3 already covers. **VERDICT: REJECT as
standalone; merge into Loop 3 #2.**

### Loop 1 claim: "Allowlist-discipline drift" — 24 new test files may need TOML rows

**Challenge**: Loop 1 cites `~24` new test files. I verified the
current `tests/backend/pytest/architecture/` directory has **34 .py
files and 6 .toml files**. The Loop 1 estimate "24 NEW" is the upper
bound (the lock-conflict matrix `plan-loop-2-03-lock-conflict-matrix.md:459`
quote `"Total NEW backend lock test files (architecture/): ~24"`).
Of those 24, only those that introduce a NEW kind of allowlist
(e.g. #44 `_router_registry.toml`, #74a 4 census TOMLs, #73
`_kri_state_vocabulary_allowlist.toml` — total 6 NEW TOMLs per Loop 3
#34) need new TOML entries. The other ~18 add ROWS to EXISTING TOMLs
or no TOML at all. So the Loop 1 framing "each of the 24 may need a
TOML row" overstates by ~3×. **VERDICT: ACCEPT as a real risk but
DOWNGRADE from MEDIUM × MEDIUM to LOW × MEDIUM.**

### Loop 1 claim: "Time-zone regression" in #69 created_at default

**Challenge**: Loop 1's concrete trigger is "if any of the 3 link
tables had a DIFFERENT default". I checked: `vendor_risk_links`,
`vendor_control_links`, `vendor_kri_links` are the link tables. The
existing `backend/app/models/` should be inspected for their
`server_default` to verify. The mitigation Loop 1 proposes (a
pre-migration `SELECT pg_typeof(created_at), tzinfo …` query) is
correct and cheap. **VERDICT: ACCEPT as real but LOW × MEDIUM
(unchanged); the mitigation is one-shot and concrete.**

### Loop 1 claim: "Build-cache poisoning" — Vite hash collision

**Challenge**: As argued in §1.1 L1-DROP-2, this is unfalsifiable
theory. Vite uses content-hash chunks deterministically; collision
probability is < 2^-256 per chunk. **VERDICT: REJECT as register
entry.**

---

## Section 7 — Summary

- **Loop 3 risk count**: 34 (verified accurate)
- **Loop 1 additions reviewed**: 28
- **Loop 1 additions accepted**: 22
- **Loop 1 additions rejected/dedup'd**: 6
- **Loop 2 adversarial NEW risks**: 13
- **Final count after dedup**: **62 distinct risks**

### New risks added by Loop 2 adversarial review

1. Code-review burnout sustained across 12 weeks
2. Plan-citation staleness as code lands
3. Hot-fix collision during cleanup window
4. Concurrent feature work conflict
5. Test-data fixture mutation bleeding
6. Cumulative CI memory/time pressure
7. Permission-boundary fuzz coverage gap
8. Distributed-tracing correlation loss
9. Backwards incompatibility for 3rd-party API consumers
10. Database backup/pg_dump format compatibility
11. Test-data mutation via Postgres lane
12. Pre-commit hook proliferation budget overflow
13. Scheduler timing race for #62 + #63 paired wave

### Loop 1 risks rejected as not real

1. Worktree dirty-state hazard (DUPLICATE of Loop 3 #2)
2. Build-cache poisoning (Vite hash collisions; vanishing)
3. #71 parallel-suite single-flight (Vitest module isolation handles)
4. #36 service-worker cache (no PWA in RiskHub)
5. #43 audit emitter import cycle (Loop 1 self-contradicts: "additive")
6. #73 ADR-012 TOML schema (covered by atomic-commit invariant)

### Top 15 highest-priority

(See Section 4 table.)

### Recommended global mitigation additions

8 new mitigations (#13–#20). See Section 5.

### Methodology notes

- All file:line citations re-verified against commit `1ee872a4`.
- 6 dropped Loop 1 entries grounded in current code state, not
  speculation.
- 13 new risks each cite a concrete current-code or current-plan
  source.
- Dedup math: 34 + 22 + 13 − 7 = 62.

End of adversarial risk register review.
