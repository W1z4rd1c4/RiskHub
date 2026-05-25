# RiskHub Architecture Audit Remediation Plan - 2026-05-23

> For agentic workers: REQUIRED SUB-SKILLS before implementation are
> `superpowers:test-driven-development`, `improve-codebase-architecture`, and
> `code-simplifier`. Use `superpowers:executing-plans` or
> `superpowers:subagent-driven-development` to execute this file. Work items use
> checkbox syntax so progress can be tracked in place.

## 0. Plan Metadata

| Field | Value |
|---|---|
| Source audit | `docs/audits/2026-05-18-architecture-and-simplify-audit.md` |
| Audit baseline | `fb359c46 Deepen architecture ownership seams` |
| Planning baseline | `9392fb7e docs: add corrected architecture audit` |
| Plan owner | Main-thread orchestrator |
| Scope | Fix, explicitly defer, or mark corrected-premise for every repo-verifiable finding through the Audit Finding Coverage Matrix |
| Non-scope | PR creation, branch/worktree creation, cosmetic rewrites unrelated to audit findings |
| Required method | Strict test-first vertical slices: RED, GREEN, REFACTOR, VERIFY |
| Critical reviewers used | Backend correctness reviewer, frontend reviewer, architecture/simplification reviewer |

## 1. Acceptance Criteria

This document has two gates. **Plan Readiness** means the plan is safe to hand to implementers. **Remediation Completion** means the future code/docs remediation has landed and passed its gates. Plan readiness is not evidence that remediation has happened.

### 1.1 Plan Readiness Gate

This plan is ready to execute when all of the following are true:

- [ ] The Audit Finding Coverage Matrix has one row or submatrix entry for every repo-verifiable C-finding, Top 10 deepening, Top 15 simplification target, quick-win deletion, dead symbol/member, explicit deferral, corrected premise, and retain-by-contract/live-do-not-delete item.
- [ ] Every matrix row has an exact audit anchor such as `docs/audits/2026-05-18-architecture-and-simplify-audit.md:<line>` plus repo evidence where the disposition depends on current code.
- [ ] Every row has exactly one disposition: `Concrete slice`, `Corrected premise`, `Explicit deferral`, `Retain by contract`, or `Already covered`.
- [ ] Corrected premises and deferrals are visible as rows, not hidden inside concrete-slice text.
- [ ] Slice ownership is unique. A later wave may verify work from an earlier wave, but it must not repeat implementation ownership.
- [ ] Verification commands are copy/paste safe from the repository root, or explicitly use subshells before returning to root commands.
- [ ] Future implementation gates are clearly separated from docs-only plan-readiness checks.

### 1.2 Remediation Completion Gate

The future remediation is complete when all of the following are true:

- [ ] C-1 through C-10 in the source audit are fixed with behavior tests, not only shape tests.
- [ ] Every high-leverage refactor listed in the audit has either landed or has a narrow architecture lock preventing regression while the remaining work is explicitly deferred by owner decision.
- [ ] The 23 dead-pinned symbols: 21 dataclasses, 1 alias, 1 function; plus 2 dead Literal members are either deleted or converted into live behavior-backed Interfaces. No `hasattr` test preserves a dead name.
- [ ] Every deletion target in the Top 15 simplification table is either deleted or retained with a documented live production/test caller and a behavior test.
- [ ] Endpoint files remain HTTP Adapters. ORM reads/writes move behind service Modules where the audit calls out inline ORM reach.
- [ ] The transaction Seam is real: `commit_service_boundary` rolls back, carries a useful boundary tag into logs/metrics, and has adoption ratchets.
- [ ] Operational loss modes are observable: durable outbox for KRI breach notifications, logged DB health probe failures, surfaced approval projection corruption, Prometheus docs/tests, and OpenTelemetry export support.
- [ ] Frontend route protection, render crash containment, dirty-form preservation, and dialog accessibility are verified by user-facing tests.
- [ ] ADR-001, ADR-002, ADR-007, and ADR-011 match the final code and architecture locks.
- [ ] Final verification commands in section 16 pass, or any residual failure is documented with owner-approved scope and evidence.

## 2. Core Rules For Implementation

- [ ] Before touching production code, write the RED test for the exact behavior or deletion ratchet.
- [ ] Run the RED test and capture that it fails for the expected reason. If it passes, stop and rewrite the test.
- [ ] Implement the smallest GREEN change. Do not batch unrelated audit findings.
- [ ] REFACTOR only after GREEN. Preserve behavior while improving Module Depth, Locality, and Leverage.
- [ ] Use behavior tests for live Interfaces and negative-existence tests only for verified-dead files or shims.
- [ ] Use AST parsing for architecture locks. Avoid subprocess `grep` inside tests unless no parser applies.
- [ ] Do not delete invariant-protected exports such as `app.api.v1.endpoints.users.get_password_hash` unless the invariant docs and tests are changed in the same slice.
- [ ] Do not add frontend-only authorization policy. Frontend guards mirror backend capability semantics; backend remains authoritative.
- [ ] Do not introduce broad generic helpers that hide domain rules. A helper must reduce real duplication while keeping domain-specific meaning visible.
- [ ] Keep slices small enough to revert independently. Schema changes get their own Alembic migration and rehearsal.

## 3. Architecture Vocabulary

Use this vocabulary in code reviews, comments, ADR edits, and commit messages:

- **Module**: a code unit with an Interface and hidden Implementation.
- **Interface**: what callers rely on. It must be smaller and more stable than the Implementation.
- **Implementation**: private details behind the Interface.
- **Depth**: how much complexity the Module hides behind a small Interface.
- **Seam**: the point where behavior can change without spreading edits across callers.
- **Adapter**: glue that translates between external shape and internal Interface. FastAPI endpoints and React route wrappers are Adapters.
- **Leverage**: the amount of repeated or risky work removed by one Interface.
- **Locality**: related policy and data changes live together instead of being scattered.

## 4. Evidence Inputs

Primary evidence:

- `docs/audits/2026-05-18-architecture-and-simplify-audit.md`
- `docs/adr/ADR-001-capabilities-module-unification.md`
- `docs/adr/ADR-002-service-owned-transactions.md`
- `docs/adr/ADR-007-bounded-context-taxonomy.md`
- `docs/adr/ADR-011-auth-scheme-and-session-model.md`
- `docs/security/authorization-capability-contract.md`
- `tests/backend/pytest/test_architecture_deepening_contracts.py`
- `tests/backend/pytest/architecture/`
- `tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards*`
- `tests/frontend/unit/src/pages/shared/useRegisterPageController.test.ts`

Critical reviewer constraints incorporated:

- Backend reviewer: treat C-1 through C-6 as vertical backend lanes, add durable outbox payload Interfaces, handle KRI duplicate data explicitly, surface approval corruption, test metrics and OTel, and make the transaction Seam real.
- Frontend reviewer: fix user-visible Wave 4 items first, map route guards to backend capability semantics, preserve dirty remediation fields, and use a shared accessible dialog shell without changing public props.
- Architecture reviewer: define each target Module Interface before moving code, replace dead name pins with behavior, add locks only after the corresponding migration, and update ADRs in the same slices as code.

## 5. Parallel Work Lanes

The safest sequencing is three lanes with explicit join points:

| Lane | Owner profile | Starts after | Must join before |
|---|---|---|---|
| A. Critical backend correctness | Backend reviewer | Wave 0 | Global outbox lock, transaction adoption |
| B. Frontend release blockers | Frontend reviewer | Wave 0 | Page-state and detail-fetch simplification |
| C. Architecture cleanup and locks | Architecture reviewer | Wave 0 | Broad endpoint/private import lock |

Single-threaded order:

1. Wave 0 - Baseline and drift inventory.
2. Wave 1 - Critical backend correctness and observability.
3. Wave 2 - Frontend release blockers.
4. Wave 3 - Verified dead code and dead-pin retirement.
5. Wave 4 - Performance and read-shape deepening.
6. Wave 5 - Transaction Seam and service commit adoption.
7. Wave 6 - Endpoint Adapter thinning.
8. Wave 7 - Listing and archive simplification.
9. Wave 8 - Frontend register and detail-fetch simplification.
10. Wave 9 - Architecture locks, ADRs, and final gates.

Parallel order:

- Wave 2 can run alongside Wave 1 after Wave 0.
- Verified-dead deletion from Wave 3 can run alongside Wave 1 only when it does not touch KRI history, approval queue, admin telemetry, metrics, or account lockout files.
- Wave 4 dashboard work must land before the broad dashboard endpoint ORM ban.
- Wave 6 restore/dashboard extraction must land before the broad endpoint/private import discipline lock.

## 6. Audit Traceability Ledger

Use this matrix as the execution ledger. Every repo-verifiable audit finding must stay in one of these dispositions:

- `Concrete slice`: this plan names the implementation slice and verification.
- `Already covered`: an existing slice already covers the finding without amendment.
- `Corrected premise`: current repo evidence contradicts the original premise; the plan records why no remediation is added.
- `Explicit deferral`: the finding is acknowledged and intentionally kept outside this remediation.
- `Retain by contract`: the finding names code that must remain because a documented contract requires it.

### 6.1 C-Findings

| Audit finding | Exact anchor | Disposition | Target plan slice | Required test or lock |
|---|---|---|---|---|
| C-1 KRI breach notifications | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:23`, `:662`, `:666` | Concrete slice | W1.2 | Outbox behavior tests, handler idempotency tests, and global outbox-only lock RED proof |
| C-2 KRI period uniqueness | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:24`, `:695` | Concrete slice | W1.1 | Database constraint, migration rehearsal, API conflict tests |
| C-3 account lockout runtime hardening | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:25` | Concrete slice | W1.3 | Production startup/config tests |
| C-4 admin telemetry DB probe logging | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:26` | Concrete slice | W1.4 | DB failure traceback logging test |
| C-5 approval queue corrupt projection observability | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:27` | Concrete slice | W1.5 | API schema, log, metric, and capability-failure tests |
| C-6 metrics docs, Prometheus tests, OTel Adapter | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:28` | Concrete slice | W1.6 | Metrics route/docs tests and OTel configuration test |
| C-7 app-level ErrorBoundary | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:36` | Concrete slice | W2.1 | ErrorBoundary render/reset tests |
| C-8 protected route guards | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:37` | Concrete slice | W2.2 | Route guard/page-gate tests and route-manifest structural coverage |
| C-9 remediation dirty-field preservation | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:38` | Concrete slice | W2.3 | Dirty-field refresh and issue-id reset tests |
| C-10 accessible dialog shell | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:39` | Concrete slice | W2.4 | Confirm/archive dialog a11y tests |

### 6.2 Top 10 Deepening Opportunities

