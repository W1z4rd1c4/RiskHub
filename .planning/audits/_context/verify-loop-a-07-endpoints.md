# Phase 2 Loop A — Endpoint surface verification

Date: 2026-05-09
Domain: Endpoint surface (questionnaires, monitoring, reports, users-summary,
control monitoring, orphaned items)
Mode: read-only verification of audit findings against current code.
Quote rule: ≤15 words; every claim cites `file:line`.

---

## Item #10 — Questionnaires endpoint module delete (S8.5)

**Verdict: CONFIRM-REJECT (developer's Reject is correct).** Audit claim "0
routes (file is dead)" is empirically false. Propose evolution path under #38.

Evidence:

- `backend/app/api/v1/router.py:24` imports `riskhub_questionnaires` in the
  aggregator tuple.
- `backend/app/api/v1/router.py:58`
  `api_router.include_router(riskhub_questionnaires.router)` — module is
  mounted into the live API surface.
- `backend/app/api/v1/endpoints/riskhub_questionnaires.py:14`
  `router = APIRouter(prefix="/riskhub/questionnaires", tags=["riskhub"])`.
- `backend/app/api/v1/endpoints/riskhub_questionnaires.py:37`
  `@router.post("/batch-send", response_model=BatchSendResponse)` — 1 mounted
  POST route at `/api/v1/riskhub/questionnaires/batch-send`.
- Frontend caller chain confirmed:
  - `frontend/src/services/riskHubApi.ts:308-310`
    `batchSendQuestionnaires` POSTs `/riskhub/questionnaires/batch-send`.
  - `frontend/src/components/riskhub/riskQuestionnairePanelState.ts:170`
    `await riskHubApi.batchSendQuestionnaires(payload)`.
  - `frontend/src/components/riskhub/RiskQuestionnairesPanel.tsx:24`
    `riskHubCapabilityEnabled(..., 'can_batch_send')` — capability gate.
- Backend test exists: `tests/backend/pytest/api/v1/test_riskhub_questionnaires.py`
  (226 lines).
- Service collaborator: `riskhub_questionnaires.py:11`
  `from app.services.risk_questionnaire_service import send_questionnaire_for_risk`.

Proposed evolution path (folds into #38, **NOT** delete):

- Keep file + route (it owns the only batch-send action surface).
- Move `RiskFilters`, `BatchSendRequest`, `BatchSendResponse`
  (`riskhub_questionnaires.py:17-34`) out of the endpoint into
  `backend/app/schemas/riskhub.py` (which already exists per
  `backend/app/schemas/` listing).
- Document module purpose in `backend/app/api/v1/endpoints/README.md` (a
  README is already present in that directory) so the "0 routes" mistake is
  not repeated by future audits.

---

## Item #12 — Users-summary blanket-except narrowing (D-N3)

**Verdict: CONFIRM (developer Accept-with-mod stands).** Two blanket excepts
exist; both can be narrowed. Read at
`backend/app/api/v1/endpoints/users/summary.py`.

Evidence (current file, 92 lines):

- Blanket-except #1 — `summary.py:46-49` inside `_can_view_governance`:
  ```python
  try:
      ensure_business_view_access(current_user, detail="...")
  except Exception:
      return False
  ```
  Quote `summary.py:48` `except Exception:` — should narrow to
  `AuthorizationError` (the documented `DomainError` subclass per ADR-003)
  since `ensure_business_view_access` is the only thing inside the `try`.
  `app.core.permissions.ensure_business_view_access` is imported at
  `summary.py:10`.

- Blanket-except #2 — `summary.py:60-63` inside `_build_shell_summary`:
  ```python
  try:
      questionnaire_inbox_count = await _count_questionnaire_inbox(...)
  except Exception:
      questionnaire_inbox_count = 0
  ```
  Quote `summary.py:62` `except Exception:` — wraps the questionnaire-inbox
  fan-out. The narrow catch should be the documented `DomainError`/transport
  error pair: `(NotFoundError, AuthorizationError, SQLAlchemyError)` (or the
  `app.core.exceptions` umbrella) per ADR-003. Bare `Exception` swallows
  programmer errors.

- Authoritative governance/access capability surface that the file should
  route through:
  - `summary.py:10` `from app.core.permissions import can_manage_users,
    ensure_business_view_access, has_permission`. Endpoint inlines
    `_can_view_governance` (line 45-50) and re-implements gating instead of
    sourcing from `Capabilities.can(...)`.
  - Canonical capability surface lives in
    `backend/app/services/_authorization_capabilities/perimeter.py`
    (capability-catalog `id: capabilities` → method `can`, see
    `docs/security/capability-catalog.json:9-13`).
  - `MeCapabilities` already publishes `can_view_governance` field
    (`docs/security/capability-catalog.json:34`); the endpoint should consume
    that field instead of evaluating ad hoc.

Cross-check with developer answer: matches "Narrow exception handling and
route governance through canonical capabilities" in
`developer answer.md:29`. P1 priority.

---

## Item #15 — `access_user` capability catalog gap (D-N2)

**Verdict: CONFIRM (developer Accept stands, P1).**

Evidence:

- Backend capability schema exists:
  `backend/app/schemas/access.py:63`
  `class AccessUserCapabilities(BaseModel):` with 7 fields (lines 66-72):
  `can_edit_identity`, `can_edit_business_access`, `can_edit_role`,
  `can_deactivate`, `can_change_active_status`, `can_break_glass_enable`,
  `can_revoke_sessions`.
- Capability builder exists:
  `backend/app/services/_access_workflow/policy.py:26`
  `def access_user_capabilities(current_user: User, target_user: User) ->
  AccessUserCapabilities:`. Returns the schema at line 43.
- The `AccessUserRead.capabilities` field is populated:
  `backend/app/schemas/access.py:58`
  `capabilities: "AccessUserCapabilities | None" = None`.
- Endpoint wires it: `backend/app/api/v1/endpoints/access.py:81`
  `capabilities=access_user_capabilities(current_user, user) if current_user
  is not None else None`.
- Frontend mirror exists:
  `frontend/src/types/access.ts:51` `export interface AccessUserCapabilities {`.

**Catalog gap confirmed:** `docs/security/capability-catalog.json` (216 lines)
enumerates surfaces `capabilities`, `me_capabilities`, `risk`, `control`,
`kri`, `issue`, `vendor` (lines 7-214). It does **NOT** declare an
`access_user` surface. Current matches:

- Line 27 `"can_view_access_users"` — this is a `me_capabilities` field, not
  an `access_user` per-row capability bag.
- Line 28 `"can_view_department_access_users"` — same.

There is no entry whose `id == "access_user"`, no `backend.path
backend/app/schemas/access.py` reference, and no frontend
`frontend/src/types/access.ts` reference. The 7 `AccessUserCapabilities`
fields are not field-shape-validated by the catalog.

---

## Item #17 — `_monitoring_response` shim consolidation (S2.1)

**Verdict: CONFIRM (developer Accept stands, P2).** Cross-link only — Agent
A5 already covered this. Repeating evidence for completeness.

Evidence:

- Shim file: `backend/app/api/v1/endpoints/_monitoring_response.py:1`
  `"""Compatibility Adapter for monitoring response projection helpers."""`
  (25 lines).
- Pure re-export of 9 names from
  `app.services._monitoring_response` (lines 3-13).
- 14 importer files under `backend/app/api/v1/endpoints/` (count from
  `grep -rln`):
  - `controls/crud/{create,detail,restore}.py`
  - `controls/linking.py`
  - `departments/{controls,kris}.py`
  - `kris/crud/{breaches,create,detail,restore}.py`
  - `risks/control_links.py`
  - `risks/crud/{create,detail,restore}.py`
- Sample importer: `controls/crud/detail.py:6` `from
  app.api.v1.endpoints._monitoring_response import
  load_monitoring_response_context, serialize_control_read`.
- Service-side seam: `backend/app/services/_monitoring_response/` (directory
  per `backend/app/services/_monitoring_status` listing).

The deletion test passes if all 14 importers retarget the service module
directly; nothing of substance lives in the shim.

---

## Item #38 — Endpoint-layer Pydantic model eviction (S8.6)

**Verdict: CONFIRM (developer Accept-with-mod stands, P2; questionnaire
route preserved).** All inline models confirmed; `backend/app/schemas/`
target modules already exist.

Evidence:

- `backend/app/api/v1/endpoints/health.py:16` `class LivenessResponse(BaseModel):`
- `health.py:22` `class ReadinessResponse(BaseModel):`
- `health.py:32` `class HealthResponse(ReadinessResponse):`
  (3 inline models, lines 16-35)
- `backend/app/api/v1/endpoints/preferences.py:15` `class PreferencesUpdate(BaseModel):`
- `preferences.py:36` `class PreferencesResponse(BaseModel):`
  (2 inline models, lines 15-40)
- `backend/app/api/v1/endpoints/riskhub_questionnaires.py:17` `class RiskFilters(BaseModel):`
- `riskhub_questionnaires.py:24` `class BatchSendRequest(BaseModel):`
- `riskhub_questionnaires.py:30` `class BatchSendResponse(BaseModel):`
  (3 inline models, lines 17-34)

Target schema modules (already present in `backend/app/schemas/`):

- `backend/app/schemas/` lists (alphabetical) — relevant targets:
  - No existing `health.py` in schemas — would be a new file (3 models).
  - No existing `preferences.py` (or `user.py` already exists at
    `backend/app/schemas/user.py` — could host `PreferencesUpdate`/
    `PreferencesResponse`; alternatively a new `preferences.py`).
  - `backend/app/schemas/riskhub.py` already exists — natural home for
    `RiskFilters`, `BatchSendRequest`, `BatchSendResponse`.
- `backend/app/schemas/risk_questionnaire.py` also exists; `BatchSend*` could
  alternatively land there if `riskhub.py` is reserved for CRO config.

Architecture-lock interaction: `tests/backend/pytest/architecture/test_w9_schema_datetime_ban.py`
applies to `backend/app/schemas/` files only. Schemas added must use
`UtcAwareDatetime`, not bare `datetime` (none of the 8 listed models
currently imports `datetime`, so the move is safe per the lock).

---

## Item #43 — Audit adapter-emitter helper (BE-N4)

**Verdict: CONFIRM (developer Accept-with-mod stands, P3; preserve audit
matrix).**

Evidence:

- Audit matrix: `backend/app/core/audit/_audit_matrix.toml` — 229 lines, 37
  `[[adapter]]` entries. Header line 1 `# W7 audit adapter matrix.`
  (Phase 1 said 38; current count is 37 by `grep -c "^\[\[adapter\]\]"`. The
  Phase 1 text "38 adapter rows" was approximate — adjust to 37.)
- Adapter modules under `backend/app/core/audit/`:
  - `risk.py` (124 lines), `control.py` (118), `kri.py` (198),
    `issue.py` (332), `approval.py` (99), `vendor.py` (174). Total = 1,045
    adapter lines plus `changes.py` (45) and `labels.py` (6).
- Boilerplate pattern repeats per module (canonical example
  `control.py:30-39` for `control_created`, then `42-65` for
  `control_updated`, then `68-91` for `control_archived`, then `94-118` for
  `control_restored`):
  ```python
  await log_activity_func(
      db,
      entity_type=ActivityEntityType.CONTROL,
      entity_id=control.id,
      entity_name=control_display_name(control),
      safe_entity_label=safe_entity_label("CTRL", control.id),
      action=ActivityAction.CREATE,
      actor=actor,
      department_id=control.department_id,
  )
  ```
- Same shape repeats in `risk.py:27-36`, `risk.py:60-71`, `risk.py:86-97`,
  `risk.py:111-124`. Quote `risk.py:27` `await log_activity_func(`.
- For `*_updated`/`*_archived`/`*_restored`, the prelude
  `changes = resolve_audit_changes(changes=changes, before_data=before_data,
  after_data=after_data)` repeats verbatim
  (`risk.py:59`, `risk.py:85`, `risk.py:110`; same in `control.py:53`,
  `control.py:79`, `control.py:104`).
- Architecture lock that pins matrix:
  `tests/backend/pytest/architecture/test_w7_audit_adapter_completeness_red.py:13`
  `MATRIX_PATH = AUDIT_ROOT / "_audit_matrix.toml"`; line 33
  `def test_audit_matrix_functions_exist()` asserts every
  `(module, function)` in the TOML has a corresponding `def` in
  `backend/app/core/audit/<module>.py`.

Boilerplate seam observation (no implementation steps): the repeated
`(entity_type, entity_id, entity_name, safe_entity_label, action, actor,
department_id, [changes], [description])` shape across 37 adapters is the
"adapter-emitter" candidate. The `_audit_matrix.toml` row schema already
encodes (`module`, `function`, `entity_type`, `action`) — those four are
exactly what the lock asserts. A helper that takes the row tuple plus the
domain object's `id`/`name`/`department_id` would not invalidate the
matrix lock. **Required preservation:** every existing `def` name must
remain at module level (the lock asserts presence by name), so any helper
must be additive, not a wrapper that hides the per-function `def`.

---

## Item #44 — API surface path-prefix registry (BE-N6)

**Verdict: CONFIRM (developer Accept stands, P3).**

Evidence: `backend/app/api/v1/router.py:32-60` (28 `include_router` calls,
mixed prefix patterns).

- Line 32 `api_router = APIRouter()`.
- Lines 34-60 — 27 `include_router` calls. Phase 1 said 28 lines 34..60;
  the 28th line is line 33 (blank) so 27 calls is the literal count. The
  audit/Phase 1 number "28 routers" matches if you also count the implicit
  `health` mounted in line 34. Verified count: **27 include_router calls.**

Three prefix patterns coexist:

1. **Aggregator-prefixed** (router.py owns the prefix):
   - `router.py:35` `prefix="/auth"`,
   - `router.py:36` `prefix="/users"`,
   - `router.py:37` `prefix="/access"`,
   - `router.py:38` `prefix="/controls"`,
   - `router.py:39` `prefix="/risks"`,
   - `router.py:41` `prefix="/vendors"`,
   - `router.py:45` `prefix="/dashboard"`,
   - `router.py:46` `prefix="/departments"`,
   - `router.py:47` `prefix="/reports"`,
   - `router.py:48` `prefix="/executions"`,
   - `router.py:50` `prefix="/approvals"`,
   - `router.py:51` `prefix="/notifications"`,
   - `router.py:52` `prefix="/admin"`,
   - `router.py:54` `prefix="/orphaned-items"`,
   - `router.py:55` `prefix="/lookups"`,
   - `router.py:56` `prefix="/activity-log"`,
   - `router.py:57` `prefix="/riskhub"`.
   (17 prefix entries.)

2. **Module-owned prefix** (router.py omits prefix; sub-router declares it):
   - `router.py:34` `health.router` — no prefix; routes use literal
     `/livez`, `/readyz`, `/health`.
   - `router.py:40` `issues.router` — no prefix; sub-router/sub-modules add
     `/issues...` per file.
   - `router.py:42` `vendor_links.router` — no prefix; routes hard-code
     `/vendors/...`.
   - `router.py:43` `vendor_reports.router` — no prefix; routes hard-code
     `/vendor-reports/...` (per `vendor_reports.py:122,129,155`).
   - `router.py:44` `risk_questionnaires.risk_router` — prefix declared at
     `risk_questionnaires/__init__.py:8` (`/risks`).
   - `router.py:49` `kris.router` — prefix declared at
     `kris/crud/list.py:23` (`prefix="/kris"`).
   - `router.py:53` `directory.router` — prefix declared at
     `directory.py:24` (`prefix="/directory"`).
   - `router.py:58` `riskhub_questionnaires.router` — prefix declared at
     `riskhub_questionnaires.py:14` (`/riskhub/questionnaires`).
   - `router.py:59` `preferences.router` — prefix declared at
     `preferences.py:12` (`/preferences`).
   - `router.py:60` `risk_questionnaires.router` — prefix declared at
     `risk_questionnaires/__init__.py:7` (`/questionnaires`).

3. **Inconsistent tag patterns:** some are `tags=["..."]` at aggregator
   (e.g. line 36 `tags=["users"]`); some omit tags here because the
   sub-module already declares them (`directory.router` carries
   `tags=["directory"]`); some are tagged at both levels (riskhub).

Registry seam observation: `router.py` has no canonical mapping
`{prefix → tags → module}`. The mixed pattern means a future endpoint
addition has 3 valid places to declare the prefix. A registry would either
be a TOML/Python data structure that
`scripts/architecture` or an invariant test could lock so that only one
place owns a prefix.

Existing related lock: `tests/backend/pytest/architecture/test_w3_gate_snapshot.py`
already walks `api_router.routes` and asserts 4 specific
`(method, path) → required capability` mappings. A path-prefix registry
could be a new sibling lock without colliding with W3.

---

## Item #49 — Control execution monitoring wrapper (S2.2)

**Verdict: CONFIRM (developer Accept stands, P2; inline wrapper, update
lock).**

Evidence:

- Wrapper: `backend/app/services/_control_execution/monitoring.py` (12
  lines, 1 function).
- Body of `load_control_execution_monitoring_context`
  (`monitoring.py:9-11`):
  ```python
  async def load_control_execution_monitoring_context(db: AsyncSession) ->
      MonitoringResponseContext:
      now = utc_now()
      return await load_monitoring_response_context(db, now=now, today=now.date())
  ```
  This is a 2-line shim that pins `now`/`today` defaults and forwards to
  the canonical `load_monitoring_response_context` from
  `app.services._monitoring_response`.
- Callers (verified): `backend/app/services/_control_execution/link_governance.py:62`,
  `:91`, `:141`, `:170` — 4 call sites.
- Lock that gates it:
  `tests/backend/pytest/test_architecture_deepening_contracts.py:188`
  `assert hasattr(monitoring, "load_control_execution_monitoring_context")`
  and `:192` `assert "from app.services._control_execution.monitoring" in
  governance_source`. This pins both the helper's existence and the import
  path. Inlining requires deleting/updating both assertions.
- The wrapper exists only because callers don't want to write `now=utc_now()`
  twice. Inlining at 4 sites adds 4 × 1 line = trivial; removing wrapper
  shrinks the package surface.

---

## Item #58 — Orphaned item facade + static-method class (S8.3)

**Verdict: CONFIRM (developer Accept-with-mod stands, P3).**

Evidence:

- Facade: `backend/app/services/orphaned_item_service.py` (8 lines, full
  contents):
  ```python
  """Service for managing orphaned items (risks/controls without owners)."""
  from app.services._orphaned_items.service import OrphanedItemService
  __all__ = ["OrphanedItemService"]
  ```
  Pure re-export.
- Importers of the facade:
  - `backend/app/api/v1/endpoints/orphaned_items.py:25`
    `from app.services.orphaned_item_service import OrphanedItemService`.
  - (Other tests/services may import directly from
    `app.services._orphaned_items.service`.)
- Static-method class:
  `backend/app/services/_orphaned_items/service.py:20`
  `class OrphanedItemService:`. Lines 23-80 contain 8 `@staticmethod`
  methods. Each method is a 1-line passthrough to a module-level function:
  - `service.py:23-25` `flag_orphaned_items` → `_flag_orphaned_items` (line
    10).
  - `service.py:27-29` `_get_fallback_owner_id` → `_get_fallback_owner_id`
    (line 15).
  - `service.py:31-33` `scan_uncategorised_items` →
    `_scan_uncategorised_items` (line 11).
  - `service.py:35-40` `get_pending_orphans` → `_get_pending_orphans` (line
    13).
  - `service.py:42-44` `get_orphan_stats` → `_get_orphan_stats` (line 17).
  - `service.py:46-62` `resolve_orphan` → `_resolve_orphan` (line 16).
  - `service.py:64-76` `get_pending_orphans_with_details` →
    `_get_pending_orphans_with_details` (line 14).
  - `service.py:78-80` `get_orphan_detail` → `_get_orphan_detail` (line 12).
- Underlying functions live in sibling files
  (`flagging.py`, `reads.py`, `resolution.py`, `stats.py`); package README
  at `backend/app/services/_orphaned_items/README.md` describes them.
- Endpoint usage of the static-method API:
  `backend/app/api/v1/endpoints/orphaned_items.py:45`
  `await OrphanedItemService.scan_uncategorised_items(db)`;
  `:70, 119, 120, 147, 164, 187, 195` — 7 dotted call sites.

The static-method class adds zero behavior; it is a namespace facade. The
8 methods could be replaced by direct imports of the 8 module functions
without touching their bodies.

---

## Item #59 — Control monitoring package consolidation (S2.10)

**Verdict: CONFIRM (developer Accept-with-mod stands, P3; sequence after
shim cleanup).**

Evidence — multiple `_monitoring_*` packages exist:

- `backend/app/services/_monitoring_response/` — directory (per
  `_monitoring_response.py` shim importing from it; full directory not
  inspected here).
- `backend/app/services/_monitoring_status/` — directory containing
  (`config.py`, `controls.py`, `kris.py`, `queries.py`, `types.py`,
  `__init__.py`, `README.md`).
- `backend/app/services/_control_execution/monitoring.py` — single-file
  wrapper (#49 above).

Consolidation target observation:

- `_monitoring_response` is a projection/serialization layer (returns
  `MonitoringResponseContext` and serializers — see shim re-exports at
  `endpoints/_monitoring_response.py:3-13`).
- `_monitoring_status` is a status/state layer (per file names: `controls`,
  `kris`, `queries`).
- `_control_execution/monitoring.py` only forwards to `_monitoring_response`.
- After #17 (shim deletion) and #49 (wrapper inline), the natural target is
  to merge `_monitoring_status` into `_monitoring_response` (both serve
  the monitoring use-case for the controls/KRIs read paths) OR keep them
  separate by naming convention (`_monitoring_response` = projection,
  `_monitoring_status` = state queries). The current packages have
  overlapping vocabulary ("monitoring") with different responsibilities.

This is exactly the "after shim cleanup" sequencing the developer flagged.

---

## Item #63 — Outbox dispatch SchedulerJobRun instrumentation (BE-N7)

**Verdict: CONFIRM (developer Accept-with-mod stands, P3; preserve admin
runtime state).**

Evidence:

- Dispatcher: `backend/app/services/outbox/dispatcher.py` (110 lines).
- `SchedulerJobRun` is **not** imported or referenced in `dispatcher.py`
  (`grep` returns no hits in this file).
- Caller: `backend/app/core/scheduler_jobs.py:114`
  `async def run_outbox_dispatch() -> None:`; docstring (line 115)
  `"""Dispatch queued outbox events without flooding the scheduler run
  ledger."""`.
- The runtime state is mutated in-process via
  `scheduler_jobs.py:120-122,129-131,136-138`:
  - `_outbox_dispatch_state["last_started_at"] = started_at.isoformat()`
  - `_outbox_dispatch_state["last_status"] = "running"|"succeeded"|"failed"`
  - `_outbox_dispatch_state["last_processed"] = processed`
  - `_outbox_dispatch_state["last_error"] = str(exc)`
- All other scheduler jobs use `execute_tracked_job(...)` which wraps
  `SchedulerJobRun` insertion (per `scheduler_jobs.py:47, 57, 67, 86, 100,
  111`). Outbox is the lone exception:
  - `kri_deadline_check`: `execute_tracked_job("kri_deadline_check", ...)`.
  - `questionnaire_deadline_check`: ditto.
  - `issue_deadline_check`: ditto.
  - `ad_deprovision_check`: ditto.
  - `sso_jwks_refresh`: ditto.
  - `orphan_scan`: ditto.
  - `outbox_dispatch`: in-memory `_outbox_dispatch_state` only (no
    `SchedulerJobRun` row).
- Admin surface that consumes the runtime state:
  `backend/app/core/scheduler.py:26`
  `get_outbox_dispatch_runtime_state` (re-exported); used by admin console
  endpoints (per `endpoints/admin/console.py` listing,
  `GET /admin/outbox/status` line 58 in Phase 1 mapping).
- `SchedulerJobRun` model exists (per
  `app.models.scheduler_job_run.SchedulerJobRun`, used at
  `backend/app/api/v1/endpoints/orphaned_items.py:33-41` to read latest
  scan).
- Constraint per developer: do not lose the admin outbox runtime state
  surface (the `_outbox_dispatch_state` dict is read by admin).
  Instrumentation should be **additive** (write `SchedulerJobRun` rows
  AND keep the in-memory state) rather than replacing.

Reason `outbox_dispatch` was left out of the tracked-job ledger (per
docstring quote `dispatcher.py` ledger comment): "without flooding the
scheduler run ledger" — the dispatch interval is short
(`OUTBOX_DISPATCH_INTERVAL_SECONDS`, default value not inspected here) so
naive insertion would balloon the run ledger. Any
SchedulerJobRun-instrumented variant must address this rate concern (e.g.,
only record runs that actually processed events, or roll up windows).

---

## Cross-cuts and follow-ups visible from this domain

- **#10 ↔ #38 sequencing:** keep the questionnaire route (#10), but move
  its 3 inline schemas under #38 to `backend/app/schemas/riskhub.py` (or
  `risk_questionnaire.py`). This satisfies both findings cleanly.
- **#17 ↔ #49 ↔ #59 sequencing:** developer's "after shim cleanup" applies.
  Drop `endpoints/_monitoring_response.py` shim first (#17), inline the
  `_control_execution/monitoring.py` wrapper next (#49), then revisit the
  `_monitoring_response` vs `_monitoring_status` package split (#59).
- **#15 catalog gap is doc-track only:** the gap is in
  `docs/security/capability-catalog.json`. Per orchestrator override, doc
  Reject arguments are overruled — but #15 is `Accept` already, so this
  just confirms.
- **#44 path-prefix registry interacts with W3 gate snapshot
  (`test_w3_gate_snapshot.py`):** any new registry-based assertions must
  not weaken the existing 4 `(method, path) → capability` checks.
- **#43 must preserve `_audit_matrix.toml` × `test_w7_audit_adapter_
  completeness_red.py:33` lock:** every `(module, function)` row needs a
  module-level `def` of that exact name to pass the lock. Helper extraction
  is therefore additive, not a wrapper-hides-def refactor.
- **#12 narrowing intersects ADR-003:** the `DomainError` taxonomy is the
  authoritative seam (`AuthorizationError` for `_can_view_governance`;
  `(NotFoundError, AuthorizationError, ValidationError)` or umbrella for
  the questionnaire-inbox path). `app.core.exceptions.EXCEPTION_REGISTRY`
  is locked by
  `tests/backend/pytest/architecture/test_w4_exception_registry_completeness_red.py`.

---

End of Phase 2 Loop A endpoint domain verification.
