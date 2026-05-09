# Phase 3 Loop 3 — ADR Drafts (FULL TEXT)

Authoring inline drafts of ADR-011, ADR-012, and the ADR-007 amendment.
Each draft matches the voice/structure of ADR-001 through ADR-010
(`docs/adr/ADR-001..010`) — six sections in order: `## Status`,
`## Context`, `## Decision`, `## Alternatives Rejected`, `## Migration
Impact`, `## Rollback Strategy`, `## Invariant Tests`. ADR-002 sets the
precedent for adding extra named subsections (`## Hard Expiration on
Auth-Flow Exemption`, `## Outbox Dispatcher Consolidation`,
`## Handler Idempotency`); ADR-005 sets the precedent for inline
`### sub-sections` inside `## Decision`. ADR-011 and ADR-012 follow the
same shape rather than introducing a new "Forbidden" / "Enforcement"
header set; forbidden additions are folded into `## Decision` prose, and
"Enforcement" becomes the existing `## Invariant Tests` section. This
preserves Loop B's flagged style alignment and matches every existing
ADR header in `docs/adr/`.

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Paths
absolute throughout. Quotes ≤15 words.

---

## ADR-011 — Auth Scheme and Session Model (#72)

**Target file**: `docs/adr/ADR-011-auth-scheme-and-session-model.md`
**Status**: Accepted (matching ADR-001..010 convention; see Loop B note).
**Depends on**: no other ADR. Citation-only references to ADR-001
(capability contract), ADR-002 (auth-flow allowlist sunset).

