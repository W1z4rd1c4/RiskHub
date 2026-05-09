## Section 6 — ADR Drafts (Inline)

This section contains the full text of three new architectural decision records produced by this resolution plan. They are written in the same voice and structure as ADR-001 through ADR-010 and should be committed to `docs/adr/` at the slot indicated by the per-item recipe (Sections 3-5). All three carry `## Status = Accepted` per the existing convention.

Phase 4 + Phase 6 corrections applied:

- ADR-011 §Decision pins `require_permission(resource, action)` to `backend/app/core/security.py:170` and explicitly does NOT attribute the factory to ADR-001. ADR-001 owns `Capabilities.can(action, resource, *, instance=None)`; ADR-011 elects `require_permission` as the canonical FastAPI dependency adapter satisfying ADR-001's "endpoints may keep FastAPI dependency helpers as adapters" clause (`ADR-001:13`).
- ADR-011 cross-refs are ADR-001, ADR-002, ADR-003 (cite `core/exceptions.py:68-69`), and ADR-004. ADR-006 is REJECTED — ADR-011 is a freeze, not a sweep (Loop 2 verdict).
- ADR-012 drops the top-level `## Cross-References` header (no existing ADR uses one) and folds cross-references into `## Invariant Tests` per the ADR-008:33 voice. ADR-002 cited in `## Decision`. ADR-008 wording rewritten to "ADR-008 makes `_config` the cross-cutting SSOT; ADR-012 applies SSOT discipline to a bounded-context-local anchor". ADR-009 reference narrowed (covers reserved enum/role/permission DECLARATIONS, not module-surface deprecation).
- ADR-007 amendment uses "PRIMARY classification + many-to-one for right-halves" (NOT "EXACTLY ONE"). Per-allowlist atomicity sentence included. `_orphaned_items` and `_notification_inbox` are Workflow-paired with `_identity_access_lifecycle`. The 5th category is `Cross-cutting` (NOT `Core`). Recomputed count: 32 entries / 31 packages / 1 file (`_register_listings` dual-classed; `_monitoring_response.py` file entry).

---

### ADR-011: Auth Scheme and Session Model

