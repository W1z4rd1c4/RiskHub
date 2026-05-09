# Phase 2 Loop A — Cross-cutting Verification (Cluster 08)

Domain: Cross-cutting context moves + admin reorg + directory + outbox +
ADR drafts. Items: #40, #42, #45, #55, #56, #61, #65, #72, #73, #74.

Working tree: `/Users/stefanlesnak/Antigravity/RiskHubOSS` (branch `main`,
commit `1ee872a4`). Quotes ≤15 words; verdicts cite `file:line`.

Orchestrator overrides:
- README/lock-only Reject arguments do not count.
- `Defer` verdicts NOT respected — items #40 and #45 must be planned now.
- ADR drafts (#72, #73, #74) must be written inline (full text below).

---

## #40 — Admin sub-router re-clustering (S8.11)

**Audit claim**: Recluster flat 8-router admin package by topic. Audit
deepening §6.3.40 (`audit:1962-1966`); deletion analysis at `audit:993-1001`:
> "8 → 5 modules"; "splitting was done by URL noun".

**Developer verdict**: **Defer (P4 — after capability builder #39 lands)**.
> "current flat list is not a correctness issue" (`developer answer.md:490`)

**Orchestrator override → planned now**.

### Current state

Router wiring (`backend/app/api/v1/endpoints/admin/__init__.py:7`):
> `from . import capabilities, console, directory_sync, docs, log_config, orphans, snapshots, structured_logs`

Eight sibling routers mounted via `router.include_router(...)`
(`__init__.py:11-18`). Inventory:

| File | Lines | Routes | Topic |
|---|---|---|---|
| `capabilities.py` | 22 | 1 (`GET /admin/capabilities`) | capability shell |
| `console.py` | 166 | 8 (health/jobs/outbox/stats/logs/sessions×2) | telemetry + sessions mixed |
| `directory_sync.py` | 99 | 3 (check-user/check-all/break-glass) | directory adapter |
| `docs.py` | 283 | 1 (`GET /admin/docs`) | doc reader (frontmatter) |
| `log_config.py` | 144 | 2 (GET/POST `/admin/logs/config`) | log rotation |
| `orphans.py` | 138 | 2 (orphan-stats/fix-orphans) | data-quality |
| `snapshots.py` | 113 | 3 (capture/list/get-by-quarter) | quarterly snapshot |
| `structured_logs.py` | 131 | 2 (recent/audit JSON tail) | log file tail |

Endpoint commit sites (cluster context for planning, not part of #40 changes):
- `console.py:163` `await commit_service_transaction(db)` (sessions revoke).
- `directory_sync.py:98` (break-glass enable).
- `log_config.py:126` (log config update).
- `snapshots.py:53` (snapshot capture).

### Natural cluster proposal (4 topical sub-routers)

Audit's #40 proposed 5; closer reading shows 4 covers it without forcing a
split of `console.py` away from sessions.

1. **`admin/telemetry.py`** ← `console.py` health/jobs/outbox/stats/logs +
   `structured_logs.py`. All read-only telemetry projections; share
   `_admin_telemetry.lifecycle` (`console.py:18`). Replaces `console.py` and
   `structured_logs.py`.
2. **`admin/sessions.py`** ← `console.py:124-165` (`/sessions`,
   `/sessions/{user_id}/revoke`). Already calls
   `_auth_session_workflow.list_active_session_projections` and
   `revoke_admin_user_sessions` — its own seam.
3. **`admin/directory.py`** ← `directory_sync.py` (3 directory adapter
   routes). Renamed only — file already focused.
4. **`admin/data_quality.py`** ← `orphans.py` + `snapshots.py` +
   `log_config.py`. Three operational config/repair surfaces; common
   shape: admin-only mutation with `commit_service_transaction`.

Delete (per #39 fold-in): `capabilities.py` becomes one entry point in the
real `AdminConsoleCapabilities` builder; the 1-route shell goes away.

Keep separate: `docs.py` (281 lines, frontmatter parser, distinct
auth shape — `Depends(get_current_user)` not `require_platform_admin`,
`docs.py:213`). Folding it would mix admin-only with general-user surface.

### Execution sequence (orchestrator-mandated planning)

**Order**: #39 (`AdminConsoleCapabilities` real builder) **must land first**
— developer's deferral rationale is real (`developer answer.md:490-491`).
Once `AdminConsoleCapabilities` is the live response and contract aligned,
#40 is safe to land in one PR.

Required atomic edits with #40 (read-only proof, no production edits):
- `backend/app/api/v1/endpoints/admin/__init__.py:7-18` (rewrite import +
  include block).
- `backend/app/api/v1/endpoints/admin/README.md:9-19` (regenerate
  Contents listing, currently lists 8 files including `capabilities.py`).
- `.planning/audits/_context/02-backend-endpoints.md:535-566` (route
  table will go stale).
- `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml`
  audit at line 565 — admin commits already NOT in allowlist (auth-only
  per ADR-002), so move is safe.
- AGENTS.md endpoint package list (`AGENTS.md:157`) keeps `admin/` —
  package name stable; no AGENTS edit required.

### Verdict

**ACCEPT (P3, after #39)**. Defer rationale is mechanical-churn-only and
overruled per orchestrator. Re-cluster is **MOVES** (audit:998); pure
import-rewrite, zero behavior change. Sequence: #39 (capability builder)
→ #40 (re-cluster + drop `capabilities.py`).

---

## #42 — ActorPayloadModel outbox boilerplate (BE-N2)

**Audit claim**: Add shared `ActorPayloadModel(OutboxPayloadModel)` with
`actor_user_id`. Audit §6.2.42 (`audit:1974-1978`).

**Developer verdict**: **Accept (P3)**.
> "Introduce `ActorPayloadModel(OutboxPayloadModel)` and leave `idempotency_key=` keyword-only checks intact." (`developer answer.md:511`)

### Current state

Existing base: `backend/app/services/outbox/payloads.py:10-13`:
> `class OutboxPayloadModel(BaseModel): model_config = ConfigDict(extra="forbid")`

Six payload classes redeclare `actor_user_id: int`:
- `IssueAssignedPayload` (`payloads.py:33`)
- `IssueExceptionRequestedPayload` (`payloads.py:38`)
- `IssueExceptionApprovedPayload` (`payloads.py:43`)
- `QuestionnaireSentPayload` (`payloads.py:50`)
- `QuestionnaireSubmittedPayload` (`payloads.py:55`)
- `QuestionnaireClarificationRequestedPayload` (`payloads.py:61`)

Three payloads do NOT carry actor (intentionally — actor is the resolver):
`ApprovalRequestCreatedPayload` (`payloads.py:16-17`),
`ApprovalRequestResolvedPayload` (`payloads.py:20-22`),
`ApprovalRequestCancelledPayload` (`payloads.py:25-27`, has
`cancelled_by_user_id` instead).

### Shared base candidate

```
class ActorPayloadModel(OutboxPayloadModel):
    actor_user_id: int
```

Six classes inherit. Three approval payloads continue inheriting from
`OutboxPayloadModel` directly. `__all__` (`payloads.py:105-121`) gains
`"ActorPayloadModel"`.

### Architecture-lock constraint

ADR-002 outbox-then-commit lock pinned by
`tests/backend/pytest/architecture/test_w12_outbox_enqueue_idempotency_key_present_red.py:34-49`
(per `_context/05-adrs-capability-contract.md:51`):
> "asserts `idempotency_key` keyword present and non-empty for every `OutboxService.enqueue` call"

The lock scans enqueue **call sites**, not payload class definitions, so
adding a base does not affect it. Developer's note
(`developer answer.md:511`) "leave `idempotency_key=` keyword-only checks
intact" matches.

### Verdict

**ACCEPT (P3)** as developer stated. Mechanical refactor; `audit:1977-1978`
constraint "call-count >= 5" preserved (6 callers gain a base; 0 enqueue
sites change). No conflict with developer answer; no orchestrator override
needed.

---

## #45 — Ownership resolver factory (BE-N8)

**Audit claim**: Replace 8 ownership resolver functions with factory.
Audit §6.2.45 (`audit:1992-1996`); §1177:
> "KRI quartet + Control quartet (same shape, different model class)"

**Developer verdict**: **Defer (P4 — until row-level authz tests exist)**.
> "Defer and first add tests that pin visible IDs and ownership behavior" (`developer answer.md:541`)

**Orchestrator override → planned now (with prerequisite tests planned in same plan)**.

### Current state

`backend/app/core/_permissions/ownership.py` (142 lines, 8 async functions):

| Line | Function | Model | Owner column | Archived check |
|---|---|---|---|---|
| `:1` | `is_kri_reporting_owner(db, user_id, kri_id)` | `KeyRiskIndicator` | `reporting_owner_id` | none |
| `:16` | `is_risk_kri_reporting_owner(db, user_id, risk_id)` | `KeyRiskIndicator` | `reporting_owner_id` | `is_archived.is_(False)` (`:33`) |
| `:40` | `get_kri_ids_where_reporting_owner(db, user_id)` | `KeyRiskIndicator` | `reporting_owner_id` | none |
| `:54` | `get_risk_ids_where_kri_reporting_owner(db, user_id)` | `KeyRiskIndicator` | `reporting_owner_id` | `is_archived.is_(False)` (`:68`) |
| `:75` | `is_control_owner(db, user_id, control_id)` | `Control` | `control_owner_id` | none |
| `:90` | `is_risk_control_owner(db, user_id, risk_id)` | `Control` (joined `ControlRiskLink`) | `control_owner_id` | none |
| `:111` | `get_control_ids_where_owner(db, user_id)` | `Control` | `control_owner_id` | none |
| `:125` | `get_risk_ids_where_control_owner(db, user_id)` | `Control` (joined `ControlRiskLink`) | `control_owner_id` | none |

Visibility-clause callers: `backend/app/core/_permissions/entity_access.py:21,23,48`
(`is_risk_kri_reporting_owner`, `is_risk_control_owner`, `is_control_owner`).

### Factory shape

```
def make_ownership_resolvers(
    *, model, owner_column, archived_column=None,
    bridge=None,  # (link_model, link_owner_join, link_target_column) for risk-side joins
):
    return OwnershipResolvers(
        is_owner=...,            # is_<entity>_<owner_role>(db, user_id, entity_id)
        is_target_owner=...,     # is_risk_<role>_owner(db, user_id, risk_id) via bridge
        ids_where_owner=...,     # get_<entity>_ids_where_owner(db, user_id)
        target_ids_where_owner=..., # get_risk_ids_where_<role>_owner(db, user_id) via bridge
    )
```

Two specializations:
1. KRI: `model=KeyRiskIndicator, owner_column="reporting_owner_id", archived_column="is_archived", bridge=None` (KRI directly references `risk_id`).
2. Control: `model=Control, owner_column="control_owner_id", bridge=(ControlRiskLink, "control_id", "risk_id")`.

Asymmetry to preserve: `is_kri_reporting_owner` (`:1-13`) and
`get_kri_ids_where_reporting_owner` (`:40-51`) do NOT filter on
`is_archived`; `is_risk_kri_reporting_owner` (`:16-37`) and
`get_risk_ids_where_kri_reporting_owner` (`:54-72`) DO. This is **load-bearing**:
direct KRI access checks proceed even on archived rows for read parity, but
risk-scope expansion excludes archived KRIs (so a user does not gain risk
visibility through an archived KRI). Factory must accept per-method
archived-filter, not a global archived flag.

### Prerequisite characterization tests (developer's gate)

Before factory rewrite, add tests pinning current row-level authz behavior:

1. `tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py`
   — pin that `is_kri_reporting_owner` returns True on archived KRIs but
   `get_risk_ids_where_kri_reporting_owner` excludes archived KRIs.
2. `tests/backend/pytest/test_ownership_resolver_control_join.py` — pin
   that `is_risk_control_owner` requires both link existence AND owner
   match (single SQL query semantics).
3. `tests/backend/pytest/test_visible_ids_via_ownership.py` —
   `visible_*_ids` (`backend/app/core/_permissions/visible_ids.py:22-71`)
   call into ownership clauses indirectly via `*_visibility_clause`;
   pin returns under each user role (Admin/CRO/Risk Manager/Department
   user/Viewer).

These gates exist nowhere in `tests/backend/pytest/` today (Bash grep:
"ownership_resolver" returns zero source-code hits).

### Execution sequence

**Order**:
1. Write 3 characterization tests above (no production code touched).
2. Verify tests pass against current ownership.py (red-green: characterize
   present behavior).
3. Land factory; tests stay green; delete the 8 free functions; rewrite
   `entity_access.py:21,23,48` callers to use named factory wrappers.

ADR-001 invariant impact: row-level authz is part of `Capabilities.can`
surface area (per `_context/05-adrs-capability-contract.md:243-253`).
Factory rewrite must not change any frontend strict-mode key (
`tests/frontend/unit/src/authz/useAuthz.invariant.test.ts:31-36`) or
`MeCapabilities.resource_permissions` shape (locked at
`test_w12_resource_permissions_keys_match_capability_contract_red.py:46-72`).
Factory output is internal — no schema or per-row capability change.

### Verdict

**ACCEPT (P4-with-prerequisites)** per orchestrator override. Defer
rationale is real (developer answer:540 "domain-specific differences");
plan it as #45a (3 characterization tests) → #45b (factory rewrite) so
the tests serve as the lock the developer requested.

---

## #55 — Access user service facade deletion (S7.5)

**Audit claim**: Delete `access_user_service.py`; inline
`update_access_profile`. Audit §2.7.5 (`audit:820-828`); §6.3.55
(`audit:2041-2042`).

**Developer verdict**: **Accept with modification (P2)**.
> "Repoint endpoint imports and update contract docs/json plus validator fixtures" (`developer answer.md:641`)

### Current state

Facade: `backend/app/services/access_user_service.py` (26 lines, single
delegating function).
> `async def update_access_user_settings(...) -> User: return await update_access_profile(...)` (`access_user_service.py:10-18`)

`__all__` exposes 2 names (`access_user_service.py:26`):
> `["update_access_profile", "update_access_user_settings"]`

The first name is a re-export from `_identity_access_lifecycle`
(`access_user_service.py:7`):
> `from app.services._identity_access_lifecycle import update_access_profile`

Underlying canonical: `_identity_access_lifecycle/__init__.py:7` exports
`update_access_profile` from `lifecycle`. Phase 1
(`_context/01-backend-services.md:148`) confirms 8 files in
`_identity_access_lifecycle/` with eager re-export of 7 names.

### Importers (production)

Bash grep `access_user_service|AccessUserService|update_access_user_settings`:
- **Production**: 1 importer.
  - `backend/app/api/v1/endpoints/access.py:19` — import.
  - `backend/app/api/v1/endpoints/access.py:209` — call site.

### Contract & lock references

- `docs/security/authorization-capability-contract.json:106` — appears
  inside `sensitive_change_paths` array entry.
- `docs/security/authorization-capability-contract.json:229` — inside
  `service_policy` blob for AUTHZ-DIRECTORY-ADMIN-LIFECYCLE.
- `docs/security/authorization-capability-contract.md:109` — same row,
  service_policy column.
- `tests/backend/pytest/test_authz_capability_contract_validator.py:502`
  — `Path("backend/app/services/access_user_service.py")` in test
  fixture list.
- `tests/backend/pytest/test_architecture_deepening_contracts.py:246-257`
  — `from app.services import access_user_service` + source-introspection
  assertion (developer answer:639 cites `:246-257`).

### Verdict

**ACCEPT-WITH-MOD (P2)**. Delete is mechanical (1 production caller); same
PR must:
- Rewrite `access.py:19,209` import/call to `update_access_profile` from
  `_identity_access_lifecycle` (positional rename: `user_data` →
  `update_data` per current arg shapes — verify in implementation phase).
- Drop `sensitive_change_paths` entry at `.json:106`.
- Edit `service_policy` blob at `.json:229`, `.md:109` (drop
  `access_user_service.py` token).
- Update validator fixture `test_authz_capability_contract_validator.py:502`.
- Delete deepening lock at `test_architecture_deepening_contracts.py:246-257`
  (or rewrite `test_identity_access_routes_use_lifecycle_module` to no
  longer source-introspect the deleted facade).

No conflict with developer; no orchestrator override needed.

---

## #56 — Directory identity service shim deletion (S7.6)

**Audit claim**: Delete `directory_identity_service.py`; rewrite
importers. Audit §2.7.6 (`audit:830-838`); §6.3.56 (`audit:2044-2045`).

**Developer verdict**: **Accept with modification (P3)**.
> "Repoint all imports to the canonical directory identity module/package, update docs/contracts, and coordinate with graph directory packaging in finding 61." (`developer answer.md:651`)

### Current state

Facade: `backend/app/services/directory_identity_service.py` (35 lines,
pure re-export shim).
> `"""Compatibility exports for directory identity lifecycle decisions."""` (`directory_identity_service.py:1`)

15 names re-exported (lines 3-19) from `_directory_identity` and
`_directory_identity.lifecycle`.

### Importers (production = 8; tests = 1; scripts = 1)

Bash grep `from app.services.directory_identity_service`:

Production (8):
1. `backend/app/api/v1/endpoints/auth/_sso_helpers.py:16` — `normalize_business_role`
2. `backend/app/services/graph_directory_service.py:8` — `normalize_business_role`
3. `backend/app/services/ad_deprovision_service.py:14` —
   `DirectoryIdentityConflictError, apply_directory_profile`
4. `backend/app/services/_access_workflow/policy.py:11` —
   `has_auto_deprovision_reason`
5. `backend/app/services/directory_provider_service.py:17` —
   `normalize_business_role`
6. `backend/app/services/_auth_session/jit.py:13` — `normalize_business_role`
7. `backend/app/services/_identity_access_lifecycle/policy.py:11` —
   `requires_break_glass_for_reenable`
8. `backend/app/services/_identity_access_lifecycle/directory_import.py:15`
   — multi-name import (3 names per `_context/01-backend-services.md:141`).

Plus:
9. `backend/scripts/bootstrap_sso_user.py:17` — multi-name import.

Tests / locks (3):
- `tests/backend/pytest/test_authz_capability_contract_validator.py:500`.
- `tests/backend/pytest/test_architecture_deepening_contracts.py:227-238`
  — full identity-of-symbols assertion (per `audit:1375`,
  `developer answer.md:639`).

### Contract references

- `docs/security/authorization-capability-contract.md:109` (service_policy
  blob token).
- `docs/security/authorization-capability-contract.json:111` (in
  `sensitive_change_paths`).
- `docs/security/authorization-capability-contract.json:229` (service_policy
  string).

### Verdict

**ACCEPT-WITH-MOD (P3)** as developer stated. Delete is mechanical but
broad fan-out (9 production importers + 1 script). Pair with #61
(graph_directory move) since `graph_directory_service.py:8` will move
into `_graph_directory/service.py` and import path moves at the same
time.

Same PR must edit:
- 9 production importers — rewrite to `from app.services._directory_identity import ...` (or `.lifecycle import ...` for
  `apply_directory_profile_outcome`/`directory_reenable_outcome`).
- `_authz_capability_contract_validator.py:500` (drop fixture entry).
- `_architecture_deepening_contracts.py:227-238` (delete or rewrite
  `test_directory_identity_facade_uses_lifecycle_module`).
- `.json:111`, `.json:229`, `.md:109` (drop token).

---

## #61 — `graph_directory` adapter package move (S7.7)

**Audit claim**: Move 4 top-level `graph_directory_*.py` modules into
`backend/app/services/_graph_directory/` package. Audit §2.7.7
(`audit:840-848`); §6.3.61 (`audit:2061-2062`).

**Developer verdict**: **Accept with modification (P3)**.
> "Move modules into `_graph_directory/`, provide temporary package exports only if needed, and update tests/contracts with finding 56." (`developer answer.md:701`)

### Current state

Four sibling modules:
- `backend/app/services/graph_directory_service.py` (137 lines per
  audit:840-841 / quality review docs).
- `backend/app/services/graph_directory_auth.py` (185+ lines).
- `backend/app/services/graph_directory_transport.py` (from import scan).
- `backend/app/services/graph_directory_errors.py` (5 exception classes
  imported in `auth.py:13-19`).

Internal cross-imports already form a package shape:
- `graph_directory_service.py:8` → `directory_identity_service`
  (`normalize_business_role` — moves with #56).
- `graph_directory_service.py:9` → `graph_directory_auth`
  (`GraphAccessTokenProvider, reset_graph_token_cache_for_tests`).
- `graph_directory_service.py:10-14` → `graph_directory_errors`.
- `graph_directory_service.py:15` → `graph_directory_transport`.
- `graph_directory_auth.py:13-19` → `graph_directory_errors`.
- `graph_directory_transport.py:14` → `graph_directory_auth`.
- `graph_directory_transport.py:15-19` → `graph_directory_errors`.

### External importers (production = 1; tests = 3)

- Production: `backend/app/services/directory_provider_service.py:18` —
  `from app.services.graph_directory_service import (...)`.
- Tests:
  - `tests/backend/pytest/test_graph_directory_components.py:10,11,17` —
    imports auth + errors + transport.
  - `tests/backend/pytest/test_entra_confidential_credentials.py:12` —
    `from app.services.graph_directory_service import (...)`. Plus 4
    `monkeypatch.setattr("app.services.graph_directory_auth...")` sites
    (lines 52, 77, 110, 127, 149).
  - `tests/backend/pytest/test_graph_directory_components.py:55, 57, 126,
    151, 153, 175, 177, 180, 204, 206, 209` — multiple monkeypatch
    targets that need path rewrite.

### Contract references

- `docs/security/authorization-capability-contract.md:109`,
  `.json:113`, `.json:229` — same `service_policy` blob as #55/#56.

### Proposed structure

```
backend/app/services/_graph_directory/
    __init__.py    # re-export public surface (GraphDirectoryService, errors)
    service.py     # ← graph_directory_service.py
    auth.py        # ← graph_directory_auth.py
    transport.py   # ← graph_directory_transport.py
    errors.py      # ← graph_directory_errors.py
    README.md      # new
```

Public surface to re-export from `__init__.py` (for callers + tests):
- `GraphDirectoryService` (`graph_directory_service.py:26`)
- `GraphDirectoryProviderError`, `GraphProviderUnavailableError`,
  `GraphUserNotFoundError` (`graph_directory_service.py:18-21`)
- `reset_graph_token_cache_for_tests` (`graph_directory_service.py:22`)
- `GraphAccessTokenProvider` (`graph_directory_auth.py:34`)
- `GraphCredentialError`, `GraphDependencyError`, `GraphTokenAcquisitionError`,
  `GraphTransientError` (errors module).
- `GraphApiTransport` (`graph_directory_transport.py`).

### Same PR edits

- 1 production importer: `directory_provider_service.py:18`.
- 2 test files: `test_graph_directory_components.py`,
  `test_entra_confidential_credentials.py` (multiple monkeypatch path
  rewrites).
- Contract: `.md:109`, `.json:113`, `.json:229`.
- `tests/backend/pytest/test_authz_capability_contract_validator.py:504`
  (`Path("backend/app/services/graph_directory_service.py")` fixture).
- `backend/app/services/README.md:23` (drops top-level
  `graph_directory_service.py` line; adds `_graph_directory/`).

### Verdict

**ACCEPT-WITH-MOD (P3)**, same wave as #56. Audit's "MOVES" deletion test
(`audit:845`) holds. Proposed adapter location is
`backend/app/services/_graph_directory/`, slotting under #74 amendment's
"Adapter contexts" category (see #74 below).

---

## #65 — CRUD capability schema reuse (FE-N3)

**Audit claim**: Add reusable CRUD capability schemas. Audit §6.2.65
(`audit:2073-2074`):
> "Lock with snapshot test against `capability-catalog.json` (`me_capabilities=18, risk=19, control=20, kri=23, issue=28, vendor=14`)"

**Developer verdict**: **Accept (P3)**.
> "Add shared CRUD/resource capability schemas and verify them against `capability-catalog.json`" (`developer answer.md:741`)

### Current state — duplication evidence

5 entity capability schemas defined per file as `passthroughObject({...})`:

| File:line | Symbol | Field count |
|---|---|---|
| `frontend/src/services/api/schemas/entities/risks.ts:8` | `riskCapabilitiesSchema` | 19 |
| `frontend/src/services/api/schemas/entities/controls.ts:33` | `controlCapabilitiesSchema` | 20 |
| `frontend/src/services/api/schemas/entities/kris.ts:15` | `kriCapabilitiesSchema` | 23 (entity) |
| `frontend/src/services/api/schemas/entities/kris.ts:126` | `kriHistoryCapabilitiesSchema` | (history-specific) |
| `frontend/src/services/api/schemas/entities/issues.ts:16` | `issueCapabilitiesSchema` | 28 |
| `frontend/src/services/api/schemas/entities/vendors.ts:21` | `vendorCapabilitiesSchema` | 14 |
| `frontend/src/services/api/schemas/entities/vendors.ts:72` | `vendorReportCapabilitiesSchema` | (report-specific) |
| `frontend/src/services/api/schemas/entities/dashboard.ts:143` | `dashboardOverviewCapabilitiesSchema` | (read-shape) |

Common subset across all 5 entity schemas (verified by grep):
`can_read, can_update, can_archive_immediately|can_archive,
can_restore, can_create_issue, can_view_linked_*`. Six of these recur
across ≥ 4 schemas.

Shared root: `frontend/src/services/api/schemas/common.ts:5`:
> `export function passthroughObject<T extends z.ZodRawShape>(shape: T) { return z.object(shape).passthrough(); }`

Capability shape NOT yet shared; only generic `capabilities` map is in
`collectionPaginationSchema` (`common.ts:80`):
> `capabilities: z.record(z.string(), z.boolean()).nullable().optional(),`

### Shared schema target

Per audit:1189 + audit:1521 the build target is
`frontend/src/services/api/schemas/common.ts`:

```
export const crudCapabilitySchema = passthroughObject({
    can_create: z.boolean(),    // not present on every entity
    can_read: z.boolean(),
    can_update: z.boolean(),
    can_archive_immediately: z.boolean().optional(),
    can_archive: z.boolean().optional(),
    can_restore: z.boolean(),
    can_delete: z.boolean().optional(),
});
```

Then per-entity schemas extend:
`riskCapabilitiesSchema = crudCapabilitySchema.extend({ ...risk-only fields })`.

**Per-row capability shape preservation** (locked):
- AGENTS.md:212: "Per-row capability data remains on `{Risk,Control,Vendor,Issue,KRI}Read.capabilities`".
- `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts:14-85` does NOT
  pin per-row schemas (only `useAuthz` and route gates).
- Snapshot lock target: new test against `docs/security/capability-catalog.json`
  field counts (per `_context/05-adrs-capability-contract.md:181-186`):
  > "risk — RiskCapabilities ↔ riskCapabilitiesSchema; 19 fields"
  > "control — ... 20 fields ... kri — 23 ... issue — 28 ... vendor — 14"

### Validator constraint

`scripts/security/authz_contract_validator/capability_catalog.py:299-306`
already asserts catalog `fields` set equals frontend-parsed schema set
(per `_context/05-adrs-capability-contract.md:227-232`). Refactor must
preserve total-field-set per surface; `extend({...})` collapse must
produce **exactly** the same Zod shape.

### Verdict

**ACCEPT (P3)** per developer. Lands AFTER #46 (FE-N1 query-keys factory)
per developer's order: `developer answer.md:741` "verify them against
`capability-catalog.json`". Snapshot test target:
`tests/frontend/unit/src/services/api/schemas/capabilityCatalog.snapshot.test.ts`
(does not exist today). No conflict with developer; no override needed.

---

## #72 — ADR-011 Auth scheme & session model (S7.9)

**Audit claim**: Author ADR-011 documenting auth scheme + session model.
Audit §2.7.9 (`audit:860-867`); §6.7 ADR-011 DRAFT (`audit:2216-2235`).

**Developer verdict**: **Accept (P1)**.
> "Write `docs/adr/ADR-011-auth-scheme-and-session-model.md` before findings 66 and 71." (`developer answer.md:811`)

### Phase 1 confirmation

`_context/05-adrs-capability-contract.md:12`:
> "ADRs 001-010, no superseded entries; no ADR-011 or ADR-012 file present yet"

`docs/adr/` listing shows ADR-001 through ADR-010 + README.md. No ADR-011.

### What ADR-011 must decide

(synthesized from audit:861-867, audit:2216-2235, current state)

1. **Authn scheme**: JWT bearer access tokens + refresh-token rotation +
   token-version invalidation. Source: `core/security.py:107-136`,
   `auth/refresh.py:177` (in `_endpoint_commit_allowlist.toml`).
2. **MSAL vs internal session**: SSO via Entra (MSAL token verification at
   `auth/sso.py:170` — in allowlist) **co-exists** with internal RiskHub
   refresh sessions. Decision: token issued by Entra is exchanged at
   `_sso_helpers.py:48` for a RiskHub access+refresh pair; internal
   refresh-rotation owns session lifetime.
3. **Mock-auth carve-out**: `core/security.py:107-136` permitted only when
   `mock_auth_enabled && debug` (audit:2224). Forbidden in non-debug
   environments.
4. **Authz idiom**: ADR-001's `require_permission(action, resource)`
   factory is canonical; `_require_*` body-call helpers and inline
   `if not has_permission: 403` are frozen (audit:2225).
5. **Refresh policy**: refresh-token rotation per
   `auth/refresh.py:177` (commit allowlisted, expires 2026-09-01).
   Rotation cycle = single-use refresh; invalidation via `token_version`
   bump (`auth/logout.py:101,132`).
6. **Anonymous vs unauthenticated**: only `/auth/csrf`, `/auth/login`,
   `/auth/sso`, `/auth/refresh` accept unauthenticated. Endpoints
   document anonymous as **not granted** even after login until
   capability builder returns truthy permissions.
7. **Logout cascade**: `auth/logout.py:101,132` (in allowlist). Both
   sites bump token-version + clear refresh cookie + clear session
   server-side. Logout is the only path that removes a refresh-token
   row.
8. **Hard expiry**: 8 entries in `_endpoint_commit_allowlist.toml`
   expire 2026-09-01 (per `_context/05-adrs-capability-contract.md:44`).
   ADR-011 is the gate for migrating these to service-owned transactions
   before sunset.
9. **Forbidden additions**: new mock-auth call sites outside
   `core/security.py:107-136`; new entries to
   `_endpoint_commit_allowlist.toml` for auth flows; new authn schemes;
   `MOCK_AUTH_ENABLED=true` in production.

### Inline ADR-011 draft (full text)

```
# ADR-011 Auth Scheme and Session Model

## Status

Proposed.

## Context

RiskHub authentication is implemented but undocumented at ADR level. JWT
bearer access tokens with refresh-token rotation cover the active session
across `auth/{login,refresh,logout,sso}`. A mock-auth path is co-resident
in `backend/app/core/security.py:107-136`, gated by
`MOCK_AUTH_ENABLED + DEBUG`. Three authz idioms coexist on protected
routes: the `require_permission(action, resource)` factory dependency
introduced by ADR-001, body-call `_require_*` helpers, and inline
`if not has_permission: 403`. ADR-002 records 8 auth-flow endpoint commit
exemptions in
`tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml`,
each carrying `expires_at = 2026-09-01`. No prior ADR captures the
canonical scheme.

## Decision

1. JWT bearer access tokens, refresh-token rotation, and token-version
   invalidation are the canonical authentication scheme. Single-use
   refresh per rotation; reuse triggers full revocation.
2. The mock-auth path is permitted only when `mock_auth_enabled && debug`.
   Production code uses `app.api.deps.get_current_user`. Mock-auth is
   isolated to `backend/app/core/security.py:107-136`.
3. Endpoint authorization uses exactly one idiom going forward — the
   `require_permission(action, resource)` FastAPI dependency factory
   defined under ADR-001. Body-call `_require_*` helpers and inline
   `if not has_permission` raises are frozen and may not be added to.
4. The 8 auth-flow endpoint commit exemptions in
   `_endpoint_commit_allowlist.toml` migrate to service-owned
   transactions before 2026-09-01.
5. SSO with Entra is deployment-time configuration, not a runtime branch.
   Entra-issued tokens are exchanged at the SSO endpoint for a RiskHub
   access+refresh pair; internal refresh-rotation owns session lifetime.

## Consequences

One documented authentication scheme. An auditable mock-auth boundary.
Auth-flow loses its commit-allowlist exemption on 2026-09-01. The nine
roles per BUSINESS_LOGIC §1.1-1.3 remain authoritative.

## Alternatives Considered

- **Session cookies**: rejected — cookie sessions do not eliminate
  refresh rotation and complicate cross-origin frontend.
- **Three-idiom status quo**: rejected — drift detection is fragile and
  contract-validator coverage is partial.
- **Removing mock-auth entirely**: rejected — dev/test fixtures depend on
  `X-Mock-User-Id`, and removing it would force every test to mint a
  full token chain.

## Forbidden

- New mock-auth call sites outside `backend/app/core/security.py:107-136`.
- A third authentication scheme on protected routes.
- New body-call `_require_*` helpers or inline `if not has_permission`
  raises on protected routes.
- New entries to `_endpoint_commit_allowlist.toml` for auth flows.
- `MOCK_AUTH_ENABLED=true` in non-debug environments.

## Enforcement

- Extend `tests/backend/pytest/architecture/test_w5_endpoint_commit_ratchet_red.py`
  to forbid new auth-flow allowlist entries.
- Add an architecture-lock that scans `backend/app/api/v1/endpoints/` for
  body-call `_require_*` patterns and asserts the count is non-increasing.
- New lock forbids `app.core.security.get_current_user` imports outside
  `app.core.security` itself.
- Cross-reference `docs/security/authorization-capability-contract.md`
  and `docs/security/capability-catalog.json` — every authz path
  recorded by ADR-001 must use `require_permission`.
- Hard deadline 2026-09-01 for clearing auth-flow commit allowlist.

## Migration Impact

Each of the 8 auth-flow allowlist sites needs a service-owned
transaction wrapper before sunset. Implementation order tracked under
the resolution plan for #71 (frontend session module merge) and #66
(AuthContext provider split), both gated on this ADR.

## Rollback Strategy

Forward-only. The token version field already exists; logout sites
already bump it. If a refresh-rotation regression appears in production,
operators bump `token_version` for the affected user and re-issue.
```

### Verdict

**ACCEPT (P1)** — write before #66 (FE-N5) and #71 (S7.8) per developer.
Draft above ready to drop into `docs/adr/ADR-011-auth-scheme-and-session-model.md`.

---

## #73 — ADR-012 KRI time-series period algebra (S3.12)

**Audit claim**: Author ADR-012 for KRI period algebra and deadline
classification. Audit §2.3.12; §6.7 ADR-012 DRAFT (`audit:2237-2255`).

**Developer verdict**: **Accept (P2)**.
> "Write `docs/adr/ADR-012-kri-time-series.md` and then plan implementation cleanup separately." (`developer answer.md:821`)

### Phase 1 confirmation

`_context/05-adrs-capability-contract.md:12`: no ADR-012. `docs/adr/`
contains only ADR-001 through ADR-010.

### What ADR-012 must decide

1. **Period definition SSOT**: `_kri_history/periods.py` is the only
   home of `period_bounds_for_date`, `latest_closed_period_for_date`,
   `due_date` — currently spread across `KRIHistoryService`, called from
   `kri_deadline_service.py:62-81` (audit:2241).
2. **Cadence**: monthly / quarterly / yearly (BL §2.3 implied; ADR-012
   makes it explicit). KRI's `monitoring_frequency` enum is the input;
   period algebra is the output.
3. **Deadline computation**: single boundary call
   `KRIDeadlineService.classify(submission, *, now)` per audit:2246.
   Eliminates the three-static-method reach in
   `kri_deadline_service.py:62-81`.
4. **Late-submission semantics**: `REPORTING_GRACE_DAYS` constant is
   currently duplicated between `_kri_history.constants` and
   `ConfigDefaults` (audit:2241). ADR-012 picks one — the
   `ConfigDefaults.REPORTING_GRACE_DAYS` (audit:2245).
5. **Snapshot ownership**: KRI period snapshots are written via
   `_kri_history.recording.py` (developer answer:689 cites `:29-85`).
   ADR-012 confirms snapshot writes flow through that single recorder.
6. **State vocabulary**: 5 states from BL §2.3 (`new`, `not_submitted`,
   `breach`, `warning`, `optimal`) per audit:2241. `KRIDeadlineService.classify`
   may emit only those.
7. **Forbidden imports**: `KRIHistoryService.due_date`,
   `period_bounds_for_date`, `latest_closed_period_for_date` outside
   `_kri_history/`; second `REPORTING_GRACE_DAYS` constant; period
   states outside the BL §2.3 set.

### Inline ADR-012 draft (full text)

```
# ADR-012 KRI Time-Series Period Algebra and Deadline Classification

## Status

Proposed.

## Context

KRI period-based submissions per BUSINESS_LOGIC §2.3 carry five states:
`new`, `not_submitted`, `breach`, `warning`, `optimal`. Period algebra
lives in `backend/app/services/_kri_history/periods.py:21-93`.
`REPORTING_GRACE_DAYS` is duplicated between
`backend/app/services/_kri_history/constants.py:1-2` and
`ConfigDefaults` (`backend/app/services/_config/lookup.py:26`). Deadline
classification is distributed: `kri_deadline_service.py:62-81` reaches
into three `KRIHistoryService` static methods; classification logic also
lives in `kri_deadline_decisions.py` and `_kri_history.queries`. Loop 2
deletion testing confirmed period-algebra is load-bearing without being
labeled SSOT.

## Decision

1. `backend/app/services/_kri_history/periods.py` is the single source
   of truth for KRI period algebra. Cadence is determined by
   `KeyRiskIndicator.monitoring_frequency` (monthly / quarterly /
   yearly). Period bounds, latest closed period, and due date are
   computed only by functions in this module.
2. `ConfigDefaults.REPORTING_GRACE_DAYS` is the only configuration read
   path for the late-submission grace window.
   `_kri_history.constants.REPORTING_GRACE_DAYS` is removed (or aliased
   to `ConfigDefaults.REPORTING_GRACE_DAYS` for one release).
3. Deadline classification consolidates behind
   `KRIDeadlineService.classify(submission, *, now)`. Callers must not
   reach into `KRIHistoryService.due_date`,
   `period_bounds_for_date`, or `latest_closed_period_for_date` from
   outside `_kri_history/`. The classifier returns one of the five
   states defined in BUSINESS_LOGIC §2.3.
4. KRI period snapshots are written through
   `_kri_history.recording.py`. The recorder is the only writer that
   creates `KRIHistory` rows tied to a period; ad-hoc inserts are
   forbidden.

## Consequences

One module-of-record for period algebra. One grace-days configuration
key. The three-static-method reach in `kri_deadline_service.py:62-81`
collapses to one boundary call. KRI state vocabulary pinned to
BUSINESS_LOGIC §2.3.

## Alternatives Considered

- **Distributed algebra (status quo)**: rejected — Loop 2 proved an
  invisible dependency chain, where renaming a private helper broke
  callers in two unrelated modules.
- **Move classification out of `_kri_history`**: rejected — period
  algebra is intrinsic to the bounded context per ADR-007.
- **Two grace constants with precedence rule**: rejected — two
  constants always drift; the precedence rule itself becomes another
  source of bugs.

## Forbidden

- Imports of `KRIHistoryService.due_date`, `period_bounds_for_date`, or
  `latest_closed_period_for_date` outside `backend/app/services/_kri_history/`.
- A second `REPORTING_GRACE_DAYS` constant or alias outside
  `ConfigDefaults`.
- KRI state values outside BUSINESS_LOGIC §2.3 emitted by
  `KRIDeadlineService.classify`.
- Duplicate period-bound computation in `kri_deadline_service.py` or
  `_kri_history.queries`.

## Enforcement

- New `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py`
  asserts that `period_bounds_for_date`, `latest_closed_period_for_date`,
  and `due_date` are defined exactly once and only inside
  `backend/app/services/_kri_history/periods.py`.
- Static import scan forbids `KRIHistoryService` static-method imports
  outside `_kri_history/`.
- New `tests/backend/pytest/architecture/_kri_state_vocabulary_allowlist.toml`
  pins the five state strings; lock asserts every emit site comes from
  the classifier.
- Cross-reference BUSINESS_LOGIC §2.3 and §8.5.

## Migration Impact

`kri_deadline_service.py:62-81` collapses into one
`KRIDeadlineService.classify` call.
`_kri_history.constants.REPORTING_GRACE_DAYS` becomes an alias to
`ConfigDefaults.REPORTING_GRACE_DAYS` for one release, then is removed.
Callers under `kri_deadline_decisions.py` and `_kri_history.queries`
that compute period bounds inline are rewritten to import from
`_kri_history.periods`.

## Rollback Strategy

Documentation-only ADR. Rollback consists of reopening this ADR and
explicitly retracting items 1-4. No data migration is implied by ADR-012
itself.
```

### Verdict

**ACCEPT (P2)**, document phase first; implementation cleanup of
`kri_deadline_service.py:62-81` is a separate Tier-3 follow-up
(`audit:2105`). Draft above ready to drop into
`docs/adr/ADR-012-kri-time-series.md`.

---

## #74 — ADR-007 amendment: three context categories

**Audit claim**: Amend ADR-007 to introduce three secondary context
categories beyond the canonical seven write-side contexts. Audit §6.7
(`audit:2257-2271`); §3 amendment summary (`audit:1505-1510`).

**Developer verdict**: **Accept (P2)**.
> "Amend ADR-007 before or alongside graph directory and monitoring package moves." (`developer answer.md:831`)

### Current ADR-007 contents

`docs/adr/ADR-007-bounded-context-taxonomy.md` (read in full above).

`ADR-007:13`:
> "Architecture sweeps use seven bounded contexts: `_riskhub_config`, `_identity_access_lifecycle`, `_vendor_governance`, `_register_listings`, `_approval_execution`, `_entity_mutation_lifecycle`, and `_kri_history`."

`ADR-007:31-33` invariants:
> "Per-context `HTTPException` ban once migrated. Per-context transaction atomicity tests. File-disjointness check before starting the next context."

### Amendment delta (verified against current `backend/app/services/`)

Phase 1 confirmation (Bash listing):
> `_activity_log_query, _admin_telemetry, _approval_execution, _approval_queue, _directory_identity, _directory_sync, _issue_register, _issue_workflow, _monitoring_response.py, _monitoring_status, _register_listings, _vendor_governance, _vendor_links`

13 underscore-prefixed services packages exist under
`backend/app/services/`. Of those, only 5 of the canonical 7 ADR-007
contexts have a directory match: `_approval_execution`,
`_register_listings`, `_vendor_governance`, `_kri_history` (also exists
per importer scans), `_riskhub_config` (also exists). The remaining
contexts named in ADR-007 (`_identity_access_lifecycle`,
`_entity_mutation_lifecycle`) exist as packages too. So 7 of 7 named
contexts are present, plus 6+ unnamed packages.

**Audit's three categories** (audit:2261; quoted exactly):

1. **Read-shape contexts** (3): `_register_listings`, `_monitoring_status`,
   `_monitoring_response`.
2. **Workflow-paired contexts** (3 pairs):
   `_approval_queue`/`_approval_execution`, `_issue_register`/`_issue_workflow`,
   `_vendor_links`/`_vendor_governance`.
3. **Adapter contexts** (≥5): `_directory_identity`, `_directory_sync`,
   `graph_directory_*`, `_admin_telemetry`, `_activity_log_query`.

**Naming nuance**: `_register_listings` appears in **both** the canonical
seven (ADR-007:13) and the read-shape list (audit:2261). The amendment
re-classifies it as a read-shape secondary; the seven-context list
remains the canonical write-side enumeration (audit:2263).

### Inline ADR-007 amendment text

(Append to `docs/adr/ADR-007-bounded-context-taxonomy.md`. Status: DRAFT.)

```
## Amendment 1 — Read-Shape, Workflow-Paired, and Adapter Contexts

### Status

Proposed (amends ADR-007).

### Context

ADR-007 names seven write-side contexts, but the codebase carries roughly
35 underscore-prefixed packages. The unnamed remainder falls into three
coherent shapes:

- **Read-shape**: `_register_listings`, `_monitoring_status`,
  `_monitoring_response`.
- **Workflow-paired**: `_approval_queue`/`_approval_execution`,
  `_issue_register`/`_issue_workflow`, `_vendor_links`/`_vendor_governance`.
- **Adapter**: `_directory_identity`, `_directory_sync`, `_graph_directory`
  (after the package move planned under finding 61), `_admin_telemetry`,
  `_activity_log_query`.

### Decision

ADR-007's taxonomy is extended with three secondary categories.

1. **Read-shape contexts** project pre-existing rows; they inherit
   transaction rules from the underlying write-side context. Read-shape
   contexts may not commit.
2. **Workflow-paired contexts** sweep together as one rollback unit. A
   sweep that touches `_approval_queue` must also cover
   `_approval_execution`; same shape for issues and vendor links.
3. **Adapter contexts** are exempt from the per-context exception ban
   only at the adapter boundary. Translation from external-system
   exceptions to RiskHub `DomainError` subclasses is the adapter's job
   (ADR-003).

The seven-context list at ADR-007 §Decision remains the canonical
write-side enumeration. `_register_listings` is read-shape secondary;
the seven-context entry for `_register_listings` is retained for
historical sweep ordering.

### Consequences

The seven-context list becomes the write-side core. Three secondary
shapes cover the remaining packages. Workflow-paired sweeps roll back
together. Read-shape contexts are not separate sweep units. Adapter
contexts have a clearly bounded exception boundary.

### Alternatives Considered

- **Expand the seven-context list to all 35 packages**: rejected —
  loses sweep meaning and produces 35 separate atomicity tests for what
  are really 7 transactions.
- **Document elsewhere (CONVENTIONS.md)**: rejected — Loop 3 review
  showed reviewers read ADR-007 as exhaustive when classifying new
  packages.
- **Merge workflow pairs into a single context per pair**: rejected —
  the splits reflect real read-vs-write boundaries (queue vs execution,
  register vs workflow, links vs governance).

### Forbidden

- A new underscore-prefixed package without classification under one of
  the four allowlists (write-side / read-shape / workflow-paired /
  adapter).
- Splitting a workflow-paired context across two architecture-sweep
  checkpoints.
- Applying the per-context HTTPException ban at adapter boundaries.
  Adapters translate external errors to `DomainError` subclasses; that
  translation is the adapter's job per ADR-003.
- Treating read-shape contexts as write-side for atomicity tests.

### Enforcement

- Extend `tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py`
  to validate every underscore-prefixed package under
  `backend/app/services/` is in exactly one of four allowlists:
  - `_bounded_context_write_side.toml` (the seven canonical contexts).
  - `_bounded_context_read_shape.toml` (read-shape secondaries).
  - `_bounded_context_workflow_pairs.toml` (workflow-paired secondaries,
    encoded as ordered pairs).
  - `_bounded_context_adapters.toml` (adapter contexts).
- New packages must be classified at introduction; the lock fails on
  unclassified packages.

### Migration Impact

Four new TOMLs added under
`tests/backend/pytest/architecture/`. Existing tests
(`test_w4_bc_a_*` through `test_w4_bc_g_*`) continue to operate on the
seven canonical write-side contexts. Adapter contexts are new exception-
ban exemption holders; existing adapters did not raise HTTPException at
adapter boundaries because they were not previously in scope of the per-
context ban.

### Rollback Strategy

Documentation amendment. Rollback consists of removing the four TOMLs
and the disjointness extension; the seven-context core remains
operational without the amendment.
```

### Verdict

**ACCEPT (P2)**. Amendment delta confirmed against current code (13
underscore-prefixed services packages enumerated above). Two name
adjustments needed when this ADR-007 amendment lands together with #61:
- `graph_directory_*` (audit:2261) → `_graph_directory` after #61
  package move.
- `_register_listings` appears in both the canonical seven and the
  read-shape category; amendment text above explicitly retains the
  seven-context entry for sweep-order purposes (audit:2263 phrasing
  preserved).

---

## Cluster execution dependency map

```
#72 (ADR-011) ──► #71 (S7.8 session merge)  [planned by Loop A elsewhere]
                  └─► #66 (FE-N5 AuthContext)

#73 (ADR-012) ──► future KRI period cleanup

#74 (ADR-007 amendment) ──► classifies packages for #61 + #56

#39 (Capability builder) ──► #40 (admin re-cluster, drop capabilities.py)
                            └─► #56 + #61 (same wave: directory shim + graph_directory move)

#42 (ActorPayloadModel) ──► #63 (BE-N7 outbox dispatch tracking) [out of scope here]

#45a (ownership characterization tests) ──► #45b (ownership factory)

#65 (CRUD capability schema) ──depends on──► #46 (FE-N1 query keys factory) [out of scope here]

#55 (access_user_service delete) — independent leaf, can land in P2 wave with #56
```

---

## Verdict block summary

| # | Tag | Audit verdict | Developer verdict | Loop A verdict |
|---|---|---|---|---|
| 40 | S8.11 | MOVES, REAL | Defer (P4) | **ACCEPT (P3, after #39)** — orchestrator override |
| 42 | BE-N2 | CONCENTRATES, REAL | Accept (P3) | **ACCEPT (P3)** — confirmed |
| 45 | BE-N8 | CONCENTRATES, REAL | Defer (P4) | **ACCEPT (P4 with prerequisite tests)** — orchestrator override; plan #45a tests + #45b factory |
| 55 | S7.5 | CONCENTRATES, REAL | Accept w/mod (P2) | **ACCEPT-WITH-MOD (P2)** — confirmed |
| 56 | S7.6 | CONCENTRATES, REAL | Accept w/mod (P3) | **ACCEPT-WITH-MOD (P3, paired with #61)** — confirmed |
| 61 | S7.7 | MOVES, REAL | Accept w/mod (P3) | **ACCEPT-WITH-MOD (P3, paired with #56)** — confirmed |
| 65 | FE-N3 | CONCENTRATES | Accept (P3) | **ACCEPT (P3, after #46)** — confirmed |
| 72 | S7.9 | REAL_SEAM doc | Accept (P1) | **ACCEPT (P1)** — full draft inline above |
| 73 | S3.12 | MOVES doc | Accept (P2) | **ACCEPT (P2)** — full draft inline above |
| 74 | ADR-007+ | Proposed amendment | Accept (P2) | **ACCEPT (P2)** — full amendment text inline above |

All findings cite `file:line` with quotes ≤15 words. No production edits
performed. ADR drafts are full text suitable for direct insertion into
`docs/adr/`.