```
# ADR-011 Auth Scheme and Session Model

## Status

Accepted

## Context

RiskHub authentication exists across `backend/app/api/v1/endpoints/auth/` and `backend/app/core/security.py` but no ADR documents the canonical scheme. Three transport surfaces coexist on protected routes: the `require_permission(action, resource)` FastAPI dependency factory introduced by ADR-001, body-call `_require_*` helpers, and inline `if not has_permission: 403` checks. The mock-auth path is a fallback branch inside `backend/app/core/security.py:107-136` (the canonical `get_current_user` dependency), gated by both `settings.mock_auth_enabled` and `settings.debug`. ADR-002 records 8 auth-flow endpoint commit exemptions in `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml`, each carrying `expires_at = 2026-09-01`. SSO with Microsoft Entra is implemented at `backend/app/api/v1/endpoints/auth/sso.py:170` and `backend/app/api/v1/endpoints/auth/_sso_helpers.py:48` but its relationship to internal session lifetime is undocumented at the architecture level.

## Decision

JWT bearer access tokens with refresh-token rotation and a token-version SSOT are the canonical authentication scheme. Single-use refresh per rotation; reuse triggers full revocation through the token-version field bumped at `backend/app/api/v1/endpoints/auth/logout.py:101,132`.

The mock-auth fallback inside `backend/app/core/security.py:107-136` is permitted only when `mock_auth_enabled && debug` evaluates true — both conditions are required (the AND is load-bearing; either alone is forbidden). Production code uses `app.api.deps.get_current_user`, which delegates into `app.core.security.get_current_user`. New mock-auth call sites outside that line range are forbidden, and `MOCK_AUTH_ENABLED=true` is forbidden in non-debug environments.

Endpoint authorization uses exactly one idiom going forward — the `require_permission(action, resource)` FastAPI dependency factory defined under ADR-001 and verified by `tests/backend/pytest/architecture/test_w3_gate_snapshot.py:26-32`. Body-call `_require_*` helpers and inline `if not has_permission` raises are frozen and may not be added on protected routes; existing call sites are tracked for migration but the count is non-increasing.

SSO with Microsoft Entra is deployment-time configuration, not a runtime branch. Entra-issued tokens are exchanged at `auth/sso.py:170` for a RiskHub access+refresh pair via `auth/_sso_helpers.py:48`; internal refresh-rotation owns session lifetime from that point forward. Logout cascade at `auth/logout.py:101,132` is the only path that bumps `token_version`, clears the refresh cookie, and removes the server-side refresh row.

The 8 auth-flow endpoint commit exemptions in `_endpoint_commit_allowlist.toml` (`auth/sso.py:170`, `auth/refresh.py:177`, `auth/logout.py:101`, `auth/logout.py:132`, `auth/password.py:128`, `auth/_sso_helpers.py:48`, `auth/demo.py:67`, `auth/password.py:161`) migrate to service-owned transactions before `2026-09-01`. New entries to that allowlist for auth flows are forbidden; the lock cap drops to 0 after the sunset date. Adding a third authentication scheme on protected routes is forbidden without superseding this ADR.

## Alternatives Rejected

- Session cookies: rejected because cookie sessions do not eliminate refresh rotation and complicate cross-origin frontend operation.
- Three-idiom status quo (`require_permission` + body-call `_require_*` + inline `403`): rejected because drift detection is fragile and contract-validator coverage is partial.
- Removing mock-auth entirely: rejected because dev/test fixtures depend on the mock-auth fallback inside `core/security.py:107-136`, and removing it would force every test to mint a full token chain.
- Letting Entra own session lifetime: rejected because RiskHub refresh rotation handles permission revocation, token-version bumps, and server-side refresh-row removal more granularly than the Entra session.

## Migration Impact

Each of the 8 auth-flow allowlist sites needs a service-owned transaction wrapper before `2026-09-01`. Implementation order is tracked under the resolution plans for #71 (frontend session module merge) and #66 (AuthContext provider split), both gated on this ADR. Existing body-call `_require_*` and inline-`403` call sites remain during migration; new sites are forbidden by lock. SSO deployment configuration is unchanged — only the documented relationship between Entra token verification and RiskHub session issuance is added.

## Rollback Strategy

Forward-only. The token-version field already exists and logout sites already bump it. If a refresh-rotation regression appears in production, operators bump `token_version` for the affected user and re-issue. The ADR does not introduce schema or data-shape changes.

## Invariant Tests

- Hard expiration on auth-flow exemption: `tests/backend/pytest/architecture/test_w5_endpoint_commit_ratchet_red.py::test_auth_commit_allowlist_entries_are_complete_and_unexpired` already enforces `expires_at = 2026-09-01`. After `2026-09-01` the same lock is extended to cap allowlist size at 0; new entries fail the test.
- New `tests/backend/pytest/architecture/test_w12_auth_idiom_ratchet_red.py` scans `backend/app/api/v1/endpoints/` for body-call `_require_*` patterns and inline `if not has_permission` raises and asserts the count is non-increasing.
- New `tests/backend/pytest/architecture/test_w12_get_current_user_isolation_red.py` forbids `from app.core.security import get_current_user` outside `backend/app/core/security.py` and `backend/app/api/deps.py`; production importers route through `app.api.deps.get_current_user`.
- New `tests/backend/pytest/architecture/test_w12_mock_auth_guard_red.py` parses `backend/app/core/security.py:107-136` and asserts the mock-auth branch is reached only when `mock_auth_enabled and settings.debug` (both conjuncts present in the AST).
- Cross-reference verified: every `AUTHZ-` action in `docs/security/authorization-capability-contract.json` records a `frontend_gate` and `backend_authority` that resolve through `require_permission` per `scripts/security/validate_authz_capability_contract.py:170-175`.

## Hard Expiration on Auth-Flow Exemption

Auth-flow exemptions in `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` carry `expires_at = 2026-09-01` (8 entries). The architecture lock at `architecture/test_w5_endpoint_commit_ratchet_red.py::test_auth_commit_allowlist_entries_are_complete_and_unexpired` will fail after that date until each entry is re-justified or the underlying commit is migrated to a service-owned transaction. After the sunset, the same lock asserts the allowlist is empty for auth flows; the cap drops from 8 to 0.

## SSO Token-Exchange Boundary

Entra-issued tokens reach `backend/app/api/v1/endpoints/auth/sso.py:170` for verification. The exchange in `backend/app/api/v1/endpoints/auth/_sso_helpers.py:48` mints a RiskHub access+refresh pair and persists the refresh row; from that point forward the RiskHub session owns lifetime. New SSO providers attach at the same exchange point; they do not bypass refresh rotation or token-version invalidation.
```

---

## ADR-012 — KRI Time-Series Period Algebra and Deadline Classification (#73)

