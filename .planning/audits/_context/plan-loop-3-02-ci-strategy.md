# Phase 3 Loop 3 — CI Strategy (per-PR gating for the 77-item plan)

Working dir: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Anchor commit: `1ee872a4`.
Source CI: `.github/workflows/*.yml` (8 workflows) + `scripts/Makefile`.
Source plan: Loop 2 master sequence + validator schedule + migration window.

CRITICAL CONSTRAINTS:
- Single sequential developer; TDD red-green-refactor.
- Doc/lock-only Reject is INVALID; Defers planned (#69+#70 migration window, etc.).
- E2E Playwright is **out of scope** for plan gates per user decision.
- Architecture-locks ratchet is mandatory across the entire 77-item plan
  (every PR must pass `make -f scripts/Makefile test-architecture-locks`).

---

## 1. CI lane inventory (existing)

Each lane below is read directly from `.github/workflows/` and `scripts/Makefile`.
"Status" describes today's behaviour; "Trigger" lists the GitHub events that
fire it; "Gate" lists whether failure blocks merge.

### 1.1 `lint.yml` — three jobs

| Job | What it runs | Cite | Wall-clock |
|---|---|---|---|
| `frontend-unit-tests` | `npm run test:coverage` | `.github/workflows/lint.yml:33-35` | ~3-5 min |
| `backend-quality` | `ruff check`, `mypy --config-file mypy.ini app`, `python3 scripts/tools/suppression_budget.py` | `lint.yml:63-79` | ~2-4 min |
| `lint` (Frontend + Repo Contracts) | `npm run lint`, `tsc --noEmit`, `npm run build`, `make quality-repo-contracts` (which runs `validate_authz_capability_contract.py --base-ref ...`), `validate_production_contract_docs.py`, `validate_deprecated_imports.py` | `lint.yml:113-161` | ~5-7 min |

Gate: BLOCKING on every PR (no `continue-on-error`). Triggers: `pull_request: [main, develop]`, `push: [main, develop]` per `lint.yml:3-7`.

Note: the `lint` job calls `make -f scripts/Makefile quality-repo-contracts` which
internally runs `python3 scripts/security/validate_authz_capability_contract.py
--base-ref "$AUTHZ_CONTRACT_BASE_REF"` (Makefile `:160`). This means **the
capability-contract validator runs on every PR via the lint workflow**, not as
a separate workflow. The 16 validator-touching items from Loop 2 A5 are gated
here.

### 1.2 `backend-postgres.yml` — two jobs

| Job | What it runs | Cite | Wall-clock |
|---|---|---|---|
| `sqlite-tests` | `pytest -m "not postgres and not benchmark" -q` | `backend-postgres.yml:38-39` | ~6-10 min (cov) |
| `postgres-tests` | `make -f scripts/Makefile test-postgres-ci` (collects + runs `-m postgres` + 4 named files) | `backend-postgres.yml:80-83`; Makefile `:121-132` | ~5-8 min |

Gate: BOTH BLOCKING (no `continue-on-error`). Triggers: `pull_request: [main,
develop]`, `push: [main, develop]` per `backend-postgres.yml:3-7`.

**Important**: despite the user-task framing of "Postgres lane may run nightly,
advisory", the **current `backend-postgres.yml:80-83` is BLOCKING on every PR**.
The migration bundle (#69+#70) is therefore already gated by an existing
mandatory lane — there is no need to promote the Postgres lane; we only need
to ensure the new RED tests are placed under the `-m postgres` marker so they
run on this lane.

### 1.3 `maintenance-governance.yml` — three jobs (path-filtered)

| Job | What it runs | Cite | Wall-clock |
|---|---|---|---|
| `docs-governance` | `make -f scripts/Makefile docs-topology-consistency` (incl. `check_docs_contract.py`, `readme_coverage.py audit`, `docs_tree_audit.py --max-root-hops 3 --fail-on-unreachable`, `structure_metrics_guard.py`), `validate_production_contract_docs.py`, `validate_deprecated_imports.py`, `validate_lint_ratchet_docs.py` | `maintenance-governance.yml:38-56` | ~2-3 min |
| `frontend-maintenance` | `npm run quality:debt`, `npm run cleanup:deadcode`, `validate-no-inline-styles.mjs` | `maintenance-governance.yml:88-105` | ~3-4 min |
| `backend-maintenance-informational` | `suppression_budget.py`, full-tree ruff (informational), full-tree mypy | `maintenance-governance.yml:120-156` | ~2-4 min |

Gate: `docs-governance` and `frontend-maintenance` are BLOCKING.
`backend-maintenance-informational` carries `continue-on-error: true`
(`maintenance-governance.yml:123`). Triggers: `pull_request` PATH-FILTERED to
`AGENTS.md`, `.planning/**`, `docs/**`, `scripts/**`, `frontend/scripts/**`,
`backend/{mypy.ini,ruff.toml}`, `.github/workflows/**`
(`maintenance-governance.yml:6-16`); also `cron '30 1 * * *'` nightly.

**Critical**: this workflow is the ONLY lane that runs the README 3-hop
reachability invariant (`docs-topology-consistency` Makefile target). It is
PATH-FILTERED, so PRs that do not touch the listed paths SKIP this lane. See
§7 GAPS — for plan items that touch new READMEs (e.g. #61 `_graph_directory/`,
#62 `_vendor_links/kri_assignment.py`, #74a/b new bounded-context TOMLs),
the path filter activates this lane and the docs invariants run.

### 1.4 `e2e.yml` — two jobs

| Job | What it runs | Cite | Wall-clock |
|---|---|---|---|
| `e2e-tests` | `npx playwright test -c playwright.config.ts --project=chromium` | `e2e.yml:112-116` | ~15-25 min |
| `production-profile-smoke` | uvicorn boot + curl health/auth/docs/headers asserts | `e2e.yml:182-264` | ~5-8 min |

Gate: BOTH BLOCKING today (no `continue-on-error`). Triggers: same as
backend-postgres.

**User scope decision**: E2E is out of scope for the plan-gate strategy. The
plan does not introduce new e2e specs; it does not require e2e changes for
any of the 77 items. **Recommendation**: leave `e2e.yml` as-is (existing PRs
already gate against it); the plan does not touch it. The
`production-profile-smoke` sub-job is independently valuable and stays
mandatory regardless of e2e classification.

### 1.5 `security.yml` — eight jobs

| Job | What it runs | Cite | Wall-clock |
|---|---|---|---|
| `public-repo-hygiene` | `validate_public_repo_hygiene.py` | `security.yml:34-35` | ~30 s |
| `workflow-pin-validation` | `validate_workflow_pins.py`, `validate_repo_hardening.py` | `security.yml:43-48` | ~30 s |
| `python-security` | bandit, pip-audit | `security.yml:76-118` | ~3-5 min |
| `frontend-security` | `npm audit --audit-level=high` | `security.yml:154-161` | ~1-2 min |
| `frontend-i18n` | `npm run i18n:test` | `security.yml:189-193` | ~1-2 min |
| `redis-resilience-integration` | `pytest -m redis_integration` | `security.yml:206-218` | ~3-5 min (nightly only) |
| `container-security` | Trivy + Grype on built backend/frontend images | `security.yml:230-305` | ~10-15 min |
| `secrets-detection` | Gitleaks | `security.yml:332-355` | ~1-2 min |
| `security-headers` | `pytest test_security_headers.py` | `security.yml:357-384` | ~1-2 min |

Gate: all BLOCKING except `redis-resilience-integration` which has
`continue-on-error: true` (`security.yml:199`) AND is `if: github.event_name == 'schedule'` (`security.yml:200`) so it never runs on PRs.
Triggers: `pull_request: [main, develop]`, `push: [main, develop]`,
`cron '0 2 * * *'` and `cron '0 0 * * 0'` (`security.yml:7-15`).

### 1.6 `startup-smoke.yml` — one job

`docker-onboarding-smoke` runs `./scripts/compose.sh up`, then curls
`/livez`/`/readyz`/`/health`/`/auth/config`/`/docs` and validates response
shapes (`startup-smoke.yml:14-71`). Gate: BLOCKING. Triggers: only `push:
[main, develop]` and `cron '45 2 * * *'` and `workflow_dispatch`
(`startup-smoke.yml:3-8`). **Does NOT run on PRs.** Wall-clock: ~10-15 min.

### 1.7 `release-parity-pr.yml` — `workflow_dispatch` only

Manual trigger; never runs on PRs (`release-parity-pr.yml:3-4`). Out of scope
for the plan's PR-gate strategy.

### 1.8 `release-parity-fast.yml` — non-blocking nightly

`continue-on-error: true` (`release-parity-fast.yml:14`); only runs on
`push: [main]` and nightly cron `:5`. Out of scope for the plan's PR-gate
strategy.

### 1.9 `release.yml` — tag-triggered

Only fires on `push: tags: ['v*']` (`release.yml:5-6`). Out of scope for the
plan's PR-gate strategy.

---

## 2. CI lane → mandatory/advisory classification (proposed plan-gate map)

For the 77-item plan, classify each lane as **MANDATORY** (must pass before
merge) or **ADVISORY** (informational, doesn't block). This re-states the
current state where it agrees with the plan, and proposes changes where it
diverges.

| Lane (workflow:job) | Current gate | Plan-gate proposal | Why |
|---|---|---|---|
| `lint.yml:frontend-unit-tests` | BLOCKING | **MANDATORY** | Frontend coverage threshold (lines ≥58, branches ≥47) is a ratchet — every FE item (~19 frontend items + #37/#39 capability builders + auth-related items) must keep coverage from sliding. |
| `lint.yml:backend-quality` (ruff + mypy + suppression-budget) | BLOCKING | **MANDATORY** | Every backend file change touches ruff + mypy. Suppression budget is a ratchet allowlist that no plan item should breach. |
| `lint.yml:lint` (FE lint + tsc + build + repo-contracts including authz validator + production-contract-docs + deprecated-imports) | BLOCKING | **MANDATORY** | This is where the **capability-contract validator runs**. Validator-touching items (16 from Loop 2 A5) gate here. |
| `backend-postgres.yml:sqlite-tests` | BLOCKING | **MANDATORY** | Default backend regression. Every backend code/test change needs this. |
| `backend-postgres.yml:postgres-tests` | BLOCKING | **MANDATORY** | The migration bundle (#69+#70) and the new postgres-marked tests in `tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py` (per `plan-loop-2-06-migration-window.md:451-496`) MUST land green. Already mandatory; stays mandatory. |
| `maintenance-governance.yml:docs-governance` | BLOCKING (path-filtered) | **MANDATORY when path-touched** | Items that touch READMEs, ADRs, or `.planning/**` activate this. ALL ADRs (#72/#73/#74b), all bounded-context README adds (#61/#62/#74a/b), all doc-touch items per Loop 2 A4 trigger it. |
| `maintenance-governance.yml:frontend-maintenance` | BLOCKING (path-filtered) | **MANDATORY when path-touched** | FE debt-budget + cleanup audit. All FE items (~19) gate here. |
| `maintenance-governance.yml:backend-maintenance-informational` | ADVISORY (`continue-on-error: true`) | **ADVISORY** (keep) | Full-tree ruff/mypy noise; informational only. |
| `e2e.yml:e2e-tests` | BLOCKING | **OUT OF SCOPE per user** — leave as-is | User decision. Plan introduces no e2e specs. |
| `e2e.yml:production-profile-smoke` | BLOCKING | **MANDATORY** | Production auth/CORS/CSP smoke; #66 AuthContext split could regress this. Keep mandatory. |
| `security.yml:public-repo-hygiene` | BLOCKING | **MANDATORY** | All items. |
| `security.yml:workflow-pin-validation` | BLOCKING | **MANDATORY** | All items. |
| `security.yml:python-security` (bandit + pip-audit) | BLOCKING | **MANDATORY** | All backend items. |
| `security.yml:frontend-security` (npm audit) | BLOCKING | **MANDATORY** | All FE items. |
| `security.yml:frontend-i18n` | BLOCKING | **MANDATORY** | FE items that touch i18n strings (likely #66, #68, possibly #36). |
| `security.yml:redis-resilience-integration` | ADVISORY (cron-only) | **ADVISORY** (keep) | Nightly only; not relevant to plan items. |
| `security.yml:container-security` (Trivy + Grype) | BLOCKING | **MANDATORY** | All items (catches dep drift, esp. requirements changes from validator/test work). |
| `security.yml:secrets-detection` (Gitleaks) | BLOCKING | **MANDATORY** | All items. |
| `security.yml:security-headers` | BLOCKING | **MANDATORY** | Items that touch FastAPI middleware (#37 governance, #66 AuthContext indirectly via prod-profile, #44 path-prefix registry). |
| `startup-smoke.yml` | non-PR (push/cron) | **N/A for PRs** | Existing post-merge safety net. |
| `release-parity-{pr,fast}.yml` | manual / nightly | **N/A for PRs** | Out of plan scope. |
| `release.yml` | tag-only | **N/A for PRs** | Out of plan scope. |

---

## 3. Per-item × CI lane matrix (77 items)

Legend:
- **B** = `lint.yml:backend-quality` (ruff + mypy)
- **F** = `lint.yml:lint` (frontend lint + tsc + build + authz validator + repo-contracts)
- **U** = `lint.yml:frontend-unit-tests` (vitest coverage)
- **S** = `backend-postgres.yml:sqlite-tests` (pytest default)
- **P** = `backend-postgres.yml:postgres-tests` (pytest -m postgres)
- **D** = `maintenance-governance.yml:docs-governance`
- **M** = `maintenance-governance.yml:frontend-maintenance`
- **A** = architecture-locks (runs WITHIN `S` because architecture tests live in `tests/backend/pytest/architecture/` and are NOT marked `postgres`/`benchmark`, so default `pytest -m "not postgres and not benchmark"` covers them; verified in `06-test-surface.md:11-19,29-31`).
- **V** = capability-contract validator (runs WITHIN `F` via `quality-repo-contracts` Makefile target, see `lint.yml:151` and `Makefile:160`).
- **PROD** = `e2e.yml:production-profile-smoke`

Every PR runs B + F + U + S + (P always BLOCKING currently) + (D conditional on
path filter) + (M conditional on path filter) + security + startup. The matrix
below highlights which items make each lane **load-bearing** (a known-RED test
exists for that lane).

| Seq | Item | Domain | Lanes that gate (load-bearing) | Notes |
|---:|---|---|---|---|
| 1 | #72 | crosscut/ADR | D | New ADR-011 + index entries (`AGENTS.md`, `docs/README.md`, `docs/DOCUMENTATION_TREE.md`); `test_w11_docs_index_completeness_red.py` triggers in S/A. |
| 2 | #73 | kris/ADR | D | New ADR-012; same docs invariants as #72. |
| 3 | #74a | crosscut/ADR | D, S/A | 31-package census draft; new bounded-context TOMLs (4 new TOMLs) — current architecture-locks Makefile target does NOT enforce them yet (see GAPS §7.2). Census output is .planning/** files (TODO: lock added in #74b). |
| 4 | #74b | crosscut/ADR | D, S/A | ADR-007 amendment text; once census TOMLs are validated, add architecture lock to enforce. |
| 5 | #10 | endpoints/Reject | D | Doc-only verify; AGENTS.md `:162` cite stays. `test_w11_docs_index_completeness_red.py` covers in S/A. |
| 6 | #57 | vendor/Reject | D, S/A | Quarterly comparison facade reject; `test_architecture_deepening_contracts.py:559-569` lock asserts in S/A. |
| 7 | #12 | endpoints | B, S | `users/summary.py` narrowing; new pytest in S. |
| 8 | #13 | vendor | B, S, F (V), D | Validator-touching: drops `vendor_link_helpers.py` from `service_policy` cells in capability contract md/json (per `plan-loop-2-04-doc-touch-matrix.md:122,151`). |
| 9 | #1 | risks | B, S | Drop `validate_risk_type` re-export. |
| 10 | #19 | risks | B, S | Risk-type validation onto service policy; HTTP 400 parity test in S. |
| 11 | #11 | risks | B, S | `risk.process` → `risk.name`; regression test in S. |
| 12 | #14 | issues | B, S | Outbox-only; new lock test in S/A; `_audit_matrix.toml` may shift if a new outbox shape is added (`04-architecture-locks.md:120-135`). |
| 13 | #15 | endpoints | B, S, F (V), U, D | Validator-touching NEW catalog surface (`access_user`, 8th catalog object). Pydantic↔Zod parity check 4 fires in V. New surface row in capability-catalog.json must round-trip. Frontend types added → U coverage. |
| 14 | #37 | frontend (BE) | B, S, F (V) | Validator-touching: `_can_view_governance` mirror replaced by `build_me_capabilities` (cap-contract regression check). |
| 15 | #2 | issues | B, S | Drop 4 underscore aliases; lock unchanged. |
| 16 | #3 | kris | F, U, M | Delete `kriFormWorkflow.ts`; coverage and debt-budget gates fire. |
| 17 | #4 | frontend | F, U, M | Same shape as #3. |
| 18 | #5 | frontend | F, U, M | Same shape. |
| 19 | #6 | frontend | F, U, M | Same shape. |
| 20 | #7 | approvals | B, S | Endpoint shim delete. |
| 21 | #41 | issues | B, S | Bidirectional alias delete. |
| 22 | #50 | kris | B, S, F (V), D | Validator-touching: `kri_history/submission.py` drops from md `:117,118,161` + json `:389,411` (`plan-loop-2-05-validator-schedule.md:223-234`). |
| 23 | #52 | kris | B, S | Lock update only. |
| 24 | #53 | issues | B, S | Drop facade; `test_w11b_test_infra_polish_red.py` may need updating. |
| 25 | #54 | approvals | B, S | Inline aggregator. |
| 26 | #75 | approvals | B, S | Delete-and-consolidate. |
| 27 | #18 | approvals | B, S | Approval API tests. |
| 28 | #20 | risks | B, S, D | AGENTS+ENDPOINT_INVARIANTS bump (date `:21-22`); doc-touch via `D`. |
| 29 | #21 | endpoints | B, S | Architecture lock update. |
| 30 | #25 | kris | B, S | KRI dept-scope helper. |
| 31 | #26 | kris | F, U, M | Delete `KRIForm.tsx` shim. |
| 32 | #29 | issues | B, S | Source-type vocabulary canonicalization. |
| 33 | #33 | approvals | F, U, M | Drop KRI variant banner. |
| 34 | #35 | frontend | F, U, M | Delete `usePermissions` hook. |
| 35 | #36 | frontend | F, U, M | Refactor `BusinessRouteGuards.tsx`. |
| 36 | #48 | frontend | F, U, M | Merge error helpers. |
| 37 | #64 | frontend | F, U, M | Extract QueryClient defaults. |
| 38 | #47 | frontend | F, U, M | Extract session-refresh retry policy. |
| 39 | #22 | frontend | F, U, M | `ControlForm.tsx` shim delete. |
| 40 | #23 | frontend | F, U, M | Inline `controlFormUtils`. |
| 41 | #55 | crosscut | B, S, F (V), D | Validator-touching: drops `access_user_service.py` from sensitive_change_paths + service_policy. Atomic doc-touch enforced by validator check 7. |
| 42 | #24 | kris | B, S, F (V), D | Validator-touching atomic with #51: 5 md cells + 5 json strings (`plan-loop-2-05-validator-schedule.md:199-220`). |
| 43 | #51 | kris | B, S, F (V), D | Atomic with #24, same gates. |
| 44 | #56 | crosscut | B, S, F (V), D | Validator-touching atomic with #61: directory_identity_service shim. |
| 45 | #61 | crosscut | B, S, F (V), D | Validator-touching atomic with #56: graph_directory move. New README in `_graph_directory/` triggers `D` 3-hop. |
| 46 | #17 | vendor | B, S | Architecture lock update. |
| 47 | #49 | endpoints | B, S | Inline monitoring wrapper. |
| 48 | #59 | endpoints | B, S, D | Consolidate `_monitoring_*` packages; docs+lock; potential README move. |
| 49 | #9 | approvals | B, S | Delete-and-redirect duplicate `can_user_view_approval_resource`. |
| 50 | #34 | approvals | B, S, F (V), D | Validator-touching: §Vocabulary append "privilege tier"; check 5 enforces 9-section markdown invariant. |
| 51 | #27 | issues | B, S | Issue-loading duplicate deletion. |
| 52 | #8 | issues | B, S | Source-validation split. |
| 53 | #28 | issues | B, S | Issue source-mutation triplicate collapse. |
| 54 | #30 | issues | B, S, D | `issues/_shared/__init__.py` re-export pruning + allowlist update. |
| 55 | #16 | vendor | B, S, D | OpenAPI tombstone (410s) + tests; OpenAPI doc surface in `D`. |
| 56 | #38 | endpoints | B, S, D | Move 8 inline endpoint Pydantic models to schemas; architecture allowlist + AGENTS.md `:162` invariants in `D` and S/A. |
| 57 | #31 | vendor | B, S | Vendor reporting row formatters. |
| 58 | #32 | frontend | F, U, M | Generic vendor linked-entity tab. |
| 59 | #43 | endpoints | B, S | Audit adapter-emitter helper; `_audit_matrix.toml` invariant in S/A (`test_w7_audit_adapter_completeness_red.py`). |
| 60 | #44 | endpoints | B, S, D | Centralize guarded path-prefix registry; invariant tests; possibly new README. |
| 61 | #42 | crosscut | B, S | `ActorPayloadModel` shared base. |
| 62 | #58 | endpoints | B, S | Delete `OrphanedItemService` facade. |
| 63 | #63 | endpoints | B, S | Outbox dispatch instrumentation; admin runtime state preserved. |
| 64 | #46 | frontend | F, U, M | Promote resource query-key factories; typed factory module. |
| 65 | #65 | frontend | F (V), U, M | Validator-touching: `crudCapabilitySchema` Zod base; check 4 (Pydantic↔Zod parity) fires across 4 surfaces (risks/controls/kris/vendors). |
| 66 | #67 | frontend | F, U, M | Generic `useResourcePanelQuery`. |
| 67 | #39 | frontend (BE) | B, S, F (V), U, M, D | Validator-touching NEW capability builder. AdminConsoleCapabilities surface; check 4 + check 2 (sensitive_change_paths). |
| 68 | #40 | crosscut | B, S, D | Re-cluster admin sub-routers; AGENTS.md `:157` endpoint package list invariant in `D`. |
| 69 | #62 | kris | B, S, F (V), D | Validator-touching: path rewrite to `_vendor_links/kri_assignment.py`; check 2 + check 7. New README touch may activate `D`. |
| 70 | #45a | crosscut | B, S | Ownership prerequisite characterization tests. |
| 71 | #45b | crosscut | B, S | Ownership resolver factory. |
| 72 | #66 | frontend | F (V), U, M, D, PROD | Validator-touching: AuthContext split; check 7 (frontend local-gate per-file allowlist). New SessionContext / PreferencesContext / AuthActionsContext files trigger validator allowlist update. PROD-profile smoke catches auth boot regressions. |
| 73 | #68 | frontend | F, U, M | `WidgetShell` + scoped query selector; dashboard regression plan. |
| 74 | #60 | approvals | B, S, F (V), D | Validator-touching: §Vocabulary "privilege context" append (check 5). |
| 75 | #71 | frontend | F (V), U, M, D | Validator-touching: `services/session/` 8→4 merge; sensitive_change_paths path rewrite. |
| 76 | #69 | vendor | B, S, **P**, D | **Migration window — postgres-lane critical**. New tests under `tests/backend/pytest/migrations/test_vendor_link_*` ARE `pytestmark = pytest.mark.postgres` (per `plan-loop-2-06-migration-window.md:457`). MUST pass on `P`. New AbstractVendorLink mixin docs in `models/README.md` trigger `D`. |
| 77 | #70 | vendor | B, S, **P**, D | Atomic with #69, same gates. Validator regression check (verify `VendorCapabilities` field-shape unchanged). |

---

## 4. Mandatory vs advisory summary table

| Lane category | Mandatory? | Items requiring a load-bearing gate | Notes |
|---|---|---|---|
| Backend ruff/mypy (`B`) | **Yes — all PRs** | 77/77 (every PR runs ruff+mypy) | Existing `lint.yml:backend-quality`. |
| Frontend lint+tsc+build (`F`) | **Yes — all PRs** | 77/77 (every PR runs lint+tsc+build); 16 are validator-load-bearing | The `lint.yml:lint` job hosts the validator. |
| Frontend vitest coverage (`U`) | **Yes — all PRs** | 19 frontend items + 4 BE items that touch FE types (#15, #37, #39, #65) | Existing `lint.yml:frontend-unit-tests`. Coverage thresholds: lines 58, branches 47, functions 47, statements 57 (`06-test-surface.md:548-549`). |
| Backend pytest sqlite (`S`) | **Yes — all PRs** | 77/77 | Includes architecture-locks (no marker). |
| Backend pytest postgres (`P`) | **Yes — all PRs (existing gate)** | **2 critical items: #69 + #70** (the migration bundle introduces postgres-marked tests). 4 routine guard files: `test_postgres_schema_contracts.py`, `test_outbox_approval_flow.py`, `test_approval_workflow.py`, `test_health.py` (Makefile `:128-132`). | Despite user-task framing of "may be advisory", the existing CI lane is BLOCKING on every PR. **Plan-gate proposal: keep mandatory**. |
| Architecture locks (`A`) | **Yes — all PRs** (runs as part of `S`) | 77/77 (every plan item touches at least one lock per Loop 2 A3) | Verified by `Makefile:134-135` and the contract-marker discipline at `test_w11b_test_infra_polish_red.py:32-43`. |
| Capability-contract validator (`V`) | **Yes — all PRs** (runs as part of `F`) | 16 validator-load-bearing items (Loop 2 A5): #13, #15, #24, #34, #37, #39, #50, #51, #55, #56, #57, #60, #61, #62, #65, #66, #69+#70 verify-only, #71. | Note: Loop 2 A5 lists 16 items; item count may rise to 18 once #71 ("session merge") and #57 ("verify only") are tallied. |
| Docs governance (`D`) | **Conditional path-filter** | All items that touch `AGENTS.md`, `.planning/**`, `docs/**`, `scripts/**`, `frontend/scripts/**`, `backend/{mypy.ini,ruff.toml}`, or `.github/workflows/**` (per `maintenance-governance.yml:6-16`). Per Loop 2 A4 doc-touch matrix this is ~50/77 items. | The 3-hop reachability invariant runs here; new READMEs from #61, #62, #74a/b activate. |
| Frontend maintenance (`M`) | **Conditional path-filter** (same trigger as `D`) | 19 frontend items + #74b ADR-007 if it modifies frontend doc-touch | Debt budget + cleanup audit. |
| Production profile smoke (`PROD`) | **Yes — all PRs** | All items that touch FastAPI middleware, auth wiring, or environment variables (#37, #66, #44, anything in `auth/`). | Existing `e2e.yml:production-profile-smoke`. |
| Security suite (`SEC`) | **Yes — all PRs** | 77/77 | Bandit + pip-audit + npm audit + Trivy + Grype + Gitleaks + workflow-pin + repo-hygiene. |
| E2E Playwright | **Out of scope per user** | None of the 77 items introduces a new spec | Existing `e2e.yml:e2e-tests` continues to gate, but plan-gate strategy does not mandate it. |
| Backend maintenance informational | **Advisory** | None | Keep `continue-on-error: true`. |
| Redis-resilience integration | **Advisory (cron-only)** | None of the 77 items introduces a Redis-fault test | Keep nightly + `continue-on-error: true`. |
| Startup smoke (`startup-smoke.yml`) | **N/A for PRs** | n/a | Push/cron-only. |
| Release parity / release.yml | **N/A for PRs** | n/a | Tag/manual/nightly. |

---

## 5. Postgres-lane items (must pass on `P` before merge)

Items whose RED tests are explicitly `pytestmark = pytest.mark.postgres` (or
that touch postgres-only behaviour where the validator/lock requires PG):

| Item | Rationale | Cite |
|---|---|---|
| **#69** | New file `tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py:457` carries `pytestmark = pytest.mark.postgres` and asserts FK `confdeltype='c'` for 6 constraints. | `plan-loop-2-06-migration-window.md:451-496` |
| **#70** | Atomic with #69; the `vendors.status` column drop and `ix_vendors_status` index drop are asserted in the same postgres-lane test file. | `plan-loop-2-06-migration-window.md:480-496` |

All other items use sqlite-only fixtures (`sqlite+aiosqlite:///:memory:` per
`conftest.py:28`). The `architecture/test_w12_alembic_clean_diff_red.py` runs
on a "live DB" but the existing infrastructure handles dialect routing
automatically.

**Recommendation**: keep the existing `backend-postgres.yml:postgres-tests`
job mandatory on every PR. Do not promote it to nightly-only — the migration
bundle requires this lane to be green at merge time. The plan introduces no
PR that would justify weakening this gate.

---

## 6. Validator-lane items (must pass on `V` before merge)

The capability-contract validator runs as part of `lint.yml:lint` via the
`make -f scripts/Makefile quality-repo-contracts` target (Makefile `:160`,
which calls `python3 scripts/security/validate_authz_capability_contract.py
--base-ref "$AUTHZ_CONTRACT_BASE_REF"`). The 16 validator-touching items
per Loop 2 A5:

| Item | Validator check that fires | Pydantic↔Zod parity? |
|---|---|---|
| #13 | check 2 + 7 (drop vendor_link_helpers) | no |
| #15 | check 2, 3, 4, 5 (NEW access_user surface, 8 catalog) | **YES** |
| #24 | check 2 + 7 (atomic with #51, 5+5 cells) | no |
| #34 | check 5 (Vocabulary append "privilege tier") | no |
| #37 | check 4 (regression-only) | no |
| #39 | check 2 + 4 (NEW admin builder; 4 fields) | **YES** |
| #50 | check 2 + 7 (drop kri_history submission) | no |
| #51 | check 2 + 7 (atomic with #24) | no |
| #55 | check 2 + 7 (drop access_user_service) | no |
| #56 | check 2 + 7 (drop directory_identity_service) | no |
| #57 | check 2 + 7 (verify-only — no contract token cited) | no |
| #60 | check 5 (Vocabulary append "privilege context") | no |
| #61 | check 2 + 7 (graph_directory path rewrite) | no |
| #62 | check 2 + 7 (kri_vendor_assignment path rewrite) | no |
| #65 | check 4 (4 surfaces — `crudCapabilitySchema` Zod base) | **YES** |
| #66 | check 7 (FE local-gate per-file allowlist) | no |
| #69+#70 | check 2 (verify; vendor models in sensitive_change_paths) | no |
| #71 | check 2 + 7 (services/session/ path rewrite) | no |

**3 Pydantic↔Zod parity items** (#15, #39, #65) — these are the highest-risk
validator-gate items. A field-shape drift between backend Pydantic class and
frontend Zod schema causes `capability_catalog_*_field_missing` /
`*_field_extra` to emit (`capability_catalog.py:269-306`).

**Recommendation**: validator stays in `lint.yml:lint` (mandatory). No new
workflow needed. Add a comment in `Makefile:160` documenting that this is
the canonical PR-gate for the capability contract.

---

## 7. GAPS in current CI (recommended new gates)

### 7.1 README 3-hop reachability invariant — partial coverage

**Current**: `make -f scripts/Makefile docs-topology-consistency` runs
`docs_tree_audit.py --max-root-hops 3 --fail-on-unreachable` (Makefile
`:226-229`). This is BLOCKING in `maintenance-governance.yml:38-40` only when
the path filter is hit.

**Plan items affected**: #61 (new `_graph_directory/` README), #62 (new
`_vendor_links/kri_assignment.py` and possibly README), #74a/b (new
bounded-context README structure across 31 packages), #44 (potential new
README), #59 (potential README move).

**Gap**: if a developer creates a new package WITHOUT touching the listed
paths in the path filter (`maintenance-governance.yml:6-16`), the 3-hop
invariant is NOT enforced on PR. The path filter includes `docs/**` but does
NOT include `backend/app/**` or `frontend/src/**`. A new
`backend/app/services/_graph_directory/README.md` does NOT activate the
filter.

**Recommendation**: add `backend/app/**` and `frontend/src/**` to the path
filter:
```yaml
# maintenance-governance.yml additions:
paths:
  - 'AGENTS.md'
  - '.planning/**'
  - 'docs/**'
  - 'scripts/check_docs_contract.py'
  - 'scripts/quality/**'
  - 'scripts/tools/**'
  - 'frontend/scripts/**'
  - 'backend/mypy.ini'
  - 'backend/ruff.toml'
  - '.github/workflows/**'
  + - 'backend/app/**'
  + - 'frontend/src/**'
```

This ensures the docs-tree audit runs whenever any code module's
parent-directory README could fall outside the 3-hop graph.

**Effort**: 1-2 lines of YAML; no code change. Can land in a single PR
preceding #61/#74a.

### 7.2 New bounded-context TOMLs (#74a) — no current lock

**Current**: Loop 2 master sequence Seq 3-4 introduces 4 new TOMLs from the
ADR-007 amendment census. There is **no architecture-lock test** that asserts
those TOMLs are well-formed, that their entries reference existing files, or
that newly-added entries carry rationale + expires_at (the canonical pattern
for `_archive_allowlist.toml` etc.).

**Plan items affected**: #74a (census), #74b (ADR text). Without a lock, the
TOMLs can rot.

**Recommendation**: as part of #74b, add a new architecture-lock test
`tests/backend/pytest/architecture/test_w13_bounded_context_census_lock.py`:
```python
"""W13: bounded-context census TOMLs are well-formed and current.

Each entry must cite an existing file path under backend/app/ or
frontend/src/ and carry rationale + non-expired expires_at, mirroring
the _archive_allowlist.toml + _capabilities_all_allowlist.toml pattern.
"""
import tomllib, datetime
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
CENSUS_TOMLS = (
    "tests/backend/pytest/architecture/_bounded_context_classify_allowlist.toml",
    "tests/backend/pytest/architecture/_bounded_context_promote_allowlist.toml",
    "tests/backend/pytest/architecture/_bounded_context_collapse_allowlist.toml",
    "tests/backend/pytest/architecture/_bounded_context_keep_allowlist.toml",
)

def test_census_tomls_are_present_and_parseable() -> None:
    for path in CENSUS_TOMLS:
        full = REPO_ROOT / path
        assert full.exists(), full
        data = tomllib.loads(full.read_text(encoding="utf-8"))
        assert isinstance(data.get("entries", []), list)

def test_census_entries_cite_real_files_and_carry_metadata() -> None:
    today = datetime.date.today()
    for path in CENSUS_TOMLS:
        for entry in tomllib.loads((REPO_ROOT / path).read_text(encoding="utf-8")).get("entries", []):
            assert (REPO_ROOT / entry["path"]).exists(), entry["path"]
            assert entry.get("rationale")
            assert datetime.date.fromisoformat(str(entry["expires_at"])) >= today
```

This test runs in `S/A` (architecture-locks) and gates #74b once #74a's
TOMLs are committed.

**Effort**: 1 new test file (~40 lines) + add 4 new TOMLs in #74a.

### 7.3 New ADR index parity — no automated check

**Current**: `test_w11_docs_index_completeness_red.py:13-37` enforces a
hardcoded set of 9 needles in 4 docs (`AGENTS.md`, `CLAUDE.md`,
`docs/README.md`, `docs/DOCUMENTATION_TREE.md`). It does NOT enforce that
every ADR file in `docs/adr/` is referenced.

**Plan items affected**: #72 (ADR-011), #73 (ADR-012), #74b (ADR-007 amend).
Without a parity check, an ADR can land without being indexed.

**Recommendation**: extend `test_w11_docs_index_completeness_red.py` to enumerate `docs/adr/ADR-*.md`
and assert each filename appears in `docs/README.md` AND
`docs/DOCUMENTATION_TREE.md`. Approximate 10-line addition:
```python
def test_every_adr_file_appears_in_root_docs_index() -> None:
    adr_files = sorted((ROOT / "docs/adr").glob("ADR-*.md"))
    docs = (ROOT / "docs/README.md").read_text() + (ROOT / "docs/DOCUMENTATION_TREE.md").read_text()
    missing = [f.stem for f in adr_files if f.stem not in docs]
    assert missing == [], f"ADRs missing from index: {missing}"
```

**Effort**: ~10 lines added to existing test; runs in `S/A` lane.
Land before or with #72.

### 7.4 Validator path-filter awareness — none today

**Current**: the validator runs unconditionally on every PR (good). But the
validator output is not surfaced as a separate CI status — it's part of the
`lint.yml:lint` job. A failure in the validator vs. a failure in `tsc` is
indistinguishable from the PR check column.

**Recommendation** (low priority): split the validator into its own step
within the `lint` job with explicit `continue-on-error: false` AND its own
GitHub Actions output annotation. The validator already prints structured
findings (`runner.py:35-60`); annotate them as `::error file=...,line=...::`
to surface in the PR diff view.

**Effort**: ~30 lines of post-processing in `lint.yml`. Low priority — keep
in backlog.

### 7.5 Postgres-lane test convention check — none today

**Current**: there is no architecture-lock test that asserts every
`tests/backend/pytest/migrations/**.py` file carries `pytestmark =
pytest.mark.postgres`. A developer could write a migration test without
the marker, causing it to run on the sqlite default lane and crash.

**Plan items affected**: #69+#70 introduces the first migration tests under
that directory. Future migration items (none in the current 77, but #74a's
ADR-007 amendment may unlock more) need the convention.

**Recommendation**: as part of the #69+#70 commit, add a lock:
```python
# tests/backend/pytest/architecture/test_postgres_lane_test_convention_red.py
def test_migration_tests_are_postgres_marked() -> None:
    migration_tests = sorted((REPO_ROOT / "tests/backend/pytest/migrations").glob("test_*.py"))
    unmarked = [
        path.relative_to(REPO_ROOT).as_posix()
        for path in migration_tests
        if "pytestmark = pytest.mark.postgres" not in path.read_text()
    ]
    assert unmarked == [], unmarked
```

**Effort**: ~15 lines; runs in `S/A` lane. Land with #69+#70.

### 7.6 Capability-catalog snapshot drift detection — partial coverage

**Current**: `capability_catalog.py` field-shape parity (check 4) catches
field add/remove but does NOT catch field-order drift between Pydantic and
Zod. A surface like `risk` (19 fields) could have `can_archive` move from
position 5 to position 12 in the Zod schema without check 4 firing.

**Plan items affected**: #15, #39, #65 — all NEW or RESHAPED catalog
surfaces. #65 is highest-risk because it consolidates 4 surfaces under a
shared base.

**Recommendation**: extend `capability_catalog.py:143-230` to assert
ORDERED equality of Pydantic field list vs Zod field list, not just set
equality. (Verify whether the validator already does this — `check 4` doc
text says "field-shape parity" but does not specify ordering.)

If not currently enforced, add to `runner.py` Check 4 expansion. **Effort**:
~20 lines in validator; ~1 day to land safely with #65.

**Lower-priority alternative**: add a snapshot test under
`tests/frontend/unit/src/authz/` that ingests the Pydantic + Zod
side-by-side and asserts ordered equality. Runs in `U` (vitest) lane.

### 7.7 Architecture-lock test naming convention — none today

**Current**: `test_w11b_test_infra_polish_red.py:32-43` enforces every
architecture test carries `pytestmark = pytest.mark.contract`, but does NOT
enforce the `_red.py` suffix convention. New plan items (#69+#70 add
4 test files; #74b adds 1; potentially others) need the suffix to be
indexable.

**Plan items affected**: #14, #74b, #69+#70, plus any item that adds an
architecture lock.

**Recommendation** (low priority): extend `test_w11b` with:
```python
def test_architecture_test_filenames_use_red_suffix() -> None:
    files = sorted((ARCHITECTURE_TEST_ROOT).glob("test_*.py"))
    nonred = [f.name for f in files if not f.name.endswith("_red.py") and f.name != "__init__.py"]
    # current allowlist for non-_red files:
    allowlist = {"test_dashboard_threshold_contract_red.py", "test_makefile_postgres_lane_red.py", "test_residual_type_cleanup_contract_red.py", "test_w6_bc_d_register_listing_centralization.py"}
    nonred_filtered = [n for n in nonred if n not in allowlist]
    assert nonred_filtered == [], nonred_filtered
```
(Verify current state — several existing tests don't end in `_red.py`, so
the allowlist is needed.)

**Effort**: ~15 lines + verification of current state. Low priority.

### 7.8 Path-prefix registry lock (#44) — gate proposal

**Plan item #44** introduces a guarded path-prefix registry. It will need
its own architecture lock to assert no endpoint registers a path prefix
outside the registry. The lock should be added in the same commit as #44.

**Recommendation**: design checklist for #44's commit:
- New TOML `tests/backend/pytest/architecture/_path_prefix_allowlist.toml`
- New test `test_w14_path_prefix_registry_red.py` (W14 namespace).
- Runs in `S/A` lane.

---

## 8. Per-item CI total wall-clock estimate

CI stages run in parallel where independent. Total elapsed wall-clock time
per PR is dominated by the slowest sequential lane (typically
`backend-postgres.yml:postgres-tests` at ~5-8 min after install).

### 8.1 Baseline per-PR CI cost (no failures)

| Lane | Wall-clock | Parallel? |
|---|---:|---|
| `lint.yml:frontend-unit-tests` | ~3-5 min | yes (parallel with backend lanes) |
| `lint.yml:backend-quality` | ~2-4 min | yes |
| `lint.yml:lint` (depends on `frontend-unit-tests`) | ~5-7 min | sequential after FE unit |
| `backend-postgres.yml:sqlite-tests` | ~6-10 min | yes |
| `backend-postgres.yml:postgres-tests` | ~5-8 min | yes |
| `maintenance-governance.yml:docs-governance` | ~2-3 min | yes (path-filtered) |
| `maintenance-governance.yml:frontend-maintenance` | ~3-4 min | yes (path-filtered) |
| `e2e.yml:e2e-tests` | ~15-25 min | yes |
| `e2e.yml:production-profile-smoke` | ~5-8 min | yes |
| `security.yml:python-security` | ~3-5 min | yes |
| `security.yml:frontend-security` | ~1-2 min | yes |
| `security.yml:frontend-i18n` | ~1-2 min | yes |
| `security.yml:container-security` | ~10-15 min | yes |
| `security.yml:secrets-detection` | ~1-2 min | yes |
| `security.yml:security-headers` | ~1-2 min | yes (depends on python-security + frontend-security) |
| `security.yml:public-repo-hygiene` | ~30 s | yes |
| `security.yml:workflow-pin-validation` | ~30 s | yes |

**Critical path** (slowest sequential dependency): e2e-tests (~25 min) OR
container-security (~15 min) OR `lint.yml:lint` (after `frontend-unit-tests`,
~10 min).

**Realistic per-PR baseline**: **~25-35 min** wall-clock if e2e is on the
critical path, **~15-20 min** if e2e is excluded.

### 8.2 Per-domain item CI cost adjustment

Items that are simple S/leaf may complete CI faster (skipping e2e if
unaffected). Items that touch multiple lanes (#66, #69+#70, #15, #39, #65)
hit every lane.

| Item shape | CI cost adjustment | Items |
|---|---|---|
| Backend doc-only (#10, #57, #20, ADRs) | Baseline (no extra) | ~10 items |
| Backend unit/lock (#1-9, #11-14, #16-22, etc.) | Baseline | ~30 items |
| Frontend-only (FE-* items, #3, #4, #5, #6, etc.) | Baseline + FE-maintenance | ~19 items |
| Validator-touching (16 items, see §6) | Baseline + validator failure-prone | 16 items |
| Migration window (#69+#70) | Baseline + Postgres-lane critical | 2 items |
| Cross-stack (#37, #39, #66) | Baseline + multiple gates | 3 items |

### 8.3 Estimated total CI burn for the 77-item plan

Assuming each item lands in its own PR with one CI run on green:

- 77 items × ~25 min/item = **~32 hours** of CI wall-clock if linear.
- Parallel lanes mean GitHub Actions burn-time is higher: ~16 lanes × 5 min
  average × 77 PRs = **~6,160 lane-minutes** ≈ **103 lane-hours**.

Failures and re-runs likely double this (TDD red→green often requires 2-3
CI iterations per PR). **Realistic total CI burn**: ~200-300 lane-hours
across the 12-week plan duration.

### 8.4 Per-item wall-clock ceilings

For the highest-cost items (multiple lanes load-bearing):

| Item | Lanes that gate | Estimated wall-clock |
|---|---|---:|
| #69 + #70 (migration) | B + S + P + D + V + SEC + PROD | ~30-40 min (P + container-security on critical path) |
| #66 (AuthContext split) | F + V + U + M + D + PROD | ~25-30 min |
| #65 (crudCapabilitySchema) | F + V + U + M | ~20-25 min |
| #39 (admin builder) | B + S + F + V + U + M + D | ~25-35 min |
| #15 (access_user surface) | B + S + F + V + U + D | ~20-30 min |
| #74b (ADR-007 amendment) | D + S/A | ~10-15 min (light load) |
| Single-domain leaf (e.g. #1, #4, #5) | F + S | ~15-20 min |

---

## 9. Recommended new gates summary

| Gap | Recommendation | When to add | Effort |
|---|---|---|---|
| 7.1 README 3-hop reachability path filter | Add `backend/app/**` and `frontend/src/**` to `maintenance-governance.yml` paths | Before #61 (Seq 45) | 2-line YAML |
| 7.2 Bounded-context TOMLs (#74a) lock | New `test_w13_bounded_context_census_lock.py` | With #74b | ~40 lines |
| 7.3 ADR index parity | Extend `test_w11_docs_index_completeness_red.py` to enumerate `docs/adr/` | With or before #72 | ~10 lines |
| 7.4 Validator failure annotation | Annotate findings as `::error::` | Backlog (low priority) | ~30 lines |
| 7.5 Postgres-lane test convention | New `test_postgres_lane_test_convention_red.py` | With #69+#70 | ~15 lines |
| 7.6 Capability-catalog ordered equality | Extend `capability_catalog.py` Check 4 to enforce field order | Before or with #65 | ~20 lines |
| 7.7 Architecture-lock filename convention | Extend `test_w11b` with `_red.py` suffix check + allowlist | Backlog (low priority) | ~15 lines |
| 7.8 Path-prefix registry lock (for #44) | New `test_w14_path_prefix_registry_red.py` + TOML | With #44 | ~30 lines |

---

## 10. Plan-gate runbook (developer-facing, per item)

This is the canonical pre-commit checklist for any of the 77 items. Steps
mirror `plan-loop-2-05-validator-schedule.md:483-505` and AGENTS.md.

```bash
#!/usr/bin/env bash
# scripts/dev/precommit.sh — local pre-commit gate

set -euo pipefail

# 1. Author RED test(s) per Loop 2 plan for this item.
#    Confirm RED:
pytest tests/backend/pytest/<new_red_test>.py
# Expected: FAIL (red).

# 2. Implement fix per Loop 2 plan; re-run:
pytest tests/backend/pytest/<new_red_test>.py
# Expected: PASS (green).

# 3. Run full domain test suite (sqlite default lane):
pytest -m "not postgres and not benchmark" -q
# Expected: PASS, all green.

# 4. Run architecture locks:
make -f scripts/Makefile test-architecture-locks
# Expected: PASS.

# 5. (validator-touching items only) Run validator:
python3 scripts/security/validate_authz_capability_contract.py
# Expected: exit 0.

# 6. (#69+#70 migration items only) Run postgres lane locally:
TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_test@localhost:5432/riskhub_test \
  make -f scripts/Makefile test-postgres-ci
# Expected: PASS.

# 7. (FE items only) Run frontend lint + typecheck + build:
cd frontend && npm run lint && npx tsc --noEmit && npm run build
# Expected: PASS.

# 8. (FE items only) Run vitest with coverage:
cd frontend && npm run test:coverage
# Expected: coverage thresholds satisfied.

# 9. Lint:
cd backend && ./venv/bin/ruff check app ../tests/backend/pytest scripts
cd backend && ./venv/bin/mypy --config-file mypy.ini app
# Expected: PASS.

# 10. (doc-touching items) Verify docs topology:
make -f scripts/Makefile docs-topology-consistency
# Expected: PASS.

# 11. git add specific files; git commit.
```

CI re-runs steps 3-10 on every PR; this local script is the developer-side
backstop and minimises CI wall-clock waste.

---

## 11. Per-item gate decision table (quick lookup, all 77)

Compact form: `Item: [lanes that gate]`. Lane abbreviations as in §3.

```
#1: B,S
#2: B,S
#3: F,U,M
#4: F,U,M
#5: F,U,M
#6: F,U,M
#7: B,S
#8: B,S
#9: B,S
#10: D
#11: B,S
#12: B,S
#13: B,S,F[V],D
#14: B,S
#15: B,S,F[V],U,D
#16: B,S,D
#17: B,S
#18: B,S
#19: B,S
#20: B,S,D
#21: B,S
#22: F,U,M
#23: F,U,M
#24: B,S,F[V],D     (atomic with #51)
#25: B,S
#26: F,U,M
#27: B,S
#28: B,S
#29: B,S
#30: B,S,D
#31: B,S
#32: F,U,M
#33: F,U,M
#34: B,S,F[V],D
#35: F,U,M
#36: F,U,M
#37: B,S,F[V]
#38: B,S,D
#39: B,S,F[V],U,M,D
#40: B,S,D
#41: B,S
#42: B,S
#43: B,S
#44: B,S,D
#45a: B,S
#45b: B,S
#46: F,U,M
#47: F,U,M
#48: F,U,M
#49: B,S
#50: B,S,F[V],D
#51: B,S,F[V],D     (atomic with #24)
#52: B,S
#53: B,S
#54: B,S
#55: B,S,F[V],D
#56: B,S,F[V],D     (atomic with #61)
#57: B,S
#58: B,S
#59: B,S,D
#60: B,S,F[V],D
#61: B,S,F[V],D     (atomic with #56)
#62: B,S,F[V],D
#63: B,S
#64: F,U,M
#65: F[V],U,M
#66: F[V],U,M,D,PROD
#67: F,U,M
#68: F,U,M
#69: B,S,P,D        (atomic with #70)
#70: B,S,P,D        (atomic with #69)
#71: F[V],U,M,D
#72: D
#73: D
#74a: D,S
#74b: D,S
#75: B,S
```

(Note: every item also runs the SEC suite and lint baseline implicitly. The
decision table highlights only the lanes where the item is load-bearing.)

---

## 12. Summary

The current CI suite is well-aligned with the plan's needs:

1. **Capability-contract validator already runs on every PR** via
   `lint.yml:lint` → `make quality-repo-contracts`. The 16 validator-touching
   items are gated.
2. **Postgres lane already runs on every PR** as a blocking gate
   (`backend-postgres.yml:postgres-tests`). The migration bundle (#69+#70)
   is already gated.
3. **Architecture locks run as part of the default sqlite lane** (no
   `postgres`/`benchmark` marker), so every PR enforces them.

Three small additions are recommended before the plan's middle gates land:

- **7.1**: extend `maintenance-governance.yml` path filter to include
  `backend/app/**` and `frontend/src/**` (covers new package READMEs from
  #61, #62, #74a/b).
- **7.2**: add `test_w13_bounded_context_census_lock.py` with #74b.
- **7.3**: extend `test_w11_docs_index_completeness_red.py` to enumerate
  `docs/adr/ADR-*.md` (gates #72, #73, #74b).

E2E Playwright is left as-is per user scope decision; the plan does not
require any changes to it. All other lanes stay in their current gating
posture.

End of CI strategy.