```markdown
# ADR-011 Auth Scheme and Session Model

## Status

Accepted

## Context

RiskHub authentication exists across `backend/app/api/v1/endpoints/auth/` and `backend/app/core/security.py` but no ADR documents the canonical scheme. Three transport surfaces coexist on protected routes: the `require_permission(resource, action)` FastAPI dependency factory, body-call `_require_*` helpers, and inline `if not has_permission: 403` checks. The mock-auth path is a fallback branch inside `backend/app/core/security.py:107-136` (the canonical `get_current_user` dependency), gated by both `settings.mock_auth_enabled` and `settings.debug`. ADR-002 records 8 auth-flow endpoint commit exemptions in `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml`, each carrying `expires_at = 2026-09-01`. SSO with Microsoft Entra is implemented at `backend/app/api/v1/endpoints/auth/sso.py:170` and `backend/app/api/v1/endpoints/auth/_sso_helpers.py:48` but its relationship to internal session lifetime is undocumented at the architecture level.

## Decision

JWT bearer access tokens with refresh-token rotation and a token-version SSOT are the canonical authentication scheme. Single-use refresh per rotation; reuse triggers full revocation through the token-version field bumped at `backend/app/api/v1/endpoints/auth/logout.py:101,132`.

The mock-auth fallback inside `backend/app/core/security.py:107-136` is permitted only when `mock_auth_enabled && debug` evaluates true — both conditions are required (the AND is load-bearing; either alone is forbidden). Production code uses `app.api.deps.get_current_user`, which delegates into `app.core.security.get_current_user`. New mock-auth call sites outside that line range are forbidden, and `MOCK_AUTH_ENABLED=true` is forbidden in non-debug environments.

Endpoint authorization uses exactly one idiom going forward — the `require_permission(resource, action)` FastAPI dependency factory defined in `backend/app/core/security.py:170`. ADR-001 §Decision names `Capabilities.can(action, resource, *, instance=None)` as the service-layer Interface and explicitly permits FastAPI dependency helpers as endpoint adapters; `require_permission` is the canonical adapter elected by this ADR. Body-call `_require_*` helpers and inline `if not has_permission` raises are frozen and may not be added on protected routes; existing call sites are tracked for migration but the count is non-increasing.

SSO with Microsoft Entra is deployment-time configuration, not a runtime branch. Entra-issued tokens are exchanged at `auth/sso.py:170` for a RiskHub access+refresh pair via `auth/_sso_helpers.py:48`; internal refresh-rotation owns session lifetime from that point forward. Logout cascade at `auth/logout.py:101,132` is the only path that bumps `token_version`, clears the refresh cookie, and removes the server-side refresh row.

The 8 auth-flow endpoint commit exemptions in `_endpoint_commit_allowlist.toml` (`auth/sso.py:170`, `auth/refresh.py:177`, `auth/logout.py:101`, `auth/logout.py:132`, `auth/password.py:128`, `auth/_sso_helpers.py:48`, `auth/demo.py:67`, `auth/password.py:161`) migrate to service-owned transactions before `2026-09-01` per ADR-002 §Hard Expiration on Auth-Flow Exemption. New entries to that allowlist for auth flows are forbidden; the lock cap drops to 0 after the sunset date. Adding a third authentication scheme on protected routes is forbidden without superseding this ADR.

## Alternatives Rejected

- Session cookies: rejected because cookie sessions do not eliminate refresh rotation and complicate cross-origin frontend operation.
- Three-idiom status quo (`require_permission` + body-call `_require_*` + inline `403`): rejected because drift detection is fragile and contract-validator coverage is partial.
- Removing mock-auth entirely: rejected because dev/test fixtures depend on the mock-auth fallback inside `core/security.py:107-136`, and removing it would force every test to mint a full token chain.
- Letting Entra own session lifetime: rejected because RiskHub refresh rotation handles permission revocation, token-version bumps, and server-side refresh-row removal more granularly than the Entra session.
- Attributing `require_permission` to ADR-001's Interface: rejected because ADR-001 names `Capabilities.can(action, resource)` (service-layer Interface) and `require_permission(resource, action)` is the FastAPI adapter, not the same surface; conflating them would erase the adapter boundary.

## Migration Impact

Each of the 8 auth-flow allowlist sites needs a service-owned transaction wrapper before `2026-09-01` (tracked under finding #76). Implementation order is sequenced under #71 (frontend session module merge) and #66 (AuthContext provider split), both gated on this ADR. Existing body-call `_require_*` and inline-`403` call sites remain during migration; new sites are forbidden by lock. SSO deployment configuration is unchanged — only the documented relationship between Entra token verification and RiskHub session issuance is added.

## Rollback Strategy

Forward-only. The token-version field already exists and logout sites already bump it. If a refresh-rotation regression appears in production, operators bump `token_version` for the affected user and re-issue. The ADR does not introduce schema or data-shape changes.

## Invariant Tests

- Hard expiration on auth-flow exemption: `tests/backend/pytest/architecture/test_w5_endpoint_commit_ratchet_red.py::test_auth_commit_allowlist_entries_are_complete_and_unexpired` already enforces `expires_at = 2026-09-01`. After `2026-09-01` the same lock is extended to cap allowlist size at 0; new entries fail the test.
- New `tests/backend/pytest/architecture/test_w12_auth_idiom_ratchet_red.py` scans `backend/app/api/v1/endpoints/` for body-call `_require_*` patterns and inline `if not has_permission` raises and asserts the count is non-increasing against `_auth_idiom_baseline.toml`.
- New `tests/backend/pytest/architecture/test_w12_get_current_user_isolation_red.py` forbids `from app.core.security import get_current_user` outside `backend/app/core/security.py` and `backend/app/api/deps.py`; production importers route through `app.api.deps.get_current_user`.
- New `tests/backend/pytest/architecture/test_w12_mock_auth_guard_red.py` parses `backend/app/core/security.py:107-136` and asserts the mock-auth branch is reached only when `mock_auth_enabled and settings.debug` (both conjuncts present in the AST).
- New `tests/backend/pytest/architecture/test_w12_sso_token_exchange_boundary_red.py` asserts every SSO->RiskHub token exchange routes through `backend/app/api/v1/endpoints/auth/sso.py:170` calling into `backend/app/api/v1/endpoints/auth/_sso_helpers.py:48`; no other endpoint mints a RiskHub access+refresh pair from an Entra token.
- Cross-reference verified: every `AUTHZ-` action in `docs/security/authorization-capability-contract.json` records a `frontend_gate` and `backend_authority` that resolve through `require_permission` per `scripts/security/validate_authz_capability_contract.py:170-175`.
- ADR-001 — Capabilities surface: ADR-001 §Decision names `Capabilities.can(action, resource, *, instance=None)` as the service-layer Interface and permits FastAPI dependency adapters at the endpoint seam. `require_permission(resource, action)` at `backend/app/core/security.py:170` is the canonical adapter elected by this ADR; the argument orders are deliberately distinct (service Interface is `(action, resource)`; adapter factory is `(resource, action)`).
- ADR-002 — Service-owned transactions: the 8 auth-flow allowlist entries evolve to 0 by 2026-09-01 per ADR-002 §Hard Expiration on Auth-Flow Exemption. The `test_w5_endpoint_commit_ratchet_red.py` lock at `tests/backend/pytest/architecture/` enforces both the expiration date and the post-sunset cap-0.
- ADR-003 — Domain exception taxonomy: `AuthorizationError` and `AuthenticationError` are projected via `EXCEPTION_REGISTRY` at `backend/app/core/exceptions.py:68-69`; the FastAPI handler maps them to 403/401 with the documented `WWW-Authenticate` header. Auth endpoints raise these domain types, not raw `HTTPException`.
- ADR-004 — UTC-aware datetime SSOT: JWT `exp`/`iat` derive from `utc_now()` at `backend/app/core/security.py:68`; all timestamp fields on refresh-token rows use `UtcAwareDatetime` at the schema boundary.

## Hard Expiration on Auth-Flow Exemption

Auth-flow exemptions in `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` carry `expires_at = 2026-09-01` (8 entries). The architecture lock at `architecture/test_w5_endpoint_commit_ratchet_red.py::test_auth_commit_allowlist_entries_are_complete_and_unexpired` will fail after that date until each entry is re-justified or the underlying commit is migrated to a service-owned transaction. After the sunset, the same lock asserts the allowlist is empty for auth flows; the cap drops from 8 to 0. The 8 sites and their owning files:

- `backend/app/api/v1/endpoints/auth/sso.py:170` — SSO exchange commit, migrating to `app.services._auth_session.session_lifecycle.complete_sso_login`.
- `backend/app/api/v1/endpoints/auth/_sso_helpers.py:48` — SSO helper commit, folded into the same `_auth_session` service method.
- `backend/app/api/v1/endpoints/auth/refresh.py:177` — Refresh rotation commit, migrating to `app.services._auth_session.session_lifecycle.rotate_refresh_token`.
- `backend/app/api/v1/endpoints/auth/logout.py:101` — Single-session logout commit, migrating to `app.services._auth_session.session_lifecycle.logout_session`.
- `backend/app/api/v1/endpoints/auth/logout.py:132` — All-sessions logout commit, migrating to the `logout_all_sessions` variant of the same service method.
- `backend/app/api/v1/endpoints/auth/password.py:128` — Password change commit, migrating to `app.services._identity_access_lifecycle.password.update_password`.
- `backend/app/api/v1/endpoints/auth/password.py:161` — Password reset commit, wrapping into the same identity-access service.
- `backend/app/api/v1/endpoints/auth/demo.py:67` — Demo-session commit, migrating to `app.services._identity_access_lifecycle.demo.create_demo_session`.

## SSO Token-Exchange Boundary

Entra-issued tokens reach `backend/app/api/v1/endpoints/auth/sso.py:170` for verification. The exchange in `backend/app/api/v1/endpoints/auth/_sso_helpers.py:48` mints a RiskHub access+refresh pair and persists the refresh row; from that point forward the RiskHub session owns lifetime. New SSO providers attach at the same exchange point; they do not bypass refresh rotation or token-version invalidation. Bound to lock `tests/backend/pytest/architecture/test_w12_sso_token_exchange_boundary_red.py`.
```