| Rank | Audit target | Exact anchor | Disposition | Target plan slice | Required test or lock |
|---|---|---|---|---|---|
| 1 | Adopt `commit_service_boundary` canonical primitive | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:351`, `:571` | Concrete slice | W5.1-W5.3 | Transaction boundary behavior tests and commit ratchet |
| 2 | Promote outbox-only invariant to global architecture lock | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:352`, `:318` | Concrete slice | W1.2, W9.1 verification | Global AST outbox lock |
| 3 | Redesign `hasattr` architecture pins into behavior pins | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:353`, `:678` | Concrete slice | W3.2 | Behavior tests plus dead-pin ratchet |
| 4 | `_register_listings/*` declarative `ListingDescriptor` registry | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:354` | Explicit deferral | W7 verifies no partial registry work is required | Deferred until sentinel, vendor-context, and prefix helpers land |
| 5 | Dashboard endpoints into `_dashboard_metrics` builders | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:355`, `:654` | Concrete slice | W4.1, W4.4 | Dashboard parity and query-budget tests |
| 6 | Endpoint/private-service import discipline lock | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:356`, `:295` | Concrete slice | W6.3, W9.2 roll-up | Private import architecture lock |
| 7 | Restore endpoints into mutation lifecycle orchestrators | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:357`, `:670` | Concrete slice | W6.1 | Restore endpoint parity tests and adapter lock |
| 8 | Frontend register page-state migration | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:358`, `:264` | Concrete slice | W8.1 | Register page-state tests |
| 9 | Frontend detail-fetch consolidation on React Query | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:359`, `:265` | Concrete slice | W8.2 | Detail-fetch behavior tests and query-key policy |
| 10 | Deadline orchestrators templating via `DeadlineRun` driver | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:360`, `:650` | Explicit deferral | W3.1C only removes compatibility shims | 300-LOC templating consolidation deferred |

### 6.3 Top 15 Simplification Targets And Quick Wins

| Rank/item | Audit target | Exact anchor | Disposition | Target plan slice | Required test or lock |
|---|---|---|---|---|---|
| Top 15 #1 | 4 frontend `useXPageState.ts` hooks to `useRegisterPageController` | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:380`, `:264` | Concrete slice | W8.1 | Page-state preservation tests |
| Top 15 #2 | Dead contracts and `hasattr` pins | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:381`, `:414` | Concrete slice | W3.2 | Dead-symbol behavior tests and ratchet |
| Top 15 #3 | `archive_X_no_commit` and `archive_X_detail` consolidation | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:382`, `:283`, `:284` | Concrete slice | W7.3 | Archive behavior tests |
| Top 15 #4 | Register listing shared sentinels | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:383`, `:280`, `:642` | Concrete slice | W7.1 | Register listing characterization tests |
| Top 15 #5 | 4 export builders to registry | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:384`, `:654` | Concrete slice | W6.5 | Export parity plus registry-selection tests |
| Top 15 #6 | `ArchiveConfirmDialog` simplification | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:385`, `:674` | Concrete slice | W2.4, W8.3 | Dialog a11y and adapter tests |
| Top 15 #7 | `endpoints/auth/_sso_helpers.py` deletion | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:386`, `:235`, `:658` | Concrete slice | W3.1A | Negative-existence ratchet |
| Top 15 #8 | `scripts/security/authz_validator/` shim deletion | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:387`, `:239`, `:678` | Concrete slice | W3.1B | Validator parity and negative-existence ratchet |
| Top 15 #9 | Vendor-context subqueries to helper | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:388`, `:281` | Concrete slice | W7.2 | Vendor-context filter parity tests |
| Top 15 #10 | `_kri_history/queries.py` period-row builder | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:389`, `:662` | Concrete slice | W7.4c | KRI history query characterization tests |
| Top 15 #11 | Group-filter prefix parser | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:390`, `:282` | Concrete slice | W7.1 | Prefix parser tests |
| Top 15 #12 | `_to_directory_user` duplicate normalization | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:391`, `:288` | Concrete slice | W7.4b | Directory normalization tests |
| Top 15 #13 | `endpoints/controls/_helpers.py` deletion | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:392`, `:236`, `:670` | Concrete slice | W3.1A | Negative-existence ratchet |
| Top 15 #14 | `resolve_safe_default_role` consolidation | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:393`, `:287`, `:658` | Concrete slice | W7.4a | Safe-default-role behavior tests |
| Top 15 #15 | `_approval_execution/kri_changes.py` deletion | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:394`, `:238`, `:646` | Concrete slice | W3.1A | Negative-existence ratchet |
| Quick win | `_reporting/exports/monitoring.py` alias deletion | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:401` | Concrete slice | W3.1C, W6.5 | Export route parity tests |
| Quick win | `_register_listings/__init__.py` re-export deletion | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:402` | Concrete slice | W3.1B | Import-contract migration and ratchet |
| Quick win | `Header.tsx`, `usersTablePresentation`, `ApprovalList.currentUserId` deletion | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:405`, `:406`, `:674` | Concrete slice | W3.1A | Frontend negative-existence and behavior tests |
| Retain | `get_password_hash` re-export | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:410`, `:241` | Retain by contract | W3.1 guardrail | Keep invariant unless docs/tests are changed in same slice |

### 6.4 Dead Symbols And Live Retain Items

| Symbol or group | Exact anchor | Disposition | Target plan slice | Required test or lock |
|---|---|---|---|---|
| 21 dead dataclasses listed in W3.2 | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:414` through `:428` | Concrete slice | W3.2 | Behavior replacements and no-`hasattr` ratchet |
| `RegisterListingDefinition` alias | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:424` | Concrete slice | W3.2 | Register listing behavior tests |
| `build_deadline_notification_plan` function | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:418` | Concrete slice | W3.2 | Deadline behavior tests before deletion |
| `EntityMutationKind` Literal members `"no_op"` and `"blocked"` | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:428` | Concrete slice | W3.2 | Mutation-kind producer ratchet |
| `EntityMutationOutcome`, `SideEffectResult`, `VendorListingGovernance`, `RegisterListingPlan`, `ReportExportDefinition`, and other live retain items | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:430` through `:443` | Retain by contract | W3.2 guardrail | Behavior tests protect live Interfaces |

### 6.5 Remaining Repo-Verifiable Findings

| Audit finding | Exact anchor | Disposition | Target plan slice | Required test or lock |
|---|---|---|---|---|
| `_get_vendor_with_deps` unused helper | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:240` | Concrete slice | W3.1A | Verified-dead ratchet and vendor tests |
| `trigger_kri_deadline_check` no frontend caller | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:242` | Retain by contract | W3.4 | Admin/debug route tests |
| `count_high_risks` unused outside tests/facade | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:243` | Concrete slice | W3.1A | Threshold/report tests |
| `get_config_sync` no production callers | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:244`, `:666` | Concrete slice | W3.1A | Negative-existence ratchet |
| `apply_kri_value_as_of` no callers | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:245` | Concrete slice | W3.1A | KRI report as-of/export tests |
| `OrphanResolutionPlan` name collision | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:246`, `:666` | Concrete slice | W3.3 | Orphan resolution behavior tests |
| Underscored alias cleanup | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:251` | Explicit deferral | W9.3 hygiene note | Requires separate owner decision unless touched by existing slices |
| `react-hook-form` installed premise | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:266`; checked against `frontend/package.json` and `frontend/package-lock.json` | Corrected premise | W8 dependency decision | Do not add dependency in this remediation |
| `resolveCapabilityFlag` uniformity | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:267` | Concrete slice | W8.4 | Frontend authz invariant tests and AST lock |
| i18n `defaultValue` drift | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:269` | Concrete slice | W8.5 | Fixed file inventory, structural test, and `i18n:test` |
| React Query stale-time/query-key drift | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:270` through `:271` | Concrete slice | W8.2 | Query-key and stale-time policy tests |
| `merge_collection_filters` duplicate | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:642` | Concrete slice | W7.1A | Collection filter parity tests |
| `KRIEditKind` discriminator missing | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:644` | Concrete slice | W7.5 | Side-effect dispatch tests |
| Unused KRI side-effect `department_id` | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:644` | Concrete slice | W7.6 | Side-effect tests and type check |
| Approval queue/execution paired context | `docs/adr/ADR-007-bounded-context-taxonomy.md:51` | Concrete slice | W1.5, W4.3, W7.5, W7.6 | Paired verification and rollback notes |
| `notification_service.py` broad catches | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:666` | Concrete slice | W1.7 | Notification failure logging tests |
| Legacy `_vendor_links/kri_assignment.py` naming, now canonical `_vendor_links/kri_bridge.py` | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:662` | Concrete slice | W6.6 | One-step import migration tests |
| `_issue_workflow/serialization.py` private import | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:662` | Concrete slice | W6.3 | Private import discipline lock |
| `_config/` vs `_riskhub_config/` naming | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:666` | Explicit deferral | None | Low-value naming cleanup outside this remediation |
| Reporting export duplication: pipeline, shared module, 10 shims | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:654` | Concrete slice | W6.5 | Export parity and adapter locks |
| Dashboard inline ORM and dashboard N+1 | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:654` | Concrete slice | W4.1, W4.4 | Dashboard query-budget tests |
| Restore endpoints, create endpoints, route-calling-route imports, `require_*` factories, private capability imports | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:670`, `:295` through `:307` | Concrete slice | W6.1-W6.8 | Endpoint adapter locks and authz contract validator |
| `_identity_access_lifecycle` direct commits and service commit dispersion | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:157` through `:183`, `:656` | Concrete slice | W5.1-W5.3 | Service commit boundary ratchet |
| ADR-001/ADR-002/ADR-007/ADR-011 drift and allowlist hygiene | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:315` through `:327`, `:484` through `:508`, `:678`; `docs/adr/ADR-011-auth-scheme-and-session-model.md:13`, `:42` | Concrete slice | W5.3, W9.3, W9.4 | Docs consistency tests and architecture locks |
| `buildLegacyAuthz` fallback | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:755`, `docs/security/authorization-capability-contract.md:238` | Retain by contract | W8.4 | Authz invariant tests document fallback behavior |

## 7. Wave 0 - Baseline And Drift Inventory

Goal: prove the current tree, anchors, and counts before implementing fixes.

### W0.1 Clean-start guard

- [ ] RED: none. This is an execution guard.
- [ ] Run `git status --short --branch`.
- [ ] Confirm branch is `main` and no unrelated user changes are present.
- [ ] If unrelated changes exist, stop and classify them before editing.
- [ ] Run `git rev-parse --short HEAD` and record the baseline in the implementation notes.

### W0.2 Audit anchor revalidation

- [ ] Run:

```bash
rg -n 'C-[0-9]|Theme [0-9]|Wave summary|Top 15|Top 10' docs/audits/2026-05-18-architecture-and-simplify-audit.md
```

- [ ] Re-run the corrected-document invalid-phrase guard:

```bash
rg -n 'No `/metrics`|NO `/metrics`|zero metrics|never scrapable|NameError|~1100|87 LOC|4[x×] listing sentinels|22-line shim|6-line shim|verified twice|riskhub-audit-2026-05-18' docs/audits/2026-05-18-architecture-and-simplify-audit.md
```

- [ ] Expected result: no matches. If matches appear, repair the audit document before implementation.

### W0.3 Current source inventory

- [ ] Run these source inventories and save the counts in implementation notes:

```bash
rg -n 'NotificationService\.(create_notification|bulk_create)|run_best_effort_notification_batch' backend/app
rg -n 'await db\.commit\(' backend/app/services
rg -n 'commit_service_transaction|commit_auth_transaction' backend/app
rg -n 'from app\.services\._authorization_capabilities|from app\.services\._[a-z_]+ import' backend/app/api/v1/endpoints
rg -n 'from app\.models import|import app\.models' backend/app/api/v1/endpoints
rg -n 'role="dialog"|aria-modal|focus trap|ErrorBoundary|useDetailResource|useIssueDetail|useRegisterPageController' frontend/src tests/frontend
```

- [ ] Do not use these counts as tests. Convert only stable invariants into AST-based locks in later waves.

### W0.4 Verification baseline

- [ ] Future implementation baseline. These commands may write caches or test artifacts; do not treat them as docs-only plan-readiness verification.
- [ ] Run from the repository root:

```bash
set -euo pipefail
make -f scripts/Makefile test-architecture-locks
python3 scripts/security/validate_authz_capability_contract.py
make -f scripts/Makefile lint-backend
(cd frontend && npx tsc --noEmit)
(cd frontend && npm run lint -- --max-warnings=0)
(
  cd backend
  set +e
  output="$(./venv/bin/python -m mypy --config-file mypy.ini . --no-error-summary --no-pretty 2>&1)"
  status=$?
  set -e
  printf '%s\n' "$output"
  count="$(printf '%s\n' "$output" | awk '/: error:/ {n++} END {print n+0}')"
  printf 'mypy error count: %s\n' "$count"
  if [ "$status" -gt 1 ] || { [ "$status" -ne 0 ] && [ "$count" -eq 0 ]; }; then exit "$status"; fi
  test "$count" -le "${MYPY_MAX_ERRORS:-103}"
)
```

- [ ] Full mypy is a baseline-count gate, not a raw zero-exit gate, until the known 103-error baseline is eliminated.
- [ ] Count `: error:` lines from full mypy output. The final count must be `<= 103`.
- [ ] Touched backend files must introduce no new mypy errors.
- [ ] If a slice reduces the full count, record the new lower baseline in the implementation notes and use that lower count for later slices.
- [ ] Expected baseline: architecture locks pass, authz validator passes, ruff passes, frontend type/lint pass, and mypy stays at or below the recorded baseline.

## 8. Wave 1 - Critical Backend Correctness And Observability

Goal: fix C-1 through C-6 with durable behavior and observable failure modes.

### W1.1 C-2 KRI period uniqueness

Target Interface:

- Module: `backend/app/models/kri_history.py`
- Interface: `KRIValueHistory` guarantees at most one row per `(kri_id, period_end)`.
- Seam: database constraint plus service-side conflict mapping.

Steps:

- [ ] RED: add `tests/backend/pytest/test_kri_period_protection.py::test_duplicate_kri_value_history_period_rejected_by_database`.
- [ ] RED: add a Postgres migration rehearsal test under `tests/backend/pytest/migrations/` that introspects the unique constraint name.
- [ ] Run the focused tests and confirm they fail because no DB constraint exists.
- [ ] GREEN: add `UniqueConstraint("kri_id", "period_end", name="uq_kri_value_history_kri_period_end")` to `KRIValueHistory`.
- [ ] GREEN: add a forward-only Alembic migration.
- [ ] GREEN: migration preflight must fail with a clear diagnostic listing duplicate `(kri_id, period_end)` groups rather than silently deleting data.
- [ ] GREEN: map duplicate insert errors to the existing domain conflict pattern where API callers can hit this path.
- [ ] REFACTOR: keep KRI period algebra in `_kri_history/periods.py`; do not duplicate date normalization in the migration or service.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_kri_period_protection.py ../tests/backend/pytest/migrations/test_kri_value_history_period_unique_constraint.py -q)
(cd backend && TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub_test ./venv/bin/python -m pytest ../tests/backend/pytest/migrations/test_kri_value_history_period_unique_constraint.py -q)
```

### W1.2 C-1 KRI breach notifications through outbox

Target Interface:

- Module: `backend/app/services/outbox/`
- Interface: a typed KRI breach notification payload with a deterministic idempotency key.
- Adapter: an outbox handler that calls `NotificationService.create_notification`.
- Seam: `_kri_history` enqueues an event; only the outbox handler emits the notification.

Steps:

- [ ] RED: add `tests/backend/pytest/test_kris_value_submission_api.py::test_kri_breach_submission_enqueues_outbox_without_inline_notification`.
- [ ] RED: update stale inline best-effort notification expectations in `tests/backend/pytest/test_kris_value_submission_api.py` so outbox-only behavior is asserted instead of inline notification tolerance.
- [ ] RED: add `tests/backend/pytest/test_outbox_kri_notifications.py::test_kri_breach_outbox_handler_creates_notification`.
- [ ] RED: add `tests/backend/pytest/test_outbox_kri_notifications.py::test_kri_breach_outbox_handler_failure_is_retryable`.
- [ ] RED: add `tests/backend/pytest/test_outbox_kri_notifications.py::test_kri_breach_outbox_handler_is_idempotent_for_existing_notification`.
- [ ] RED: add AST lock `tests/backend/pytest/architecture/test_kri_history_outbox_only_emit_red.py` that fails on direct `NotificationService.*` calls under `backend/app/services/_kri_history/`.
- [ ] RED: expand the outbox-only architecture lock globally in this slice so required outbox services cannot emit direct notifications. Capture the RED failure before removing the KRI direct notification.
- [ ] Confirm the first and architecture tests fail on `backend/app/services/_kri_history/direct_application.py`.
- [ ] GREEN: add a KRI breach payload model in `backend/app/services/outbox/payloads.py` with `extra="forbid"`.
- [ ] GREEN: add handler registration in `backend/app/services/outbox/registry.py`.
- [ ] GREEN: add handler implementation under `backend/app/services/outbox/handlers/`.
- [ ] GREEN: generate idempotency keys from `kri_id`, `period_end`, recipient id, and breach transition. Do not collapse separate breach transitions into one event.
- [ ] GREEN: make the handler idempotent before creating follow-on notification rows, aligned with ADR-002 outbox idempotency requirements.
- [ ] GREEN: replace the direct notification in `_kri_history/direct_application.py` with `OutboxService.enqueue` in the same transaction as the KRI history write.
- [ ] REFACTOR: keep KRI-specific recipient selection in `_kri_history`; keep notification delivery in the outbox handler Adapter.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_kris_value_submission_api.py ../tests/backend/pytest/test_outbox_kri_notifications.py ../tests/backend/pytest/architecture/test_kri_history_outbox_only_emit_red.py -q)
make -f scripts/Makefile test-architecture-locks
```

### W1.3 C-3 in-memory account lockout runtime guard

Target Interface:

- Module: `backend/app/main.py` plus `backend/app/services/account_lockout_service.py`
- Interface: supported production startup requires Redis; in-memory lockout is allowed only for debug/demo single-worker runtime.
- Seam: a startup guard resolves worker count once and rejects production-like multi-worker in-memory use.

Steps:

- [ ] RED: add `tests/backend/pytest/test_account_lockout_runtime.py::test_debug_false_requires_redis_lockout_backend`.
- [ ] RED: add `tests/backend/pytest/test_account_lockout_runtime.py::test_in_memory_lockout_rejected_for_multi_worker_production_like_runtime`.
- [ ] RED: add `tests/backend/pytest/test_account_lockout_runtime.py::test_debug_demo_single_worker_can_use_in_memory_lockout`.
- [ ] Confirm tests fail because multi-worker in-memory mode is not guarded.
- [ ] GREEN: reuse or extract the worker-count resolver already used by scheduler jobs for `API_WORKERS`, `UVICORN_WORKERS`, and `WEB_CONCURRENCY`.
- [ ] GREEN: keep supported `DEBUG=false` Redis path unchanged.
- [ ] GREEN: reject or hard-fail production-like multi-worker in-memory startup with an actionable error message.
- [ ] REFACTOR: keep the guard near startup wiring; do not put environment parsing inside `InMemoryAccountLockoutBackend`.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_account_lockout_runtime.py -q)
(cd backend && ./venv/bin/ruff check app/main.py app/services/account_lockout_service.py)
```

### W1.4 C-4 admin telemetry DB probe logging

Target Interface:

- Module: `backend/app/services/_admin_telemetry/lifecycle.py`
- Interface: DB health probe returns the same response shape but logs traceback-bearing failures.
- Seam: failure classification remains tolerant; observability changes.

Steps:

- [ ] RED: add `tests/backend/pytest/test_admin_telemetry.py::test_system_status_db_failure_logs_exception_with_context`.
- [ ] Confirm the test fails because no `logger.exception` call occurs.
- [ ] GREEN: call `logger.exception` when the DB probe catches `Exception`.
- [ ] GREEN: include stable context fields such as probe name and operation without logging secrets.
- [ ] REFACTOR: keep the API response semantics unchanged.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_admin_telemetry.py -q)
```

### W1.5 C-5 approval queue corrupt projection observability

Target Interface:

- Module: `backend/app/services/_approval_queue/`
- Interface: corrupt payload tolerance is explicit and surfaced; capability-code bugs are not silently hidden.
- Seam: projection returns valid rows plus observable skipped-count metadata.

Steps:

- [ ] RED: add `tests/backend/pytest/test_approval_queue_projection.py::test_corrupt_projection_logs_traceback_and_surfaces_skipped_count`.
- [ ] RED: add API response coverage in `tests/backend/pytest/test_approvals.py` or `tests/backend/pytest/api/v1/approvals/` asserting `skipped_corrupt_payloads: int = 0` exists on `ApprovalRequestListResponse`.
- [ ] RED: add metric coverage for `riskhub_approval_queue_projection_skipped_total` with bounded labels only.
- [ ] RED: add a capability-failure test proving `approval_capabilities(...)` exceptions are not swallowed by the corrupt-payload tolerance path.
- [ ] Confirm tests fail because `skipped_corrupt_payloads` is dropped before the API response, logging lacks traceback, the metric is absent, and capability calculation can be hidden by the broad catch.
- [ ] GREEN: replace non-traceback `logger.error` with `logger.exception` for unexpected projection exceptions.
- [ ] GREEN: add `skipped_corrupt_payloads: int = 0` to `ApprovalRequestListResponse`.
- [ ] GREEN: pass `ApprovalQueuePage.skipped_corrupt_payloads` through `to_response()`.
- [ ] GREEN: use public API response metadata, not private admin metadata, so operators can observe projection loss through the normal list response.
- [ ] GREEN: add `riskhub_approval_queue_projection_skipped_total` behind the existing metrics registry with bounded labels only.
- [ ] GREEN: log projection failures with `queue_logger.exception`, including non-secret context such as approval request id.
- [ ] GREEN: move `approval_capabilities(...)` outside the tolerated corrupt-payload catch so capability-code bugs fail loudly unless explicitly classified as corrupt persisted data.
- [ ] REFACTOR: keep projection contracts small; avoid passing raw ORM rows to response serializers.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_approval_queue_projection.py ../tests/backend/pytest/test_approvals.py -q)
```

### W1.6 C-6 metrics docs, Prometheus tests, and OTel Adapter

Target Interface:

- Module: `backend/app/core/settings/metrics.py`
- Interface: metrics are explicit runtime configuration, documented for deployment, and test-covered.
- Adapter: OpenTelemetry export is optional, disabled by default, and configured through settings.

Steps:

- [ ] RED: add `tests/backend/pytest/test_metrics_runtime.py::test_metrics_route_absent_by_default_and_present_when_enabled`.
- [ ] RED: add `tests/backend/pytest/test_metrics_runtime.py::test_rate_limit_backend_unavailable_counter_is_scrapable_when_metrics_enabled`.
- [ ] RED: add a docs/config guard test under `tests/backend/pytest/architecture/` that requires `METRICS_ENABLED` in deployment docs and env examples.
- [ ] RED: add `tests/backend/pytest/test_metrics_runtime.py::test_otel_exporter_is_configured_only_when_endpoint_set`.
- [ ] Confirm the docs guard and OTel test fail.
- [ ] GREEN: document `METRICS_ENABLED=true` in deployment README, reference docs, and env examples used for production install.
- [ ] GREEN: add OTel settings, for example `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME`, default disabled.
- [ ] GREEN: add an OTel Adapter Module that wires exporter setup during startup only when configured. Startup must not require OTel when unset.
- [ ] GREEN: add required runtime dependencies only if no existing dependency supports the Adapter.
- [ ] REFACTOR: keep Prometheus route registration and OTel setup separate; do not make `/metrics` depend on OTel.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_metrics_runtime.py ../tests/backend/pytest/architecture/test_deployment_metrics_setting_documented_red.py -q)
(cd backend && ./venv/bin/ruff check app/core/settings app/main.py)
```

### W1.7 Notification broad catch narrowing

Target Interface:

- Module: `backend/app/services/notification_service.py`
- Interface: expected notification delivery failures are classified narrowly and logged with traceback-bearing context.
- Seam: best-effort notification paths stay tolerant only for explicitly expected failure classes.

Steps:

- [ ] RED: add `tests/backend/pytest/test_notification_service.py::test_best_effort_notification_logs_unexpected_failure_with_traceback`.
- [ ] RED: add `tests/backend/pytest/test_notification_service.py::test_expected_notification_failure_path_remains_tolerant`.
- [ ] Confirm tests fail because broad catches hide failure class and traceback context.
- [ ] GREEN: narrow broad `except Exception` blocks to known expected errors where behavior intentionally continues.
- [ ] GREEN: use `logger.exception` for unexpected notification failures with non-secret context such as recipient id, notification type, and operation.
- [ ] GREEN: re-raise or route unexpected failures through the existing retry/error path when the caller expects durability.
- [ ] REFACTOR: keep deadline/scheduler tolerant paths explicit; do not make every caller fatal.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_notification_service.py -q)
(cd backend && ./venv/bin/ruff check app/services/notification_service.py)
```

## 9. Wave 2 - Frontend Release Blockers

Goal: fix C-7 through C-10 with user-facing tests.

### W2.1 C-7 app-level ErrorBoundary

Target Interface:

- Module: `frontend/src/components/ErrorBoundary.tsx`
- Interface: catches route render crashes, shows recoverable fallback, resets on route changes.
- Adapter: `frontend/src/App.tsx` wraps a common route-render surface covering public routes and the protected route shell.

Steps:

- [ ] RED: add `tests/frontend/unit/src/components/ErrorBoundary.test.tsx::renders_fallback_when_child_route_throws`.
- [ ] RED: add `tests/frontend/unit/src/components/ErrorBoundary.test.tsx::renders_fallback_when_public_route_throws`.
- [ ] RED: add `tests/frontend/unit/src/components/ErrorBoundary.test.tsx::renders_fallback_when_protected_child_route_throws`.
- [ ] RED: add `tests/frontend/unit/src/components/ErrorBoundary.test.tsx::resets_error_on_location_change`.
- [ ] Confirm tests fail because no boundary exists.
- [ ] GREEN: implement class or supported React error boundary component with accessible fallback.
- [ ] GREEN: wrap both `publicRoutes` and the protected route shell through the same ErrorBoundary surface in `App.tsx` while preserving `Suspense`.
- [ ] REFACTOR: keep fallback text concise and operational; do not create a marketing or explanatory page.
- [ ] VERIFY:

```bash
(cd frontend && npm run test:run -- ErrorBoundary.test.tsx)
(cd frontend && npx tsc --noEmit)
```

### W2.2 C-8 route guards for protected pages

Target Interface:

- Module: `frontend/src/authz/BusinessRouteGuards.tsx`
- Interface: typed route guard components mirror backend capability semantics.
- Adapter: route config wraps `/audit-trail`, `/admin`, and `/admin/docs`; `/vendor-reports` uses the backend `/vendor-reports/capabilities` response as a page-level gate unless a later backend-authored Authz projection is added.

Steps:

- [ ] RED: extend `tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.test.tsx` for direct navigation with denied authz redirects.
- [ ] RED: extend `tests/frontend/unit/src/authz/__tests__/BusinessRouteGuards.factory.test.tsx` for any new guard exports.
- [ ] RED: add structural coverage that protected route manifests cannot rely only on sidebar `isVisible`.
- [ ] RED: add a vendor reports negative test proving direct navigation does not render protected report content/actions unless `GET /api/v1/vendor-reports/capabilities` returns `can_read: true`.
- [ ] Confirm tests fail for currently unguarded route configs.
- [ ] GREEN: add or reuse guard factories for audit trail, admin console, and admin docs through the existing `createBusinessRouteGuard` factory. Update the structural test that currently locks the exact guard export set.
- [ ] GREEN: map each guard to backend capability semantics. Admin routes guard on `canViewAdminConsole`, not raw `isPlatformAdmin`. Audit-trail route protection must match the backend read surface used by the page; export visibility remains driven by backend response capabilities.
- [ ] GREEN: `/vendor-reports` remains page-gated by backend-authored `/vendor-reports/capabilities`. Do not guard it with only `reports:read`; a synchronous Authz route guard may be added only after backend exposes a matching vendor-report Authz projection.
- [ ] GREEN: wrap route entries in `frontend/src/routing/business.tsx` and `frontend/src/routing/admin.tsx`.
- [ ] REFACTOR: keep route config readable; route guards stay thin Adapters.
- [ ] VERIFY:

```bash
(cd frontend && npm run test:run -- BusinessRouteGuards)
(cd frontend && npm run test:run -- routing)
(cd frontend && npx tsc --noEmit)
```

### W2.3 C-9 remediation workflow dirty-field preservation

Target Interface:

- Module: `frontend/src/components/issues/remediation/useRemediationPlanWorkflow.ts`
- Interface: server refreshes update clean fields; dirty local fields survive; changing `issue.id` resets all fields.
- Seam: local dirty tracking separates "same issue refresh" from "new issue".

Steps:

- [ ] RED: add `tests/frontend/unit/src/components/issues/__tests__/useRemediationPlanWorkflow.test.tsx::server_refresh_does_not_clobber_dirty_fields`.
- [ ] RED: add `tests/frontend/unit/src/components/issues/__tests__/useRemediationPlanWorkflow.test.tsx::changing_issue_id_resets_workflow_fields`.
- [ ] Include `assignOwnerId`, `assignDueAt`, progress, status, blocker, completion, and validation fields.
- [ ] Confirm dirty-field test fails on current effect dependencies.
- [ ] GREEN: track a saved baseline or dirty field map.
- [ ] GREEN: reset only when `issue.id` changes or after a successful local save acknowledges the current value.
- [ ] REFACTOR: keep the hook API stable for `RemediationPlanCard`.
- [ ] VERIFY:

```bash
(cd frontend && npm run test:run -- useRemediationPlanWorkflow)
```

### W2.4 C-10 shared accessible dialog shell

Target Interface:

- Module: `frontend/src/components/DialogShell.tsx`.
- Interface: role, modal semantics, labels, initial focus, focus trap, Escape handling, opener focus restoration.
- Adapters: `ConfirmDialog` and `ArchiveConfirmDialog` retain public props.

Steps:

- [ ] RED: add `tests/frontend/unit/src/components/__tests__/ConfirmDialog.a11y.test.tsx`.
- [ ] RED: add `tests/frontend/unit/src/components/__tests__/ArchiveConfirmDialog.a11y.test.tsx`.
- [ ] Cover `role="dialog"`, `aria-modal="true"`, labelled title, described body/error, close button `aria-label`, initial focus, Escape behavior, Tab and Shift+Tab trap, focus restoration, loading-disabled close semantics, archive reason validation, and portal/backdrop behavior.
- [ ] Confirm tests fail on current dialogs.
- [ ] GREEN: extract a shared dialog shell.
- [ ] GREEN: migrate `ConfirmDialog` and `ArchiveConfirmDialog` to the shell without changing caller props.
- [ ] REFACTOR: remove duplicated behavior only after all a11y tests are green.
- [ ] VERIFY:

```bash
(cd frontend && npm run test:run -- ConfirmDialog ArchiveConfirmDialog)
(cd frontend && npm run lint -- --max-warnings=0)
```

## 10. Wave 3 - Verified Dead Code And Dead-Pin Retirement

Goal: remove shape-only scaffolding and replace name pins with behavior.

### W3.1 Verified-dead and compatibility cleanup buckets

W3.1A zero-call deletion targets:

- `backend/app/api/v1/endpoints/auth/_sso_helpers.py`
- `backend/app/api/v1/endpoints/controls/_helpers.py`
- `backend/app/services/_approval_execution/kri_changes.py`
- `backend/app/services/_directory_sync/`
- `backend/app/api/v1/endpoints/issues/_shared/`
- `backend/app/api/v1/endpoints/vendors/_shared.py:_get_vendor_with_deps`
- `get_config_sync` after zero-call verification
- `backend/app/services/_reporting/counts.py:count_high_risks` plus the `backend/app/services/report_service.py` facade re-export, after zero-production-call verification
- `backend/app/services/export_snapshot_service.py:apply_kri_value_as_of`
- `frontend/src/components/layout/Header.tsx`
- dead helpers in `frontend/src/components/access/usersTablePresentation.ts`
- unused `currentUserId` prop in `frontend/src/pages/approvals/ApprovalList.tsx`

W3.1B test-only or contract-pinned compatibility cleanup:

- `scripts/security/authz_validator/`
- `backend/app/services/_register_listings/__init__.py`

W3.1C live compatibility adapter migration before deletion:

- `backend/app/services/_reporting/exports/monitoring.py`
- `backend/app/services/deadline_runner.py`
- `backend/app/services/deadline_notifications.py`

Steps:

- [ ] RED: add parametrized AST/path test `tests/backend/pytest/architecture/test_verified_dead_code_deleted_red.py`.
- [ ] RED: add frontend architecture test under `tests/frontend/unit/src/architecture/verifiedDeadCodeDeleted.test.ts`.
- [ ] Confirm tests fail because files or symbols exist.
- [ ] GREEN: delete only W3.1A targets with zero live production/test callers after immediate pre-delete `rg -n '\b<Name>\b' backend tests docs` verification.
- [ ] GREEN: adjust imports/barrels and allowlists that only preserve dead targets.
- [ ] GREEN: delete `backend/app/services/_directory_sync/`.
- [ ] GREEN: remove `_directory_sync` from `tests/backend/pytest/architecture/_bounded_context_adapters.toml`.
- [ ] GREEN: update `tests/backend/pytest/architecture/_w7_bounded_context_disjointness_baseline.toml` from `32` to `31`.
- [ ] GREEN: update ADR-007 text and tables to remove the phantom adapter.
- [ ] GREEN: when deleting `issues/_shared/`, run authz-contract sync in the same slice because route dependency imports may move.
- [ ] GREEN: migrate W3.1B tests/import contracts before deleting test-only or contract-pinned compatibility shims; do not classify these targets as zero-call until those contracts are updated.
- [ ] GREEN: migrate `backend/app/api/v1/endpoints/reports/unified_exports/export_monitoring.py` to canonical monitoring row builders before deleting `_reporting/exports/monitoring.py`.
- [ ] GREEN: migrate `backend/app/services/questionnaire_deadline_service.py` and deadline tests to import `_deadline_execution` APIs directly before deleting `deadline_runner.py` and `deadline_notifications.py`.
- [ ] GREEN: add negative-existence ratchets for W3.1C only after caller migration proves the compatibility adapters have zero callers.
- [ ] REFACTOR: collapse duplicated negative-existence tests into the new parametrized tests.
- [ ] VERIFY:

```bash
make -f scripts/Makefile test-architecture-locks
(cd frontend && npm run test:run -- verifiedDeadCodeDeleted)
(cd backend && ./venv/bin/ruff check .)
(cd frontend && npx tsc --noEmit)
```

### W3.2 Replace 23 dead-symbol pins

Steps:

- [ ] RED: add a contract test that fails while `tests/backend/pytest/test_architecture_deepening_contracts.py` still pins dead names with `hasattr`.
- [ ] For each live Module, write a behavior test through the public Interface before deleting name pins.
- [ ] For each dead symbol, run current `rg -n '\b<Name>\b' backend tests docs` verification immediately before removal and confirm only test/docs references remain.
- [ ] GREEN: remove 23 dead-pinned symbols: 21 dataclasses, 1 alias, 1 function; plus 2 dead Literal members.
- [ ] GREEN: remove these 21 dead dataclasses:
  - `EntityMutationOptions`
  - `EntityApprovalPlan`
  - `EntityDirectApplyPlan`
  - `DeadlineRunPlan`
  - `DeadlineRunOutcome`
  - `IssueLinkedContextDefinition`
  - `IssueRegisterPlan`
  - `IssueSourceMutationPlan`
  - `VendorLinkAccessPlan`
  - `VendorLinkedResourceProjection`
  - `VendorReportDefinition`
  - `DirectorySyncOutcome`
  - `DirectoryImportOutcome`
  - `DashboardMetricPlan`
  - `DashboardMetricOutcome`
  - `DashboardSnapshotDecision`
  - `MetricAvailability`
  - `RegisterListingCriteria`
  - `RegisterSerializerContext`
  - `ReportExportExecutionPlan`
  - `ReportExportOutcome`
- [ ] GREEN: remove 1 dead alias: `RegisterListingDefinition`.
- [ ] GREEN: remove 1 dead function: `build_deadline_notification_plan`.
- [ ] GREEN: remove 2 dead Literal members: `"no_op"` and `"blocked"`.
- [ ] GREEN: preserve live types named in the audit, including `EntityMutationOutcome`, `SideEffectResult`, `VendorListingGovernance`, `RegisterListingPlan`, and `ReportExportDefinition`.
- [ ] REFACTOR: split `test_architecture_deepening_contracts.py` into smaller behavior-oriented tests where useful.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_architecture_deepening_contracts.py -q)
make -f scripts/Makefile test-architecture-locks
```

### W3.3 `OrphanResolutionPlan` collision cleanup

Steps:

- [ ] RED: add `tests/backend/pytest/architecture/test_orphan_resolution_plan_contract_red.py` proving the live orphan-resolution Interface has one canonical exported plan symbol.
- [ ] RED: add behavior coverage for the live orphan resolution path before renaming or extracting the governance requirements projection.
- [ ] Confirm tests fail because `governance.py::OrphanResolutionPlan` collides by name with the canonical execution plan `resolution_plan.py::OrphanResolutionPlan`.
- [ ] GREEN: keep `resolution_plan.py::OrphanResolutionPlan` as the canonical execution plan.
- [ ] GREEN: rename or replace `governance.py::OrphanResolutionPlan` with an explicit requirements/projection type used by `orphan_resolution_plan()`.
- [ ] GREEN: preserve live validation behavior in `_orphaned_items/resolution.py`.
- [ ] GREEN: update imports and architecture pins so they point only at the live Interface.
- [ ] REFACTOR: keep governance/orphaned-item module names explicit; do not merge unrelated policy.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest \
  ../tests/backend/pytest/architecture/test_orphan_resolution_plan_contract_red.py \
  ../tests/backend/pytest/test_orphan_resolution_plan.py \
  ../tests/backend/pytest/test_admin_orphans.py \
  ../tests/backend/pytest/test_orphaned_items_scan_and_stats.py -q)
make -f scripts/Makefile test-architecture-locks
```

### W3.4 Manual KRI deadline trigger route decision

Decision: retain `trigger_kri_deadline_check` as a documented admin/debug API in this remediation.

Steps:

- [ ] RED: add notifications API tests proving privileged users can trigger the route and unprivileged users receive 403.
- [ ] GREEN: document or retain the current route contract as admin/debug behavior.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_notifications.py -q)
make -f scripts/Makefile test-architecture-locks
```

## 11. Wave 4 - Performance And Read-Shape Deepening

Goal: remove hot-path N+1 patterns through deeper read Modules.

### W4.1 Dashboard metrics Modules

Target Interface:

- Module: `backend/app/services/_dashboard_metrics/`
- Interface: `load_risk_dashboard_metrics`, `load_kri_dashboard_metrics`, `load_control_dashboard_metrics`, `load_department_dashboard_metrics`.
- Adapter: dashboard endpoints translate request/session data and return API schemas.

Steps:

- [ ] RED: add API parity tests for `dashboard/risks.py`, `dashboard/kris.py`, `dashboard/controls.py`, and `dashboard/departments.py`.
- [ ] RED: add query-budget test `tests/backend/pytest/api/v1/test_dashboard_query_budget.py::test_department_metrics_query_count_is_bounded`.
- [ ] RED: add AST lock that fails while dashboard endpoint files import ORM models or sibling route handlers after migration.
- [ ] GREEN: move ORM aggregation into `_dashboard_metrics/{risks,kris,controls,departments}.py`.
- [ ] GREEN: replace enum-loop counts with grouped SQL queries.
- [ ] GREEN: remove `dashboard/overview.py` route-calling-route imports.
- [ ] REFACTOR: keep endpoint files as HTTP Adapters only.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_dashboard.py ../tests/backend/pytest/api/v1/test_dashboard_query_budget.py -q)
make -f scripts/Makefile test-architecture-locks
```

### W4.2 Issue register capability preload

Steps:

- [ ] RED: add query-count coverage to `tests/backend/pytest/api/v1/test_issue_register_projection.py` proving issue summaries do not call the capability loader per row.
- [ ] GREEN: introduce a batch/preload capability Seam aligned with risks, controls, and KRIs.
- [ ] REFACTOR: keep per-row capability response shape unchanged.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/api/v1/test_issue_register_projection.py -q)
```

### W4.3 Approval queue SQL visibility and index

Steps:

- [ ] RED: add `tests/backend/pytest/test_approval_queue_visibility.py::test_visibility_filter_applies_before_pagination`.
- [ ] RED: add parity tests for requester, primary approver, scenario approver, privileged resolver, status filters, resource visibility, total count, and pagination.
- [ ] RED: assert returned rows preserve backend-computed `capabilities.can_approve`, `capabilities.can_reject`, and top-level compatibility flags.
- [ ] GREEN: push visibility filtering into SQL before pagination.
- [ ] RED: after the query shape is finalized, add migration rehearsal for composite index on `ApprovalRequest(status, created_at)`.
- [ ] GREEN: add the Alembic migration and model/index declaration if the model owns indexes locally.
- [ ] REFACTOR: move `approval_queue_visibility.py` into `_approval_queue/` if imports stay local and tests remain clear.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_approval_queue_visibility.py -q)
(cd backend && TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub_test ./venv/bin/python -m pytest ../tests/backend/pytest/migrations/test_approval_request_status_created_index.py -q)
```

### W4.4 Dashboard issue aggregate reuse

Steps:

- [ ] RED: add a query-budget test proving summary, aging, and severity do not each load the full scoped issue set independently.
- [ ] GREEN: share one aggregate query path or use SQL aggregation.
- [ ] REFACTOR: keep existing dashboard API response schemas stable.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/api/v1/test_dashboard_issue_metrics.py -q)
```

## 12. Wave 5 - Transaction Seam And Service Commit Adoption

Goal: turn a decorative helper into a real service-owned commit Seam.

### W5.1 Define `commit_service_boundary`

Target Interface:

- Module: `backend/app/services/transaction_boundary.py`
- Interface: `commit_service_boundary(db, *, boundary: str)` commits, rolls back on commit failure, and emits useful boundary metadata.
- Seam: service Modules commit through one observable primitive.

Steps:

- [ ] RED: add `tests/backend/pytest/test_transaction_boundary.py::test_commit_service_boundary_rolls_back_and_logs_boundary_on_commit_failure`.
- [ ] RED: add `tests/backend/pytest/test_transaction_boundary.py::test_commit_service_boundary_commits_once_on_success`.
- [ ] Confirm tests fail because current `commit_service_transaction` is a shallow commit wrapper.
- [ ] GREEN: implement `commit_service_boundary`.
- [ ] GREEN: make `commit_auth_transaction` delegate to or share implementation with the generic helper while preserving auth call sites.
- [ ] REFACTOR: keep the old endpoint helper as a temporary compatibility Adapter only until W5.2 migrates its callers.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_transaction_boundary.py -q)
```

### W5.2 Ratchet service-side raw commits

Steps:

- [ ] RED: add AST lock `tests/backend/pytest/architecture/test_service_commit_boundary_ratchet_red.py`.
- [ ] Seed an allowlist with current raw service commits and clear ownership/rationale.
- [ ] GREEN: migrate single-commit candidates first:
  - `_notification_inbox/lifecycle.py`
  - `_identity_access_lifecycle/execution.py::log_user_update_and_commit`
  - `_identity_access_lifecycle/execution.py::commit_directory_import`
  - `_identity_access_lifecycle/profile_updates.py`
  - `_control_execution/workflow.py`
  - `_control_execution/link_policy.py`
  - `_orphaned_items/resolution.py`
  - `_orphaned_items/flagging.py`
  - low-risk `_auth_session_workflow/*` callers after auth helper delegation
- [ ] RED: before migrating each commit caller, add or name the concrete focused behavior test file for that caller; do not execute this slice with an unnamed verification target.
- [ ] RED: add `tests/backend/pytest/test_service_commit_boundary_adoption.py` if no existing focused file covers the caller being migrated.
- [ ] REFACTOR: avoid mass-changing high-risk multi-step workflows until each has local tests.
- [ ] VERIFY after each Module:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_service_commit_boundary_adoption.py ../tests/backend/pytest/architecture/test_service_commit_boundary_ratchet_red.py -q)
make -f scripts/Makefile test-architecture-locks
```

### W5.3 ADR-002 and ADR-011 update

- [ ] RED: add/extend an ADR consistency test that fails while ADR-002 or ADR-011 names stale transaction primitives, stale auth-flow exemption text, or obsolete endpoint commit allowlist counts.
- [ ] GREEN: update ADR-002 to describe `commit_service_boundary`, rollback behavior, and the adoption ratchet.
- [ ] GREEN: update ADR-011 to match the current auth-flow endpoint commit state, `_auth_session_workflow` ownership, and endpoint commit allowlist expiration.
- [ ] VERIFY:

```bash
make -f scripts/Makefile test-architecture-locks
```

## 13. Wave 6 - Endpoint Adapter Thinning

Goal: endpoints stop owning domain queries, model imports, and private service details where the audit called out drift.

### W6.1 Restore orchestrators

Target Interface:

- Module: `backend/app/services/_entity_mutation_lifecycle/lifecycle.py`
- Interface: restore operations for risks, controls, and KRIs use the same mutation Seam as archive/update paths.
- Adapter: restore endpoints pass actor, id, and request data only.

Steps:

- [ ] RED: add public API tests for `/risks/{id}/restore`, `/controls/{id}/restore`, and `/kris/{id}/restore` covering archived visibility, activity logs, `can_restore` metadata, and RBAC.
- [ ] RED: add AST lock `tests/backend/pytest/architecture/test_restore_endpoints_thin_adapters_red.py` that fails on model imports, `select(...)`, or endpoint-side commit shims in restore endpoints after migration.
- [ ] GREEN: implement restore orchestration in `_entity_mutation_lifecycle`.
- [ ] GREEN: move endpoint ORM reads/writes into the service Module.
- [ ] REFACTOR: keep endpoints thin and keep response schemas unchanged.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_risks.py ../tests/backend/pytest/test_kris_rbac.py ../tests/backend/pytest/architecture/test_restore_endpoints_thin_adapters_red.py -q)
```

### W6.2 Create endpoint business logic into services

Steps:

- [ ] RED: add service-level behavior tests for risk-code collision retry and final conflict after max retries.
- [ ] RED: add `tests/backend/pytest/test_create_endpoint_service_modules.py` for service-level create behavior if no existing test file already covers the service boundary.
- [ ] RED: add service-level behavior tests for create paths in controls, KRIs, issues, and contextual issues that currently own business rules in endpoint Adapters.
- [ ] RED: add endpoint parity tests proving response shape, RBAC, audit/activity behavior, and conflict mapping stay stable.
- [ ] RED: add architecture lock `tests/backend/pytest/architecture/test_create_endpoints_thin_adapters_red.py`.
  - It must scan the migrated create adapters:
    - `backend/app/api/v1/endpoints/risks/crud/create.py`
    - `backend/app/api/v1/endpoints/controls/crud/create.py`
    - `backend/app/api/v1/endpoints/kris/crud/create.py`
    - `backend/app/api/v1/endpoints/issues/crud/create.py`
    - `backend/app/api/v1/endpoints/issues/crud/contextual.py`
  - It must fail if those adapters reintroduce inline retry loops: `MAX_RETRIES`, `IntegrityError`, `for attempt in range`.
  - It must fail if those adapters reintroduce ORM/domain construction: `Risk(`, `Control(`, `KeyRiskIndicator(`, `Issue(`, `IssueRemediationPlan(`.
  - It must fail if those adapters import domain models/enums from `app.models` or `app.models.issue`: `Risk`, `Control`, `KeyRiskIndicator`, `Issue`, `IssueRemediationPlan`, `IssueStatus`, `IssueRemediationStatus`, `VendorKRILink`. `User` remains allowed as a route dependency type import.
  - It must fail if those adapters reintroduce endpoint transaction workflows: `db.add`, `db.flush`, `db.refresh`, `db.rollback`, `db.commit`, `commit_service_transaction`.
  - It must fail if those adapters reintroduce endpoint reload/query internals: `select(`, `selectinload`, `joinedload`, `db.execute`.
- [ ] GREEN: move retry loop from `backend/app/api/v1/endpoints/risks/crud/create.py` into the risk service Module.
- [ ] GREEN: move audited create business logic for controls, KRIs, issues, and contextual issues behind service Interfaces one endpoint family at a time.
- [ ] REFACTOR: endpoints remain Adapters around service Interfaces.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest \
  ../tests/backend/pytest/test_create_endpoint_service_modules.py \
  ../tests/backend/pytest/test_risks.py \
  ../tests/backend/pytest/test_controls.py \
  ../tests/backend/pytest/test_kris_rbac.py \
  ../tests/backend/pytest/api/v1/test_issues_crud_api.py \
  ../tests/backend/pytest/api/v1/test_issues_contextual_api.py \
  ../tests/backend/pytest/api/v1/test_issues_rbac_api.py \
  ../tests/backend/pytest/architecture/test_create_endpoints_thin_adapters_red.py -q)
make -f scripts/Makefile test-architecture-locks
```

### W6.3 Private capability import discipline

Steps:

- [ ] RED: add AST lock that fails for endpoint imports from `app.services._authorization_capabilities` when the symbol exists on `app.services.authorization_capabilities`.
- [ ] GREEN: migrate true bypasses such as `endpoints/users/summary.py` to the public facade.
- [ ] GREEN: Facade Option A is locked: keep `authorization_capabilities.py` narrow and lock only private imports whose symbols exist on the public facade.
- [ ] GREEN: keep forced bypasses allowlisted with rationale only when the symbol does not exist on the public facade.
- [ ] GREEN: migrate `_register_listings/risks.py` true service-layer bypass if the public facade supports the symbol.
- [ ] REFACTOR: document Option A in ADR-001 and the private import architecture lock.
- [ ] VERIFY:

```bash
make -f scripts/Makefile test-architecture-locks
python3 scripts/security/validate_authz_capability_contract.py
```

### W6.4 Reporting and docs Adapters

Steps:

- [ ] RED: add architecture tests for `admin/docs.py`, audit-trail Excel, and summary export endpoints to ensure they call service Modules rather than doing document/report assembly inline.
- [ ] GREEN: extract audited document/report assembly to `_documentation_service` and `_reporting/excel` Modules.
- [ ] REFACTOR: keep endpoint response types and filenames stable.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/api/v1/test_reports_kris.py -q)
make -f scripts/Makefile test-architecture-locks
```

### W6.5 Reporting export consolidation

Target Interface:

- Module: `backend/app/services/_reporting/exports/`
- Interface: `_reporting/exports` is the canonical export-building package; endpoint shims delegate to it until they are deleted.
- Adapter: `unified_exports/pipeline.py`, `_shared.py`, and the audited 10 shims preserve route behavior during migration.

Steps:

- [ ] RED: add export parity tests covering filenames, filter handling, row shapes, content type, and response headers for each audited reporting route.
- [ ] RED: if a new registry-specific export test file is introduced, create it in this slice before any verification command references it.
- [ ] RED: add an architecture lock that fails while endpoint-level export shims assemble rows directly after migration.
- [ ] GREEN: make `_reporting/exports` canonical for export builders.
- [ ] GREEN: migrate `unified_exports/pipeline.py`, `_shared.py`, and the audited 10 shims to the canonical package or delete them when zero-call verification proves they are dead.
- [ ] REFACTOR: keep route signatures, file names, and response headers stable.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest \
  ../tests/backend/pytest/api/v1/test_reports_export_pipeline.py \
  ../tests/backend/pytest/api/v1/test_reports_risks.py \
  ../tests/backend/pytest/api/v1/test_reports_controls.py \
  ../tests/backend/pytest/api/v1/test_reports_kris.py \
  ../tests/backend/pytest/api/v1/test_reports_issues.py \
  ../tests/backend/pytest/api/v1/test_reports_audit.py \
  ../tests/backend/pytest/test_reports_rbac.py -q)
make -f scripts/Makefile test-architecture-locks
```

### W6.6 Vendor/KRI assignment bridge rename

Steps:

- [ ] RED: add one-step migration coverage for callers of the legacy `backend/app/services/_vendor_links/kri_assignment.py` path.
- [ ] GREEN: rename `_vendor_links/kri_assignment.py` to `_vendor_links/kri_bridge.py`, reflecting vendor-link assignment behavior rather than KRI ownership.
- [ ] GREEN: migrate all callers in one slice; do not keep a compatibility shim.
- [ ] REFACTOR: keep vendor-link business rules in `_vendor_links`; do not move KRI side effects into the bridge.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_vendor_links.py ../tests/backend/pytest/test_kris_rbac.py -q)
(cd backend && ./venv/bin/ruff check app/services/_vendor_links)
```

### W6.7 Endpoint `require_*` factory consolidation

Steps:

- [ ] RED: add route dependency parity tests for the scattered endpoint `require_*` factories named by the audit.
- [ ] RED: add an AST lock that prevents new local `require_*` factories when an equivalent shared auth dependency exists.
- [ ] RED: add `tests/backend/pytest/architecture/test_endpoint_auth_dependency_factories_red.py`.
- [ ] GREEN: consolidate duplicate endpoint `require_*` factories into a small shared dependency factory that preserves backend capability semantics.
- [ ] GREEN: update affected endpoints and docs/security capability contract references in the same slice.
- [ ] REFACTOR: keep route-specific policy arguments explicit; do not hide resource/action decisions behind stringly typed helpers.
- [ ] VERIFY:

```bash
python3 scripts/security/validate_authz_capability_contract.py
make -f scripts/Makefile test-architecture-locks
(cd backend && ./venv/bin/python -m pytest \
  ../tests/backend/pytest/test_authz_capability_contract_validator.py \
  ../tests/backend/pytest/test_authorization_capabilities_facade.py \
  ../tests/backend/pytest/architecture/test_endpoint_auth_dependency_factories_red.py -q)
```

### W6.8 Approval execution authz helper

Steps:

- [ ] RED: add approval execution tests proving approve, reject, and cancel privilege checks stay behaviorally identical.
- [ ] RED: create `tests/backend/pytest/test_approval_execution.py` for approve, reject, and cancel privilege parity before referencing it in verification.
- [ ] GREEN: extract a shared approval execution authz helper for approve/reject/cancel checks.
- [ ] GREEN: keep the helper behind the approval execution service boundary; endpoints stay thin.
- [ ] REFACTOR: avoid coupling queue projection capabilities to execution authorization.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_approvals.py ../tests/backend/pytest/test_approval_execution.py -q)
python3 scripts/security/validate_authz_capability_contract.py
```

## 14. Wave 7 - Listing And Archive Simplification

Goal: reduce duplication without flattening domain semantics.

### W7.1 Register listing sentinels and group parsing

Steps:

- [ ] RED: add characterization tests for risks, controls, KRIs, and vendors grouped list output:
  - unlinked vendor
  - uncategorized
  - structurally parallel unlinked risk
  - `vendor:` and `risk:` prefixed filters
  - capability metadata
- [ ] GREEN: extract shared sentinel values for the 3x identical vendor-related sentinels.
- [ ] GREEN: keep vendor/risk sentinel semantics explicit; do not claim four identical sentinels.
- [ ] GREEN: extract `parse_prefixed_group_value` helper.
- [ ] REFACTOR: delete duplicated parser code only after characterization tests pass.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/api/v1/test_issue_register_module.py ../tests/backend/pytest/test_kris_department_filters_api.py -q)
```

### W7.1A Drop duplicate `merge_collection_filters`

Steps:

- [ ] RED: add characterization tests for the canonical collection filter helper and the local duplicate proving identical merged filter output.
- [ ] RED: add `tests/backend/pytest/api/v1/test_register_vendor_context_filters.py` for vendor-context extraction parity.
- [ ] Confirm tests fail after temporarily routing the duplicate call path to the canonical helper without adapting edge cases.
- [ ] GREEN: delete the local duplicate `merge_collection_filters` and call the canonical helper.
- [ ] REFACTOR: keep collection-specific defaults visible at the call site.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest \
  ../tests/backend/pytest/api/v1/test_collection_helpers.py \
  ../tests/backend/pytest/api/v1/test_issue_register_module.py \
  ../tests/backend/pytest/api/v1/test_register_vendor_context_filters.py -q)
```

### W7.2 Vendor-context subquery helper

Steps:

- [ ] RED: add tests proving controls, KRIs, and risks vendor-context filters return identical rows before and after extraction.
- [ ] RED: create or extend `tests/backend/pytest/api/v1/test_register_vendor_context_filters.py`.
- [ ] GREEN: extract a small helper in `_register_listings/`.
- [ ] REFACTOR: keep entity-specific joins and capability decisions outside the helper.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest \
  ../tests/backend/pytest/api/v1/test_register_vendor_context_filters.py \
  ../tests/backend/pytest/test_risks.py \
  ../tests/backend/pytest/test_controls.py \
  ../tests/backend/pytest/test_kris_rbac.py -q)
```

### W7.3 Archive detail consolidation

Steps:

- [ ] RED: add behavior tests for `archive_risk_detail`, `archive_control_detail`, and `archive_kri_detail` covering pending delete, existing archived entity, actor metadata, and response detail.
- [ ] GREEN: consolidate `archive_X_no_commit` and `archive_X_detail` through a typed internal descriptor or function.
- [ ] REFACTOR: keep exception classes domain-specific where existing behavior differs.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_risks.py ../tests/backend/pytest/test_kris_rbac.py ../tests/backend/pytest/test_architecture_deepening_contracts.py -q)
```

### W7.4a `resolve_safe_default_role` shared helper

- [ ] Test file: `tests/backend/pytest/test_safe_default_role.py`.
- [ ] RED: add parametrized tests preserving current `RuntimeError`, `ServiceFailure`, and `HTTPException` behavior for all callers.
- [ ] Expected RED failure: at least one caller still handles missing default role through local exception construction that cannot be driven by a shared helper.
- [ ] Implementation file: the current role helper Module plus each caller that has local `resolve_safe_default_role` behavior.
- [ ] GREEN: extract a shared helper with an exception factory callback and migrate callers one at a time.
- [ ] REFACTOR: keep caller-specific HTTP status and service error messages explicit at the call site.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_safe_default_role.py -q)
(cd backend && ./venv/bin/ruff check app/services app/api/v1/endpoints)
```

### W7.4b `_to_directory_user` shared normalizer

- [ ] Test file: `tests/backend/pytest/test_directory_user_normalization.py`.
- [ ] RED: add parametrized AD and Graph tests over the seven shared fields currently normalized by `_to_directory_user`.
- [ ] Expected RED failure: AD and Graph conversion paths still duplicate field mapping and cannot share one asserted normalizer.
- [ ] Implementation files: `backend/app/services/directory_provider_service.py` and `backend/app/services/_graph_directory/service.py`.
- [ ] GREEN: extract a shared normalizer that maps the seven shared fields while keeping provider-specific fields explicit.
- [ ] REFACTOR: keep provider adapters thin; do not hide Graph-only or AD-only semantics.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_directory_user_normalization.py -q)
(cd backend && ./venv/bin/ruff check app/services)
```

### W7.4c `_kri_history/queries.py` period-row builder

- [ ] Test file: `tests/backend/pytest/test_kri_history_queries.py`.
- [ ] RED: add overdue and due-soon characterization tests for both existing query call paths.
- [ ] Expected RED failure: the two call paths build equivalent period rows independently and cannot be tested through one helper.
- [ ] Implementation file: `backend/app/services/_kri_history/queries.py`.
- [ ] GREEN: extract a shared period-row builder for overdue and due-soon query results.
- [ ] REFACTOR: keep query predicates and scoping outside the row builder.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_kri_history_queries.py -q)
```

### W7.4d Export builders residual verification

- [ ] W6.5 owns export consolidation and any registry extraction. Do not duplicate that implementation here.
- [ ] RED: add a registry-specific assertion in the W6.5 test file proving export builders are selected through the canonical `_reporting/exports` Interface after W6.5 lands.
- [ ] VERIFY after W6.5:

```bash
(cd backend && ./venv/bin/python -m pytest \
  ../tests/backend/pytest/api/v1/test_reports_export_pipeline.py \
  ../tests/backend/pytest/api/v1/test_reports_risks.py \
  ../tests/backend/pytest/api/v1/test_reports_controls.py \
  ../tests/backend/pytest/api/v1/test_reports_kris.py \
  ../tests/backend/pytest/api/v1/test_reports_issues.py \
  ../tests/backend/pytest/api/v1/test_reports_audit.py \
  ../tests/backend/pytest/test_reports_rbac.py -q)
make -f scripts/Makefile test-architecture-locks
```

### W7.5 Approval-execution `KRIEditKind` discriminator

Steps:

- [ ] RED: add tests proving every `SIDE_EFFECT_HANDLERS` entry is addressed by an explicit `KRIEditKind` discriminator.
- [ ] RED: add dispatch tests for each KRI side-effect path currently keyed by ad hoc string or shape checks.
- [ ] RED: create `tests/backend/pytest/test_kri_approval_side_effects.py` for KRI side-effect dispatch before referencing it in verification.
- [ ] Expected RED failure: side-effect dispatch can add a handler without updating the discriminator.
- [ ] GREEN: introduce `KRIEditKind` aligned with `SIDE_EFFECT_HANDLERS`.
- [ ] GREEN: route approval-execution KRI side effects through the discriminator.
- [ ] REFACTOR: keep handler implementations unchanged except for typed dispatch inputs.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_approval_execution.py ../tests/backend/pytest/test_kri_approval_side_effects.py -q)
```

### W7.6 Remove unused KRI side-effect `department_id`

Steps:

- [ ] RED: add type or behavior tests in `tests/backend/pytest/test_kri_approval_side_effects.py` proving the three KRI side-effect functions do not use `department_id`.
- [ ] Expected RED failure: signatures still accept unused `department_id`.
- [ ] GREEN: remove `department_id` from the three side-effect signatures and all call sites.
- [ ] REFACTOR: keep department scoping checks in the caller that actually owns authorization.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_kri_approval_side_effects.py -q)
(cd backend && ./venv/bin/python -m mypy --config-file mypy.ini app/services/_approval_execution --no-error-summary --no-pretty)
```

### W7.7 Consolidate pending-delete assertion duplication

Steps:

- [ ] RED: add behavior tests for each duplicated `assert_no_pending_delete` path covering pending-delete, archived, and active entities.
- [ ] Expected RED failure: duplicate assertions drift in exception type, status code, or message.
- [ ] GREEN: consolidate pending-delete assertions behind one small helper or domain method.
- [ ] REFACTOR: keep entity-specific exception messages where callers already depend on them.
- [ ] VERIFY:

```bash
(cd backend && ./venv/bin/python -m pytest ../tests/backend/pytest/test_risks.py ../tests/backend/pytest/test_controls.py ../tests/backend/pytest/test_kris_rbac.py -q)
```

## 15. Wave 8 - Frontend Register And Detail-Fetch Simplification

Goal: bring frontend architecture in line with backend register/detail patterns.

Dependency decision:

- Do not add `react-hook-form`; future form-validation consolidation requires separate dependency approval.

### W8.1 Register page-state migration

Rules:

- Migrate only risks, issues, vendors, and KRIs. Controls are the template and should not be rewritten except to adjust shared types.
- Do one register at a time.
- Preserve sorting, grouped views, export filters, URL-param initial state, archived visibility, vendor-context exclusions, page reset semantics, group reset semantics, access-denied state, and error state.

Slices:

- [ ] Risks: add RED tests for `useRisksPageState`, migrate to `useRegisterPageController`, run focused tests.
- [ ] Issues: add RED tests for `useIssuesPageState`, migrate to controller, preserve remediation/approval filters.
- [ ] Vendors: add RED tests for `useVendorsPageState`, migrate to controller, preserve vendor-context exclusions.
- [ ] KRIs: add RED tests for `useKrisPageState`, migrate to controller, preserve period/status filters.

Verification:

```bash
(cd frontend && npm run test:run -- useRegisterPageController useRisksPageState useIssuesPageState useVendorsPageState useKrisPageState)
(cd frontend && npx tsc --noEmit)
```

### W8.2 Detail-fetch migration to React Query

Scope decision:

- In scope: the three audit-framed detail pages using `useDetailResource`.
- VendorDetailPage is in scope for React Query detail-fetch migration via `useVendorDetailState`.
- Template: `frontend/src/pages/issues/issue-detail/useIssueDetail.ts`.
- Move `frontend/src/lib/issueQueryKeys.ts` into `frontend/src/lib/queryKeys/`.
- Use and document `30_000` ms stale time for migrated detail queries unless an existing query-key policy file already states a stricter value.

Steps:

- [ ] RED: add tests for invalid IDs not calling APIs, 403 mapping to access-denied, retry/refetch behavior, session-scoped query keys, and stale data not overwriting local tabs/dialog state.
- [ ] GREEN: migrate one detail page at a time to React Query.
- [ ] GREEN: move `frontend/src/lib/issueQueryKeys.ts` into `frontend/src/lib/queryKeys/`.
- [ ] GREEN: document the `30_000` ms stale-time policy in the shared query key/query client helper used by migrated detail pages.
- [ ] REFACTOR: remove `useDetailResource` only after zero callers remain and negative-existence tests are in place.
- [ ] VERIFY:

```bash
(cd frontend && npm run test:run -- useDetailResource useIssueDetail detail)
(cd frontend && npm run lint -- --max-warnings=0)
```

### W8.3 Dialog simplification completion

- [ ] After W2.4 is green, delete `ArchiveConfirmDialog` duplication that is now covered by the shared shell.
- [ ] Keep public props stable until all current dialog callers migrate: 8 `ConfirmDialog` production call sites and 1 `ArchiveConfirmDialog` production call site, or compatibility is deliberately removed with tests.
- [ ] Run dialog and archive/restore action tests.

### W8.4 `resolveCapabilityFlag` migration

Steps:

- [ ] RED: add frontend authz invariant tests that fail on direct capability truth checks for audited resources.
- [ ] RED: add an AST lock over production `frontend/src/**/*.{ts,tsx}` excluding schemas, types, and tests. It must catch optional-chain and alias patterns such as `capabilities?.can_X === true`, `capabilities?.can_X === false`, `capabilities?.can_X !== true`, nullish fallback checks, nested `state.capabilities?.can_X`, and boolean coercions.
- [ ] GREEN: migrate direct checks to `resolveCapabilityFlag`.
- [ ] GREEN: keep explicit exceptions only in a documented allowlist when capability absence and `false` have different semantics, or when compatibility fallback is required by contract. Each exception records file, expression, owner, and reason.
- [ ] GREEN: retain `buildLegacyAuthz` because the capability contract requires the feature-flag fallback.
- [ ] REFACTOR: do not add new frontend-only policy; keep backend capability metadata authoritative.
- [ ] VERIFY:

```bash
(cd frontend && npm run test:run -- useAuthz BusinessRouteGuards)
(cd frontend && npx tsc --noEmit)
```

### W8.5 Audited user/access i18n cleanup

Steps:

- [ ] RED: before implementing, run `rg -n "defaultValue\\s*:" frontend/src/components/access frontend/src/components/users frontend/src/pages/UserNewPage.tsx frontend/src/pages/UsersPage.tsx frontend/src/pages/users frontend/src/pages/admin-console/sections/ops` and record the fixed file inventory for this slice.
- [ ] RED: add a structural test proving audited user/access production files contain no inline literal `defaultValue:` fallbacks.
- [ ] RED: add render tests or locale-resource tests proving audited user/access strings come from locale resources.
- [ ] Expected RED failure: audited components still carry inline `defaultValue` strings.
- [ ] GREEN: remove audited inline `defaultValue` fallbacks, adding missing locale keys only where absent.
- [ ] REFACTOR: keep translation keys domain-specific and avoid moving unrelated copy.
- [ ] VERIFY:

```bash
(cd frontend && npm run test:run -- access users i18n)
(cd frontend && npm run i18n:test)
(cd frontend && npm run lint -- --max-warnings=0)
```

### W8.6 `useKriFormState` patch setter consolidation

Steps:

- [ ] RED: add hook tests covering the existing generic `setFormField` behavior plus representative patch-backed UI state updates.
- [ ] Expected RED failure: the hook already has generic `setFormField`, but still exposes many named patch setters for non-`formData` state.
- [ ] GREEN: preserve `setFormField`; introduce a typed generic patch/state setter only for non-`formData` state and migrate callers without behavior changes.
- [ ] REFACTOR: keep field-specific parsing/validation explicit in the hook.
- [ ] VERIFY:

```bash
(cd frontend && npm run test:run -- useKriFormState)
(cd frontend && npx tsc --noEmit)
```

## 16. Wave 9 - Architecture Locks, ADRs, And Final Gates

Goal: make the fixed architecture hard to regress.

### W9.1 Global outbox-only lock ratchet verification

- [ ] W1.2 owns global outbox-only lock implementation and RED proof.
- [ ] VERIFY: confirm the global lock still catches direct notification emission in services where outbox is required.
- [ ] VERIFY: confirm any scheduler replay-path allowlist is documented with dedupe/replay semantics.

### W9.2 Endpoint Adapter lock roll-up

- [ ] W4.1 owns dashboard endpoint ORM and route-calling-route locks.
- [ ] W6.1 owns restore endpoint adapter locks.
- [ ] W6.2 owns tests/backend/pytest/architecture/test_create_endpoints_thin_adapters_red.py for create adapters and the forbidden-pattern set named in W6.2.
- [ ] W6.3 owns private capability import discipline locks.
- [ ] W8.4 owns frontend capability AST locks.
- [ ] VERIFY: run the aggregate architecture-lock gate and confirm all owning-slice locks are present and passing.

### W9.3 Phantom Module and allowlist hygiene

- [ ] W3.1 owns deleting `backend/app/services/_directory_sync/`, removing it from `_bounded_context_adapters.toml`, updating the disjointness baseline from `32` to `31`, and updating ADR-007.
- [ ] Add phantom adapter detection for `_bounded_context_adapters.toml` after W3.1.
- [ ] VERIFY: `_directory_sync` is absent from the code tree, adapter TOML, disjointness baseline, and ADR-007.
- [ ] Tighten empty or meaningless allowlist ceilings:
  - `_endpoint_commit_allowlist.toml`
  - `_naming_allowlist.toml`
  - `_capability_catalog_access_user_baseline.toml`
  - `_capabilities_all_allowlist.toml` decorative `intent` metadata
- [ ] Prefer parametrized tests for duplicate single-assertion negative-existence locks.

### W9.4 ADR updates

- [ ] ADR-001: update invariant wording and tests for public facade/private capability import discipline.
- [ ] ADR-002: document `commit_service_boundary`, rollback behavior, retired auth-flow exemptions, and service adoption ratchet.
- [ ] ADR-007: resolve `_directory_sync` phantom adapter and update bounded-context taxonomy.
- [ ] ADR-011: reconcile auth/session model text with the current endpoint commit allowlist and `_auth_session_workflow` ownership.
- [ ] Run docs topology and architecture-lock gates after each ADR slice.

### W9.5 AST architecture-test cleanup

Steps:

- [ ] RED: replace `tests/backend/pytest/architecture/test_monitoring_response_shim_removed_red.py::test_no_endpoint_imports_shim` with an equivalent AST-based test that fails for the same forbidden pattern.
- [ ] Expected RED failure: the AST test catches the current violation without invoking subprocess `grep`.
- [ ] GREEN: replace the subprocess grep architecture test with AST parsing.
- [ ] REFACTOR: keep test failure messages specific enough to name the file, symbol, and rule.
- [ ] VERIFY:

```bash
make -f scripts/Makefile test-architecture-locks
```

### W9.6 Plan readiness and future remediation gates

Docs-only plan-readiness verification after editing this document:

```bash
git status --short --branch
git diff --check -- docs/audits/2026-05-23-architecture-audit-remediation-plan.md
git diff --name-only -- backend frontend scripts tests .github
python3 scripts/check_docs_contract.py
python3 scripts/tools/readme_coverage.py audit --report-json /tmp/riskhub-readme-coverage.json --report-md /tmp/riskhub-readme-coverage.md
python3 scripts/tools/docs_tree_audit.py --scope canonical --max-root-hops 3 --fail-on-unreachable --output-dir /tmp/riskhub-docs-tree-audit
rg -n '[S]ource audit (section|Theme|Top 15|frontend drift|dead-code inventory)|test_[i]ssues\.py|test_[o]rphaned_items\.py|[f]ails before W1\.2|[a]ll seven callers|[r]eplace the 14 per-field setters|[i]dentify the brittle subprocess grep' docs/audits/2026-05-23-architecture-audit-remediation-plan.md
```

Future implementation final gate:

```bash
set -euo pipefail

