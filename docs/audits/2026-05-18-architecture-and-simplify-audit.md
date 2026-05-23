# RiskHub Architecture & Simplification Audit — 2026-05-18

**Audit team**: 35 Opus subagents across 5 rounds.
**Tree state**: clean working tree at `fb359c46 Deepen architecture ownership seams`.
**Empirical gates**: all GREEN (197/197 architecture-locks, 0/0 authz contract validator, 0 ruff hits, 103 pre-existing mypy errors in scripts/alembic only, frontend tsc/eslint clean).
**Methodology**: per `/improve-codebase-architecture` + `/simplify` lenses, with adversarial cross-round verification per `memory/feedback_audits_validate_current_code.md`.
**Verification pass (2026-05-18 evening)**: 26 additional Opus subagents across 5 triage rounds (T1.1–T5.2) re-checked every cited claim against current code. Corrections applied inline; full delta in §15.

> **One-line takeaway** — the architecture-deepening commit wave produced *shape without substance*: ~22 typed contract dataclasses survive only because `test_architecture_deepening_contracts.py` pins their names; 50 service-side commits never adopted the named transaction boundary that the endpoint perimeter ratchet was supposed to enable; the frontend mirrors the same shape-without-substance pattern (4 of 5 duplicated page-state hooks need migration, no `ErrorBoundary`, unguarded admin routes). 197/197 gates green; the rot is everywhere they don't look.

---

## 1. Executive Summary

The codebase is **shippable and secure** (authz validator 0 errors, SSO/JWT/nonce/state verified clean at §12, no PII leaks in logs per R3.5). All architecture-lock gates pass, the outbox dispatcher/store split is correct, and 3 of 5 register listings (risks/controls/kris) preload approvals + ownership-ID sets + capabilities with `can_read_override=True`; issues incurs 2 per-row authz DB calls and vendors uses collection-level capabilities (§12 correction).

The audit found **ten bounded findings**: four confirmed silent-production risks (C-1, C-2, C-4, C-5), two configuration/observability hardening gaps (C-3, C-6), plus four release-blocking UX/resilience gaps (C-7..C-10). It also found **eleven cross-cutting anti-patterns**, **ten ranked architectural deepenings**, and **fifteen ranked simplification targets** totaling **~2,400 LOC removable** (sum of Rank 1-15 line estimates) with low-to-medium risk. None of the findings block release; all are debt that compounds.

### Critical 🔴 / hardening 🟡 — production risks (C-1..C-6)

| # | Finding | File:line | Classification | Production risk |
|---|---|---|---|---|
| C-1 | **KRI breach notification bypasses outbox** | `backend/app/services/_kri_history/direct_application.py:207` | 🔴 Silent-production risk | Notification can drop silently — no replay (other 2 originally-reported bypass sites verified clean by R3.7) |
| C-2 | **KRI value history missing `UniqueConstraint("kri_id", "period_end")`** | `backend/app/models/kri_history.py:60-63` (no constraint declared) | 🔴 Silent-production risk | Serialization relies on parent KRI row-lock; if a caller forgets `for_update=True`, duplicates insert |
| C-3 | **`InMemoryAccountLockoutBackend` has no multi-worker guard outside supported production Redis mode** | `backend/app/main.py:292-320`, `backend/app/services/account_lockout_service.py:56-101` | 🟡 Configuration hardening gap | Supported `DEBUG=false` startup requires Redis and uses `RedisAccountLockoutBackend`; dev/demo or misconfigured production-like multi-worker runs still multiply attempts across workers |
| C-4 | **`_admin_telemetry/lifecycle.py:58-62` swallows `Exception → db_status="error"` with NO `logger.*` call** | same | 🔴 Silent-production risk | Operator sees red on `/admin/system-status`, has zero log trail |
| C-5 | **`_approval_queue/projection.py:42-47` swallows real bugs + skipped count never reaches API/audit/metric** | same | 🔴 Silent-production risk | Logic bugs in `approval_capabilities` could silently hide all approvals from approvers |
| C-6 | **Prometheus `/metrics` is opt-in and undocumented; no OTel export** | `backend/app/main.py:268-275`, `backend/app/core/settings/metrics.py:2`, `backend/requirements-runtime.txt:3` | 🟡 Observability enablement gap | `/metrics` exists when `METRICS_ENABLED=true`, but the setting defaults false and is not surfaced in deployment docs/examples; OpenTelemetry export is absent |

### Release-blocking 🟡 — UX / resilience (C-7..C-10)

These do not cause silent production failures but should ship in the same release cycle as the silent-failure fixes.

| # | Finding | File:line | Production risk |
|---|---|---|---|
| C-7 | **No `ErrorBoundary` anywhere in `frontend/src/`** | `frontend/src/App.tsx` (only `<Suspense>` fallback) | Single render exception in any lazy page → white-screen |
| C-8 | **Admin/vendor-reports/audit-trail routes have no `RouteGuard`** | `frontend/src/routing/business.tsx:194-202`, `admin.tsx:9-22` | Typed URL bypasses sidebar `isVisible`; user sees protected pages until backend 403s |
| C-9 | **`useRemediationPlanWorkflow.ts:57-69` effect dep clobber** | `frontend/src/components/issues/remediation/useRemediationPlanWorkflow.ts:57-69` | Saving a new value wipes in-flight typing |
| C-10 | **`ConfirmDialog` + `ArchiveConfirmDialog` lack `role="dialog"`, `aria-modal`, focus trap** | `frontend/src/components/{ConfirmDialog,ArchiveConfirmDialog}.tsx` | Screen-reader users can't interact correctly |

### High-leverage refactors (🟡 plan-and-ship over 6–9 weeks)

- **Adopt `commit_service_boundary` primitive** across all 13 non-auth packages (50 raw `db.commit()` calls in 23 service files; 39 lack rollback locality; current `commit_auth_transaction` has the right rollback shape but its `boundary: str` param is decorative — never logged or used in body)
- **Promote outbox-only invariant to global architecture lock** (currently scoped only to `_issue_workflow/` + `endpoints/issues/`)
- **Retire 22 dead-pinned dataclasses** + their `hasattr` assertions in `test_architecture_deepening_contracts.py`
- **Build `_dashboard_metrics/{risks,kris,controls,departments}.py` services** — 4 dashboard endpoints currently reach directly into ORM (including a `1 + 7N` query pattern in `dashboard/departments.py`)
- **Migrate 4 frontend `useXPageState` hooks** to `useRegisterPageController.ts` (~560 LOC dedup; `useControlsPageState.ts:85` already uses the controller as the migration template)
- **Add restore orchestrators** in `_entity_mutation_lifecycle/lifecycle.py` to complete the archive/update/restore symmetry

### Bottom-line metrics

| Dimension | Count | Detail |
|---|---|---|
| Total agent invocations (audit) | 35 | 10 R1 + 8 R2 + 10 R3 + 3 R4 + 4 R5 |
| Total agent invocations (triage verification) | 26 | 6 T1 + 10 T2 + 5 T3 + 3 T4 + 2 T5 — see §15 |
| Peer-DM cross-checks observed | 17 | agents corrected each other in-flight |
| R1 findings overturned by R2/R3 adversarial verification | 15 | catalogued in §13 |
| Audit claims further corrected by triage pass | 32 | §15 (18 numeric + 13 framing + 1 new finding) |
| Verified dead types pinned by tests | 22 | §6 Top 15 |
| Verified outbox bypasses needing fix | 1 | §4 Theme 4 (R3.7 final) |
| Estimated LOC removable | ~2,400 | §6 Top 15 (sum of Rank 1-15 estimates) |
| Estimated migration effort | 6–9 weeks | §10 Wave plan |
| Architecture-lock tests passing | **197/197** | §7 |

---

## 2. Audit Methodology

### Round structure (35 agents)

| Round | Agents | Type | Purpose |
|---|---|---|---|
| 1 | 10 | `code-explorer` | Per-domain inventory (services × 7, endpoints, frontend, tests+docs) |
| 2 | 8 | `code-explorer` | Cross-cutting specialists (coupling, duplication, dead-code, over-abstraction, naming, error-handling, test-coverage-gaps, security-authz) |
| 3 | 10 | `code-explorer` | New lenses (perf, migration, concurrency, ADR drift, observability, frontend correctness) + adversarial verifiers (outbox bypass, dead-type pins, commit dispersion, capability facade) |
| 4 | 3 | `general-purpose` | Empirical gates (ruff/mypy + architecture-locks + authz contract validator) |
| 5 | 4 | `code-architect` | Synthesis (theme miner, simplification ranker, deepening ranker, migration planner) |

### Adversarial-verification model

Every claim that survives to this document was either: (a) reaffirmed by two independent agents reading the cited file, or (b) corrected by a later round and the corrected form recorded. R2 caught 4 R1 false flags. R3 caught 8 R2/R1 errors. R5.2 + R5.4 + main thread caught 3 more before final synthesis.

The model worked: peer DMs visibly upgraded findings (`R1.7 → R1.6 → R1.3 → R3.7` collapsed an over-counted "3 outbox bypasses" to "2 confirmed, 1 hallucination"). The dominant failure mode warned about in `memory/feedback_audits_validate_current_code.md` — citing already-fixed code — was caught in real time by R1.10 itself: it had relied on a 2026-05-09 audit doc claiming `IssueRegisterPlan` was live; grep against current code showed zero callers; R1.10 issued its own correction within the same round.

### Methodology limits

The audit did NOT: edit any file, push any branch, run `pytest -k <test_name>` to confirm individual flake risks, run a full `make pre-commit` cycle, or rehearse alembic migrations on a real database. The empirical gates (Round 4) ran the headline static-analysis + architecture-lock + authz contract suites only.

---

## 3. Domain Map

### Backend services tree (`backend/app/services/`)

**Bounded contexts (per ADR-007 Amendment 1)**:

| Classification | Packages |
|---|---|
| **Workflow pairs** (11 per ADR-007) | `_issue_register` ↔ `_issue_workflow`, `_kri_history` ↔ (orchestrators), `_vendor_governance` ↔ `_vendor_links` ↔ `_vendor_workflow`, `_entity_mutation_lifecycle` ↔ `_approval_execution`, `_risk_questionnaires`, `_register_listings` (read-shape side), plus archive/restore/exception pairs |
| **Read-shape** | `_register_listings/`, `_collection_contracts.py`, `_collection_filters.py`, `_monitoring_response.py`, `_monitoring_status/`, `_dashboard_metrics/`, `_quarterly_comparison/`, `_reporting/`, `_admin_telemetry/`, `_activity_log_query/`, `_authorization_capabilities/`, `_notification_inbox/`, `_orphaned_items/` (reads.py side) |
| **Write-side** | `_approval_execution/`, `_approval_queue/`, `_entity_mutation_lifecycle/`, `_issue_workflow/`, `_kri_history/`, `_orphaned_items/` (writes), `_register_listings/` (dual-classed, listing-plan execution writes audit) |
| **Adapters** | `_auth_session/`, `_auth_session_workflow/`, `_directory_identity/`, `_graph_directory/`, `_directory_sync/` (⚠️ phantom — README only), `_org_chart/` |
| **Cross-cutting** | `_config/` (read cache), `_riskhub_config/` (write workflows) |
| **Top-level legacy** | `ad_deprovision_service.py`, `account_lockout_service.py`, `directory_provider_service.py`, `sso_challenge_store.py`, `sso_token_service.py`, plus several facade/shim files |

### Backend API tree (`backend/app/api/v1/endpoints/`)

Resource domains: `risks/`, `controls/`, `kris/`, `issues/` each have nested `crud/{create,detail,update,archive,restore,list}.py`. `vendors/` is flat (`crud.py` + `lifecycle.py` — asymmetric). Plus `dashboard/`, `approvals/`, `departments/`, `admin/`, `auth/`, `users/`, `riskhub/`, `risk_questionnaires/`, `reports/{unified_exports,audit_trail_excel,summary_excel}`, and top-level files (`access.py`, `activity_log.py`, `executions.py`, `notifications.py`, `orphaned_items.py`, `preferences.py`, `lookups.py`, `vendor_links.py`, `vendor_reports.py`, `directory.py`, `health.py`, `riskhub_questionnaires.py`).