---

### ADR-012: KRI Time-Series Period Algebra

```markdown
# ADR-012 KRI Time-Series Period Algebra

## Status

Accepted

## Context

KRI deadline notifications, history corrections, and dashboard summaries all reach the same period-algebra primitives: `period_bounds_for_date`, `latest_closed_period_for_date`, `is_period_end_boundary`, `due_date`, and `is_within_reporting_window`. These primitives currently live in `backend/app/services/_kri_history/periods.py` (canonical), but cross-package callers reach them through three `KRIHistoryService` static-method bridges in `backend/app/services/kri_deadline_service.py:64,77,78`. The reporting-grace constant `REPORTING_GRACE_DAYS = 15` is duplicated: the canonical declaration is `backend/app/services/_kri_history/constants.py:2`; a copy lives in `backend/app/services/_config/lookup.py:26 ConfigDefaults.REPORTING_GRACE_DAYS`, reached from `kri_deadline_service.py:52` and `kri_deadline_support.py:36`. The duplicate is silent — the two values agree today — but it can drift and there is no enforcement that the bounded context owns its own constant.

The five KRI states recorded by `BUSINESS_LOGIC.md §2.3` (`new`, `not_submitted`, `breach`, `warning`, `optimal`) are computed from period algebra plus the breach-status check; today the resolution is split across `_resolve_period_end`, `_due_date`, and the breach evaluator inside `KRIDeadlineService`, with the period-end and due-date arithmetic re-derived at three separate static-method reaches.

## Decision

`backend/app/services/_kri_history/periods.py` is the SSOT for the period-algebra primitives `(period_bounds_for_date, latest_closed_period_for_date, is_period_end_boundary, due_date, is_within_reporting_window)`. `backend/app/services/_kri_history/constants.py` is the SSOT for `REPORTING_GRACE_DAYS = 15`. Cross-package callers import these directly from the SSOT modules, or from the `KRIHistoryService` re-export when a single named entry point reduces coupling. Per ADR-002, `KRIDeadlineService` is the transaction-owning service entrypoint for deadline notifications and outbox dispatch; classification logic does not commit, but the surrounding notification dispatch does.

The `ConfigDefaults.REPORTING_GRACE_DAYS` duplicate at `backend/app/services/_config/lookup.py:26` is removed; consumers import from `_kri_history.constants` directly. The three `KRIHistoryService.*` static-method reaches in `kri_deadline_service.py:64,77,78` collapse into a single `KRIDeadlineService.classify(kri, *, today)` helper that returns a frozen `KriDeadlineClassification` dataclass with `(period_end, due, reporting_owner_id, is_breached)`.

The five KRI states (`new`, `not_submitted`, `breach`, `warning`, `optimal`) defined in `BUSINESS_LOGIC.md §2.3` are computed from the period algebra plus the canonical breach evaluator. State precedence is `new -> not_submitted -> breach -> warning -> optimal` per the documented ordering. The state vocabulary is registered in `tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml` and bound to a lock test that pins the period-algebra consumers, the single-definition `REPORTING_GRACE_DAYS`, and the single `KRIHistoryService.*` reach inside `kri_deadline_service.py`.

## Alternatives Rejected

- **Promote `ConfigDefaults` to authoritative**: rejected because the grace-days constant is package-internal period algebra, not CRO-managed runtime config. Promoting it would invert the bounded-context-ownership direction.
- **Keep three independent static-method reaches**: rejected because every additional reach broadens the API surface that the lock test must enforce, and changes to period algebra ripple into three call sites instead of one.
- **Delete the `KRIHistoryService` re-export entirely**: rejected because the static-method bridges remain a compatibility seam for the public service-class import; only the cross-package call sites are consolidated.
- **Inline the five KRI states inside `KRIDeadlineService`**: rejected because the state vocabulary is shared with dashboards, breach-trend exports, and the public KRI listing surfaces; centralizing the state names in the period-algebra module preserves single-Interface discipline.

## Migration Impact

The collapse touches `kri_deadline_service.py` (single file, isolated change), `kri_deadline_support.py:36` (one fallback removed), and removes one line from `_config/lookup.py:26`. Snapshot rebaselines are not required: classifications use the same period algebra before and after. A snapshot rebaseline for the affected listing/dashboard surfaces is taken under ADR-006 only if the parametric output-equality test reveals a behavioural drift.

## Rollback Strategy

Rollback restores the `ConfigDefaults.REPORTING_GRACE_DAYS = 15` line, the three static-method reaches, and the previous fallback at `kri_deadline_support.py:36`. The parametric output-equality test at `tests/backend/pytest/test_kri_deadline_classify_red.py` prevents silent regression of the per-call semantics.

## Invariant Tests

- `REPORTING_GRACE_DAYS = 15` may appear in EXACTLY ONE source-of-truth location: `backend/app/services/_kri_history/constants.py`. The lock test `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py::test_reporting_grace_days_has_single_definition` enforces this.
- No module outside `_kri_history/` and the allowlist in `tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml` may import `period_bounds_for_date`, `latest_closed_period_for_date`, `due_date`, `is_period_end_boundary`, or `is_within_reporting_window`. Enforced by `test_period_algebra_consumers_are_in_allowlist`.
- `kri_deadline_service.py` may contain at most one `KRIHistoryService.*` reference (the collapsed `classify_for_today` entrypoint). Enforced by `test_kri_deadline_service_uses_single_classify_call`.
- `kri_deadline_service.py` may not reference `ConfigDefaults.REPORTING_GRACE_DAYS`. Enforced by `test_kri_deadline_service_does_not_use_config_defaults_for_grace`.
- A parametric output-equality test (`tests/backend/pytest/test_kri_deadline_classify_red.py`) pins the `(period_end, due, reporting_owner_id, is_breached)` contract of the new `KRIDeadlineService.classify` helper against representative `(frequency, last_period_end, today)` tuples covering monthly, quarterly, and annual cadences.
- The five KRI states (`new`, `not_submitted`, `breach`, `warning`, `optimal`) are recorded with their precedence in `BUSINESS_LOGIC.md §2.3` and `_kri_state_vocabulary_allowlist.toml`; lock tests enforce that consumers refer to the registered names.
- ADR-001 — capabilities module unification, single public Interface for capabilities; ADR-012 follows the same single-Interface discipline for period algebra.
- ADR-002 — service-owned transactions; `KRIDeadlineService` is the transaction-owning service entrypoint for deadline notifications, ensuring no orphan rows after rollback.
- ADR-006 — snapshot equivalence-class testing covers listing/dashboard surfaces. ADR-012 introduces a parametric output-equality test for `classify`, which is a different shape from a snapshot fixture and is not subject to ADR-006 redaction rules; the §Migration Impact rebaseline trigger reuses ADR-006 mechanically without conflating vocabulary.
- ADR-007 — bounded-context taxonomy; the `_kri_history` package owns its own grace-days constant, consistent with the bounded-context-local-SSOT direction. ADR-007 amendment registers `_kri_history` as a write-side context; ADR-012 refines the internal SSOT without re-classifying the context.
- ADR-008 — uses `ConfigDefaults` as the cross-cutting SSOT for risk thresholds. ADR-012 applies SSOT discipline to a bounded-context-local anchor (`_kri_history.constants`); the two anchors coexist deliberately because risk thresholds are CRO-managed runtime config, while the grace-days constant is package-internal period algebra.
- ADR-009 — reserved surfaces convention. ADR-009 governs reserved enum/role/permission DECLARATIONS; ADR-012 does not introduce reserved surfaces and does not extend `_reserved_modules.toml`. The `_kri_state_vocabulary_allowlist.toml` registry is a separate convention covering bounded-context-local SSOT, not reserved surfaces.
```