make -f scripts/Makefile test-architecture-locks
python3 scripts/security/validate_authz_capability_contract.py
make -f scripts/Makefile docs-topology-consistency
make -f scripts/Makefile lint-backend
make -f scripts/Makefile test
TEST_DATABASE_URL=postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub_test make -f scripts/Makefile test-postgres-ci
(
  cd backend
  set +e
  output="$(./venv/bin/python -m mypy --config-file mypy.ini . --no-error-summary --no-pretty 2>&1)"
  status=$?
  set -e
  printf '%s\n' "$output"
  count="$(printf '%s\n' "$output" | awk '/: error:/ {n++} END {print n+0}')"
  printf 'mypy error count: %s\n' "$count"
  if [ "$status" -gt 1 ] || { [ "$status" -ne 0 ] && [ "$count" -eq 0 ]; }; then exit "$status"; fi
  test "$count" -le "${MYPY_MAX_ERRORS:-103}"
)
(cd frontend && npx tsc --noEmit)
(cd frontend && npm run lint -- --max-warnings=0)
(cd frontend && npm run test:run)
make -f scripts/Makefile test-e2e
```

- Full mypy is a baseline-count gate, not a raw zero-exit gate, until the 103-error baseline is eliminated.
- Count `: error:` lines from full mypy output; the final count must be `<= 103`.
- Touched backend files must introduce no new mypy errors.
- If a slice reduces the full count, record the new lower baseline and use it for later verification.
- `docs-topology-consistency` must pass before final remediation completion.
- Any `structure_metrics_guard` drift must be fixed in `.planning/codebase/STRUCTURE.md`; do not waive it in final completion.
- `python3 scripts/tools/structure_metrics_guard.py --output-dir /tmp/riskhub-structure-metrics-guard` is informational for this docs-only repair unless `.planning/codebase/STRUCTURE.md` drift is explicitly in scope.

If a full backend pytest run is too slow for an intermediate slice, run the focused tests plus architecture locks. The final gate still requires the full command set or an explicit owner-approved limitation.

## 17. Evidence Map

| Plan area | Evidence |
|---|---|
| C-1 through C-6 | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:23` through `:28` |
| C-7 through C-10 | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:36` through `:39` |
| Top 10 deepening opportunities | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:345` through `:360` |
| Top 15 simplification targets and quick wins | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:374` through `:410` |
| Dead symbols and live retain items | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:414` through `:443` |
| Frontend duplication and corrected premises | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:263` through `:271` |
| Listing/archive duplication | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:279` through `:289` |
| Endpoint private imports and inline ORM | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:293` through `:307`, `:670` |
| Architecture-lock and ADR drift | `docs/audits/2026-05-18-architecture-and-simplify-audit.md:315` through `:327`, `:484` through `:508`, `:678` |
| Repo command surfaces | `scripts/Makefile:111`, `:122`, `:135`, `:143`, `:151`, `:229` |

## 18. Known Risks And Stop Conditions

- Stop if a RED test cannot be made to fail for the audited reason. That usually means the finding was already fixed or the test is targeting the wrong seam.
- Stop if a migration sees existing duplicate KRI period rows and no owner has approved cleanup behavior.
- Stop if dashboard query changes alter department scoping or cross-department exceptions.
- Stop if frontend route guards require a capability that backend does not expose or enforce.
- Stop if a cleanup would delete an invariant-protected public import without updating the documented invariant.
- Stop if OpenTelemetry dependencies materially change startup/runtime behavior when OTel settings are unset.
- Stop if a helper extraction increases Interface size more than it hides Implementation complexity.

## 19. Done Report Template

Use this format when execution completes:

```markdown
## Result

- Fixed C-1..C-10: <yes/no, with exceptions>
- Removed/deepened dead pins: <count>
- Deleted verified-dead targets: <count>
- Added architecture locks: <list>
- ADRs updated: <list>

## Verification

<command> -> <result>

## Evidence

- <file:line or test name>

## Limitations

- <only when needed>
```