Shared infra: `_collection.py` / `_collection_execution.py` (query/sort/filter parsing).

### Frontend tree (`frontend/src/`)

`App.tsx` + `main.tsx` boot; `routing/{business,admin,core}.tsx` register routes; `authz/{useAuthz, policy, BusinessRouteGuards}` resolve capabilities; `services/{api,session}` for REST + session store; `lib/{capabilities,queryKeys,utils,monitoringStatus}` for shared utilities; `pages/` grouped per entity (risks/controls/vendors/kris/issues/users/dashboard/admin-console/approvals/departments/login/shared); `components/` for shared UI; `contexts/{Auth,Session,Preferences,AuthActions,DashboardFilter,Theme}` for cross-cutting state.

### Tests & docs

`tests/backend/pytest/architecture/` houses **90 architecture-lock test files** (189 test functions in that directory, plus 8 from `test_w0_harness_contract_red.py` outside it = 197 functions in the `make test-architecture-locks` target). `tests/backend/pytest/test_architecture_deepening_contracts.py` is a separate **1700-line file with 68 functions and 130 `hasattr` pins** — this is the file with the dead-type-pin anti-pattern. `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts` is the canonical FE authz invariant home (5 tests pass).

`docs/security/{authorization-capability-contract.md/.json, capability-catalog.json}` plus `docs/adr/` (ADR-001 capabilities, ADR-002 service-owned transactions, ADR-005 archivable, ADR-007 bounded contexts + Amendment 1, ADR-010 forward-only migrations, ADR-012 KRI period algebra SSOT).

---

## 4. Cross-Cutting Anti-Patterns

Eleven themes emerged across the 23 verified findings reports (R1.1–R5.1). Ordered by leverage on the final audit.

### Theme 1 — Contract dataclasses locked by hasattr (🔴)

**What**: "Architecture-deepening" commits produced ~22 typed dataclass contracts that are never instantiated, returned, or imported — only pinned by `hasattr` assertions in `tests/backend/pytest/test_architecture_deepening_contracts.py`. The test suite ratchets dead code into permanence.

**Evidence (final list per R3.8 + R5.1)**:
- `_entity_mutation_lifecycle/contracts.py`: `EntityMutationOptions`, `EntityApprovalPlan`, `EntityDirectApplyPlan` + `EntityMutationKind` Literal has dead `"no_op"`/`"blocked"` branches
- `_deadline_execution/contracts.py`: `DeadlineRunPlan`, `DeadlineRunOutcome`
- `_deadline_execution/plans.py:14`: `build_deadline_notification_plan`
- `_issue_register/linked_context.py`: `IssueLinkedContextDefinition`, `IssueRegisterPlan`, `IssueSourceMutationPlan`
- `_vendor_governance/links.py`: `VendorLinkAccessPlan`, `VendorLinkedResourceProjection`
- `_vendor_governance/reports.py`: `VendorReportDefinition`
- `_directory_identity/lifecycle.py`: `DirectorySyncOutcome`, `DirectoryImportOutcome`
- `_dashboard_metrics/lifecycle.py`: `DashboardMetricPlan`, `DashboardMetricOutcome`, `DashboardSnapshotDecision`
- `_quarterly_comparison/composition.py`: `MetricAvailability` (R2.7 originally called LIVE; R3.8 verified zero constructions)
- `_register_listings/lifecycle.py`: `RegisterListingDefinition` alias, `RegisterListingCriteria`, `RegisterSerializerContext`
- `_reporting/exports/lifecycle.py`: `ReportExportExecutionPlan`, `ReportExportOutcome`

**Why it matters**: These tests look like architecture invariants but enforce nothing about behavior. Removing them unlocks ~1500 LOC of speculative scaffolding and clarifies what's actually load-bearing. **Adjacent**: Theme 2 (god packages produced many of these dataclasses), Theme 11 (ADR drift).

### Theme 2 — God packages reaching across domains (🟡)

**What**: Two "lifecycle" packages have outgrown bounded contexts.

