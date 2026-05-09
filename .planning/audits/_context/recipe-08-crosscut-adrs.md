# Phase 5 — Per-Item TDD Recipes (Cross-cutting + ADR drafts + endpoints tail)

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Single
sequential developer. TDD: red → green → refactor. Doc/lock-only items
Reject invalid; defers planned. All Phase 4 corrections applied.
`pytestmark = pytest.mark.contract` on every new architecture test;
backend API tests use `client_factory` from
`tests/backend/pytest/conftest.py`. Quotes ≤15 words, file:line cited.

Item ordering matches dispatch ordering — paired waves grouped.

---

## #40 (S8.11) — Re-cluster admin sub-routers (4-cluster split)

**Effort**: M (8–10h). Prereq: #39. Phase 4 correction: `console.py` has
**7** routes (NOT 8); the four clusters are recomputed accordingly.

### Files touched

- `backend/app/api/v1/endpoints/admin/console.py:36,49,58,67,79,124,149` — 7 routes split across 4 clusters.
- `backend/app/api/v1/endpoints/admin/__init__.py` — re-export new sub-router modules.
- `backend/app/api/v1/endpoints/admin/_deps.py` — unchanged shared deps.
- New: `backend/app/api/v1/endpoints/admin/system_status.py` (cluster 1: `/health`, `/jobs/status`, `/outbox/status`, `/stats`).
- New: `backend/app/api/v1/endpoints/admin/operational_logs.py` (cluster 2: `/logs`).
- New: `backend/app/api/v1/endpoints/admin/sessions.py` (cluster 3: `/sessions`, `/sessions/{user_id}/revoke`).
- Cluster 4 = existing siblings (`capabilities.py`, `directory_sync.py`, `docs.py`, `log_config.py`, `orphans.py`, `snapshots.py`, `structured_logs.py`) — unchanged.
- New lock test: `tests/backend/pytest/architecture/test_w13_admin_subrouter_cluster_red.py`.

### TDD steps

1. **Red**: write `test_w13_admin_subrouter_cluster_red.py` with `pytestmark = pytest.mark.contract`. Test 1 asserts `console.py` route count is 0 (after migration). Test 2 asserts each new cluster file (`system_status`, `operational_logs`, `sessions`) declares the expected route paths in its `@router.get/.post` decorators. Test 3 asserts `admin/__init__.py` exports each cluster router. Run: `cd backend && pytest tests/backend/pytest/architecture/test_w13_admin_subrouter_cluster_red.py -x` → expect FAIL.
2. **Green**: move handlers verbatim. From `console.py:36,49,58,67`: `health()`, `jobs_status()`, `outbox_status()`, `stats()` → `system_status.py`. From `console.py:79`: `logs()` → `operational_logs.py`. From `console.py:124,149`: `active_sessions()`, `revoke_user_sessions()` → `sessions.py`. Each new file declares its own `router = APIRouter()` and re-exports. Update `admin/__init__.py` to mount the three new routers under their existing path prefixes (no URL change). Delete now-empty handler bodies in `console.py` (file may remain as deprecated alias).
3. **Refactor**: keep imports identical; the only diff is module location. Add module docstrings naming the cluster.
4. **Verify lock**: `cd backend && pytest tests/backend/pytest/architecture/test_w13_admin_subrouter_cluster_red.py -x` → PASS.

### Lock TOMLs

None new; the test enumerates clusters inline from a literal table.

### ADR cross-refs

- ADR-007 §Decision (bounded-context taxonomy): admin sub-routers do not introduce a new bounded context.
- ADR-009 (reserved-surfaces convention): `console.py` becomes a deprecated surface; if the file is retained as alias, list it in `_reserved_modules.toml`.

### Migration notes

URL paths are unchanged. Frontend has zero impact. Snapshot bases under
ADR-006 are not affected because response shapes do not change.

### Rollback

Revert the commit; the old `console.py` returns. The lock test fails
again on rollback (intended — it forces re-clustering forward only).

---

## #55 (S7.5) — Delete 26-line `access_user_service.py` facade

**Effort**: S (1–2h). Single inlined call site.

### Files touched

- `backend/app/services/access_user_service.py` (DELETE) — 26 lines.
- `backend/app/api/v1/endpoints/access.py:19` (rewrite import).
- `tests/backend/pytest/test_authz_capability_contract_validator.py:502` (remove path entry).
- `tests/backend/pytest/test_architecture_deepening_contracts.py:246` (remove the `from app.services import access_user_service` import).
- New lock test: `tests/backend/pytest/architecture/test_w13_access_user_service_facade_removed_red.py`.

### TDD steps

1. **Red**: write `test_w13_access_user_service_facade_removed_red.py` with `pytestmark = pytest.mark.contract`. Assertion: `Path("backend/app/services/access_user_service.py").exists()` is False; assertion: no production module under `backend/app/` imports `access_user_service`. Run → FAIL (file still present).
2. **Green**: rewrite `backend/app/api/v1/endpoints/access.py:19` from `from app.services.access_user_service import update_access_user_settings` to `from app.services._identity_access_lifecycle import update_access_profile as update_access_user_settings` (or rename the local call site). Delete `backend/app/services/access_user_service.py`. Remove the `Path("backend/app/services/access_user_service.py")` entry from `tests/backend/pytest/test_authz_capability_contract_validator.py:502`. Remove the `access_user_service` line from `tests/backend/pytest/test_architecture_deepening_contracts.py:246`. Run → PASS.
3. **Refactor**: prefer aliasing at import time (`as update_access_user_settings`) to keep the call-site signature stable; the wrapper signature was identical to `update_access_profile` per `access_user_service.py:18-24`.
4. **Verify**: `cd backend && pytest tests/backend/pytest/architecture/test_w13_access_user_service_facade_removed_red.py -x` → PASS. Run full backend pytest to confirm `access.py` route still works under `client_factory` integration tests.

### Lock TOMLs

None new.

### ADR cross-refs

- ADR-007 §Decision context #2: `_identity_access_lifecycle` is the canonical write-side context for access profile mutation; the facade was redundant.
- ADR-009: facade deletion is forward-only; no `_reserved_modules.toml` entry needed because no public API changes.

### Migration notes

`update_access_user_settings` is a name-only wrapper with identical
signature to `update_access_profile` (`access_user_service.py:10-24`).
Aliasing at the single import site preserves the endpoint signature
without requiring a deprecation alias.

### Rollback

Revert; the file returns. Run again under `client_factory`.

---