---

### ADR-007 Amendment: Read-Shape, Workflow-Paired, Adapter, and Cross-cutting Categories

The amendment is appended to `docs/adr/ADR-007-bounded-context-taxonomy.md` after the existing `## Invariant Tests` section. It does not rewrite the canonical seven-context list; it extends it.

```markdown
## Amendment 1 — Read-Shape, Workflow-Paired, Adapter, and Cross-cutting Contexts

### Status

Accepted

### Context

ADR-007 names seven write-side bounded contexts but the codebase carries 31 underscore-prefixed packages under `backend/app/services/`. The unnamed remainder falls into four coherent shapes: read-shape projections, workflow-paired companions, adapter contexts that translate external systems, and a small set of cross-cutting modules that supply policy primitives to every other context. Without an explicit secondary taxonomy, reviewers read the seven-context list as exhaustive and misclassify new packages.

### Decision

ADR-007's taxonomy is extended with three secondary categories (read-shape, workflow-paired, adapter) and one cross-cutting category. The seven-context list at ADR-007 §Decision remains the canonical write-side enumeration. Each package has a PRIMARY classification (exactly one of the five lists) and may additionally appear as the right-half of a workflow pair when paired with another context; the disjointness lock permits this many-to-one membership for workflow-pair right-halves. Each allowlist must be atomic — entries are written as a single contiguous list per TOML file and may not span across multiple lists.

1. **Read-shape contexts** project pre-existing rows. They inherit transaction rules from the underlying write-side context and may not commit. Read-shape contexts are not separate sweep units. Examples: `_register_listings` (dual-class — also write-side), `_monitoring_status`, `_dashboard_metrics`, `_quarterly_comparison`, `_reporting`, `_org_chart`. The single-file `backend/app/services/_monitoring_response.py` is the read-shape complement of `_monitoring_status` and is registered in the read-shape allowlist as a file (not a package).

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
   - `_orphaned_items` ↔ `_identity_access_lifecycle`
   - `_notification_inbox` ↔ `_identity_access_lifecycle`

3. **Adapter contexts** are exempt from the per-context HTTPException ban only at the adapter boundary. Translation from external-system exceptions to RiskHub `DomainError` subclasses is the adapter's job per ADR-003. Adapters: `_directory_identity`, `_directory_sync`, `_graph_directory` (after the package move planned under finding 61), `_admin_telemetry`, `_activity_log_query`, `_auth_session`.

4. **Cross-cutting contexts** are policy modules reached by every other context. They own canonical primitives (capability builders, configuration defaults) and are subject to ADR-001 and ADR-008 SSOT discipline rather than the per-context atomicity sweeps. Cross-cutting contexts: `_authorization_capabilities`, `_config`.

### Classification Table

The full classification of the 31 underscore-prefixed packages plus the `_monitoring_response.py` file entry. Workflow-pair right-halves carry their PRIMARY classification (whichever of write-side, adapter applies); their workflow-pair membership is recorded separately in `_bounded_context_workflow_pairs.toml`.

| Package | Category | Rationale | Enforcement TOML |
|---|---|---|---|
| `_riskhub_config` | Write-side | ADR-007 §Decision context #1 | `_bounded_context_write_side.toml` |
| `_identity_access_lifecycle` | Write-side | ADR-007 §Decision context #2 | `_bounded_context_write_side.toml` |
| `_vendor_governance` | Write-side | ADR-007 §Decision context #3 | `_bounded_context_write_side.toml` |
| `_register_listings` | Write-side + Read-shape (dual; explicitly allowed) | ADR-007 + listing planner | `_bounded_context_write_side.toml` + `_bounded_context_read_shape.toml` |
| `_approval_execution` | Write-side | ADR-007 §Decision context #5 | `_bounded_context_write_side.toml` |
| `_entity_mutation_lifecycle` | Write-side | ADR-007 §Decision context #6 | `_bounded_context_write_side.toml` |
| `_kri_history` | Write-side | ADR-007 §Decision context #7 | `_bounded_context_write_side.toml` |
| `_monitoring_status` | Read-shape | Status projection (no commits) | `_bounded_context_read_shape.toml` |
| `_dashboard_metrics` | Read-shape | Dashboard metric projection | `_bounded_context_read_shape.toml` |
| `_quarterly_comparison` | Read-shape | Quarterly metric projection | `_bounded_context_read_shape.toml` |
| `_reporting` | Read-shape | Reporting export projection | `_bounded_context_read_shape.toml` |
| `_org_chart` | Read-shape | Org-chart traversal | `_bounded_context_read_shape.toml` |
| `_monitoring_response.py` | Read-shape (file entry) | File-level read-shape complement of `_monitoring_status` | `_bounded_context_read_shape.toml` |
| `_approval_queue` | Workflow-paired (`_approval_execution`) | Queue side of approval | `_bounded_context_workflow_pairs.toml` |
| `_issue_register` | Workflow-paired (`_issue_workflow`) | Register side | `_bounded_context_workflow_pairs.toml` |
| `_issue_workflow` | Workflow-paired (`_issue_register`) | Workflow side | `_bounded_context_workflow_pairs.toml` |
| `_vendor_links` | Workflow-paired (`_vendor_governance`) | Link mutators | `_bounded_context_workflow_pairs.toml` |
| `_access_workflow` | Workflow-paired (`_identity_access_lifecycle`) | Identity workflow | `_bounded_context_workflow_pairs.toml` |
| `_control_execution` | Workflow-paired (`_entity_mutation_lifecycle`) | Control execution | `_bounded_context_workflow_pairs.toml` |
| `_deadline_execution` | Workflow-paired (`_kri_history`) | Deadline jobs | `_bounded_context_workflow_pairs.toml` |
| `_auth_session_workflow` | Workflow-paired (`_auth_session`) | Session workflow | `_bounded_context_workflow_pairs.toml` |
| `_risk_questionnaires` | Workflow-paired (`_vendor_governance`) | Questionnaire lifecycle | `_bounded_context_workflow_pairs.toml` |
| `_vendor_workflow` | Workflow-paired (`_vendor_governance`) | Vendor workflow | `_bounded_context_workflow_pairs.toml` |
| `_orphaned_items` | Workflow-paired (`_identity_access_lifecycle`) | Orphan detection during deactivation | `_bounded_context_workflow_pairs.toml` |
| `_notification_inbox` | Workflow-paired (`_identity_access_lifecycle`) | Notification dispatch on identity events | `_bounded_context_workflow_pairs.toml` |
| `_directory_identity` | Adapter | External directory identity | `_bounded_context_adapters.toml` |
| `_directory_sync` | Adapter | Directory sync sweep | `_bounded_context_adapters.toml` |
| `_graph_directory` (post-#61) | Adapter | Microsoft Graph adapter | `_bounded_context_adapters.toml` |
| `_admin_telemetry` | Adapter | Admin telemetry projection | `_bounded_context_adapters.toml` |
| `_activity_log_query` | Adapter | Activity-log query adapter | `_bounded_context_adapters.toml` |
| `_auth_session` | Adapter | Session-token primitive | `_bounded_context_adapters.toml` |
| `_authorization_capabilities` | Cross-cutting | ADR-001 capability builder SSOT | `_bounded_context_cross_cutting.toml` |
| `_config` | Cross-cutting | ADR-008-style config defaults SSOT | `_bounded_context_cross_cutting.toml` |

Count summary: 7 write-side + 6 read-shape (incl. `_register_listings` dual + `_monitoring_response.py` file entry) + 11 workflow-pair-left-halves + 6 adapters + 2 cross-cutting = **32 entries across 31 packages and 1 file** (because `_register_listings` is dual-classed and `_monitoring_response.py` is a separate file entry). Workflow-pair right-halves are NOT counted separately in the primary tally — their PRIMARY classification appears under whichever of write-side or adapter they belong to, and their right-half membership is recorded in `_bounded_context_workflow_pairs.toml`.

### Alternatives Rejected

- Expand the seven-context list to all 31 packages: rejected because it loses sweep meaning and produces 31 separate atomicity tests for what are really seven transactions.
- Document elsewhere (`CONVENTIONS.md`, `AGENTS.md`): rejected because Loop 3 review showed reviewers read ADR-007 as exhaustive when classifying new packages.
- Merge workflow-paired contexts into a single context per pair: rejected because the splits reflect real read-vs-write boundaries (queue vs execution, register vs workflow, links vs governance).
- Three categories without `Cross-cutting`: rejected because `_authorization_capabilities` and `_config` would be force-fit into adapter or read-shape, neither of which captures their cross-cutting policy role; the lock would either fire on day 1 or accept silent miscategorization.
- Naming the fifth category `Core` instead of `Cross-cutting`: rejected because `Core` overloads "domain core" used elsewhere in DDD vocabulary; `Cross-cutting` precisely names the role (policy primitives reached by every other context).
- "EXACTLY ONE" disjointness without many-to-one for workflow-pair right-halves: rejected because it would force right-halves out of their primary write-side or adapter allowlist, breaking sweep semantics. The Phase 4 disjointness lock semantics (PRIMARY classification + workflow-pair right-half exception) is the corrected formulation.

### Migration Impact

Five new TOMLs added under `tests/backend/pytest/architecture/`: `_bounded_context_write_side.toml`, `_bounded_context_read_shape.toml`, `_bounded_context_workflow_pairs.toml`, `_bounded_context_adapters.toml`, `_bounded_context_cross_cutting.toml`. Existing per-context boundary tests (`test_w4_bc_a_riskhub_config_boundaries_red.py` through `test_w4_bc_g_kri_history_boundaries_red.py`) continue to operate on the seven canonical write-side contexts. Adapter contexts and cross-cutting contexts gain new exception-ban exemption holders; existing adapters did not raise HTTPException at adapter boundaries because they were not previously in scope of the per-context ban. `_graph_directory` is created by finding #61 (the four `graph_directory_*.py` modules move into the package) and recorded in the adapter TOML at the same commit as the package move.

### Rollback Strategy

Documentation amendment plus five new TOMLs and one extended disjointness lock. Rollback consists of removing the TOMLs and the disjointness extension; the seven-context core remains operational without the amendment.

### Invariant Tests

- New or extended `tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py` validates that every underscore-prefixed package under `backend/app/services/` (excluding `__pycache__`) has a PRIMARY classification in exactly one allowlist, with the documented exception of `_register_listings` which is dual-classed (write-side AND read-shape) for sweep-order reasons. Workflow-pair right-halves additionally appear in the workflow-pair allowlist; the lock permits this many-to-one membership only for documented pairs. New packages must be classified at introduction; the lock fails on unclassified packages.
- `_bounded_context_write_side.toml` enumerates the seven canonical contexts.
- `_bounded_context_read_shape.toml` enumerates read-shape secondaries plus the `_monitoring_response.py` file entry.
- `_bounded_context_workflow_pairs.toml` enumerates ordered pairs (`(left, right)`); the lock asserts a sweep that touches one half also covers the other, and that each pair's right-half is also recorded under its PRIMARY allowlist.
- `_bounded_context_adapters.toml` enumerates adapter packages; the lock allows HTTPException translation only at the adapter boundary and asserts ADR-003 `DomainError` projection inside.
- `_bounded_context_cross_cutting.toml` enumerates cross-cutting packages and binds them to ADR-001 (capabilities) and ADR-008 (config-default SSOT) lock chains.
- Per-allowlist atomicity asserted: each TOML file is parsed as a single contiguous list; entries spanning multiple files trigger lock failure.
- Cross-reference: ADR-003 `DomainError` taxonomy governs adapter exception translation; ADR-001 governs `_authorization_capabilities` SSOT; ADR-008 governs `_config` SSOT pattern.
```

---

End of Section 6.