**Evidence**:
- `_entity_mutation_lifecycle/archive_plans.py` reaches into `_authorization_capabilities`, `_riskhub_config`, `approval_scenario_policy`, plus `app.models` (Risk/Control/KRI/Vendor model classes) — no direct service-layer vendor or kri-history imports (triage T3.5 corrected R2.1's "vendor + kri" framing)
- `_approval_execution/{kri_value_submission,kri_history_correction,kri_generic_edit,delete_side_effects}.py` orchestrates across 5 domains (risks/controls/kris/vendors/authz) — verified primary god-package symptom

**Why it matters**: These are where every new approval flow accretes. Without explicit domain boundaries the next mutation kind adds another cross-domain import. **Adjacent**: Theme 3 (transactions), Theme 7 (dead packages produced by deepening commits).

### Theme 3 — Service-side commits without locality (🟡)

**What**: 50 service-side commits across 23 files (triage T2.3 + T4.3 + main-thread recount; audit text was off-by-one), 39 of which have no rollback proximity. `commit_service_transaction` (`backend/app/services/transaction_boundary.py:6-8`) is a vestigial endpoint-migration shim (zero service callers; called by 16 endpoint files); `commit_auth_transaction` (`_auth_session_workflow/transactions.py:12`) wraps `try: commit / except: rollback; raise` correctly but its `boundary: str` parameter is **decorative** — appears in signature + docstring but is never referenced in the function body. The "boundary tag" contract is policy theater today.

**Inventory per R3.9 (by package)**:

| Package | Count | Wrap pattern |
|---|---|---|
| `_issue_workflow/execution.py` | 8 | bare commit; no try/except |
| `_risk_questionnaires/lifecycle.py` | 5 | bare commit |
| `_kri_history/{governance,direct_application}.py` | 4 | mostly wrapped |
| `_entity_mutation_lifecycle/{archive,direct}_apply.py` | 6 | ALL wrapped |
| `_vendor_governance/lifecycle.py` | 4 | bare (allowlisted) |
| `_notification_inbox/lifecycle.py` | 3 | bare |
| `_identity_access_lifecycle/{execution,profile_updates}.py` | 3 | bare |
| `_control_execution/{workflow,link_policy}.py` | 3 | bare |
| `_riskhub_config/lifecycle.py` | 2 | bare (allowlisted) |
| `_orphaned_items/{resolution,flagging}.py` | 2 | bare |
| `_vendor_links/workflow.py` | 2 | wrapped |
| `_approval_execution/resolution.py` | 1 | wrapped |
| `_auth_session/{sso_identity,refresh}.py` | 2 | bare |
| `_auth_session_workflow/transactions.py` | 1 | helper itself |
| `_deadline_execution/executor.py` | 1 | wrapped via `begin_nested` loop |
| `ad_deprovision_service.py` | 2 | bare |

**Total: 50 sites in 23 files** (audit's original text said 49/22; the table itself sums to 50 — triage T2.3 + T4.3 + main-thread Bash recount confirmed 50/23; the `_deadline_execution/executor.py` row was missing from the running narrative count).

**Why it matters**: ADR-002 endpoint perimeter ratchet is at zero (clean), but the interior never adopted a canonical primitive. Non-HTTP entrypoints (scheduler, worker) that share these service functions can leak partial state on commit failure. **Adjacent**: Theme 4 (outbox bypass), Theme 11 (ADR drift).

### Theme 4 — Outbox bypass + untracked operational loss (🔴)

**What**: One real outbox bypass plus a broader pattern of swallowed-then-untracked failures and opt-in/undocumented metrics export.

**Evidence (definitive per R3.7)**:
- `_kri_history/direct_application.py:207` — `NotificationService.create_notification` direct call for KRI breach notification. **No replay path.** Best-effort batch (`run_best_effort_notification_batch`, line 211) swallows errors.
- `_deadline_execution/executor.py:37` — same call, but **acceptable** because scheduler replays via `has_recent_deadline_notification` dedupe (R3.7 verified).
- `core/approval_helpers.py` — was originally accused as the third bypass (R1.3); R2.8 + R3.7 verified it uses `OutboxService.enqueue` correctly at line 282.
- `_admin_telemetry/lifecycle.py:58-62` — DB probe swallows `Exception → db_status="error"` with **no `logger.*` call** at all.
- `_approval_queue/projection.py:42-47` — `logger.error` (not `.exception`, no traceback) + `skipped_corrupt_payloads` counter (line 70) never reaches API response, audit log, or metric.
- Prometheus `/metrics` is wired in `main.py:268-275` when `METRICS_ENABLED=true`, and `RATE_LIMIT_BACKEND_UNAVAILABLE_TOTAL` is scrapable under that setting. The gap is that `metrics_enabled: bool = False` defaults off, the setting is not documented in deployment env examples, and OpenTelemetry export is absent.

**Why it matters**: Highest-leverage operational gap. Outbox replay is the system's main durability story; one bypass plus opt-in/undocumented metrics means a single failure mode can still run silently in prod. **Adjacent**: Theme 3 (transactions), Theme 5 (frontend resilience), Theme 11 (lock scope too narrow).

### Theme 5 — Frontend resilience & accessibility holes (🔴)

**What**: No global error containment, route guards that rely on sidebar visibility, dialogs without ARIA, and one effect-dep clobber that wipes in-flight user typing.

**Evidence (per R3.6)**:
- No `ErrorBoundary` anywhere in `frontend/src/` (grep returns 0 files). Single render crash → app-wide white screen.
- Unguarded routes: `vendor-reports`, `audit-trail` in `routing/business.tsx:194-202`; `/admin`, `/admin/docs` in `routing/admin.tsx:9-22`. Only sidebar `isVisible` hides them — typed URL bypasses.
- `useRemediationPlanWorkflow.ts:57-69` effect deps include `issue.updated_at` and `issue.remediation_plan` (object ref). Saving fires `syncIssue` → ref changes → effect re-runs → input clobbered. **Saving a new progress value wipes any in-flight typing.**
- `ConfirmDialog.tsx:111-200` + `ArchiveConfirmDialog.tsx:60-163` lack `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap, close-button `aria-label`. Only 4 modal-ish components in the codebase use proper ARIA roles.

**Why it matters**: Capability bypass + zero error boundary + a11y gaps + dep clobber = a single render crash in any admin panel takes down the whole app for a user who shouldn't have been there in the first place. Easiest user-visible win in the audit. **Adjacent**: Theme 4 (observability), Theme 8 (frontend duplication).

### Theme 6 — N+1 queries in hot read paths (🟡)

**What**: Five confirmed N+1 patterns on tenant-scoped read paths.

**Evidence (per R3.1)**:

| Endpoint | N+1 pattern | Scale |
|---|---|---|
| `dashboard/departments.py:50-138` `get_department_metrics` | 7 queries per department in for-loop + 1 outer dept query | `1 + 7N_depts` (10 depts → 71 queries) |
| `_dashboard_metrics/lifecycle.py:89-125` enum-loop counts | `ControlStatus/Form/Frequency/RiskStatus` enum iteration | ~14 queries → 3 `GROUP BY` |
| `_issue_register/projection.py:29-30` `serialize_issue_summaries_for_actor` | Per-row `load_capabilities` (no preload override) | ~7 round-trips × N rows; 50-row page → 350+ queries |
| `approval_queue_visibility.py:77-86` | Per-row visibility check, Python filter BEFORE pagination | `O(approvals × 3)` |
| `_dashboard_metrics/issues.py:31-44` `_load_scoped_issues` | Full table fetch ×3 per dashboard call (summary/aging/severity) | Linear with tenant issue count |

**Mitigation today**: `DASHBOARD_OVERVIEW_CACHE` (15s TTL) at `dashboard/overview.py:30` caps the dashboard pain at one cold call per 15s; bounded but not solved.

**Why it matters**: All five live on the hottest tenant-scoped read paths. Tied to Theme 7's "4 dashboard endpoints reach into ORM" anti-pattern — dashboards bypass the register-listing preload discipline that already exists. **Adjacent**: Theme 7 (ORM bypass), Theme 4 (observability — no slow-query metric).

### Theme 7 — Dead code pinned by tests (🟡)

**What**: Dead packages and files that grep-clean but exist anyway, surviving because of architecture-lock TOML entries or `hasattr` tests.

**Evidence (verified by Bash grep during synthesis)**:
- `backend/app/api/v1/endpoints/auth/_sso_helpers.py` — **314 lines**, **zero direct importers** (verified). Byte-for-byte duplicates of code in `_auth_session/{sso_challenges,sso_identity,jit}.py`. The live SSO flow routes through `_auth_session.resolve_sso_exchange`.
- `backend/app/api/v1/endpoints/controls/_helpers.py` — **86 LOC** (2961 bytes), **zero callers** (R3.7 + main-thread verified).
- `backend/app/services/_directory_sync/` — README only, no Python files. But still classified as bounded-context adapter in `_bounded_context_adapters.toml:5`. **Phantom adapter** propping up `expected_disjoint_count = 32`.
- `backend/app/services/_approval_execution/kri_changes.py` — 21-line shim wrapping `build_kri_value_mutation_changes`; zero callers.
- `scripts/security/authz_validator/` — 11 modules (`__init__` + 10 module files), all `from authz_contract_validator.X import *` shims; no production callers (1 test-only consumer).
- `backend/app/api/v1/endpoints/vendors/_shared.py:_get_vendor_with_deps` — sole symbol unused.
- `backend/app/api/v1/endpoints/users/__init__.py:3` — `get_password_hash` re-export with no in-code caller, BUT **invariant-protected** by `AGENTS.md:164` + `docs/agent/ENDPOINT_INVARIANTS.md:15` (cannot be deleted without amending the invariant contract first; per triage T2.8).
- `backend/app/api/v1/endpoints/notifications.py:115-134` — `trigger_kri_deadline_check` endpoint with no frontend caller.
- `backend/app/services/_reporting/counts.py:count_high_risks` — only test caller + facade re-export.
- `backend/app/services/_config/lookup.py:get_config_sync` — no production callers (planning-doc-only references).
- `backend/app/services/export_snapshot_service.py:84-130 apply_kri_value_as_of` — no callers; KRI as-of handled by `_reporting/exports/fetch.py` instead.
- `backend/app/services/_orphaned_items/governance.py:33 OrphanResolutionPlan` — 4-field copy, only producer is dead `orphan_resolution_plan()`. Plus **name collision** with `resolution_plan.py:22 OrphanResolutionPlan` (different shape).
- `frontend/src/components/layout/Header.tsx` — no `<Header` consumers anywhere; barrel re-export at `components/layout/index.ts:3` is the only reference.
- `frontend/src/components/access/usersTablePresentation.ts:10-26` — `canChangeUserActiveStatus`, `canBreakGlassEnableUser`, `canEditAccessUser` — 2 of 3 fully unused, 1 used only in one E2E test.
- `frontend/src/pages/approvals/ApprovalList.tsx:40` — `currentUserId: _currentUserId` (accepted, renamed-to-underscore, never read); parent `ApprovalsPage.tsx:77` still passes it.

**Underscored aliases that architecture tests explicitly forbid but live anyway**:
- `_issue_workflow/loading.py:68-70`: `_get_issue_with_relations`, `_get_readable_issue_or_404`, `_get_writable_issue_or_404` — `test_issue_shared_barrel_has_no_underscored_reexports_red.py:22-24` forbids these names.
- `_auth_session/sso_identity.py:84`: `_log_failed_sso = log_failed_sso`
- `_auth_session/jit.py:194`: `_resolve_sso_user = resolve_jit_user`
- `_graph_directory/service.py:140`: `__reset_graph_token_cache_for_tests` dunder wrapper

**Why it matters**: Each survives because of an architecture-lock TOML entry or a `hasattr` test. Pruning requires deleting the lock first. Same root cause as Theme 1: ratcheting tests preserve shape, not behavior.

### Theme 8 — Frontend architecture duplication (🟡)

**What**: Patterns that exist as a uniform service in backend but are hand-rolled per-page in frontend.

**Evidence (per R1.9 + R2.2 + R3.6 + main-thread verification)**:
- **4 of 5 `useXPageState.ts` hooks** in `frontend/src/pages/{risks,issues,vendors,kris}/` duplicate `useRegisterPageController.ts` from `pages/shared/`. `pages/controls/useControlsPageState.ts:85` already uses the controller as the migration template (R5.2 was right; R5.4's reversal was wrong; T2.9 + T3.3 + T3.5 + T4.3 all confirmed). ~560 LOC dedup remaining.
- **Two parallel detail-fetch rails**: `useDetailResource.ts` (manual `useState`/`useEffect`/no cache, used by 3 detail pages) vs `useIssueDetail.ts` (React Query, used by 1). 3 detail pages get no dedup/cache/SWR/retry.
- `react-hook-form` installed but **8+ forms hand-roll validation** with repeated `errors.X_required` patterns: `IssueCreateForm`, `IssueQuickCreateModal`, `VendorFormContainer`, `RiskForm`, `KRIFormContainer`, `RoleModal`, `AccessEditModal`, others.
- **`resolveCapabilityFlag` uniformity not enforced**: 15+ files use `capabilities?.can_X === true` directly; others use `resolveCapabilityFlag(capabilities, 'can_X')`. Both compile to the same `value === true` check (`lib/capabilities.ts:5-10`), so it's style drift only; but no test enforces the canonical form.
- **`useKriFormState.ts:88` has 14 setX callbacks** (R2.4 corrected R1.9's "12") each dispatching `{type: 'patch'}` actions — should be a single `set<K>(field, value)`.
- **6 access-component files use `defaultValue: 'English string'`** (i18n drift): `pages/UsersPage.tsx:116,130`, `components/users/DirectoryUserImportPanel.tsx:62,64,92,94,109,121,130,154,155,163,164`, `components/users/ADUserPicker.tsx:28`, `pages/users/BreakGlassEnableDialog.tsx`, `pages/users/UsersPageHeader.tsx`.
- 3 different `staleTime` values across React Query usage (`60_000` default, `30_000` for issue detail, `5*60*1000` for riskhub config) — no documented policy.
- `lib/issueQueryKeys.ts` lives outside the `lib/queryKeys/` registry.

**Why it matters**: Every new register/detail page chooses an inconsistent pattern. The register listings have backend uniformity (Theme 6 ✅) without matching frontend uniformity. **Adjacent**: Theme 5 (frontend resilience), Theme 9 (listing duplication).

### Theme 9 — Listing & archive code duplication (🟡)

**What**: Cross-entity duplications that have been deferred because tests don't reward them.

**Evidence (per R2.2)**:
- `_register_listings/{controls,risks,kris}.py` — sentinel constants `*_GROUP_UNLINKED_VENDOR = "__unlinked_vendor__"` + `*_GROUP_UNCATEGORIZED = "__uncategorized__"` are **3× identical literal strings** (constant NAMES differ by prefix). `_register_listings/vendors.py:34` has a structurally parallel `VENDOR_GROUP_UNLINKED_RISK = "__unlinked_risk__"` — DIFFERENT literal, different domain semantics. Triage T3.5 + T4.3 corrected R2.2's "4× identical" framing.
- Vendor-context subqueries in `controls.py:159`, `kris.py:110`, `risks.py:76` — structurally identical (3×).
- `vendor:`/`risk:` group-filter prefix handling repeated 4× in `controls.py:309`, `kris.py:228`, `risks.py:185`, `vendors.py:396`.
- `_entity_mutation_lifecycle/archive_plans.py:164-361` — `archive_risk_detail`, `archive_control_detail`, `archive_kri_detail` are 60-line variations on the same template (3 × ~60 LOC).
- `_entity_mutation_lifecycle/archive_plans.py:106-161` — `archive_X_no_commit` three variants (3 × ~17 LOC).
- `_entity_mutation_lifecycle/policy.py:70-107` — `assert_no_pending_delete` vs `assert_no_existing_pending_delete_request`: **same SQL, different exception class** (`ConflictError` vs `ValidationError`).
- `_approval_execution/{kri_value_submission,kri_history_correction,kri_generic_edit}.py` — 3 KRI side-effects carry **unused `department_id`** parameter (R2.2 corrected R1.2's "4" — `delete_side_effects.py` doesn't have this param).
- 3 `resolve_safe_default_role` implementations: `_auth_session/jit.py:37` (`RuntimeError`), `_identity_access_lifecycle/directory_import.py:31` (`ServiceFailure`), `endpoints/auth/_shared.py:165` (`HTTPException`).
- `directory_provider_service.py:121` vs `_graph_directory/service.py:110` — `_to_directory_user` duplicated (7-field normalization).
- Triple-validation chain for "Email already registered" — 3 service sites in `_identity_access_lifecycle/{access_scope.py:74-79, profile_updates.py:55-56, profile_updates.py:105-108}` plus Pydantic `EmailStr` + DB partial unique index `ux_users_email_lower`.

**Why it matters**: Most duplications are 1-pass extractions that have been deferred because tests don't reward them. Same forces as Theme 1: nothing punishes copy-paste. **Adjacent**: Themes 1, 7.

### Theme 10 — Endpoint → private-service bypass (🟡)

**What**: Endpoints freely reach into private `_xxx` packages; the ADR-001 stated invariant ("no direct per-resource capability imports outside the Module internals") has no enforcement.

**Evidence (per R2.1 + R3.4 + R3.10 + main-thread verification)**:
- **135 `from app.services._xxx` imports in endpoints** (R2.1 grep). No architecture test guards this — the existing `test_backend_service_modules_do_not_import_endpoint_adapters` only checks the reverse direction.
- **Real authz facade bypasses** (per R3.10 definitive):
  - `endpoints/users/summary.py:18` imports `build_me_capabilities` from private path; **facade has it** — true bypass.
  - `endpoints/admin/capabilities.py:8`, `endpoints/riskhub/approval_scenarios.py:11`, `endpoints/riskhub/risk_types.py:10` — three FORCED bypasses because the facade doesn't re-export these builders (intentional per contract, see §8).
  - `_register_listings/risks.py:27` — service-layer true bypass importing `risk_capabilities` from private path.
- **4 dashboard endpoints reach directly into ORM** instead of going through `_dashboard_metrics/`: `dashboard/risks.py:25-198`, `dashboard/kris.py:22-71`, `dashboard/controls.py:22-117`, `dashboard/departments.py:18-141`. Only `dashboard/summary.py:28` and `dashboard/issues_metrics.py:23-47` do it right.
- **3 restore endpoints reach into ORM** while update/archive go via services: `risks/crud/restore.py:27-78`, `controls/crud/restore.py:27-80`, `kris/crud/restore.py:28-86`.
- **Risk-code retry loop lives in endpoint, not service** (`endpoints/risks/crud/create.py:42-120`): `MAX_RETRIES = 5` with `IntegrityError → rollback → loop`. ADR-002 interior-ownership violation.
- **115 endpoint files import `app.models`** (per R2.1 grep) — ORM types leak through the API boundary.
- **`dashboard/overview.py:21-26` imports route handlers from sibling endpoint modules** ("routes calling routes" — `build_control_trends`, `get_department_metrics`, `get_issue_aging`, etc.).

**Why it matters**: The endpoint perimeter ratchet (ADR-002 commits) is enforced but the broader perimeter (ADR-001 imports) is not. **Adjacent**: Theme 3 (interior commits), Theme 11 (ADR drift).

### Theme 11 — ADR & architecture-lock drift (🟡)

**What**: The 197/197 architecture-lock suite passes; what the locks **don't** cover is where the rot lives. The meta-theme: gates green ≠ code clean.

**Evidence**:
- **ADR-002 text drift** (per R3.4): "Hard Expiration on Auth-Flow Exemption" describes a state that no longer exists (allowlist empty since cutover). `commit_service_transaction` named in ADR as a primitive but is a vestigial endpoint shim with 16 endpoint callers but **zero service callers** (Theme 3).
- **ADR-001 unenforced invariant**: "No direct per-resource capability imports outside the Module internals" has no lock test (Theme 10).
- **Architecture-lock test scope too narrow**: `test_issues_outbox_only_emit_red.py:13-16` only covers `_issue_workflow/` + `endpoints/issues/`. The KRI breach bypass at `_kri_history/direct_application.py:207` goes uncaught (Theme 4).
- **TOML allowlist labeling**:
  - `_capabilities_all_allowlist.toml` has 16 entries with `intent = "phase-3-deprecate"` (12) or `"keep"` (4) — `intent` is **decorative**; the test (`test_w10_capabilities_all_allowlist_red.py:34-37`) only reads `name`.
  - `_capability_catalog_access_user_baseline.toml:1` `expected_capability_count = 8` is asserted with `>=` against a catalog of 25 surfaces — meaningless floor.
  - `_endpoint_commit_allowlist.toml` `allowlist = []` with assertion `len(allowed) <= 8` — ceiling has no meaning today.
  - `_naming_allowlist.toml` empty `paths = []` — exists only as a docs-anchor for `test_w11_docs_index_completeness_red.py:34`.
- **`OrphanResolutionPlan` name collision** in same package (governance.py:33 vs resolution_plan.py:22, different shapes).
- **`_bounded_context_adapters.toml:5`** classifies empty `_directory_sync` as adapter — phantom-package detection has no enforcement.
- **Test pattern inconsistencies**: `test_w12_get_current_user_isolation_red.py:11` and `test_w12_issue_status_automation_lock_red.py:13` use inline allowlists; other commit-ratchet tests externalize to TOML. `test_monitoring_response_shim_removed_red.py:17` uses `subprocess.run(["grep", ...])` while siblings use `ast.parse`.
- **Two near-identical tests** `test_w12_vendor_governance_service_commit_ratchet_red.py` + `test_w12_riskhub_config_service_commit_ratchet_red.py` should parametrize.
- **5 single-assertion negative-existence tests** (`*_shim_deleted_red.py`, `*_facade_removed_red.py`, `*_wrapper_deleted_red.py`) could merge into one parametrized ratchet.
- **`scripts/security/authz_validator/`** is a complete duplicate-package shim of `scripts/security/authz_contract_validator/` (zero production callers).

**Why it matters**: This is the meta-theme. Every other theme has at least one finding that's invisible to the green-light test suite. **Adjacent**: all themes — this binds them.

### Narrative arc (the spine of the audit)

The **architecture-deepening commit wave produced shape without substance**, and the test suite ratcheted that shape into permanence. A burst of "deepen architecture for X" commits introduced ~22 typed contract dataclasses (Theme 1) which were immediately pinned by `hasattr`-style assertions in `test_architecture_deepening_contracts.py` — so they survive without ever being instantiated. The same commits accreted two god packages (`_entity_mutation_lifecycle`, `_approval_execution` — Theme 2) where every new cross-domain mutation now lands, and a TOML-locked phantom adapter (`_directory_sync`, Theme 7) that exists in the architecture map but not in code.

Meanwhile the **service interior never adopted the named transaction boundary** that the endpoint-perimeter ratchet was supposed to enable: `commit_auth_transaction` is the right pattern but lives only in `_auth_session_workflow/` (Theme 3), while 39 services commit far from their writes and one — KRI breach notification — bypasses the outbox entirely (Theme 4). The endpoint perimeter itself is porous (135 private-package imports, ORM-reach restore endpoints, facade bypasses in `users/summary.py` and `_register_listings/risks.py` — Theme 10). Operational observability that would surface any of this in production is only partially wired: Prometheus `/metrics` exists behind `METRICS_ENABLED=true`, but the setting defaults off, is not documented in deployment env examples, and OpenTelemetry export is absent (Theme 4).

The **frontend mirrors the backend's shape-without-substance**: register listings have backend uniformity (preload + ownership sets verified clean across risks/controls/kris; issues+vendors use different patterns — see §12) but the corresponding frontend has 4 of 5 page-state hooks still un-migrated to the shared controller (Theme 8), inconsistent React Query adoption, 8+ hand-rolled validations despite `react-hook-form` installed, English-string i18n defaults in 6 files, and no `ErrorBoundary` to contain a render crash — combined with capability-bypassable admin routes (Theme 5).

Underneath, the **duplications keep growing** (3× identical sentinel patterns plus 1 structurally parallel vendor/risk sentinel, 3× archive variants, 3× `resolve_safe_default_role`, 2× orphan-resolution plans with the same name — Themes 7, 9) because the lock suite measures *that* code exists in the right TOML category, not whether it's the *same* code. **ADR drift** (Theme 11) is the meta-pattern: the gates are 197/197 green; what the gates don't cover is where the rot lives — an architecture-lock invariant scoped to one domain, missing unique constraints on dominant sort keys, and an in-memory lockout backend with no multi-worker guard outside supported production Redis mode.

---

## 5. Top 10 Deepening Opportunities (Ranked)

Per `/improve-codebase-architecture`. Score = coupling × testability × (1/cost) on a 1–5 scale per axis. See R5.3 for full per-axis breakdown.

| Rank | Target | Severity | Score | Critical-path? |
|---|---|---|---|---|
| 1 | Adopt `commit_service_boundary` canonical primitive (generalize `commit_auth_transaction`) | 🔴 | 8.3 | yes — unlocks #3, #4, #6 |
| 2 | Promote outbox-only invariant to global architecture lock | 🔴 | 12.5 | independent — quick win |
| 3 | Architecture-lock test redesign: `hasattr` → behavior pins | 🟡 | 3.3 | yes — prereq for #4, #6, #7 |
| 4 | `_register_listings/*` declarative `ListingDescriptor` registry | 🟡 | 4.0 | yes — after #3 |
| 5 | Dashboard endpoints → `_dashboard_metrics/{risks,kris,controls,departments}.py` builders | 🟡 | 6.7 | independent of #2/#3 |
| 6 | Endpoint → private-service import discipline lock | 🟡 | 3.0 | needs #1, #5, #7 first |
| 7 | Restore endpoints → `_entity_mutation_lifecycle/lifecycle.py` orchestrators | 🟡 | 4.5 | prereq for #6 |
| 8 | Frontend register page-state migration to `useRegisterPageController` | 🟡 | 5.0 | independent (frontend lane) |
| 9 | Frontend detail-fetch consolidation on React Query | 🟡 | 3.0 | depends on #8 |
| 10 | Deadline orchestrators templating via `DeadlineRun` driver | 🟢 | 1.8 | deferrable |

**Critical-path backend chain**: 1 → 3 → {4, 5, 7} → 6. **Frontend lane**: 8 → 9.

### Dropped from the Top 10 (with rationale)

- **God packages `_entity_mutation_lifecycle`/`_approval_execution`** — real coupling but the resolution is a *decision* not a deepening. Recommend ADR-007 Amendment 2 documenting whether descriptor-driven orchestration is the consolidation path, revisited after #4 demonstrates the pattern.
- **Capability facade public surface decision** — subsumed by Rank 6 (the import-discipline lock catches both the facade drift and the broader pattern).
- **`_directory_sync` phantom adapter** — 5-minute cleanup ticket, not a Top-10 deepening.
- **`_kri_history/corrections.py` lock-order alignment** — single-module bug-fix, tracked as a contract test ("KRI loaded before issue lock").
- **ADR-002 text refresh** — documentation half of Rank 1; ships with the primitive.

---

## 6. Top 15 Simplification Targets (Ranked)

Per `/simplify`. Score = LOC × call-sites × confidence × (1−risk). Quick-wins extracted at the end.

| Rank | Target | LOC | Call-sites | Confidence | Risk | Score |
|---|---|---|---|---|---|---|
| 1 | Migrate 4 frontend `useXPageState.ts` → `useRegisterPageController` (controls already migrated as template) | ~560 | 4+ | high | medium | 3,024 |
| 2 | Delete `_entity_mutation_lifecycle/contracts.py` dead types (`EntityMutationOptions`/`EntityApprovalPlan`/`EntityDirectApplyPlan` + 19 more dead dataclasses) + drop `hasattr` pins | ~250 | 0 (test-only) | high | low | 1,250 |
| 3 | `archive_X_no_commit` + `archive_X_detail` 6-fn consolidation in `_entity_mutation_lifecycle/archive_plans.py` | ~180 | 9 | medium | medium | 583 |
| 4 | `_register_listings/*.py` shared sentinels module | ~140 | 4 | high | low | 504 |
| 5 | 4 export builders → registry pattern (`_reporting/exports/{controls,kris,lifecycle,monitoring}.py`) | ~275 | 4 | medium | medium | 396 |
| 6 | `ArchiveConfirmDialog.tsx` → `ConfirmDialog` with prop config (7 callers) | ~164 | 7 | medium | medium | 413 |
| 7 | `endpoints/auth/_sso_helpers.py` deletion (314 lines, zero direct importers) | ~314 | 0 | high | low | 282 |
| 8 | `scripts/security/authz_validator/` shim package deletion | ~250 | 1 test | high | low | 225 |
| 9 | Vendor-context subqueries 3× → generic helper (`_register_listings/`) | ~45 | 3 | high | low | 122 |
| 10 | `_kri_history/queries.py:get_overdue_kris` ↔ `get_due_soon_kris` 80% identical → shared `_build_kri_period_row` | ~30 | 6 | medium | low | 97 |
| 11 | Group-filter prefix handling 4× → `parse_prefixed_group_value` helper | ~40 | 4 | high | low | 144 |
| 12 | `_to_directory_user` duplicate normalization (AD + Graph) | ~35 | 6 | medium | medium | 107 |
| 13 | `endpoints/controls/_helpers.py` (86 LOC) — zero callers | ~86 | 0 | high | low | 78 |
| 14 | 3 `resolve_safe_default_role` → consolidate with `on_missing` callback | ~20 | 3 | medium | medium | 30 |
| 15 | `_approval_execution/kri_changes.py` deletion (`build_kri_changes` wrapper has zero production/test callers) | ~21 | 0 | high | low | 19 |

**Quick wins (single-PR, low-risk)** — start here:

1. **`scripts/security/authz_validator/`** shim package (~250 LOC, 1 test caller, low risk). Atomic deletion.
2. **`_register_listings/` shared sentinels module** (~140 LOC, 4 callers, mechanical string-constant move).
3. **`_approval_execution/kri_changes.py`** 21-line shim (zero callers).
4. **`_reporting/exports/monitoring.py`** 8-line alias file.
5. **`_register_listings/__init__.py`** 3-line re-export (no consumers).
6. **`endpoints/controls/_helpers.py`** deletion (86 LOC, zero callers; grep confirmed).
7. **`endpoints/auth/_sso_helpers.py`** deletion (314 LOC, zero direct importers; grep confirmed).
8. **`frontend/src/components/layout/Header.tsx`** + 3 dead helpers in `usersTablePresentation.ts` deletion.
9. **`ApprovalList.tsx:40`** discarded `currentUserId` prop + parent prop pass.
10. **`_directory_sync/`** README + `_bounded_context_adapters.toml:5` entry + disjointness baseline update (32 → 31).

**Not safe for Wave 1 deletion** (despite zero in-code callers):
- `endpoints/users/__init__.py:3 get_password_hash` — invariant-protected by `AGENTS.md:164` + `docs/agent/ENDPOINT_INVARIANTS.md:15`. Requires amending the invariant contract first.

### Dead types (Theme 1 inventory for Wave 2)

**22 dead-pinned dataclasses** (definitive per R3.8):

- `_entity_mutation_lifecycle/contracts.py`: `EntityMutationOptions`, `EntityApprovalPlan`, `EntityDirectApplyPlan`
- `_deadline_execution/contracts.py`: `DeadlineRunPlan`, `DeadlineRunOutcome`
- `_deadline_execution/plans.py:14`: `build_deadline_notification_plan`
- `_issue_register/linked_context.py`: `IssueLinkedContextDefinition`, `IssueRegisterPlan`, `IssueSourceMutationPlan`
- `_vendor_governance/links.py`: `VendorLinkAccessPlan`, `VendorLinkedResourceProjection`
- `_vendor_governance/reports.py`: `VendorReportDefinition`
- `_directory_identity/lifecycle.py`: `DirectorySyncOutcome`, `DirectoryImportOutcome`
- `_dashboard_metrics/lifecycle.py`: `DashboardMetricPlan`, `DashboardMetricOutcome`, `DashboardSnapshotDecision`
- `_quarterly_comparison/composition.py`: `MetricAvailability`
- `_register_listings/lifecycle.py`: `RegisterListingDefinition` alias, `RegisterListingCriteria`, `RegisterSerializerContext`
- `_reporting/exports/lifecycle.py`: `ReportExportExecutionPlan`, `ReportExportOutcome`

Plus dead Literal members in `EntityMutationKind`: `"no_op"`, `"blocked"` (verified zero producers).

**Live (do NOT delete — corrects R1 errors)**:

- `EntityMutationOutcome` — 12+ construction sites
- `DeadlineNotificationExecutionPlan` alias — 2 construction sites (kri/issue deadline services)
- `SnapshotSourceDecision` — `composition.py:151`
- `DirectoryProfileUpdateOutcome` — `lifecycle.py:179-180`
- `DirectoryReenableOutcome` — `lifecycle.py:75,85,90`
- All 4 admin telemetry `*Snapshot` types + `AdminOperationOutcome`
- `Questionnaire*Outcome`/`Options` — `_risk_questionnaires/lifecycle.py` heavily uses
- `SideEffectResult` — 40+ usages in `_approval_execution/`
- `IssueLinkedVisibility` — `_issue_register/linked_context.py:190`
- `VendorListingGovernance`, `RegisterListingPlan` — real public types
- `ReportExportDefinition` (empty subclass) — keep with the `is not ExportPipelineDefinition` negative-invariant test (defensible layering pin)

---

## 7. Architecture-Lock Compliance

Per R4.2 empirical run.

**Status: GREEN** — 197/197 pass, 0 failed, 0 skipped, snapshot clean, ~2.5s runtime.

Command: `make -f scripts/Makefile test-architecture-locks` →
`cd backend && ./venv/bin/python -m pytest -q ../tests/backend/pytest/architecture ../tests/backend/pytest/test_w0_harness_contract_red.py --no-cov`

### Scope clarification

The canonical `test-architecture-locks` target runs `tests/backend/pytest/architecture/` (90 test files containing 189 test functions) + `test_w0_harness_contract_red.py` (1 file containing 8 test functions) = **197 total**. It **does NOT include** `tests/backend/pytest/test_architecture_deepening_contracts.py` — that's the 1700-line file with 68 test functions and 130 `hasattr` pins (the Theme 1 / Theme 7 root cause).

### Test counts by category

| Category | Functions |
|---|---|
| W0 harness contract (file outside `architecture/`) | 8 |
| W1 docs cross-link | 1 (parametrized to 2 cases) |
| W3 gate snapshot | 1 |
| W4 bounded-context boundaries | 22 |
| W5 endpoint/auth commit ratchet | 5 |
| W6 register-listing centralization | 2 |
| W7 audit adapter / bc disjointness | 7 |
| W8b archivable encapsulation | 6 |
| W9 schema datetime ban | 1 |
| W10 capabilities allowlist | 1 |
| W11 + W11a + W11b (docs index / dep-override / test-infra) | 5 |
| W12 various ratchets (alembic, auth, committee, mock-auth, outbox idempotency, etc.) | 13 |
| W13 various removal/ssot/adapter checks | 24 |
| ADR-007 amendment | 4 |
| KRI period algebra SSOT | 2 |
| Shim/facade/wrapper deletion (negative existence) — 5 files | ~5 |
| Other architecture invariants (W4b + non-W contracts) | 89 |
| **Total** | **197** |

Triage T4.2 reconciliation: T2.10's "189 functions" only counted `tests/backend/pytest/architecture/`; the canonical `make test-architecture-locks` target also includes 8 functions from `test_w0_harness_contract_red.py` outside that directory. Both numbers are correct at their respective scopes.

### TOML allowlist health

All `expires_at` are future:

| File | Entries | `expires_at` |
|---|---|---|
| `_archive_allowlist.toml` | 4 | 2026-11-11 |
| `_capabilities_all_allowlist.toml` | 16 | 2026-09-01 |
| `_endpoint_commit_allowlist.toml` | 0 (`[]`) | 2026-11-11 |
| `_naming_allowlist.toml` | 0 (`[]`) | 2026-11-11 |
| `_riskhub_config_service_commit_allowlist.toml` | 2 | 2026-09-01 |
| `_vendor_governance_service_commit_allowlist.toml` | 4 | 2026-09-01 |
| `_bounded_context_adapters.toml` | 6 (incl. phantom `_directory_sync`) | 2026-11-11 |
| `_bounded_context_workflow_pairs.toml` | 11 | 2026-11-11 |
| `_bounded_context_*` (other) | varies | 2026-11-11 |
| `_w7_bounded_context_disjointness_baseline.toml` | expected_disjoint_count = 32 | — |
| `_capability_catalog_access_user_baseline.toml` | expected_capability_count = 8 (vs 25 actual ≥ check) | — |

**Issues** (per R3.4 + Theme 11):

- `_endpoint_commit_allowlist.toml` empty with `len() <= 8` ceiling — ratchet target reached but ceiling now meaningless.
- `_naming_allowlist.toml` empty — exists only as a docs-anchor.
- `_capability_catalog_access_user_baseline.toml = 8` against `>= 25` actual — misleading floor.
- `_bounded_context_adapters.toml:5 _directory_sync` is a phantom adapter (README only).
- `_capabilities_all_allowlist.toml` `intent` field is decorative (test only reads `name`).

---

## 8. Authorization Capability Contract Health

Per R4.3 empirical run + R3.10 definitive verification.

**Status: GREEN** — `python scripts/security/validate_authz_capability_contract.py` exit 0, 0 errors, 0 warnings. `test_w10_capabilities_all_allowlist_red.py` passes. `useAuthz.invariant.test.ts` 5/5 passes.

### Public surface (definitive counts)

| Surface | Count |
|---|---|
| Package `__all__` (`_authorization_capabilities/__init__.py:22-39`) | **16** |
| Facade `__all__` (`authorization_capabilities.py:16-27`) | **10** |
| TOML allowlist (`_capabilities_all_allowlist.toml`) | **16** (1:1 with package) |
| `capability-catalog.json` surfaces | **25** |
| `architecture_refactor_notes` log entries (JSON) | **18** dated 2026-05-03 → 2026-05-17 (triage T2.10 + T4.3 + main-thread recount; audit's "~24" was an estimate) |

### Facade gap (intentional by design per the contract)

The facade is **narrower than the package by design** (10 vs 16): the contract drops `phase-3-deprecate`-tagged symbols and perimeter helpers (`has_capability`, `require_capability`). Missing from facade:

- `approval_scenario_capabilities`
- `department_capabilities`
- `has_capability`
- `require_capability`
- `risk_type_capabilities`
- `role_capabilities`

Plus: **`build_admin_capabilities` is in neither** the facade nor the package `__all__` — only reachable via deep submodule path `_authorization_capabilities.admin`.

### Bypass classification (per R3.10)

Of the 4 endpoint imports of `app.services._authorization_capabilities`:

| File:line | Symbol | In facade? | Classification |
|---|---|---|---|
| `endpoints/admin/capabilities.py:8` | `build_admin_capabilities` | No (missing from both) | FORCED (worst case) |
| `endpoints/riskhub/approval_scenarios.py:11` | `approval_scenario_capabilities` | No | FORCED |
| `endpoints/riskhub/risk_types.py:10` | `risk_type_capabilities` | No | FORCED |
| `endpoints/users/summary.py:18` | `build_me_capabilities` | **Yes** | **TRUE BYPASS** |

Plus 1 service-layer true bypass: `_register_listings/risks.py:27` imports `risk_capabilities` from private path.

### Recommendation

Option A (conservative): leave facade narrow; add architecture lock asserting "endpoints/services don't import from `app.services._authorization_capabilities` for names that exist in `app.services.authorization_capabilities`" — catches the 2 true bypasses and prevents drift. Forced bypasses stay.

Option B (consistent): add the 6 missing builders to the facade + promote `build_admin_capabilities` to package `__all__`. Migrate 5 imports. Removes the "FORCED" category at the cost of slightly widening the public surface beyond the deprecation roadmap.

R5.3's Rank 6 recommends Option A (cheaper, preserves the deprecation track).

---

## 9. ADR Drift

Per R3.4. Six ADRs surveyed; two need text updates; one needs a code alignment decision.

| ADR | Status | Drift |
|---|---|---|
| **ADR-001** Capabilities unification | PARTIAL | No lock test enforces "no direct per-resource imports outside the Module internals" (the ADR's stated invariant #2). Deep imports persist in `_register_listings/{risks,controls,kris}.py` for `pending_approvals_for_resources` from `_authorization_capabilities.common`. |
| **ADR-002** Service-owned transactions | PARTIAL | (a) §"Hard Expiration on Auth-Flow Exemption" describes vanished state — allowlist is empty since migration completed. (b) §Decision implies a named `commit_service_transaction` primitive that is vestigial (zero service callers). |
| **ADR-005** ArchivableMixin + status orthogonality | ALIGNED | All clean. `ControlStatus.inactive` correctly orthogonal to `is_archived` per `models/control.py:39-65` doc-comment cross-reference. |
| **ADR-007** Bounded contexts + Amendment 1 | PARTIAL | `_directory_sync/` classified as adapter in `_bounded_context_adapters.toml:5` but is README-only. Disjointness lock counts directories not packages — phantom-package detection has no enforcement. |
| **ADR-010** Forward-only Postgres migration | ALIGNED | Forward-only `downgrade()` (raising `NotImplementedError`) in all 3 referenced migrations. `check_no_link_orphans` preflight enforced. Lock-monitoring evidence is out-of-band. |
| **ADR-012** KRI period algebra SSOT | ALIGNED | `REPORTING_GRACE_DAYS = 15` lives only in `_kri_history/constants.py:2`. Canonical period helpers single home at `_kri_history/periods.py`. Lock test enforces both. |

### ADR text rewrites needed

1. **ADR-002 §Hard Expiration on Auth-Flow Exemption** — rewrite to "Auth-flow exemptions were retired during cutover; the allowlist at `_endpoint_commit_allowlist.toml` is empty and the lock now asserts the zero-entry invariant."
2. **ADR-002 §Decision** — either (a) remove the implied `commit_service_transaction` named primitive (it's a vestigial shim), or (b) name the canonical service-owned commit helper (recommend promoting `commit_auth_transaction` to a generic `commit_service_boundary`).
3. **ADR-007 Amendment 1 §Migration Impact** — resolve `_directory_sync` phantom: either populate the package from `ad_deprovision_service.py` content, delete the directory + adapter-TOML entry + update baseline count to 31, or document the placeholder explicitly with a sunset condition.
4. **ADR-001 §Invariant Tests #2** — either add the lock test or strike the invariant from the ADR text.

---

## 10. Sequenced Migration Plan

Per R5.4. 11 waves, ~6–9 weeks of engineering across ~3 reviewers. See R5.4's full report for per-PR detail.

### Wave summary

| Wave | Goal | PRs | Effort | Reversibility |
|---|---|---|---|---|
| 0 | Trivial cleanup (formatting + dead aliases + dead-prop) | 1 | 1 day | trivial |
| 1 | Dead code deletion (`_sso_helpers.py`, `_helpers.py`, `_directory_sync`, `kri_changes.py`, `authz_validator/`, frontend `Header.tsx`) | 3 | 1 week | trivial |
| 2 | Dead-pin retirement (22 dataclasses + `hasattr` assertions + `EntityMutationKind` Literal members) | 1 | 1 week | trivial |
| 3 | Critical correctness (KRI outbox + `UniqueConstraint` + lockout guard + `logger.exception` + `skipped_corrupt_payloads` surfacing) | 3 | 1 week | mixed (alembic in PR-3a) |
| 4 | Frontend critical (ErrorBoundary + RouteGuards + dep-clobber fix + dialog a11y) | 2 | ~3 days | trivial |
| 5 | Performance (dashboard departments to `_dashboard_metrics`, enum-loops to GROUP BY, per-row capability preload, approval-queue SQL filter, introduce composite `(status, created_at)` index on `ApprovalRequest`) | 3 | ~1 week | trivial + 1 alembic |
| 6 | Canonical service-side commit primitive (`commit_service_boundary` helper + ADR-002 amendment + migrate 25 single-commit candidates) | 2 | ~1.5 weeks | medium (mass diff) |
| 7 | Endpoint inline-ORM extraction (restore orchestrators, dashboard service builders, `admin/docs.py` to `_documentation_service`, audit-trail/summary exports to `_reporting/excel`) | 4 | ~2 weeks | medium |
| 8 | Listing consolidation (sentinels, vendor-context, group-filter prefix helpers) | 1 | ~1 week | medium |
| 9 | Frontend page-state migration (4 PRs, one per remaining register — controls already migrated as template) | 4 | ~2 weeks | trivial (per PR) |
| 10 | Frontend detail-fetch migration to React Query | 3 | ~2 weeks | trivial |
| 11 | Architecture-lock expansion (global outbox-only, endpoint→private import discipline, `resolveCapabilityFlag` uniformity, facade-vs-package consistency) | 1 | ~1 week | trivial |

### Critical paths

**Backend long-pole**: Wave 0 → 1 → 2 → 3 → 6 → 7 → 8 → 11. ~7–8 weeks single-threaded.

**Frontend lane** (parallel to backend): Wave 4 (day 1) → Wave 9 (after Wave 7) → Wave 10 (after Wave 9). ~3 reviewer-weeks.

**Parallelizable**:

- Wave 4 from day 1 alongside Waves 0/1/2/3
- Wave 5 alongside Wave 4 once Wave 3 in
- Wave 9 PRs (a–e) parallel across reviewers
- Wave 10 begins once Wave 9b or earlier merges

### Reversibility map

- **Trivially revertible**: Waves 0, 1, 2, 4, 8, 9 (per register), 10, 11
- **Schema-revert (alembic down)**: Wave 3 PR-3a (unique constraint), Wave 5 PR-5c (index)
- **High-blast revert**: Wave 6 PR-6b (commit helper adoption — touches many files), Wave 7 PR-7b (dashboard service split). Mitigation: keep the prior pattern compilable for one release cycle by re-exporting the previous helper.

### Total estimated effort

**6–9 weeks of engineering across 2 backend reviewers + 1 frontend reviewer.** Aggressive single-threaded: ~9 weeks. With Wave 4/5/9 parallelized: ~6 weeks.

### Pre-PR verification directive (per R5.4)

Re-run `git grep` for every file path before starting each PR; any path that disappears between this audit and the PR is a finding already addressed. The R5 reviewer round caught 7 staleness candidates this way.

---

## 11. Per-Domain Findings (Condensed)

Distilled from the 10 R1 reports. Each domain lists 🔴/🟡 highlights; ✅ verified-clean items are aggregated in §12.

### 11.1 services-register-listings (R1.1)

🟡 `merge_collection_filters` duplicate (`_register_listings/vendors.py:79` vs `endpoints/_collection.py:138`) — drop the local. 🟡 Listing grouping has 3× identical sentinel patterns plus 1 structurally parallel vendor/risk sentinel, repeated vendor-context subqueries, and repeated group-filter prefix handling (Theme 9). 🟢 `lifecycle.py:22` `RegisterListingDefinition = CollectionListingDefinition` alias used only by contract test. 🟢 `RegisterListingCriteria`, `RegisterSerializerContext` dataclasses never instantiated.

### 11.2 services-approval (R1.2)

🔴 `_approval_execution/kri_changes.py:10` — 21-line shim, zero callers. 🟡 `kri_side_effects.py:45` dispatcher sniffs `changes` keys (implicit discriminator); should be a `KRIEditKind` enum aligned with `SIDE_EFFECT_HANDLERS` table. 🟡 3 KRI side-effects carry unused `department_id` (R2.2 corrected R1.2: NOT 4 — `delete_side_effects.py` doesn't have the param). 🟡 `approval_queue_visibility.py` is the visibility half of the queue but lives at top-level — move inside `_approval_queue/`. 🟡 `approval_execution_service.py` has 3 sibling authz checks (approve/reject/cancel) each re-deriving privilege tier.

### 11.3 services-mutation-monitoring (R1.3)

🔴 `_entity_mutation_lifecycle/contracts.py` dead dataclasses (Theme 1). 🔴 `_deadline_execution/contracts.py` `DeadlineRunPlan/Outcome` dead. 🔴 `deadline_runner.py` + `deadline_notifications.py` pure re-export shims, single caller. 🟡 3 deadline services share ~300-LOC shape (deferrable per R5.3 Rank 10). 🟡 `archive_X_detail` 3-pattern (Theme 9). 🟡 `assert_no_pending_delete` vs `assert_no_existing_pending_delete_request` — same SQL, different exception class. 🟡 `kri_deadline_service.py:51-55` dead class-level constants. 🟡 `kri_deadline_decisions.py:60` "unreachable" branch (R2.6 corrected R1.3: actually reachable — suppresses week-0 notifications).

### 11.4 services-reporting-dashboard (R1.4)

🔴 `unified_exports/pipeline.py` near-duplicate of `_reporting/exports/pipeline.py` (~75 LOC overlap). 🔴 `unified_exports/_shared.py` byte-for-byte duplicate of `_reporting/exports/shared.py`. 🔴 10 `unified_exports/*.py` shim files (cemented by `test_report_export_routes_use_service_export_definitions:945`). 🟡 4 dashboard endpoints reach into ORM (`dashboard/{risks,kris,controls,departments}.py`). 🟡 N+1 in `dashboard/departments.py:50-138` + enum-loop in `_dashboard_metrics/lifecycle.py:89-125`. 🟡 `_dashboard_metrics` missing builders for risks/kris/controls/departments.

### 11.5 services-auth-identity (R1.5)

🔴 `endpoints/auth/_sso_helpers.py` 314-line duplicate of `_auth_session/{sso_challenges,sso_identity,jit}.py` — zero direct importers (main-thread + triage T2.5 + T2.8 + T3.5 + T4.3 verified). 🔴 `_directory_sync/` empty package (README only). 🔴 3 `resolve_safe_default_role` implementations (RuntimeError / ServiceFailure / HTTPException). 🟡 `_auth_session_workflow/{demo,logout,password,refresh,sso}.py` are 2-line wrappers around `commit_auth_transaction`; the helper's `boundary: str` param is decorative (never read in body). 🟡 `authorization_capabilities.py` facade-of-a-facade. 🟡 `_identity_access_lifecycle/execution.py` direct `db.commit()` at lines **38 AND 69** (`log_user_update_and_commit` + `commit_directory_import`) bypasses workflow boundary. 🟡 Dead `DirectorySyncOutcome` + `DirectoryImportOutcome` (Theme 1); LIVE `DirectoryProfileUpdateOutcome` + `DirectoryReenableOutcome` (do NOT delete).

### 11.6 services-issues-kris-vendors (R1.6)

🔴 KRI breach outbox bypass at `_kri_history/direct_application.py:207` (cross-confirmed). 🟡 `_vendor_links/kri_assignment.py` bridges KRI domain inside vendor package — rename to `kri_bridge.py`. 🟡 `_issue_workflow/serialization.py:8-10` imports underscored private from `_issue_register` (Theme 10). 🟡 3 `IssueLinkedContextDefinition` siblings dead (Theme 1). 🟡 `_vendor_links/workflow.py:286-453` with-commit + no-commit variants duplicate prep (defensible per R2.4 — kept for multi-mutation transactions). 🟡 `_kri_history/queries.py:91-214` `get_overdue_kris` vs `get_due_soon_kris` 80% identical.

### 11.7 services-config-notification (R1.7)

🔴 `_config/lookup.py:131 get_config_sync` — defined but zero call sites (only re-exported by `_config/__init__.py` and `models/global_config.py`; no actual `(...)` invocations). 🟡 `_orphaned_items/governance.py:33 OrphanResolutionPlan` name collision with `resolution_plan.py:22 OrphanResolutionPlan` — same name, different shape, different package members. 🟡 `notification_service.py:193,253,302` broad `except Exception` (R2.6 narrowed: 3 sites real, fan-out tolerance acceptable but exception should be narrower). 🟡 `_config/` vs `_riskhub_config/` naming opaque. 🟡 `_kri_history/direct_application.py:207` calls `NotificationService.create_notification` directly (the outbox bypass — see C-1). 🟢 Outbox pattern (ADR-005) consistently applied: `OutboxService` claim via `FOR UPDATE SKIP LOCKED`, retryable/fatal taxonomy, payloads `extra="forbid"`.

### 11.8 api-endpoints (R1.8)

🔴 `issues/_shared/` package — re-exports only, zero external callers (triage T2.8 definitively confirmed: `issues/crud/{contextual,create}.py` import from `app.services._issue_register` directly, NOT from `._shared`). 🔴 `controls/_helpers.py` (86 LOC) zero callers (main-thread + T2.8 verified). 🟡 16 endpoint modules import `commit_service_transaction` — endpoint perimeter clean (zero `db.commit()` in `api/`). 🟡 Dashboard inline ORM + N+1 (cross-ref R3.1). 🟡 Restore endpoints reach into ORM. 🟡 Create endpoints with business logic (risks/controls/kris/issues + `issues/crud/contextual.py:24-94` near-dup of `create.py`). 🟡 7+ scattered `require_*` factories. 🟡 4 endpoint imports of `_authorization_capabilities` (3 forced, 1 true bypass). 🟢 `deps.py` clean (3 auth helpers, `_resolve_bearer_user` factored). 🟢 `_collection.py`/`_collection_execution.py` clean re-export.

### 11.9 frontend (R1.9)

🔴 No `ErrorBoundary` anywhere. 🔴 `Header.tsx` dead component. 🔴 Unguarded admin/vendor-reports/audit-trail routes. 🟡 4 of 5 `useXPageState.ts` duplicate `useRegisterPageController.ts` (controls already migrated as template). 🟡 `useDetailResource.ts` vs `useIssueDetail.ts` two-rails detail-fetch. 🟡 `useKriFormState.ts:88` 14 setX callbacks (R2.4 corrected R1.9). 🟡 `RemediationPlanCard.tsx:16` `_canApprove`/`_canWrite` underscored props (R2.4 corrected R1.9: deliberate ESLint convention preserving prop contract, NOT dead). 🟡 `usersTablePresentation.ts:10-26` 3 dead helpers. 🟡 `ArchiveConfirmDialog.tsx` duplicates `ConfirmDialog`. 🟡 `buildLegacyAuthz` parallel to `buildAuthz` (R2.4 corrected R1.9: deliberate feature-flag fallback per contract). 🟢 Zero `: any`, 3 justified `as unknown as` casts. 🟢 Skeleton-row count uniform across 5 registers.

### 11.10 tests-docs-security (R1.10)

🔴 `tests/backend/pytest/test_architecture_deepening_contracts.py` pins 22 dead dataclasses via `hasattr`. 🟡 `_capabilities_all_allowlist.toml` `intent` field decorative. 🟡 `_capability_catalog_access_user_baseline.toml = 8` against `>= 25` actual. 🟡 `_endpoint_commit_allowlist.toml` empty with meaningless `<= 8` ceiling. 🟡 `_naming_allowlist.toml` empty (docs-anchor cargo). 🟡 `scripts/security/authz_validator/` shim duplicates `authz_contract_validator/`. 🟡 `_bounded_context_adapters.toml:5 _directory_sync` phantom adapter. 🟡 Inline-allowlist vs externalized-TOML inconsistency. 🟡 `test_monitoring_response_shim_removed_red.py:17` `subprocess.run(["grep"...])` brittle pattern. 🟢 ADR-005 invariants verified clean. 🟢 ADR-007 11 workflow pairs exact match. 🟢 ADR-010 forward-only enforced.

---

## 12. Verified-Clean Highlights

Patterns/modules that the audit examined and judged correctly implemented. Surface these in code review when reviewers wonder "should we change this too?"

**Backend services**:

- `_collection_contracts.py` / `_collection_filters.py` — single-source-of-truth for collection abstractions; all 5 register listings consume these correctly.
- 3 of 5 register listings (risks/controls/kris) preload approvals + ownership-ID sets + capabilities with `can_read_override=True`; per-row DB calls are 0 in those three. **Triage T2.1 + T3.1 + T3.2 correction**: issues capability builder (`_authorization_capabilities/issues.py:30-31`) has no `can_read_override` parameter and incurs **2 per-row DB awaits** (`can_read_issue_id` + `can_write_issue_id`); vendors uses collection-level capabilities only. R3.1's "All 5" framing was an overstatement.
- Export pipelines (`_reporting/exports/{controls,kris,risks,vendors,issues}.py`) preload all relations consumed by `_*_to_row` mappers; no lazy loads in row builders.
- Outbox dispatcher/store split (`outbox/{store,dispatcher}.py`) — `FOR UPDATE SKIP LOCKED` canonical claim, retryable/fatal/dependency error taxonomy, payloads `extra="forbid"`.
- **23 of 25** `with_for_update(...)` sites are single-row PK scopes. Triage T3.2 correction: the 2 multi-row sites are `outbox/store.py:74` (batch claim with `skip_locked=True`) and `_kri_history/corrections.py:39` (locks N open breach-derived issues bounded by `source_id`). Both are safe by construction.
- `_org_chart/invariants.py:acquire_org_chart_lock` advisory-lock pattern correctly applied across user create/deactivate/manager/department mutations.
- Scheduler advisory-lock leader election (`core/scheduler_locks.py`) correct.
- KeyRiskIndicator parent-row lock at `_kri_history/loading.py:25` (`with_for_update(of=KeyRiskIndicator)`, called from `intake.py:36` via `for_update=True`) is the serialization point for duplicate-period prevention. **Triage T3.2 correction**: the lock target is the KRI parent row, not `kri_value_history` itself. Defense-in-depth still missing per C-2.
- ADR-005 `ArchivableMixin` discipline: Risk/Control/KRI/Vendor all inherit the mixin; `archived_clause` (note: not `archive_clause`) is consistent across 4 `_register_listings/` modules (risks/controls/kris/vendors) plus `vendor_reporting_service.py`. Issues uses a status-based lifecycle (`IssueStatus != closed.value`) rather than the mixin.

**SSO/session security**:

- `sso_token_service.py:69-292` — PyJWT with explicit `algorithms=["RS256"]`, audience+issuer+tenant+oid+email-allowlist+exp checks; SSRF guard on JWKS fetch; JWKS rotation on unknown `kid` then fail-closed.
- `_auth_session/sso_challenges.py:30-38` — `_sanitize_return_to` rejects backslash, `\r`/`\n` (header injection), scheme-relative, empty; no open redirect.
- Nonce/state binding correct (`sso_challenges.py:67-134`); **256-bit entropy via `secrets.token_urlsafe(32)` at `:165-167`**; single-use challenge consumption via `await challenge_store.consume(challenge_id)` at `:93`; cookie clearing wired via `_challenge_failure(..., clear_challenge_cookie=True)` at `:47` and `SsoExchangeResolution.clear_challenge_cookie` (triage T3.2 line-citation fix).
- Refresh-session rotation `auth/refresh.py:40-43,97-122` uses `sha256(value)[:16]` for IP/UA telemetry — no raw token/JWT bodies logged.

**Observability & audit**:

- `core/activity_logger.py:111-210` dual-writes DB `ActivityLog` + structured `audit.json.log`.
- `core/activity_redaction.py` separates `DB_ACTIVITY_METADATA_POLICY` and `SIEM_ACTIVITY_METADATA_POLICY` — policy-driven PII redaction.
- Structlog runtime sound: `core/logging_runtime.py:60-108` dual `app.json.log` + `audit.json.log` rotating handlers; `middleware/logging_context.py` injects `request_id`, `client_ip`, `user_id` context.
- Zero PII/sensitive value leakage in logs (grep'd `(token|password|email|hashed)` in logger calls in inappropriate contexts = 0 matches per R3.5).
- Approval audit chain consistent — every applied side-effect terminates in `log_activity`, **either directly** (`edit_risk_control.py:81,120`, `kri_generic_edit.py:123`) **or via delegation** through `_kri_history/approval_execution.py:47,58,88,119,130` (KRI value/history paths) and `delete_side_effects.py`. Chain holds end-to-end; triage T3.2 softened R3.5's "every branch calls" framing.

**Frontend correctness**:

- `frontend/src/authz/useAuthz.ts:7` — strict-capability/legacy switch via `useSyncExternalStore`, no stale renders.
- `contexts/SessionContext.tsx:22` (Provider with memoised value + `useCallback`-stable `hasPermission`) and `PreferencesContext.tsx:18` (two `useMemo`s for state + actions) use the memoised-provider pattern. `DashboardFilterContext.tsx:75` is `createDashboardFilterStore` — a **vanilla external store factory**, not a Provider; the Provider at line 150 uses `useState(createDashboardFilterStore)` and consumers read via `useSyncExternalStore` selector at line 160. All three approaches limit re-renders correctly; triage T3.2 corrected R3.6's mischaracterisation.
- `services/session/store.ts:24` — single-source-of-truth session snapshot.
- `authz/BusinessRouteGuards.tsx:16` — `createBusinessRouteGuard` factory keyed on `Authz` boolean key; clean and type-safe (just isn't applied to all routes, per C-8).
- `pages/issues/issue-detail/useIssueDetail.ts:15` — React Query with proper key + staleTime; the migration template for §10 Wave 10.
- Zero `: any` annotations in `frontend/src/`; only 3 justified `as unknown as` casts (MSAL shim + i18next generics).
- Register skeleton-rows count uniform: `Array.from({ length: itemsPerPage }, …)` across all 5 register `*TableSection.tsx`.

**Gates**:

- 197/197 architecture-lock tests pass (§7).
- 0 errors / 0 warnings from authz contract validator (§8).
- `ruff check backend/`: 0 hits.
- Frontend `tsc --noEmit`: 0 errors.
- Frontend `eslint .`: 0 errors.

---

## 13. Appendix — Adversarial Findings Log

The audit deliberately ran multiple rounds with fresh agents per round. The following R1/R2 findings were OVERTURNED by R2/R3/R5 adversarial verification. Recording them here so reviewers don't re-trip on them.

### R1 claims corrected by R2

| Claim | Source | Corrected by | Reality |
|---|---|---|---|
| `delete_side_effects.py:67` carries unused `department_id` | R1.2 | R2.2 | Function does NOT take `department_id` — only the 3 KRI side-effects do |
| `issues/crud/archive.py` exists | R1.8 | R2.2 | File does NOT exist; only risks/controls/kris have archive.py |
| `controls/useControlsPageState.ts` already uses `useRegisterPageController` (migration template) | R1.9 | R2.2 → R5.2 → R5.4 → triage T2.9/T3.3/T3.5/T4.3 | **R1.9 was right.** R2.2 disputed, R5.2 re-asserted R1.9, R5.4 wrongly reverted to "none migrated", and main-thread + four triage agents reconfirmed: `useControlsPageState.ts:85` DOES import and use `useRegisterPageController`. Wave 9 → 4 PRs, not 5. |
| `unified_exports/pipeline.py` is verbatim duplicate of services pipeline.py | R1.4 | R2.2 | Near-duplicate (~75 LOC shared), not byte-for-byte; `_render_export`/`_stream_binary`/`_get_filename` only live in service version |
| `_config/lookup.py:5` has comment that lies | R1.7 | R2.5 | Line 5 is `from typing import TYPE_CHECKING`; no such comment exists |
| `ControlTrendChart.tsx` and `ThemeContext.tsx` docstrings are noise | R1.9 | R2.5 | Both actually inform — drop from noise list |

### R1/R2 claims corrected by R3

| Claim | Source | Corrected by | Reality |
|---|---|---|---|
| `EntityMutationOutcome` is kept alive only by architecture test | R1.3 | R2.4, R3.8 | 12+ construction sites in `approval_plans.py`/`direct_apply.py`/`archive_plans.py` — LIVE |
| `RemediationPlanCard.tsx:16` `canApprove`/`canWrite` are dead props | R1.9 | R2.4 | Deliberate ESLint convention preserving the prop contract while the inner derivation is canonical |
| `useKriFormState.ts:88` has 12 setX callbacks | R1.9 | R2.4 | Actually 14 |
| `buildLegacyAuthz` should be retired | R1.9 | R2.4 | Required by capability contract for feature-flag fallback per `docs/security/authorization-capability-contract.md:238` |
| `kri_history_correction.py:87` swallows real bugs | R1.2 | R2.6 | Wraps with `ServiceFailure(...) from exc` — trace preserved, `logger.exception` logs it |
| `direct_application.py:171-175` leaves stale session | R1.6 | R2.6 | Rollback executes; ValueError path is deliberate |
| `kris/crud/create.py:76-78` is no-op rollback | R1.8 | R2.6 | `commit_service_transaction` is `await db.commit()` with NO try/except; the endpoint try/except IS needed |
| `kri_deadline_decisions.py:60 `if overdue_weeks <= 0`” is unreachable | R1.3 | R2.6 | Reachable — suppresses week-0 notifications |
| `core/approval_helpers.py` is the third outbox bypass | R1.3 | R2.8, R3.7 | File correctly uses `OutboxService.enqueue` at line 282; never directly calls `NotificationService` |
| `MetricAvailability` is LIVE | R2.7 | R3.8 | Defined but zero constructions — actually DEAD |
| Facade omits 6 builders means R2.5 said "12/4 facade/bypass", R2.8 said "13 dropping" | R2.5, R2.8 | R3.10 | Definitive: package `__all__` is 16, facade is 10, missing-from-facade is 6; "12 facade users" is correct count |

### R3.3 finding downgraded by R3.2

R3.3 flagged a 🔴 pending-approval TOCTOU (no DB-level dedup for `(resource_type, resource_id, status, action_type=DELETE)`). R3.2 read the migrations and found:

- `h2i3j4k5l6m7_add_partial_unique_index_approval_pending.py:25-29` created `ux_approval_pending`.
- `n8o9p0q1r2s3_restore_ux_approval_pending.py` restored it after `6df2bb0adaa3` accidentally dropped it.
- Final predicate covers enum-case drift (`status IN ('PENDING','PENDING_PRIVILEGED','pending_privileged')`).
- App layer at `core/approval_helpers.py:294` matches `"ux_approval_pending"` in `IntegrityError` for defense-in-depth.

R3.3 had only read the model's `__table_args__` (which omits partial unique indexes); the constraint exists at the DB layer. **Finding downgraded to ✅ verified clean.**

### R5.2 staleness flags corrected by main-thread verification

R5.2 claimed several "dead code" candidates were already deleted. Main-thread grep verified:

| Path | R5.2 claim | Verified reality |
|---|---|---|
| `backend/app/services/auth/_sso_helpers.py` | doesn't exist | Correct — services has no `auth/` subdir |
| `backend/app/api/v1/endpoints/auth/_sso_helpers.py` | "heavily used" | **WRONG** — 314 lines, zero direct importers (R3.7 was right) |
| `controls/_helpers.py` | already deleted | **WRONG** — exists, 2961 bytes, zero callers (R3.7 was right) |
| `_directory_sync/` | empty | Correct — only `README.md` |

### Net effect

About **15 R1/R2 claims were retired** by adversarial verification — most by R2 specialists running deeper greps, a few by R3 verifiers reading the migration files directly. The remaining findings in this audit are the **verified survivors**: each was either reaffirmed by two independent agents or corrected and re-verified.

The dominant failure modes:
1. R1 agents conflated similar paths (`services/auth/_sso_helpers.py` vs `endpoints/auth/_sso_helpers.py`).
2. R1 agents trusted stale planning docs (R1.10 cited a 2026-05-09 audit claiming `IssueRegisterPlan` was live; current grep showed zero callers — caught by R1.10 itself).
3. R2/R3 specialists over-extended categorical claims ("all 4 carry unused `department_id`" when it was 3).
4. Counter-intuitive "intentional patterns" (R1.9's `buildLegacyAuthz` proposal would have removed a feature-flag fallback required by the published capability contract).

---

## 14. Appendix — Audit Trail

### Agent dispatches (35 total)

**Round 1 (10 agents, `code-explorer`)** — per-domain inventory:

`r1-services-register-listings`, `r1-services-approval`, `r1-services-mutation-monitoring`, `r1-services-reporting-dashboard`, `r1-services-auth-identity`, `r1-services-issues-kris-vendors`, `r1-services-config-notification`, `r1-api-endpoints`, `r1-frontend`, `r1-tests-docs-security`

**Round 2 (8 agents, `code-explorer`)** — cross-cutting specialists:

`r2-coupling-detector`, `r2-duplication-hunter`, `r2-dead-code-hunter`, `r2-over-abstraction-reviewer`, `r2-naming-consistency`, `r2-error-handling-audit`, `r2-test-coverage-gaps`, `r2-security-authz-deep-dive`

**Round 3 (10 agents, `code-explorer`)** — new lenses + verifiers:

`r3-perf-nplus1`, `r3-migration-db-integrity`, `r3-concurrency-tx`, `r3-adr-drift`, `r3-observability`, `r3-frontend-correctness`, `r3-verify-outbox-bypass`, `r3-verify-dead-type-pins`, `r3-verify-commit-dispersion`, `r3-verify-capability-facade`

**Round 4 (3 agents, `general-purpose`)** — empirical gates:

`r4-ruff-mypy`, `r4-architecture-locks`, `r4-authz-contract`

**Round 5 (4 agents, `code-architect`)** — synthesis:

`r5-theme-synthesizer`, `r5-simplification-aggregator`, `r5-deepening-aggregator`, `r5-migration-planner`

### Peer-DM cross-checks observed (17)

- R1.2 → R1.8: PrivilegeContext usage in approvals endpoints
- R1.7 → R1.3: Deadline executor bypasses outbox
- R1.4 → R1.8: unified_exports shim duplication
- R1.6 → R1.1: Issue grouping pattern + near-duplicate KRI queries
- R1.3 → R1.8: transaction_boundary still endpoint-side
- R1.5 → R1.10: Architecture test pins dead types
- R1.7 → R1.6: KRI direct path bypasses outbox (R1.6 confirmed, escalated 🟡 → 🔴)
- R1.6 → R1.7: Confirmed: only KRI direct path bypasses outbox in scope
- R1.3 → R1.7: Cross-confirm deadline executor bypasses + added `core/approval_helpers.py` (later disproven by R2.8)
- R1.10 → R1.5: DirectoryProfileUpdateOutcome correction (alive, not dead)
- R1.10 → R1.6: IssueRegisterPlan correction (audit doc stale, actually dead)
- R1.8 → R1.5: Facade omission causes admin bypass
- R1.5 → R1.8: 5 builders missing from facade
- R1.8 → R1.6: Confirmed `_shared/` shim + create.py duplicates update_issue_detail
- R1.10 → R1.8: Lock test pins dead unified_exports shims
- R1.5 → R1.9: Helper not contractually required
- R1.9 → R1.1: FE register hooks drift

### Compaction notes

The audit's full agent output ran to ~15,000 lines across 25+ reports. This document represents the synthesized canonical findings. The intermediate subagent transcripts are not committed in this checkout, so reviewer-facing evidence must rely on the repo-verifiable file/line pointers and command outputs cited in this document.

### What this audit does not cover

- Database query plans (no `EXPLAIN ANALYZE` runs). Theme 6's N+1 patterns are inferred from code shape, not query profiling.
- Real Postgres migration rehearsal (ADR-010 says lock-monitoring required; out-of-band rehearsal records not in repo).
- Cross-tenant tests (visibility scoping is verified per-clause; multi-tenant load patterns not exercised).
- Frontend Lighthouse / Core Web Vitals scores (a11y findings are from static review only).
- Penetration testing of SSO/refresh flow (security review is from reading code, not active testing).

---

## 15. Appendix — Verification-Pass Triage Log (2026-05-18 evening)

After the R5 audit synthesis, a **verification pass with 26 fresh Opus subagents across 5 triage rounds (T1.1–T5.2)** re-checked every cited claim against current code (`fb359c46`). The pass applied **32 corrections** to this document before publication.

### Triage round structure

| Round | Agents | Role | Output |
|---|---|---|---|
| T1 | 6 | claim atomizers — extracted every checkable assertion from §1-§14 | **813 atomic claims** across 6 section ranges |
| T2 | 10 | per-domain verifiers — re-read current code, marked VERIFIED / WRONG / STALE / IMPRECISE | per-domain verdict tables |
| T3 | 5 | adversarial challengers (high-impact re-verifier, §12 deep dive, gap analysis, tree-state forensic, audit-wide spot-check) | adversarial verdicts + drift catalog |
| T4 | 3 | empirical gate re-runners (ruff/mypy, architecture-locks, authz-contract + headline counts) | confirmed gates still green + verified 14 headline numerics |
| T5 | 2 | correction synthesizers (delta synthesizer + final cleanup advisor) | structured 32-item delta + polish recommendations |

### Corrections summary

- **Numeric** (18 items): commit count 49→50/22→23, mypy 47→103, refactor_notes ~24→18, `test_architecture_deepening_contracts.py` ~75→68 functions, `authz_validator/` 10→11 modules, controls page-state migration count 5→4 hooks (~700→~560 LOC dedup), `_identity_access_lifecycle/execution.py` 1→2 commits, `admin/docs.py` 284→283 lines, `audit_trail_excel.py` 159→158, `contextual.py` 95→94, `controls/_helpers.py` "2961 bytes"→"86 LOC", Wave 9 5→4 PRs, Theme 9 sentinel "4× identical"→"3× identical + 1 structurally parallel", `ArchiveConfirmDialog.tsx` 135→164 LOC, `dashboard/departments.py` "8 per dept"→"1 + 7N", §13 R5.2/R5.4 chain rewritten with main-thread re-confirmation, total removable LOC ~1,900→~2,400 (sum of Rank 1-15).

- **Framing / phrasing** (13 items): §12 "All 5 register listings preload"→"3 of 5"; §12 "Per-row DB calls = 0"→"0 for 4 of 5, 2 per-row for issues"; §12 "archive_clause across 6 modules"→"archived_clause across 4 + 1"; §12 "All 25 with_for_update single-row"→"23 of 25"; §12 "kri_value_history parent-row lock"→"KeyRiskIndicator parent-row lock"; §12 nonce/state binding line citations corrected; §12 "every side-effect branch calls log_activity" softened to "direct or delegated"; §12 DashboardFilterContext described as vanilla external store factory; §4.2 Theme 2 "5 domains each" reworded; §4.3 commit_auth_transaction "boundary tag" decorative noted; §4.6 lock-order "Issue → KRI"→"history → KRI → Issue"; Wave 5 invented index name `ix_approval_status_created`→generic "composite (status, created_at) index"; `get_password_hash` flagged as invariant-protected.

- **New finding promoted** (1 item): this correction was later withdrawn during document fixup because the admin telemetry star-import path succeeds against HEAD; the audit no longer carries this as a runtime bug.

### Confirmed accurate (no change)

- Tree state `fb359c46 Deepen architecture ownership seams` ✓
- 197/197 architecture-lock tests pass ✓
- `_sso_helpers.py`: 314 lines, zero direct importers ✓
- 135 private-service imports across 86 endpoint files ✓
- 115 endpoint files import `app.models` ✓
- Package `__all__` = 16 names, Facade `__all__` = 10 names (delta = 6) ✓
- `capability-catalog.json` = 25 surfaces ✓
- 22 dead-pinned dataclasses (definitive list per R3.8) ✓
- All SSO/JWT/nonce/state security claims ✓
- All ADR status verdicts (PARTIAL/ALIGNED) ✓
- 5 N+1 patterns ✓
- Outbox/store/dispatcher correctness ✓
- 17 peer-DM cross-checks ✓
- 35 audit agent invocations + 17 peer DMs ✓
- 30+ underscore service packages (actual: 33) ✓

### Triage failure modes observed

1. **Stale path conflation**: R5.2 confused `services/auth/_sso_helpers.py` (doesn't exist) with `endpoints/auth/_sso_helpers.py` (exists, 314 LOC, dead) and asserted "heavily used" on the wrong path. Main-thread `wc -l` + grep settled it: R3.7 was right, R5.2 was wrong.

2. **Self-overturning false correction**: R5.4 wrongly reverted R5.2's earlier correct re-assertion of R1.9's original claim about `useControlsPageState.ts` being migrated. Four triage agents (T2.9, T3.3, T3.5, T4.3) independently re-verified by reading the file at line 85 — `useRegisterPageController` IS imported and used. R5.4's correction record in §13 is now itself corrected.

3. **Off-by-one drift from informal estimates**: many "~75 functions", "~24 entries", "~135 LOC" placeholders proved low by 7-22% on re-count. T4.x replaced estimates with fresh `wc -l` / `grep -c` outputs.

4. **Bytes-vs-LOC ambiguity**: `controls/_helpers.py` cited as "2961 bytes" in §4.7/§13 but used an incorrect 87-line estimate in §6/Quick-wins. Unified to "86 LOC".

5. **Phrasing tightness**: several §12 "verified clean" bullets generalised valid claims about 3-4 modules to "all 5" or "all 6", overstating leverage. T3.2's adversarial pass scoped each correctly.

### Source verification artefacts

The 26 triage subagent reports are not committed in this checkout. The chains below are retained as historical audit notes, but reviewers should rely on the repo-verifiable evidence pointers above unless those transcripts are restored as committed artifacts. Specific verification chains recorded by the original audit:
- `_sso_helpers.py` aliveness: T2.5 + T2.8 + T3.4 (tree-state forensic) + T3.5 (spot-check) + T4.3 (LOC) — 5 independent grep+`wc -l` runs.
- Controls page-state migration: T2.9 + T3.3 + T3.5 + T4.3 — 4 independent re-reads of `useControlsPageState.ts:17,85`.
- Commit count 49→50: T2.3 + T3.1 + T4.3 + main-thread `grep -c` — 4 independent counts.
- `test_architecture_deepening_contracts.py` 1700 lines: T2.10 said 1387, T3.1 confirmed 1387; T4.2 said 1700; main-thread `wc -l` = 1700 (T2.10's wc invocation appears to have miscounted; T4.2 + main-thread authoritative).

---

*Generated 2026-05-18 by the Opus audit team (35 audit agents + 26 triage agents = 61 total). Corrected 2026-05-23 to remove claims contradicted by repo-verifiable evidence. Every carried finding should be traceable to a repo-verifiable `file:line` pointer at HEAD `fb359c46`; intermediate subagent transcripts are not committed in this checkout.*