## #56 (S7.6) — Delete 35-line `directory_identity_service.py` shim — PAIRED with #61

**Effort**: S (2–3h). Phase 4 correction: re-exports **13** names (NOT
15). 8 prod importers + 1 script. Same commit (or back-to-back) as
**#61**.

### Files touched (8 prod + 1 script)

- `backend/app/services/directory_identity_service.py` (DELETE) — 35 lines, 13 re-exports.
- `backend/app/api/v1/endpoints/auth/_sso_helpers.py:16` — rewrite import.
- `backend/app/services/directory_provider_service.py:17` — rewrite import.
- `backend/app/services/graph_directory_service.py:8` — rewrite import (also affected by #61).
- `backend/app/services/ad_deprovision_service.py:14` — rewrite import.
- `backend/app/services/_access_workflow/policy.py:11` — rewrite import.
- `backend/app/services/_identity_access_lifecycle/policy.py:11` — rewrite import.
- `backend/app/services/_auth_session/jit.py:13` — rewrite import.
- `backend/app/services/_identity_access_lifecycle/directory_import.py:15` — rewrite import.
- `backend/scripts/bootstrap_sso_user.py:17` — rewrite import.
- New lock test: `tests/backend/pytest/architecture/test_w13_directory_identity_shim_removed_red.py`.

### TDD steps

1. **Red**: write `test_w13_directory_identity_shim_removed_red.py` with `pytestmark = pytest.mark.contract`. Assertion 1: `Path("backend/app/services/directory_identity_service.py").exists()` is False. Assertion 2: AST scan of `backend/app/` and `backend/scripts/` finds no `from app.services.directory_identity_service import` line. Run → FAIL.
2. **Green**: rewrite each importer to point at `app.services._directory_identity` (the 11 names already imported in `directory_identity_service.py:3-15`) or `app.services._directory_identity.lifecycle` (the 2 names from `directory_identity_service.py:16-19`). Mapping:
   - `normalize_business_role`, `apply_directory_profile`, `has_auto_deprovision_reason`, `requires_break_glass_for_reenable`, `resolve_directory_email`, `resolve_or_create_department`, `DirectoryIdentityConflictError`, `DirectoryImportOutcome`, `DirectoryProfileUpdateOutcome`, `DirectoryReenableOutcome`, `DirectorySyncOutcome` → `app.services._directory_identity`.
   - `apply_directory_profile_outcome`, `directory_reenable_outcome` → `app.services._directory_identity.lifecycle`.
   Delete `backend/app/services/directory_identity_service.py`. Run → PASS.
3. **Refactor**: ensure `app.services._directory_identity.__init__.py` re-exports all 11 surface names so each importer can use a single `from app.services._directory_identity import …` line.
4. **Verify**: full backend pytest under `client_factory`.

### Lock TOMLs

None new (ADR-007 amendment lists `_directory_identity` as Adapter; the
adapter TOML in #74a/#74b lists it).

### ADR cross-refs

- ADR-007 amendment §Decision §2 — `_directory_identity` is an Adapter.
- ADR-009 — no reserved alias is required because the shim is deleted, not aliased; if the team wants a deprecation window, the alias entry would go in `_reserved_modules.toml`.

### Pairing with #61

Land #56 and #61 in the same commit OR back-to-back commits in the
order: **#61 first** (move `graph_directory_*.py` into
`_graph_directory/` package), **then #56**. The cross-import is at
`graph_directory_service.py:8 from app.services.directory_identity_service import normalize_business_role`. After #61 that file becomes
`backend/app/services/_graph_directory/service.py` (or similar) and the
import becomes `from app.services._directory_identity import normalize_business_role`. The two changes share the
same import-rewrite mechanic.

### Rollback

Revert both commits in reverse order.

---

## #61 (S7.7) — Move `graph_directory_*.py` 4 modules into `_graph_directory/` package — PAIRED with #56

**Effort**: M (5–7h). Phase 4 unchanged. Same commit/back-to-back as
**#56**.

### Files touched

- `backend/app/services/graph_directory_auth.py:1-188` → `backend/app/services/_graph_directory/auth.py`.
- `backend/app/services/graph_directory_errors.py:1-29` → `backend/app/services/_graph_directory/errors.py`.
- `backend/app/services/graph_directory_service.py:1-141` → `backend/app/services/_graph_directory/service.py`.
- `backend/app/services/graph_directory_transport.py:1-75` → `backend/app/services/_graph_directory/transport.py`.
- New: `backend/app/services/_graph_directory/__init__.py` (re-exports public surface).
- New: `backend/app/services/_graph_directory/README.md` (per ADR-007 amendment Adapter category).
- `backend/app/services/directory_provider_service.py:18` — rewrite import (also touched by #56).
- New lock test: `tests/backend/pytest/architecture/test_w13_graph_directory_package_red.py`.

### TDD steps

1. **Red**: write `test_w13_graph_directory_package_red.py` with `pytestmark = pytest.mark.contract`. Assertions:
   - `Path("backend/app/services/_graph_directory/__init__.py").is_file()`.
   - The four `graph_directory_*.py` files at `backend/app/services/` no longer exist (Path.exists False for each).
   - AST scan rejects `from app.services.graph_directory_*` imports outside the package.
   Run → FAIL.
2. **Green**: create `_graph_directory/` directory; `git mv` each file into it. Update internal imports inside the four moved files (e.g., `graph_directory_transport.py:14 from app.services.graph_directory_auth import …` becomes `from app.services._graph_directory.auth import …`). Update `directory_provider_service.py:18` and the `_graph_directory/__init__.py` to re-export the public surface. Run → PASS.
3. **Refactor**: ensure `_graph_directory/__init__.py` contains a docstring + `__all__` listing the public surface needed by external callers (currently `directory_provider_service.py` imports from `graph_directory_service`).
4. **Verify**: full backend pytest with `client_factory`. Confirm that `_directory_identity` rewrites (from #56) target `_directory_identity` not `_graph_directory`.

### Lock TOMLs

`_bounded_context_adapters.toml` (created by #74b amendment) lists
`_graph_directory` as an adapter context.

### ADR cross-refs

- ADR-007 amendment §Decision §3 — `_graph_directory` is an Adapter (after this move).
- ADR-003 — adapter exception translation: `graph_directory_errors.py:1-29` becomes `_graph_directory/errors.py`; the adapter boundary projects external errors into `DomainError` subclasses.

### Pairing with #56

Land #61 first, then #56. The internal cross-import in
`graph_directory_service.py:8 from app.services.directory_identity_service import normalize_business_role` is rewritten to
`from app.services._directory_identity import normalize_business_role`
in #56's commit (now relative to the moved file
`_graph_directory/service.py`).

### Rollback

Revert the package move; restore the four `graph_directory_*.py` files.

---

## #59 (S2.10) — Monitoring package consolidation

**Effort**: M (4–6h). **Phase 4 CRITICAL correction**:
`_monitoring_response` is a SINGLE FILE
(`backend/app/services/_monitoring_response.py`, 278 lines), NOT a
package. Recipe takes path **(b)**: drop the
`_monitoring_response/README.md` requirement and use docstring +
`_monitoring_status/README.md` only.

### Files touched

- `backend/app/services/_monitoring_response.py` — extend module docstring (lines 1-15) to describe role + dependency on `_monitoring_status`.
- `backend/app/services/_monitoring_status/README.md` — extend to mention `_monitoring_response.py` is the file-level read-shape complement.
- New: `tests/backend/pytest/architecture/test_w13_monitoring_consolidation_red.py`.
- (Touched only by ADR-007 amendment, NOT by this recipe): `_bounded_context_read_shape.toml` lists `_monitoring_response.py` as a file entry.

### TDD steps

1. **Red**: write `test_w13_monitoring_consolidation_red.py` with `pytestmark = pytest.mark.contract`. Assertions:
   - `backend/app/services/_monitoring_response.py` module docstring is non-empty and contains the substring `monitoring_status`.
   - `backend/app/services/_monitoring_status/README.md` contains the substring `_monitoring_response.py`.
   - No new path `backend/app/services/_monitoring_response/__init__.py` exists (preserves "single file" decision).
   Run → FAIL on the docstring/README substring expectations.
2. **Green**: extend the docstring at `backend/app/services/_monitoring_response.py:1` to: `"""Read-shape projection for monitoring responses. Pairs with _monitoring_status (see services/_monitoring_status/README.md). File-level entry per ADR-007 amendment."""`. Append a sentence to `backend/app/services/_monitoring_status/README.md` Notes section describing `_monitoring_response.py`. Run → PASS.
3. **Refactor**: ensure no production imports of `_monitoring_response` reach inside `_monitoring_status` and vice versa (no circular imports).
4. **Verify**: full backend pytest.

### Lock TOMLs

`_bounded_context_read_shape.toml` (created by #74b) holds
`_monitoring_response.py` as a file entry — this recipe does NOT
populate that TOML; #74b/#74a does.

### ADR cross-refs

- ADR-007 amendment §Decision §1 — read-shape contexts; `_monitoring_response.py` is a file entry in the read-shape allowlist.
- ADR-001 — no capability change.

### Migration notes — why path (b)

Path (a) (split single file into package first) requires moving 278
lines into N submodules with no functional change and is out of scope
for #59. Path (b) keeps #59 small (docstring + 2-line README append +
lock test) and preserves the file-level entry semantics in the
ADR-007 amendment without forcing a structural change.

### Rollback

Revert the docstring/README edits and remove the lock test.

---

## #63 (BE-N7) — Outbox dispatch SchedulerJobRun instrumentation

**Effort**: M (5–7h). Additive, preserves admin runtime state.

### Files touched

- `backend/app/services/outbox/dispatcher.py` (modify dispatch loop to record `SchedulerJobRun` on entry and exit).
- `backend/app/models/scheduler_job_run.py:15` — model already exists; no schema change.
- New: `tests/backend/pytest/architecture/test_w13_outbox_scheduler_instrumentation_red.py`.
- New: `tests/backend/pytest/test_outbox_dispatch_scheduler_run_red.py` (behavioural).

### TDD steps

1. **Red (architecture)**: write `test_w13_outbox_scheduler_instrumentation_red.py` with `pytestmark = pytest.mark.contract`. Assertion: AST scan of `backend/app/services/outbox/dispatcher.py` finds `SchedulerJobRun` import and a write site (any `.add(SchedulerJobRun(` or service call that creates one). Run → FAIL.
2. **Red (behavioural)**: write `test_outbox_dispatch_scheduler_run_red.py` using `client_factory`. The test invokes `dispatch_pending_outbox_events(...)` with one queued event; asserts a `SchedulerJobRun` row is created with `job_name = "outbox_dispatch"`, `status` transitions from `running` → `succeeded`, `started_at` and `finished_at` are set, `result_json` carries `{"events_processed": 1}`. Run → FAIL.
3. **Green**: in `backend/app/services/outbox/dispatcher.py`, at the start of `dispatch_pending_outbox_events`, create a `SchedulerJobRun(job_name="outbox_dispatch", run_id=str(uuid4()), status="running", trigger_type="dispatch", instance_id=…, started_at=utc_now())`, persist via the existing service-owned transaction. On success, update status to `"succeeded"`, set `finished_at = utc_now()`, `duration_ms`, `result_json`. On failure (FatalOutboxError or RetryableOutboxError), set status to `"failed"`, populate `error_message`. Run both tests → PASS.
4. **Refactor**: extract a small helper (e.g., `record_scheduler_run`) inside `outbox/dispatcher.py` so the 6-7 line block is reused for entry/success/error transitions; do not move it outside the dispatcher.
5. **Verify**: confirm admin endpoints `/jobs/status` (`console.py:49`) and `/outbox/status` (`console.py:58`) still return their existing shapes — instrumentation is additive, response models unchanged.

### Lock TOMLs

None new.

### ADR cross-refs

- ADR-002 — service-owned transactions; the `SchedulerJobRun` write must occur within an existing service-owned scope, NOT via a new `db.commit()` at the dispatcher seam.
- ADR-007 §Decision context #5 (`_approval_execution`) and the Outbox Dispatcher Consolidation subsection of ADR-002 govern dispatcher placement.

### Migration notes

`SchedulerJobRun` table already exists (`backend/app/models/scheduler_job_run.py:15-37`). Forward-only; no migration ticket. The `instance_id` field
(`scheduler_job_run.py:25`) should be sourced from
`settings.instance_id` or equivalent.

### Rollback

Revert the dispatcher change; the model stays (idle).

---

## #72 (ADR-011) — Auth Scheme and Session Model

**Effort**: M (6–8h). Phase 4 corrections applied: Probe 1 fix; cross-refs
ADR-001/003/004; **REJECT** ADR-006 reference; bind `## SSO Token-Exchange
Boundary` to a lock test.

### Files touched

- New: `docs/adr/ADR-011-auth-scheme-and-session-model.md` (full text below).
- New: `tests/backend/pytest/architecture/test_w12_auth_idiom_ratchet_red.py` (non-increasing body-call `_require_*` and inline-403 count).
- New: `tests/backend/pytest/architecture/test_w12_get_current_user_isolation_red.py` (forbid `get_current_user` import outside `core/security.py` and `api/deps.py`).
- New: `tests/backend/pytest/architecture/test_w12_mock_auth_guard_red.py` (parses `core/security.py:107-136` AST, asserts `mock_auth_enabled and settings.debug` AND).
- New: `tests/backend/pytest/architecture/test_w12_sso_token_exchange_boundary_red.py` (binds the new ADR-011 §SSO Token-Exchange Boundary section to lock).
- Existing: `tests/backend/pytest/architecture/test_w5_endpoint_commit_ratchet_red.py::test_auth_commit_allowlist_entries_are_complete_and_unexpired` extends to enforce cap-0 after 2026-09-01.

### Full ADR-011 text (with Phase 4 corrections)

```
# ADR-011 Auth Scheme and Session Model

## Status

Accepted

## Context

RiskHub authentication exists across `backend/app/api/v1/endpoints/auth/` and `backend/app/core/security.py` but no ADR documents the canonical scheme. Three transport surfaces coexist on protected routes: the `require_permission(resource, action)` FastAPI dependency factory, body-call `_require_*` helpers, and inline `if not has_permission: 403` checks. The mock-auth path is a fallback branch inside `backend/app/core/security.py:107-136` (the canonical `get_current_user` dependency), gated by both `settings.mock_auth_enabled` and `settings.debug`. ADR-002 records 8 auth-flow endpoint commit exemptions in `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml`, each carrying `expires_at = 2026-09-01`. SSO with Microsoft Entra is implemented at `backend/app/api/v1/endpoints/auth/sso.py:170` and `backend/app/api/v1/endpoints/auth/_sso_helpers.py:48` but its relationship to internal session lifetime is undocumented at the architecture level.

## Decision

JWT bearer access tokens with refresh-token rotation and a token-version SSOT are the canonical authentication scheme. Single-use refresh per rotation; reuse triggers full revocation through the token-version field bumped at `backend/app/api/v1/endpoints/auth/logout.py:101,132`.

The mock-auth fallback inside `backend/app/core/security.py:107-136` is permitted only when `mock_auth_enabled && debug` evaluates true — both conditions are required (the AND is load-bearing; either alone is forbidden). Production code uses `app.api.deps.get_current_user`, which delegates into `app.core.security.get_current_user`. New mock-auth call sites outside that line range are forbidden, and `MOCK_AUTH_ENABLED=true` is forbidden in non-debug environments.

Endpoint authorization uses exactly one idiom going forward — the `require_permission(resource, action)` FastAPI dependency factory defined in `backend/app/core/security.py:170`. Body-call `_require_*` helpers and inline `if not has_permission` raises are frozen and may not be added on protected routes; existing call sites are tracked for migration but the count is non-increasing.

SSO with Microsoft Entra is deployment-time configuration, not a runtime branch. Entra-issued tokens are exchanged at `auth/sso.py:170` for a RiskHub access+refresh pair via `auth/_sso_helpers.py:48`; internal refresh-rotation owns session lifetime from that point forward. Logout cascade at `auth/logout.py:101,132` is the only path that bumps `token_version`, clears the refresh cookie, and removes the server-side refresh row.

The 8 auth-flow endpoint commit exemptions in `_endpoint_commit_allowlist.toml` (`auth/sso.py:170`, `auth/refresh.py:177`, `auth/logout.py:101`, `auth/logout.py:132`, `auth/password.py:128`, `auth/_sso_helpers.py:48`, `auth/demo.py:67`, `auth/password.py:161`) migrate to service-owned transactions before `2026-09-01`. New entries to that allowlist for auth flows are forbidden; the lock cap drops to 0 after the sunset date. Adding a third authentication scheme on protected routes is forbidden without superseding this ADR.

## Alternatives Rejected

- Session cookies: rejected because cookie sessions do not eliminate refresh rotation and complicate cross-origin frontend operation.
- Three-idiom status quo (`require_permission` + body-call `_require_*` + inline `403`): rejected because drift detection is fragile and contract-validator coverage is partial.
- Removing mock-auth entirely: rejected because dev/test fixtures depend on the mock-auth fallback inside `core/security.py:107-136`, and removing it would force every test to mint a full token chain.
- Letting Entra own session lifetime: rejected because RiskHub refresh rotation handles permission revocation, token-version bumps, and server-side refresh-row removal more granularly than the Entra session.

## Migration Impact

Each of the 8 auth-flow allowlist sites needs a service-owned transaction wrapper before `2026-09-01` (tracked under finding #76). Implementation order is sequenced under #71 (frontend session module merge) and #66 (AuthContext provider split), both gated on this ADR. Existing body-call `_require_*` and inline-`403` call sites remain during migration; new sites are forbidden by lock. SSO deployment configuration is unchanged — only the documented relationship between Entra token verification and RiskHub session issuance is added.

## Rollback Strategy

Forward-only. The token-version field already exists and logout sites already bump it. If a refresh-rotation regression appears in production, operators bump `token_version` for the affected user and re-issue. The ADR does not introduce schema or data-shape changes.

## Invariant Tests

- Hard expiration on auth-flow exemption: `tests/backend/pytest/architecture/test_w5_endpoint_commit_ratchet_red.py::test_auth_commit_allowlist_entries_are_complete_and_unexpired` already enforces `expires_at = 2026-09-01`. After `2026-09-01` the same lock is extended to cap allowlist size at 0; new entries fail the test.
- New `tests/backend/pytest/architecture/test_w12_auth_idiom_ratchet_red.py` scans `backend/app/api/v1/endpoints/` for body-call `_require_*` patterns and inline `if not has_permission` raises and asserts the count is non-increasing.
- New `tests/backend/pytest/architecture/test_w12_get_current_user_isolation_red.py` forbids `from app.core.security import get_current_user` outside `backend/app/core/security.py` and `backend/app/api/deps.py`; production importers route through `app.api.deps.get_current_user`.
- New `tests/backend/pytest/architecture/test_w12_mock_auth_guard_red.py` parses `backend/app/core/security.py:107-136` and asserts the mock-auth branch is reached only when `mock_auth_enabled and settings.debug` (both conjuncts present in the AST).
- New `tests/backend/pytest/architecture/test_w12_sso_token_exchange_boundary_red.py` asserts every SSO->RiskHub token exchange routes through `backend/app/api/v1/endpoints/auth/sso.py:170` calling into `backend/app/api/v1/endpoints/auth/_sso_helpers.py:48`; no other endpoint mints a RiskHub access+refresh pair from an Entra token.
- Cross-reference verified: every `AUTHZ-` action in `docs/security/authorization-capability-contract.json` records a `frontend_gate` and `backend_authority` that resolve through `require_permission` per `scripts/security/validate_authz_capability_contract.py:170-175`.

## Hard Expiration on Auth-Flow Exemption

Auth-flow exemptions in `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` carry `expires_at = 2026-09-01` (8 entries). The architecture lock at `architecture/test_w5_endpoint_commit_ratchet_red.py::test_auth_commit_allowlist_entries_are_complete_and_unexpired` will fail after that date until each entry is re-justified or the underlying commit is migrated to a service-owned transaction. After the sunset, the same lock asserts the allowlist is empty for auth flows; the cap drops from 8 to 0.

## SSO Token-Exchange Boundary

Entra-issued tokens reach `backend/app/api/v1/endpoints/auth/sso.py:170` for verification. The exchange in `backend/app/api/v1/endpoints/auth/_sso_helpers.py:48` mints a RiskHub access+refresh pair and persists the refresh row; from that point forward the RiskHub session owns lifetime. New SSO providers attach at the same exchange point; they do not bypass refresh rotation or token-version invalidation. Bound to lock `tests/backend/pytest/architecture/test_w12_sso_token_exchange_boundary_red.py`.

## Cross-References

- ADR-001 — Capabilities surface; `require_permission(resource, action)` (`core/security.py:170`) is the FastAPI dependency factory aligned with the ADR-001 capability contract.
- ADR-002 — Service-owned transactions; the 8 auth-flow allowlist entries evolve to 0 by 2026-09-01.
- ADR-003 — Domain exception taxonomy; `AuthorizationError` and `AuthenticationError` are already projected via `EXCEPTION_REGISTRY` at `backend/app/core/exceptions.py:68-69`.
- ADR-004 — UTC-aware datetime SSOT; JWT `exp`/`iat` derive from `utc_now()` at `backend/app/core/security.py:68`.
```

### TDD steps

1. **Red**: create the four new lock tests with placeholder asserts that fail (`assert False, "ADR-011 not implemented"`). Run → FAIL.
2. **Green**: write the ADR doc above; implement the four AST scans:
   - `test_w12_auth_idiom_ratchet_red.py`: walk `backend/app/api/v1/endpoints/` AST, count body-call `_require_*` and inline `if not has_permission` raises; compare to baseline TOML `_auth_idiom_baseline.toml`; assert count <= baseline.
   - `test_w12_get_current_user_isolation_red.py`: AST scan for `from app.core.security import get_current_user` outside `core/security.py` and `api/deps.py`; assert empty.
   - `test_w12_mock_auth_guard_red.py`: parse `core/security.py:107-136`; locate the `if` node; assert the test is `BoolOp(And)` with two `Attribute`/`Name` children matching `mock_auth_enabled` and `debug` (or `settings.debug`).
   - `test_w12_sso_token_exchange_boundary_red.py`: assert exactly one call site mints a RiskHub access+refresh pair from an Entra token; the call site is at `auth/sso.py:170` -> `_sso_helpers.py:48`.
   Run → PASS.
3. **Refactor**: hoist common AST utilities into `tests/backend/pytest/architecture/_ast_utils.py` if reused across the four tests.

### Lock TOMLs

- New: `tests/backend/pytest/architecture/_auth_idiom_baseline.toml` (counts of body-call `_require_*` and inline-403 raises at adoption time; lock asserts non-increasing).

### ADR cross-refs (Phase 4 corrected)

- ADR-001 (Capabilities surface).
- ADR-002 (auth-flow allowlist evolution to 0 by 2026-09-01).
- ADR-003 (`AuthorizationError`/`AuthenticationError` already in `EXCEPTION_REGISTRY` at `core/exceptions.py:66-69`).
- ADR-004 (JWT `exp`/`iat` use `utc_now()` at `core/security.py:68`).
- **DO NOT** cite ADR-006 — Loop 2 said REJECT (ADR-011 is a freeze, not a sweep).

### Migration notes

ADR-011 itself is doc + locks. The 8 auth-flow `db.commit` migrations
are tracked separately under #76. The `require_permission` API used in
new code is `require_permission(resource, action)` per
`core/security.py:170` — DO NOT confuse with the reversed
`require_any_permission` factory at `core/security.py:158-167`
(`require_any_permission(*perms)` taking pairs).

### Rollback

Revert the ADR doc and the four lock tests.

---

## #74a (Census) — Classify 31 underscore-prefixed packages into 5 TOMLs

**Effort**: XL (26–30h). **Phase 4 promoted from M to XL.** Use
`Cross-cutting` (NOT `Core`) as the 5th category name. `_orphaned_items`
classified Workflow-paired with `_identity_access_lifecycle` (NOT
Read-shape, NOT pair with `_admin_telemetry`). `_notification_inbox`
classified Workflow-paired with `_identity_access_lifecycle`
(provisional — recipe selects this over standalone).

### Effort breakdown (XL = 26–30h)

| Sub-task | Hours | Notes |
|---|---|---|
| Verify each package's purpose by reading `__init__.py` + at least one consumer | 6 | 31 packages × ~10 min each |
| Write 5 TOML allowlists (write-side, read-shape, workflow-pairs, adapters, cross-cutting) | 4 | Includes commentary headers |
| Write disjointness lock test (`test_w7_bounded_context_disjointness.py`) | 6 | Pair-check, dual-class allow, file entry for `_monitoring_response.py` |
| Write per-category secondary tests (read-shape no-commit lock, adapter exception-translation lock, cross-cutting SSOT lock) | 6 | Three additional tests |
| Cross-validate with existing `test_w4_bc_*.py` (seven write-side) | 2 | Ensure no overlap or contradiction |
| ADR-007 amendment text edits + table cross-references | 2 | Coordinate with #74b |
| Adversarial review pass (verify each classification) | 2 | Run all locks; spot-check 5 random pairs |
| Rebaseline known-test-failures TOML if any | 2 | Buffer for flakes |

### Files touched

- New: `tests/backend/pytest/architecture/_bounded_context_write_side.toml`.
- New: `tests/backend/pytest/architecture/_bounded_context_read_shape.toml`.
- New: `tests/backend/pytest/architecture/_bounded_context_workflow_pairs.toml`.
- New: `tests/backend/pytest/architecture/_bounded_context_adapters.toml`.
- New: `tests/backend/pytest/architecture/_bounded_context_cross_cutting.toml` (NOT `_bounded_context_core.toml`).
- New or extended: `tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py`.
- New: `tests/backend/pytest/architecture/test_w13_read_shape_no_commit_red.py`.
- New: `tests/backend/pytest/architecture/test_w13_adapter_exception_translation_red.py`.
- New: `tests/backend/pytest/architecture/test_w13_cross_cutting_ssot_red.py`.

### 31-package classification (Phase 4 corrected)

**Write-side (canonical seven)**: `_riskhub_config`, `_identity_access_lifecycle`, `_vendor_governance`, `_register_listings` (dual), `_approval_execution`, `_entity_mutation_lifecycle`, `_kri_history`.

**Read-shape (verified)**: `_register_listings` (dual), `_monitoring_status`, `_dashboard_metrics`, `_quarterly_comparison`, `_reporting`, `_org_chart`, `_monitoring_response.py` (file entry).

**Workflow-paired (10 left-halves with their right-half partners; right-halves may also appear in their own primary allowlist)**:
- `_approval_queue` ↔ `_approval_execution` (right-half is primary write-side)
- `_issue_register` ↔ `_issue_workflow`
- `_vendor_links` ↔ `_vendor_governance` (right-half is primary write-side)
- `_access_workflow` ↔ `_identity_access_lifecycle` (right-half is primary write-side)
- `_control_execution` ↔ `_entity_mutation_lifecycle` (right-half is primary write-side)
- `_deadline_execution` ↔ `_kri_history` (right-half is primary write-side)
- `_auth_session_workflow` ↔ `_auth_session` (right-half is primary adapter)
- `_risk_questionnaires` ↔ `_vendor_governance` (right-half is primary write-side)
- `_vendor_workflow` ↔ `_vendor_governance` (right-half is primary write-side)
- `_orphaned_items` ↔ `_identity_access_lifecycle` (Phase 4 correction; right-half is primary write-side)
- `_notification_inbox` ↔ `_identity_access_lifecycle` (Phase 4 decision: workflow-paired with the same write-side context, NOT with `_admin_telemetry`)

**Adapter (6)**: `_directory_identity`, `_directory_sync`, `_graph_directory` (post-#61), `_admin_telemetry`, `_activity_log_query`, `_auth_session`.

**Cross-cutting (2)**: `_authorization_capabilities`, `_config`.

### TDD steps

1. **Red**: write the 5 TOMLs (initially empty) and `test_w7_bounded_context_disjointness.py` asserting every underscore-prefixed package under `backend/app/services/` (excluding `__pycache__`) appears in exactly one allowlist (with explicit dual-class for `_register_listings` and file entry for `_monitoring_response.py`). Run → FAIL.
2. **Green**: populate the TOMLs per the classification above. Run the disjointness test; it should pass. Then write the three secondary lock tests (`read_shape_no_commit`, `adapter_exception_translation`, `cross_cutting_ssot`) with placeholder asserts; populate them per ADR-007 amendment §Decision §1, §3, §4. Run → PASS.
3. **Refactor**: review each TOML's commentary header; ensure each package's classification rationale is one short sentence.

### Lock TOMLs

The 5 new TOMLs above. Atomicity: each TOML is written as a single
contiguous list (no spans). Each package appears in exactly its primary
allowlist; workflow-paired right-halves additionally appear in
`_bounded_context_workflow_pairs.toml` as the right-half of an ordered
pair, but their PRIMARY allowlist is whichever (write-side or adapter)
they belong to.

### ADR cross-refs

- ADR-007 amendment §Decision §1, §2, §3, §4 — this recipe is the §74a deliverable that the #74b amendment cross-references.

### Migration notes

This is a documentation + lock change. No production import paths are
modified by #74a. The TOMLs are passive (read by the disjointness
test). Per the Phase 4 amendment to "EXACTLY ONE", each package's
PRIMARY classification is exactly one; workflow-pair right-halves may
appear in their primary allowlist AND in the workflow-pair allowlist.
The lock test permits many-to-one for right-halves and asserts
per-allowlist atomicity (no spans across multiple lists).

### Rollback

Delete the 5 TOMLs and the four new tests; the disjointness lock test
is reverted to its pre-#74a state.

---

## #74b (ADR-007 amendment) — Read-Shape, Workflow-Paired, Adapter, and Cross-cutting Categories

**Effort**: M (4–6h). Prereq: #74a. Phase 4 corrections applied.

### Files touched

- `docs/adr/ADR-007-bounded-context-taxonomy.md` (append amendment).
- New (linked from #74a): the 5 TOMLs.
- Existing: `tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py` (created by #74a; #74b cites it).

### Full ADR-007 amendment text (Phase 4 corrected)

```
## Amendment 1 — Read-Shape, Workflow-Paired, Adapter, and Cross-cutting Contexts

### Status

Accepted

### Context

ADR-007 names seven write-side bounded contexts but the codebase carries 31 underscore-prefixed packages under `backend/app/services/`. The unnamed remainder falls into four coherent shapes: read-shape projections, workflow-paired companions, adapter contexts that translate external systems, and a small set of cross-cutting modules that supply policy primitives to every other context. Without an explicit secondary taxonomy, reviewers read the seven-context list as exhaustive and misclassify new packages.

### Decision

ADR-007's taxonomy is extended with three secondary categories and one cross-cutting category. The seven-context list at ADR-007 §Decision remains the canonical write-side enumeration. Each package's PRIMARY classification is exactly one. Workflow-pair right-halves may appear in their primary allowlist AND in the workflow-pair allowlist; the disjointness lock permits this many-to-one membership. Each allowlist must be atomic — no entries span across multiple lists.

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

### Alternatives Rejected

- Expand the seven-context list to all 31 packages: rejected because it loses sweep meaning and produces 31 separate atomicity tests for what are really seven transactions.
- Document elsewhere (`CONVENTIONS.md`, `AGENTS.md`): rejected because Loop 3 review showed reviewers read ADR-007 as exhaustive when classifying new packages.
- Merge workflow-paired contexts into a single context per pair: rejected because the splits reflect real read-vs-write boundaries (queue vs execution, register vs workflow, links vs governance).
- Three categories without `Cross-cutting`: rejected because `_authorization_capabilities` and `_config` would be force-fit into adapter or read-shape, neither of which captures their cross-cutting policy role; the lock would either fire on day 1 or accept silent miscategorization.
- "EXACTLY ONE" disjointness without many-to-one for workflow-pair right-halves: rejected because it would force right-halves out of their primary write-side or adapter allowlist, breaking sweep semantics.

### Migration Impact

Five new TOMLs added under `tests/backend/pytest/architecture/`: `_bounded_context_write_side.toml`, `_bounded_context_read_shape.toml`, `_bounded_context_workflow_pairs.toml`, `_bounded_context_adapters.toml`, `_bounded_context_cross_cutting.toml`. Existing per-context boundary tests (`test_w4_bc_a_riskhub_config_boundaries_red.py` through `test_w4_bc_g_kri_history_boundaries_red.py`) continue to operate on the seven canonical write-side contexts. Adapter contexts and cross-cutting contexts gain new exception-ban exemption holders; existing adapters did not raise HTTPException at adapter boundaries because they were not previously in scope of the per-context ban. `_graph_directory` is created by #61 and recorded in the adapter TOML at the same commit as the package move.

### Rollback Strategy

Documentation amendment plus five new TOMLs and one extended disjointness lock. Rollback consists of removing the TOMLs and the disjointness extension; the seven-context core remains operational without the amendment.

### Invariant Tests

- New or extended `tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py` validates that every underscore-prefixed package under `backend/app/services/` (excluding `__pycache__`) is in EXACTLY ONE primary allowlist, with the documented exception of `_register_listings` which is dual-classed (write-side AND read-shape) for sweep-order reasons. Workflow-pair right-halves additionally appear in the workflow-pair allowlist (many-to-one permitted). New packages must be classified at introduction; the lock fails on unclassified packages.
- `_bounded_context_write_side.toml` enumerates the seven canonical contexts.
- `_bounded_context_read_shape.toml` enumerates read-shape secondaries plus the `_monitoring_response.py` file entry.
- `_bounded_context_workflow_pairs.toml` enumerates ordered pairs (`(left, right)`); the lock asserts a sweep that touches one half also covers the other.
- `_bounded_context_adapters.toml` enumerates adapter packages; the lock allows HTTPException translation only at the adapter boundary and asserts ADR-003 `DomainError` projection inside.
- `_bounded_context_cross_cutting.toml` enumerates cross-cutting packages and binds them to ADR-001 (capabilities) and ADR-008 (config-default SSOT) lock chains.
- Per-allowlist atomicity asserted: each TOML file is parsed as a single contiguous list; entries spanning multiple files trigger lock failure.
- Cross-reference: ADR-003 `DomainError` taxonomy governs adapter exception translation; ADR-001 governs `_authorization_capabilities` SSOT; ADR-008 governs `_config` SSOT pattern.
```

### Recomputed count summary

7 write-side + 6 read-shape (incl. `_register_listings` dual + `_monitoring_response.py` file entry) + 11 workflow-pair-left-halves + 6 adapters + 2 cross-cutting = **32 entries across 31 packages and 1 file** (because `_register_listings` is dual-classed and `_monitoring_response.py` is a separate file entry). Workflow-pair right-halves are NOT counted separately in the primary tally — they are listed in the pairs TOML as right-halves of an ordered pair.

Phase 4 reconciliation: the prior draft's "10 workflow-pair-left-halves" count was undercounted (`_orphaned_items` and `_notification_inbox` were both reclassified to workflow-paired); the new count of 11 left-halves matches the 11 pairs above.

### TDD steps

1. **Red**: append the amendment text to `docs/adr/ADR-007-bounded-context-taxonomy.md`. Locks were written under #74a. No new test in #74b itself; the doc update is the deliverable.
2. **Green**: confirm the appended text matches the §Invariant Tests of #74a and that the disjointness lock recognizes the renamed `_bounded_context_cross_cutting.toml`.
3. **Verify**: run the disjointness lock; PASS.

### Lock TOMLs

(Created in #74a.)

### ADR cross-refs

- ADR-001 — capability SSOT for `_authorization_capabilities`.
- ADR-008 — config-default SSOT for `_config`.
- ADR-003 — adapter exception translation.

### Rollback

Remove the appended amendment text.

---

## #76 (Auth/ commit migration, NEW) — Migrate 8 auth-flow `db.commit()` sites

**Effort**: L (12–16h). **Phase 4 promoted from M to L.** Priority P1.
Deadline: 2026-09-01. Prereq: ADR-011 (#72).

### 8 sites verified (Phase 4 list)

- `backend/app/api/v1/endpoints/auth/refresh.py:177` (1 commit)
- `backend/app/api/v1/endpoints/auth/logout.py:101` (1 commit)
- `backend/app/api/v1/endpoints/auth/logout.py:132` (1 commit)
- `backend/app/api/v1/endpoints/auth/sso.py:170` (1 commit)
- `backend/app/api/v1/endpoints/auth/_sso_helpers.py:48` (1 commit)
- `backend/app/api/v1/endpoints/auth/password.py:128` (1 commit)
- `backend/app/api/v1/endpoints/auth/password.py:161` (1 commit)
- `backend/app/api/v1/endpoints/auth/demo.py:67` (1 commit)

### Files touched

- 7 endpoint files above (8 sites — `logout.py` and `password.py` each have 2).
- New service surfaces under `backend/app/services/_auth_session/` and `backend/app/services/_identity_access_lifecycle/` to absorb each commit (one service method per logical operation).
- `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` — remove all 8 auth-flow entries.
- New lock: `tests/backend/pytest/architecture/test_auth_flow_no_endpoint_commit_red.py`.

### TDD steps

1. **Red (the new architecture lock)**: write `tests/backend/pytest/architecture/test_auth_flow_no_endpoint_commit_red.py` with `pytestmark = pytest.mark.contract`. The test asserts that none of the 8 named auth files contain `await db.commit()` after migration:
   ```python
   import ast
   import pathlib
   import pytest

   pytestmark = pytest.mark.contract

   AUTH_FILES = [
       "backend/app/api/v1/endpoints/auth/refresh.py",
       "backend/app/api/v1/endpoints/auth/logout.py",
       "backend/app/api/v1/endpoints/auth/sso.py",
       "backend/app/api/v1/endpoints/auth/_sso_helpers.py",
       "backend/app/api/v1/endpoints/auth/password.py",
       "backend/app/api/v1/endpoints/auth/demo.py",
   ]

   def _has_commit(node: ast.AST) -> bool:
       for child in ast.walk(node):
           if isinstance(child, ast.Await) and isinstance(child.value, ast.Call):
               func = child.value.func
               if isinstance(func, ast.Attribute) and func.attr == "commit":
                   return True
       return False

   @pytest.mark.parametrize("path", AUTH_FILES)
   def test_auth_flow_no_endpoint_commit(path: str) -> None:
       source = pathlib.Path(path).read_text()
       tree = ast.parse(source)
       assert not _has_commit(tree), f"{path} still contains await db.commit()"
   ```
   Run → FAIL on all 6 paths (8 sites).
2. **Red (behavioural per site)**: for each of the 8 sites, write a `client_factory`-based integration test asserting the existing endpoint behaviour (e.g., `test_auth_refresh_rotates_token_red.py` for `refresh.py:177`). Run → PASS (current behaviour); the lock is the only thing that fails.
3. **Green (per site, in priority order)**:
   1. `auth/sso.py:170` — wrap in `app.services._auth_session.session_lifecycle.complete_sso_login(...)` which owns the transaction.
   2. `auth/_sso_helpers.py:48` — fold into the same `_auth_session` service method (same SSO path).
   3. `auth/refresh.py:177` — wrap in `app.services._auth_session.session_lifecycle.rotate_refresh_token(...)`.
   4. `auth/logout.py:101` — wrap in `app.services._auth_session.session_lifecycle.logout_session(...)`.
   5. `auth/logout.py:132` — wrap in the same `logout_session` (or `logout_all_sessions` variant).
   6. `auth/password.py:128` — wrap in `app.services._identity_access_lifecycle.password.update_password(...)`.
   7. `auth/password.py:161` — wrap in same service (different code path).
   8. `auth/demo.py:67` — wrap in `app.services._identity_access_lifecycle.demo.create_demo_session(...)`.
   For each migration: remove the `await db.commit()` from the endpoint, push it inside the service, run the per-site behavioural test → PASS, run the architecture lock → counter decrements.
4. **Green (lock cleanup)**: after all 8 sites are migrated, remove the corresponding entries from `_endpoint_commit_allowlist.toml`. Run `test_auth_flow_no_endpoint_commit_red.py` → PASS for all 8.
5. **Refactor**: review the new service surface for duplicate transaction-management code; extract a small helper if 4+ methods share the pattern.

### Lock TOMLs

- `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` — 8 entries removed (one per site).
- The lock at `tests/backend/pytest/architecture/test_w5_endpoint_commit_ratchet_red.py::test_auth_commit_allowlist_entries_are_complete_and_unexpired` is no longer applicable to auth-flow entries (count = 0).

### ADR cross-refs

- ADR-002 §Hard Expiration on Auth-Flow Exemption — the 2026-09-01 sunset.
- ADR-011 §Migration Impact — this finding implements the migration ADR-011 specifies.

### Migration notes

Sequence is gated on ADR-011 (#72) acceptance. Each of the 8 migrations
must preserve current endpoint behaviour (verified by per-site
behavioural tests). The new service methods land under
`_auth_session` (workflow-paired with `_auth_session_workflow` per
ADR-007 amendment) and `_identity_access_lifecycle` (canonical
write-side per ADR-007 §Decision context #2). Per-site tests use
`client_factory`; new dependency-override blocks (if any) require an
entry in `tests/backend/pytest/_get_db_override_whitelist.toml`.

### Rollback

Each of the 8 migrations is a separate commit. Rollback per-site by
reverting the commit and restoring the corresponding allowlist entry.

---

## ADR-012 reference

ADR-012 (KRI Time-Series Period Algebra and Deadline Classification,
#73) is documented in P5-A4 KRI recipes; not duplicated here. Cross-ref
text inside ADR-007 amendment §Cross-References:
"ADR-007:13 — `_kri_history` is one of the seven canonical bounded
contexts; ADR-012 refines the internal SSOT without re-classifying the
context." See `.planning/audits/_context/plan-loop-3-06-adr-drafts.md:87-158`
for the full inline draft.

---

## Cross-domain handoff notes

- **#56 + #61 (paired wave)**: land #61 first (package move) so the
  cross-import in `graph_directory_service.py:8` can be rewritten to
  `_directory_identity` in the same #56 commit. Do NOT split across PRs.
- **#72 (ADR-011) → #76 (auth commit migration)**: #72 must merge before
  #76 starts; the architecture lock created in #76 references the
  ADR-011 SSO Token-Exchange Boundary.
- **#74a → #74b**: #74a populates the 5 TOMLs and the disjointness lock;
  #74b appends the amendment doc that cites them. Same wave; #74a's
  TOMLs are the implementation of #74b's text.
- **#59 (path b chosen)**: keeps #59 small. If a future task wants to
  split `_monitoring_response.py` into a package, that is a separate
  finding outside this plan.
- **#40 admin sub-router split (7 routes, NOT 8)**: no URL change;
  frontend untouched. Cluster mapping verified against `console.py:36,49,58,67,79,124,149`.
- **#63 outbox SchedulerJobRun**: forward-only; no schema change
  (`scheduler_job_runs` table already present).
- **#55 single inlined call site**: simpler than #56 because only 1
  importer.

```

---

## Quote/citation index (Phase 4-corrected file:line)

- `backend/app/services/access_user_service.py:10-24` — wrapper signature identical to `update_access_profile`.
- `backend/app/services/directory_identity_service.py:3-19` — 13 re-exports (11 from `_directory_identity`, 2 from `_directory_identity.lifecycle`).
- `backend/app/services/_monitoring_response.py:1-278` — single file (NOT a package).
- `backend/app/api/v1/endpoints/admin/console.py:36,49,58,67,79,124,149` — 7 routes.
- `backend/app/core/security.py:170` — `def require_permission(resource: str, action: str)`.
- `backend/app/core/security.py:68` — `expire = utc_now() + (expires_delta or …)`.
- `backend/app/core/exceptions.py:68-69` — `AuthorizationError`, `AuthenticationError` in `EXCEPTION_REGISTRY`.
- `backend/app/api/v1/endpoints/auth/refresh.py:177` — 1 commit.
- `backend/app/api/v1/endpoints/auth/logout.py:101,132` — 2 commits.
- `backend/app/api/v1/endpoints/auth/sso.py:170` — 1 commit.
- `backend/app/api/v1/endpoints/auth/_sso_helpers.py:48` — 1 commit.
- `backend/app/api/v1/endpoints/auth/password.py:128,161` — 2 commits.
- `backend/app/api/v1/endpoints/auth/demo.py:67` — 1 commit.
- `backend/app/models/scheduler_job_run.py:15-37` — `SchedulerJobRun` model already exists.