**Target file**: `docs/adr/ADR-012-kri-time-series.md`
**Status**: Accepted.
**Depends on**: no other ADR. Cross-references ADR-007 (`_kri_history`
boundary), ADR-008 (SSOT pattern), ADR-009 (alias deprecation window).

```
# ADR-012 KRI Time-Series Period Algebra and Deadline Classification

## Status

Accepted

## Context

KRI submissions per `docs/BUSINESS_LOGIC.md` §2.3 carry five lifecycle states: `new`, `not_submitted`, `breach`, `warning`, `optimal`. Period algebra lives in `backend/app/services/_kri_history/periods.py:21,50,59,87,109` (`period_bounds_for_date`, `latest_closed_period_for_date`, `is_period_end_boundary`, `due_date`, `is_within_reporting_window`), but classification logic also reaches into three `KRIHistoryService` static methods from `backend/app/services/kri_deadline_service.py:64,77,78`, with classification fragments scattered between `kri_deadline_decisions.py`, `_kri_history.queries`, and the deadline service itself. `REPORTING_GRACE_DAYS = 15` is duplicated between `backend/app/services/_kri_history/constants.py:2` (the SSOT consumed by `periods.py:9`, `kri_history_service.py`, and the rest of the package) and `backend/app/services/_config/lookup.py:26` (`ConfigDefaults.REPORTING_GRACE_DAYS`, reached only by `kri_deadline_service.py:52` and `kri_deadline_support.py:36`). KRI period-snapshot writes flow through `backend/app/services/_kri_history/recording.py` for canonical paths, but ad-hoc inserts elsewhere risk drifting period semantics.

## Decision

`backend/app/services/_kri_history/periods.py` is the single source of truth for KRI period algebra. Cadence is determined by `KeyRiskIndicator.monitoring_frequency` (`monthly`, `quarterly`, `annual`). Period bounds, latest closed period, and due date are computed only by functions in this module. Imports of `KRIHistoryService.due_date`, `period_bounds_for_date`, or `latest_closed_period_for_date` outside `backend/app/services/_kri_history/` are forbidden. Duplicate period-bound computation in `kri_deadline_service.py` or `_kri_history.queries` is forbidden.

`backend/app/services/_kri_history/constants.py:2 REPORTING_GRACE_DAYS = 15` is the single configuration read path for the late-submission grace window. The duplicate at `backend/app/services/_config/lookup.py:26 ConfigDefaults.REPORTING_GRACE_DAYS` is removed; `kri_deadline_service.py:52` and `kri_deadline_support.py:36` re-import from the SSOT. A second `REPORTING_GRACE_DAYS` constant or alias outside `_kri_history.constants` is forbidden. During the deprecation window for any temporary alias, the alias entry must be recorded in `backend/app/api/v1/endpoints/_reserved_modules.toml` per ADR-009 reserved-surfaces convention.

Deadline classification consolidates behind a single boundary: `KRIDeadlineService.classify(submission, *, now) -> DeadlineState`. The three static-method reaches in `backend/app/services/kri_deadline_service.py:64,77,78` collapse into one `classify` call; the three free-floating helpers (`_resolve_period_end`, `_due_date`, `_reporting_owner_id`) are removed and replaced by attributes of the `DeadlineState` value object. Callers must not reach into `KRIHistoryService` static methods from outside `_kri_history/`. `KRIDeadlineService.classify` may emit only the five states pinned by `docs/BUSINESS_LOGIC.md` §2.3: `new`, `not_submitted`, `breach`, `warning`, `optimal`. KRI state values outside that vocabulary are forbidden.

`backend/app/services/_kri_history/recording.py` is the sole writer of `KRIHistory` rows that carry a period identity. Ad-hoc `db.add(KRIHistory(...))` statements outside the recorder are forbidden. The recorder is the only path that reconciles a submission with `period_bounds_for_date` and the SSOT grace window.

### KRI state vocabulary (BUSINESS_LOGIC §2.3, pinned)

The five canonical KRI lifecycle states emitted by `KRIDeadlineService.classify`:

1. `new` — submission window has not yet opened for the period.
2. `not_submitted` — window is open or grace exhausted; no submission recorded.
3. `breach` — submission recorded; value crosses the breach threshold.
4. `warning` — submission recorded; value crosses the near-breach threshold.
5. `optimal` — submission recorded; value within target band.

Frontend pin: `frontend/src/services/api/schemas/entities/kris.ts:42` already enumerates these five states (`monitoring_status: z.enum(['new','not_submitted','breach','warning','optimal'])`); ADR-012 codifies the cross-stack agreement.

## Alternatives Rejected

- Distributed period algebra (status quo): rejected because Loop 2 deletion testing proved an invisible dependency chain — renaming a private helper in `_kri_history` broke callers in `kri_deadline_service.py` and `_kri_history.queries` simultaneously, with no shared lock to catch it.
- Move classification out of `_kri_history`: rejected because period algebra is intrinsic to the `_kri_history` bounded context per ADR-007:13.
- Two grace constants with a precedence rule (`ConfigDefaults` overrides `_kri_history.constants` if set): rejected because two constants always drift and the precedence rule itself becomes another source of bugs.
- Pick `ConfigDefaults.REPORTING_GRACE_DAYS` as SSOT: rejected because the `_kri_history.constants` value is consumed by every other module in the package, and the `_config` value is a leaf reached only by two callers — collapsing onto the leaf would invert the dependency graph.

## Migration Impact

`backend/app/services/kri_deadline_service.py:64,77,78` collapses into one `KRIDeadlineService.classify` call returning a `DeadlineState` dataclass. `kri_deadline_service.py:52` rewrites the `ConfigDefaults.REPORTING_GRACE_DAYS` import to `from app.services._kri_history.constants import REPORTING_GRACE_DAYS`. `kri_deadline_support.py:36` performs the same rewrite. `backend/app/services/_config/lookup.py:26` removes the duplicate constant from `ConfigDefaults`. Callers under `kri_deadline_decisions.py` and `_kri_history.queries` that compute period bounds inline are rewritten to import from `_kri_history.periods`. A snapshot rebaseline for the affected listing/dashboard surfaces is taken under ADR-006 before the collapse.

## Rollback Strategy

Documentation and code-organization ADR. Rollback consists of reopening this ADR, restoring the `ConfigDefaults.REPORTING_GRACE_DAYS = 15` line, restoring the three static-method reaches in `kri_deadline_service.py`, and removing the new `_kri_state_vocabulary_allowlist.toml`. No data migration is implied by ADR-012 itself.

## Invariant Tests

- New `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py` asserts that `period_bounds_for_date`, `latest_closed_period_for_date`, `is_period_end_boundary`, `due_date`, and `is_within_reporting_window` are defined exactly once and only inside `backend/app/services/_kri_history/periods.py`.
- The same lock asserts `REPORTING_GRACE_DAYS = 15` appears in EXACTLY ONE source-of-truth location (`backend/app/services/_kri_history/constants.py`); `backend/app/services/_config/lookup.py` no longer defines it.
- Static import scan inside the same lock forbids `KRIHistoryService.due_date`, `KRIHistoryService.period_bounds_for_date`, and `KRIHistoryService.latest_closed_period_for_date` references outside `backend/app/services/_kri_history/`, allowing only the single `KRIDeadlineService.classify` consumer site.
- New `tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml` enumerates the five state strings (`new`, `not_submitted`, `breach`, `warning`, `optimal`); the lock asserts every emit site flows through `KRIDeadlineService.classify` and that no other emitter introduces a state value outside the allowlist.
- Behavioural equivalence test `tests/backend/pytest/test_kri_deadline_classify_red.py` pins `(period_end, due, reporting_owner_id, is_breached)` outputs of the new `classify` helper against the pre-collapse three-static-method computation across a `(KRI, frequency, today, last_period_end)` matrix.
- Cross-reference: `docs/BUSINESS_LOGIC.md` §2.3 (state vocabulary) and §8.5 (deadline + reporting cadence). ADR-009 governs any temporary alias entry in `_reserved_modules.toml` during the deprecation window for `_kri_history.constants.REPORTING_GRACE_DAYS` aliasing, if used.
- `backend/app/services/_kri_history/recording.py` is the sole writer of period-tagged `KRIHistory` rows; lock scans for `db.add(KRIHistory(...))` outside the recorder.

## Cross-References

- ADR-007:13 — `_kri_history` is one of the seven canonical bounded contexts; ADR-012 refines the internal SSOT without re-classifying the context.
- ADR-008 — sets the SSOT pattern for risk thresholds; ADR-012 reuses the same pattern for the KRI grace-days constant and period algebra.
- ADR-009 — reserved-surfaces convention covers any temporary alias for `_kri_history.constants.REPORTING_GRACE_DAYS` during the deprecation window.
- ADR-001 — `Capabilities.can(action, resource)` covers KRI per-row capabilities including `can_submit`, `can_view_history`; ADR-012 does not change those gates.
```

---

## ADR-007 Amendment — Read-Shape, Workflow-Paired, Adapter, and Core Categories (#74b)

**Target file**: append to `docs/adr/ADR-007-bounded-context-taxonomy.md`
(after the existing `## Invariant Tests` section).
**Status**: Accepted (as an amendment; see Loop B note on style alignment).
**Depends on**: #74a census being complete; references #61 (`_graph_directory`
post-package-move).

The amendment must classify ALL 31 underscore-prefixed packages
(`backend/app/services/_*/`, excluding `__pycache__`). Loop B's claim of
"13 unclassified orphans" was a count error — re-counted against current
tree, **15 packages** are unclassified by Loop A's three categories. The
15 names Loop B listed are correct; the count is 15. A 4th category
(`Core`) is required to absorb cross-cutting policy modules
(`_authorization_capabilities`, `_config`) that do not fit read-shape,
workflow-paired, or adapter shapes.

```
## Amendment 1 — Read-Shape, Workflow-Paired, Adapter, and Core Contexts

### Status

Accepted

### Context

ADR-007 names seven write-side bounded contexts but the codebase carries 31 underscore-prefixed packages under `backend/app/services/`. The unnamed remainder falls into four coherent shapes: read-shape projections, workflow-paired companions, adapter contexts that translate external systems, and a small set of cross-cutting core modules that supply policy primitives to every other context. Without an explicit secondary taxonomy, reviewers read the seven-context list as exhaustive and misclassify new packages.

### Decision

ADR-007's taxonomy is extended with three secondary categories and one cross-cutting category. The seven-context list at ADR-007 §Decision remains the canonical write-side enumeration.

1. **Read-shape contexts** project pre-existing rows. They inherit transaction rules from the underlying write-side context and may not commit. Read-shape contexts are not separate sweep units. Examples: `_register_listings` (dual-class — also write-side), `_monitoring_status`, `_dashboard_metrics`, `_quarterly_comparison`, `_reporting`, `_org_chart`, `_orphaned_items`. The single-file `backend/app/services/_monitoring_response.py` is the read-shape complement of `_monitoring_status` and is registered in the read-shape allowlist as a file (not a package).

2. **Workflow-paired contexts** sweep together as one rollback unit. A sweep that touches one half must also cover the other. The pairs are:
   - `_approval_queue` ↔ `_approval_execution`
   - `_issue_register` ↔ `_issue_workflow`
   - `_vendor_links` ↔ `_vendor_governance`
   - `_access_workflow` ↔ `_identity_access_lifecycle`
   - `_control_execution` ↔ `_entity_mutation_lifecycle`
   - `_deadline_execution` ↔ `_kri_history`
   - `_auth_session_workflow` ↔ `_auth_session`
   - `_risk_questionnaires` ↔ `_vendor_governance`
   - `_vendor_workflow` ↔ `_vendor_governance`
   - `_notification_inbox` ↔ `_admin_telemetry` (notification dispatch sweeps with telemetry observers)

3. **Adapter contexts** are exempt from the per-context HTTPException ban only at the adapter boundary. Translation from external-system exceptions to RiskHub `DomainError` subclasses is the adapter's job per ADR-003. Adapters: `_directory_identity`, `_directory_sync`, `_graph_directory` (after the package move planned under finding 61), `_admin_telemetry`, `_activity_log_query`, `_auth_session`.

4. **Core contexts** are cross-cutting policy modules reached by every other context. They own canonical primitives (capability builders, configuration defaults) and are subject to ADR-001 and ADR-008 SSOT discipline rather than the per-context atomicity sweeps. Core contexts: `_authorization_capabilities`, `_config`.

### Alternatives Rejected

- Expand the seven-context list to all 31 packages: rejected because it loses sweep meaning and produces 31 separate atomicity tests for what are really seven transactions.
- Document elsewhere (`CONVENTIONS.md`, `AGENTS.md`): rejected because Loop 3 review showed reviewers read ADR-007 as exhaustive when classifying new packages.
- Merge workflow-paired contexts into a single context per pair: rejected because the splits reflect real read-vs-write boundaries (queue vs execution, register vs workflow, links vs governance).
- Three categories without `Core`: rejected because `_authorization_capabilities` and `_config` would be force-fit into adapter or read-shape, neither of which captures their cross-cutting policy role; the lock would either fire on day 1 or accept silent miscategorization.

### Migration Impact

Four new TOMLs added under `tests/backend/pytest/architecture/`: `_bounded_context_write_side.toml`, `_bounded_context_read_shape.toml`, `_bounded_context_workflow_pairs.toml`, `_bounded_context_adapters.toml`, plus `_bounded_context_core.toml`. Existing per-context boundary tests (`test_w4_bc_a_riskhub_config_boundaries_red.py` through `test_w4_bc_g_kri_history_boundaries_red.py`) continue to operate on the seven canonical write-side contexts. Adapter contexts and core contexts gain new exception-ban exemption holders; existing adapters did not raise HTTPException at adapter boundaries because they were not previously in scope of the per-context ban. `_graph_directory` is created by #61 and recorded in the adapter TOML at the same commit as the package move.

### Rollback Strategy

Documentation amendment plus five new TOMLs and one extended disjointness lock. Rollback consists of removing the TOMLs and the disjointness extension; the seven-context core remains operational without the amendment.

### Invariant Tests

- New or extended `tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py` validates that every underscore-prefixed package under `backend/app/services/` (excluding `__pycache__`) is in EXACTLY ONE of the five allowlists, with the documented exception of `_register_listings` which is dual-classed (write-side AND read-shape) for sweep-order reasons. New packages must be classified at introduction; the lock fails on unclassified packages.
- `_bounded_context_write_side.toml` enumerates the seven canonical contexts.
- `_bounded_context_read_shape.toml` enumerates read-shape secondaries plus the `_monitoring_response.py` file entry.
- `_bounded_context_workflow_pairs.toml` enumerates ordered pairs (`(left, right)`); the lock asserts a sweep that touches one half also covers the other.
- `_bounded_context_adapters.toml` enumerates adapter packages; the lock allows HTTPException translation only at the adapter boundary and asserts ADR-003 `DomainError` projection inside.
- `_bounded_context_core.toml` enumerates core packages and binds them to ADR-001 (capabilities) and ADR-008 (config-default SSOT) lock chains.
- Cross-reference: ADR-003 `DomainError` taxonomy governs adapter exception translation; ADR-001 governs `_authorization_capabilities` SSOT; ADR-008 governs `_config` SSOT pattern.
```

---

## 31-package classification table (Amendment §Invariant Tests companion)

This table is the deliverable of #74a census. It must appear in the
amendment as an appendix or ship as the body of the five new TOMLs.

| Package | Category | Rationale | Enforcement TOML |
|---|---|---|---|
| `_riskhub_config` | Write-side | Canonical config write surface; ADR-007 §Decision context #1 | `_bounded_context_write_side.toml` |
| `_identity_access_lifecycle` | Write-side | Canonical user-lifecycle write; ADR-007 §Decision context #2 | `_bounded_context_write_side.toml` |
| `_vendor_governance` | Write-side | Canonical vendor-write; ADR-007 §Decision context #3 | `_bounded_context_write_side.toml` |
| `_register_listings` | Write-side + Read-shape (dual) | Listing planner is read-shape; the package retains the seven-context entry for sweep-order purposes | `_bounded_context_write_side.toml` + `_bounded_context_read_shape.toml` |
| `_approval_execution` | Write-side | Canonical approval-write; ADR-007 §Decision context #5 | `_bounded_context_write_side.toml` |
| `_entity_mutation_lifecycle` | Write-side | Canonical entity-mutation write; ADR-007 §Decision context #6 | `_bounded_context_write_side.toml` |
| `_kri_history` | Write-side | Canonical KRI-history write; ADR-007 §Decision context #7; period algebra owned per ADR-012 | `_bounded_context_write_side.toml` |
| `_monitoring_status` | Read-shape | Monitoring projection of write-side mutations | `_bounded_context_read_shape.toml` |
| `_monitoring_response.py` (file) | Read-shape | File-level read complement of `_monitoring_status`; recorded as file entry | `_bounded_context_read_shape.toml` |
| `_dashboard_metrics` | Read-shape | Dashboard metric projection over write-side rows | `_bounded_context_read_shape.toml` |
| `_quarterly_comparison` | Read-shape | Quarterly metric projection | `_bounded_context_read_shape.toml` |
| `_reporting` | Read-shape | Reporting export projection | `_bounded_context_read_shape.toml` |
| `_org_chart` | Read-shape | Org-chart traversal/invariant projection | `_bounded_context_read_shape.toml` |
| `_orphaned_items` | Read-shape | Orphan-listing projection; repair writes flow through canonical mutators per ADR-002 | `_bounded_context_read_shape.toml` |
| `_approval_queue` | Workflow-paired (with `_approval_execution`) | Queue-side of approval workflow | `_bounded_context_workflow_pairs.toml` |
| `_issue_register` | Workflow-paired (with `_issue_workflow`) | Register-side of issue workflow | `_bounded_context_workflow_pairs.toml` |
| `_issue_workflow` | Workflow-paired (with `_issue_register`) | Workflow-side of issue lifecycle | `_bounded_context_workflow_pairs.toml` |
| `_vendor_links` | Workflow-paired (with `_vendor_governance`) | Link-mutator side of vendor governance | `_bounded_context_workflow_pairs.toml` |
| `_access_workflow` | Workflow-paired (with `_identity_access_lifecycle`) | Workflow-side of access management; pairs with the write-side identity context | `_bounded_context_workflow_pairs.toml` |
| `_control_execution` | Workflow-paired (with `_entity_mutation_lifecycle`) | Control-execution workflow; pairs with the write-side mutation context | `_bounded_context_workflow_pairs.toml` |
| `_deadline_execution` | Workflow-paired (with `_kri_history`) | Deadline-job workflow; pairs with the write-side KRI history context | `_bounded_context_workflow_pairs.toml` |
| `_auth_session_workflow` | Workflow-paired (with `_auth_session`) | Workflow-side of admin session management; pairs with the adapter session context | `_bounded_context_workflow_pairs.toml` |
| `_risk_questionnaires` | Workflow-paired (with `_vendor_governance`) | Vendor questionnaire lifecycle; pairs with the write-side vendor context | `_bounded_context_workflow_pairs.toml` |
| `_vendor_workflow` | Workflow-paired (with `_vendor_governance`) | Vendor-workflow companion to vendor governance | `_bounded_context_workflow_pairs.toml` |
| `_notification_inbox` | Workflow-paired (with `_admin_telemetry`) | Notification-dispatch workflow paired with telemetry adapter | `_bounded_context_workflow_pairs.toml` |
| `_directory_identity` | Adapter | Adapter to external directory identity (Entra) | `_bounded_context_adapters.toml` |
| `_directory_sync` | Adapter | Adapter sweep over directory sync surface | `_bounded_context_adapters.toml` |
| `_graph_directory` (post-#61) | Adapter | Microsoft Graph adapter; created by #61 package move | `_bounded_context_adapters.toml` |
| `_admin_telemetry` | Adapter | Telemetry projection adapter for admin console | `_bounded_context_adapters.toml` |
| `_activity_log_query` | Adapter | Activity-log query adapter | `_bounded_context_adapters.toml` |
| `_auth_session` | Adapter | Session-token primitive adapter | `_bounded_context_adapters.toml` |
| `_authorization_capabilities` | Core | Cross-cutting capability builder; SSOT per ADR-001 | `_bounded_context_core.toml` |
| `_config` | Core | Cross-cutting config defaults; SSOT per ADR-008 pattern | `_bounded_context_core.toml` |

**Counts**: 7 write-side + 8 read-shape (incl. `_monitoring_response.py`
file + `_register_listings` dual-class) + 12 workflow-paired + 6 adapter
+ 2 core = 35 entries across 31 packages and 1 file (because
`_register_listings` is dual-classed and `_monitoring_response.py` is a
separate file entry). The lock counts each package once except for the
explicitly-dual `_register_listings` and the explicitly-file
`_monitoring_response.py`.

---

## Open questions for user input

- **ADR status convention**: Loop B flagged ADR-001..010 all use `Status: Accepted`; Loop A drafted ADR-011 and ADR-012 as `Status: Proposed`. The drafts above use `Accepted` to match the existing repo convention. If the user prefers `Proposed` for new ADRs at draft time and a separate Accept commit, change all three drafts' status lines (single edit per file).
- **`_orphaned_items` classification**: classified as Read-shape because the listing projection dominates; if the repair side (which writes through canonical mutators) is considered the dominant role, reclassify as Workflow-paired with `_admin_telemetry`. Either is defensible; the table above picks Read-shape on the strength of the package docstring at `backend/app/services/_orphaned_items/__init__.py:1` (`"Internal implementation for orphaned item management."`).
- **`_notification_inbox` pairing**: paired with `_admin_telemetry` because both are admin-side observers; alternative is Adapter (the inbox is a notification adapter). The table above picks Workflow-paired on the strength of the workflow-side `lifecycle` import surface at `backend/app/services/_notification_inbox/__init__.py:1` (`from app.services._notification_inbox import lifecycle`).
- **Dual-classification of `_register_listings`**: the audit's amendment text and Loop A's draft both retain it in the seven-context list AND classify it as read-shape. The table above mirrors that decision; the disjointness lock must explicitly allow the dual-class for this single package and reject any other package's attempt to claim two categories.
- **Mock-auth phrasing in ADR-011**: Loop B noted that `core/security.py:107-136` is the `get_current_user` definition itself, not "the mock-auth path". The draft above rephrases as "the mock-auth fallback inside" the canonical dependency, gated by the AND of `mock_auth_enabled && debug` (per the user's explicit decision).
- **REPORTING_GRACE_DAYS direction**: the user's task brief states `_kri_history/constants.py:2` is the SSOT and `_config/lookup.py:26` is deleted. The draft follows that direction. Loop A's earlier draft proposed the opposite direction — that proposal is overridden per the user's explicit decision.
- **5th category name (`Core`)**: provisional name; alternatives are `Policy` or `Cross-cutting`. The draft above uses `Core` because it matches the prose phrase "core cross-cutting policy" without inventing a new term. If the user prefers a different name, single-line rename across the amendment text and the new TOML filename.

---

## Format/voice references (matching ADR-001..010)

- Section header order matches `docs/adr/ADR-001-capabilities-module-unification.md:1-34` exactly: `## Status`, `## Context`, `## Decision`, `## Alternatives Rejected`, `## Migration Impact`, `## Rollback Strategy`, `## Invariant Tests`.
- ADR-002 precedent for extra named subsections after `## Invariant Tests`: `## Hard Expiration on Auth-Flow Exemption` (`docs/adr/ADR-002-service-owned-transactions.md:38-40`), `## Outbox Dispatcher Consolidation` (`:42-44`), `## Handler Idempotency` (`:46-50`). ADR-011 reuses the same pattern (`## Hard Expiration on Auth-Flow Exemption`, `## SSO Token-Exchange Boundary`).
- ADR-005 precedent for inline `### sub-sections` inside `## Decision`: `### ControlStatus.inactive retention (v5.3+)` (`docs/adr/ADR-005-archivable-mixin-schema-contract.md:17-19`). ADR-012 reuses the pattern (`### KRI state vocabulary (BUSINESS_LOGIC §2.3, pinned)`).
- "Status: Accepted" convention verified across ADR-001..010: every existing ADR uses `Accepted` (lines 5 of each file).
- "Forbidden additions" folded into `## Decision` prose per ADR-002:13 voice ("Endpoint commit calls remain only in a temporary allowlist during migration") rather than introduced as a new top-level section.
- "Enforcement" reuses the existing `## Invariant Tests` header per ADR-001:30, ADR-002:32, ADR-008:30.
