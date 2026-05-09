# 06 — Test Surface Map (Phase 1 Context Load)

Canonical TDD pattern reference for the architecture-cleanup resolution plan. Every claim cites `file:line` with quoted source.

---

## 1. Pytest configuration

### 1.1 `backend/pytest.ini`

```
[pytest]
asyncio_mode = auto
testpaths = ../tests/backend/pytest
python_files = test_*.py
```
— `backend/pytest.ini:2-4`

`addopts = --strict-markers --cov=app --cov-report=term-missing ... --cov-fail-under=69 -p no:langsmith_plugin` — `backend/pytest.ini:7`.

Markers (also re-declared in `conftest.pytest_configure`):
- `postgres: Tests requiring PostgreSQL database (skip on SQLite)` — `backend/pytest.ini:9`
- `benchmark: Environment-sensitive performance benchmarks` — `backend/pytest.ini:10`
- `contract: Architecture, documentation, and repository invariant-lock tests` — `backend/pytest.ini:11`
- `slow`, `redis_integration` — `backend/pytest.ini:12-13`

The default Make target excludes the postgres marker:

```
'-m "not postgres and not benchmark"' in match.group("command")
```
— `tests/backend/pytest/architecture/test_makefile_postgres_lane_red.py:19` (asserts `scripts/Makefile` `test:` target keeps that filter).

There is **no project-level `pyproject.toml`** at the repo root; pytest configuration lives only in `backend/pytest.ini`. (Search across the working directory returns only vendored examples in `backend/venv/lib/.../stevedore/`.)

### 1.2 `pytest_configure` markers re-registration

```python
config.addinivalue_line("markers", "postgres: Tests that require PostgreSQL ...")
config.addinivalue_line("markers", "contract: Architecture, documentation ...")
```
— `tests/backend/pytest/conftest.py:185-198`. Re-adds the markers because pytest rootdir resolves to repo root.

---

## 2. Backend conftest pattern (`tests/backend/pytest/conftest.py`, 1159 lines)

### 2.1 Async DB harness

`TEST_DATABASE_URL = _normalize_async_database_url(os.environ.get("TEST_DATABASE_URL", "sqlite+aiosqlite:///:memory:"))` — `tests/backend/pytest/conftest.py:28`.

`_USING_POSTGRES = TEST_DATABASE_URL.startswith("postgresql")` — `conftest.py:66`.

Fixture `async_engine` (function scope) — SQLite branch uses `StaticPool`, creates all metadata, drops on teardown:
```
poolclass=StaticPool,
... await conn.run_sync(Base.metadata.create_all)
```
— `conftest.py:267-271`.

Postgres branch in same fixture relies on session-scoped `migrate_postgres_db` (`conftest.py:282-291`) which runs `command.upgrade(alembic_cfg, "head")`.

Per-test `db_session` (`conftest.py:294-310`):
```
async with async_session_maker() as session:
    if _USING_POSTGRES:
        ...
        await session.execute(text(f"TRUNCATE TABLE {quoted_names} RESTART IDENTITY CASCADE"))
```
— PG path truncates all sorted tables; SQLite path drops/recreates per test.

### 2.2 The `client_factory` fixture (centralized override seam)

Defined `conftest.py:875-935`:
```python
@pytest.fixture
def client_factory(db_session: AsyncSession):
    @asynccontextmanager
    async def _client_factory(*, user=None, current_user=None, settings=None,
                              headers=None, db_override=None,
                              raise_app_exceptions=True):
```
— `conftest.py:876-893`.

It centralizes:
- `app.dependency_overrides[get_db] = override_get_db` — `conftest.py:908`
- `app.dependency_overrides[get_settings] = override_settings` — `conftest.py:909`
- `app.dependency_overrides[deps.get_current_user] = override_get_current_user` and `app.dependency_overrides[security.get_current_user]` when `current_user is not None` — `conftest.py:916-917`
- Adds `X-Mock-User-Id` header when `user is not None` — `conftest.py:921`
- `previous_overrides = dict(app.dependency_overrides)` saved/restored under `try/finally` — `conftest.py:907, 932-933`

This is the canonical seam any new backend integration test should use.

### 2.3 Pre-built role/user fixtures (header-mock-auth clients)

| Fixture | Role / Permissions | Client fixture |
|---|---|---|
| `test_user` / `test_role` | wildcard `*:*` | `auth_client` (`conftest.py:938-959`), `auth_client_superuser` (`962-985`) |
| `test_user_platform_admin` | `users:read/write`, `activity_log:read`, `departments:read` | `client_platform_admin` (`988-1010`) |
| `test_user_employee` | `risks:read`, `controls:read/execute`, `vendors:read`, `departments:read`, `reports:read` (DEPARTMENT scope) | `client_employee` (`1013-1032`) |
| `test_user_approval_requester` | risks/controls read+write+delete, controls execute (DEPARTMENT) | `client_approval_requester` (`1035-1057`) |
| `test_user_risk_manager` | `approvals:*`, `risks:read`, `users:read` (GLOBAL) | `client_risk_manager` (`1060-1081`) |
| `test_user_directory_reader` | `users:read` only (DEPARTMENT) | `client_directory_reader` (`1084-1106`) |
| `test_user_cro` | wildcard `*:*` (GLOBAL) | `client_cro` (`1115-1134`) |
| `test_user_department_head` | `risks:read` (DEPARTMENT) | `client_department_head` (`1137-1159`) |

All header-mock clients pass `headers = {"X-Mock-User-Id": str(user.id)}` and override `get_settings → Settings(mock_auth_enabled=True, debug=True)`.

### 2.4 Other notable fixtures

- `alembic_live_db` — disposable migration-versioned DB; for SQLite it stamps Alembic at head rather than running historical chain — `conftest.py:76-119`.
- `frozen_clock` — `freeze_time(datetime(2026, 5, 7, 12, 0, 0, tzinfo=UTC))` — `conftest.py:122-128`.
- `stable_uuid` — counter-based UUID generator — `conftest.py:131-140`.
- `RedactingSnapshotExtension` — Syrupy Amber subclass that redacts `id`, `trace_id`, `request_id`, `ip`, `email`, and any `*_at` keys — `conftest.py:143-167`.
- `snapshot` fixture wires that extension — `conftest.py:170-177`.
- `_dispose_app_engine_at_session_end` — autouse session fixture — `conftest.py:239-252`.
- `seed_risk_types` — seeds `operational` + `strategic` `RiskTypeConfig` — `conftest.py:326-352`.
- Default `client` fixture (no auth) — `conftest.py:854-872`.

### 2.5 `_get_db_override_whitelist.toml`

Full contents:
```
allowed_files = [
  "tests/backend/pytest/conftest.py",
]
```
— `tests/backend/pytest/_get_db_override_whitelist.toml:1-3`. Enforced by `architecture/test_w11a_dependency_override_discipline_red.py:16-28` which scans for `dependency_overrides[get_db]` outside the whitelist.

### 2.6 `tests/backend/pytest/factories.py`

120 lines. Provides explicit async factories: `create_test_risk` (`factories.py:14-43`), `create_test_kri` (`46-67`), `create_test_vendor` (`70-97`), `create_test_control` (`100-120`). Each takes `db: AsyncSession`, named ownership args, and an `overrides: Mapping[str, Any] | None` for parameter overrides.

---

## 3. Backend integration tests — `tests/backend/pytest/api/v1/`

25 files (mix of `test_*.py` and `*_helpers.py`/`*_support.py`).

### 3.1 Calling pattern (canonical example)

`tests/backend/pytest/api/v1/test_issues_crud_api.py:31-69`:
```python
@pytest.mark.asyncio
async def test_issue_list_collection_export_capability_tracks_reports_read(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user_employee: User,
    test_role_employee: Role,
):
    issues_read = Permission(resource="issues", action="read", ...)
    db_session.add(issues_read); await db_session.commit()
    ...
    headers = {"X-Mock-User-Id": str(test_user_employee.id)}
    allowed_response = await client.get("/api/v1/issues", headers=headers)
```
Key points: `client` fixture (anonymous), header `X-Mock-User-Id` selects the user; capability assertions read from `response.json()["capabilities"]` (`:50, :69`).

### 3.2 Auth-shorthand pattern

`tests/backend/pytest/api/v1/test_issues_crud_api.py:73-79` uses `auth_client: AsyncClient` (wildcard superuser fixture from `conftest.py:938-959`):
```python
async def test_issue_crud_list_link_and_source_metadata(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
    ...
```
Then `await auth_client.post("/api/v1/issues", json={...})` — `:125-137`.

### 3.3 Role-scoped client pattern

`tests/backend/pytest/api/v1/test_risk_questionnaires.py:84-90`:
```python
async def test_scoping_user_cannot_list_out_of_scope_risk(
    client_employee: AsyncClient,
    risk_other_dept: Risk,
):
    resp = await client_employee.get(f"/api/v1/risks/{risk_other_dept.id}/questionnaires")
    assert resp.status_code in (403, 404)
```

### 3.4 Trivial route-shadowing regression

`tests/backend/pytest/api/v1/test_route_ordering_regressions.py:1-7` is a 7-line file:
```python
@pytest.mark.asyncio
async def test_my_approvals_static_route_not_shadowed(auth_client):
    resp = await auth_client.get("/api/v1/approvals/my-approvals")
    assert resp.status_code == 200, resp.text
```

### 3.5 Plugin pattern for shared support

`tests/backend/pytest/api/v1/test_issues_crud_api.py:28`: `pytest_plugins = ("tests.backend.pytest.api.v1.issues_api_support",)` — pulls in shared fixtures from a sibling module.

### 3.6 Trend / fixture-builder pattern

`tests/backend/pytest/api/v1/test_dashboard_history.py:18-57` defines `@pytest_asyncio.fixture trend_test_data` that constructs full `Risk`, `KeyRiskIndicator`, `KRIValueHistory` graphs in-place. Pattern: `db_session.add(...); await db_session.flush()` to obtain IDs, then `await db_session.commit()` once at the end.

---

## 4. Architecture invariant-lock tests — `tests/backend/pytest/architecture/`

34 `.py` files plus 5 `.toml` allowlist registries.

All use `pytestmark = pytest.mark.contract` and standard prelude:
```python
REPO_ROOT = Path(__file__).resolve().parents[4]
```
(parents[4] = `tests/backend/pytest/architecture/file.py → repo root`).

### 4.1 Allowlist registries

| Registry | Location | Lock test |
|---|---|---|
| `_archive_allowlist.toml` | `architecture/_archive_allowlist.toml` (4 entries) | `test_w8b_archivable_encapsulation_red.py` |
| `_naming_allowlist.toml` | `architecture/_naming_allowlist.toml` (`paths = []` empty placeholder) | persistence-naming locks |
| `_capabilities_all_allowlist.toml` | 16 `[[public_names]]` with `intent` + `expires_at` | `test_w10_capabilities_all_allowlist_red.py` |
| `_endpoint_commit_allowlist.toml` | 8 entries with `file`, `line`, `rationale`, `expires_at` | `test_w5_endpoint_commit_ratchet_red.py` |
| `_riskhub_config_service_commit_allowlist.toml` | 2 entries | `test_w12_riskhub_config_service_commit_ratchet_red.py` |
| `_vendor_governance_service_commit_allowlist.toml` | (referenced) | `test_w12_vendor_governance_service_commit_ratchet_red.py` |
| `_get_db_override_whitelist.toml` | `tests/backend/pytest/_get_db_override_whitelist.toml` | `test_w11a_dependency_override_discipline_red.py` |

### 4.2 Pattern A — AST commit-site ratchet (deletion / consolidation)

`architecture/test_w12_riskhub_config_service_commit_ratchet_red.py`:
```python
def _commit_sites(root: Path) -> list[tuple[str, int]]:
    sites = []
    for path in sorted(root.rglob("*.py")):
        tree = ast.parse(path.read_text(...))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Await):
                continue
            call = node.value
            if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute) and call.func.attr == "commit":
                sites.append((path.relative_to(REPO_ROOT).as_posix(), node.lineno))
    return sites
```
— `:17-27`.

```python
def test_riskhub_config_service_commits_are_limited_to_transaction_owners() -> None:
    allowed = {(str(entry["file"]), int(entry["line"])) for entry in _allowlist_entries()}
    commit_sites = set(_commit_sites(SERVICE_ROOT))
    assert commit_sites <= allowed
    assert len(commit_sites) <= 2
```
— `:35-40`. The `len(commit_sites) <= 2` is the **ratchet** that prevents adding new commit sites without shrinking the allowlist.

```python
def test_riskhub_config_service_commit_allowlist_entries_are_justified() -> None:
    for entry in entries:
        assert entry.get("rationale")
        assert date.fromisoformat(str(entry["expires_at"])) >= date.today()
```
— `:43-48`. Every allowlist entry must justify itself with `rationale` + unexpired `expires_at`.

Same pattern at `test_w5_endpoint_commit_ratchet_red.py:37-58` with `assert len(allowed) <= 8`.

### 4.3 Pattern B — Module-absent assertion (deletions)

`architecture/test_w6_bc_d_register_listing_centralization.py:39-45`:
```python
def test_vendor_listing_orchestration_lives_in_register_listings_module() -> None:
    vendor_crud_source = _read("backend/app/api/v1/endpoints/vendors/crud.py")
    register_vendor_source = _read("backend/app/services/_register_listings/vendors.py")
    assert "from app.services._register_listings.vendors import list_vendor_governance" in vendor_crud_source
    assert "list_vendor_governance" in register_vendor_source
    assert not (ROOT / "backend/app/services/_vendor_governance/listing.py").exists()
```
The `assert not ... .exists()` is the canonical "module absent" lock.

`architecture/test_w11b_test_infra_polish_red.py:63-66`:
```python
def test_dead_kri_history_endpoint_facades_are_removed() -> None:
    existing = sorted(path for path in DEAD_KRI_HISTORY_FACADES if (REPO_ROOT / path).exists())
    assert existing == []
```
With `DEAD_KRI_HISTORY_FACADES` set at `:18-25`. This is the canonical "no importer / file gone" pattern for batch deletions.

### 4.4 Pattern C — `__all__` allowlist (public-API ratchet)

`architecture/test_w10_capabilities_all_allowlist_red.py:29-33`:
```python
def test_capabilities_public_exports_match_allowlist() -> None:
    allowlist = tomllib.loads(ALLOWLIST_PATH.read_text(encoding="utf-8"))
    public_names = [entry["name"] for entry in allowlist["public_names"]]
    assert _module_all_names(CAPABILITIES_INIT) == public_names
```

`_module_all_names` parses the module AST and returns the `__all__` list (`:16-26`).

### 4.5 Pattern D — Forbidden-pattern source scan

`architecture/test_w9_schema_datetime_ban.py:11-24`:
```python
def test_no_bare_datetime_import_in_schemas() -> None:
    for path in SCHEMA_ROOT.rglob("*.py"):
        for lineno, line in enumerate(...):
            if not line.startswith("from datetime import"):
                continue
            ...
            if "datetime" in imported_names:
                violations.append(f"{path}:{lineno}: {line.strip()}")
    assert not violations
```

### 4.6 Pattern E — AST-walk forbidden-shape

`architecture/test_dashboard_threshold_contract_red.py:18-29`:
```python
def test_dashboard_shared_has_no_static_risk_level_ranges() -> None:
    tree = _dashboard_shared_tree()
    forbidden_assignments = {"RISK_LEVEL_RANGES"}
    assigned_names = {target.id for node in ast.walk(tree)
                      if isinstance(node, (ast.Assign, ast.AnnAssign))
                      for target in (...)
                      if isinstance(target, ast.Name)}
    assert forbidden_assignments.isdisjoint(assigned_names)
```

### 4.7 Pattern F — Routing/dependency introspection (capabilities locks)

`architecture/test_w3_gate_snapshot.py:11-32`:
```python
def _route_capability_map() -> dict[tuple[str, str], str]:
    for route in api_router.routes:
        if not isinstance(route, APIRoute):
            continue
        for dependency in route.dependant.dependencies:
            capability = getattr(dependency.call, "required_capability", None)
            ...

def test_endpoint_method_required_capability_map_includes_core_read_gates():
    route_map = _route_capability_map()
    assert route_map[("GET", "/risks")] == "risks:read"
    ...
```

### 4.8 Pattern G — Doc-mention completeness (cross-link lock)

`architecture/test_w11_docs_index_completeness_red.py:13-37`:
```python
def test_review_closure_documentation_index_records_accepted_paths_and_decisions() -> None:
    docs = "\n".join([
        (ROOT / "docs/README.md").read_text(),
        (ROOT / "docs/DOCUMENTATION_TREE.md").read_text(),
        (ROOT / "AGENTS.md").read_text(),
        (ROOT / "CLAUDE.md").read_text(),
    ])
    required = {"ADR-002": "service-owned transaction rule", ...}
    for needle, reason in required.items():
        assert needle in docs, f"missing {reason}: {needle}"
```

### 4.9 Pattern H — Subclass / registry completeness

`architecture/test_w4_exception_registry_completeness_red.py:18-32`:
```python
def test_every_domain_error_subclass_is_registered() -> None:
    registered = set(EXCEPTION_REGISTRY)
    subclasses = _domain_error_subclasses(DomainError)
    assert subclasses <= registered
```

### 4.10 Pattern I — Allowlisted-set equality

`architecture/test_w12_issue_status_automation_lock_red.py:36-52`:
```python
def test_automated_issue_status_assignments_are_allowlisted() -> None:
    assignments: set[tuple[str, str]] = set()
    for path in SERVICES_ROOT.rglob("*.py"):
        ...
        if any(_is_issue_status_target(target) for target in node.targets):
            assignments.add((rel_path, status))
    assert assignments == ALLOWED_AUTOMATED_STATUS_ASSIGNMENTS
```
Note: equality (`==`), not subset (`<=`) — must remove from allowlist when removing a code site.

### 4.11 Pattern J — Cross-stack parity

`architecture/test_w12_committee_authz_parity_red.py:25-34`:
```python
def test_can_view_committee_legacy_frontend_matches_backend_permission_rule() -> None:
    backend_source = BACKEND_EVALUATION.read_text(...)
    frontend_source = FRONTEND_POLICY.read_text(...)
    backend_body = _function_body(backend_source, "can_view_risk_committee")
    assert "if is_platform_admin(user):\n        return False" in backend_body
    ...
    assert "canViewCommittee: (hasGlobalScope && !isPlatformAdmin) || isDepartmentHead" in frontend_source
```

### 4.12 Pattern K — Subprocess command-line tool gate

`architecture/test_w12_alembic_clean_diff_red.py:16-34`:
```python
def test_alembic_chain_is_clean(alembic_live_db) -> None:
    result = subprocess.run([sys.executable, "-m", "alembic", "check"], cwd=BACKEND_ROOT, env=env, ...)
    output = f"{result.stdout}\n{result.stderr}"
    assert result.returncode == 0, output
    assert "No new upgrade operations detected" in output
```

### 4.13 Pattern L — Architecture-test self-policing

`architecture/test_w11b_test_infra_polish_red.py:32-43` enforces every architecture test carries `pytestmark = pytest.mark.contract`:
```python
def test_architecture_tests_are_marked_contract() -> None:
    architecture_tests = sorted(ARCHITECTURE_TEST_ROOT.glob("test_*.py")) + [
        BACKEND_TEST_ROOT / "test_architecture_deepening_contracts.py"
    ]
    unmarked = []
    for path in architecture_tests:
        source = _source(path)
        if "pytestmark = pytest.mark.contract" not in source:
            unmarked.append(...)
    assert unmarked == []
```

### 4.14 Architecture test template (TDD failing test)

```python
from __future__ import annotations
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]


def test_<invariant_name>() -> None:
    target = (REPO_ROOT / "backend/app/<module>.py").read_text(encoding="utf-8")
    assert "<forbidden symbol>" not in target
    # or:
    # assert not (REPO_ROOT / "backend/app/<deleted module>.py").exists()
```

For ratchets with allowlist:
```python
ALLOWLIST_PATH = REPO_ROOT / "tests/backend/pytest/architecture/_<name>_allowlist.toml"

def _allowlist_entries() -> list[dict[str, object]]:
    raw = tomllib.loads(ALLOWLIST_PATH.read_text(encoding="utf-8"))
    return list(raw["allowlist"])

def test_<count>_is_ratcheted() -> None:
    allowed = {(str(e["file"]), int(e["line"])) for e in _allowlist_entries()}
    sites = set(_collect_sites(...))
    assert sites <= allowed
    assert len(sites) <= len(allowed)

def test_<count>_allowlist_entries_are_justified() -> None:
    for entry in _allowlist_entries():
        assert entry.get("rationale")
        assert date.fromisoformat(str(entry["expires_at"])) >= date.today()
```

---

## 5. Snapshot / equivalence-class tests (Syrupy + RedactingSnapshotExtension)

### 5.1 Single existing snapshot

Only one `.ambr` file: `tests/backend/pytest/__snapshots__/test_w0_harness_contract_red.ambr` (8 lines):
```
# name: test_snapshot_round_trip
  dict({
    'created_at': '<redacted>',
    'id': '<redacted>',
    'name': 'RiskHub',
  })
```
— `__snapshots__/test_w0_harness_contract_red.ambr:2-7`.

### 5.2 Source test

`tests/backend/pytest/test_w0_harness_contract_red.py:25-26`:
```python
def test_snapshot_round_trip(snapshot):
    assert {"id": 42, "created_at": "2026-05-07T12:00:00Z", "name": "RiskHub"} == snapshot
```

`:29-30` — sanity check fixture identity:
```python
def test_snapshot_fixture_uses_syrupy_assertion(snapshot):
    assert isinstance(snapshot, SnapshotAssertion)
```

`:33-54` — proves the redaction extension redacts `id`, `created_at`, `trace_id`, `request_id`, `ip`, `email`, and any `*_at` key.

### 5.3 Equivalence-class snapshot template (the only example)

```python
def test_<thing>_payload_matches_snapshot(snapshot):
    payload = {"id": ..., "created_at": ..., "name": ...}
    assert payload == snapshot
```
Run once to capture, commit `__snapshots__/test_<thing>.ambr`. The shared `RedactingSnapshotExtension` (`conftest.py:146-167`) automatically redacts volatile fields; consolidations that should produce identical equivalence-classes assert against the same snapshot.

Note: across the entire backend test tree, `grep '== snapshot'` returns **exactly one match**: `test_w0_harness_contract_red.py:26`. Snapshot/equivalence-class testing per ADR-006 is a thin pattern in current code — the harness is wired but is not yet exercised at scale.

---

## 6. Root-level backend tests — domain categorization

Total root `test_*.py` files: **173** (count from `ls | grep '^test_' | wc -l`).

Categorization by domain prefix (counts from `ls | sed | awk -F'_' '{print $1}' | sort | uniq -c`):

| Domain bucket | Count | Examples |
|---|---|---|
| `admin_*` | 8 | `test_admin_directory_sync.py`, `test_admin_logs.py`, `test_admin_orphans.py`, `test_admin_sessions.py`, `test_admin_snapshots.py`, `test_admin_telemetry.py` |
| `auth_*` (auth-flow) | 5 | `test_auth_config_endpoint.py`, `test_auth_demo_refresh.py`, `test_auth_lockout_redis_resilience.py`, `test_auth_password_hardening.py`, `test_auth_refresh.py` |
| `authz_*` / `authorization_*` | 3 | `test_authz_capability_contract_validator.py`, `test_authz_list_policy.py`, `test_authorization_capabilities_facade.py` |
| `approval*` | 7 | `test_approval_edit_apply.py`, `test_approval_field_whitelist.py`, `test_approval_resolution.py`, `test_approval_side_effect_dispatch.py`, `test_approval_uniqueness.py`, `test_approval_workflow.py`, `test_approvals.py` |
| `kri*` / `kris*` | 12 | `test_kri_history.py`, `test_kris_rbac.py`, `test_kris_value_submission_api.py`, etc. |
| `riskhub_*` (config / public read) | 6 | `test_riskhub_config_transactions.py`, `test_riskhub_departments.py`, `test_riskhub_public_config.py`, `test_riskhub_risk_types.py`, `test_riskhub_roles.py` |
| `risk*` (risk register) | 3 | `test_risk_id_generation.py`, `test_risks.py`, `test_risks_concurrency.py` |
| `vendor*` | 3 | `test_vendor_link_workflow_module.py`, `test_vendor_links.py`, `test_vendor_reports.py`, `test_vendors.py` |
| `w<N>_*_red.py` (architecture deepening / red-tests) | 22 | `test_w0_harness_contract_red.py`, `test_w1_*`, `test_w4_bc_*`, `test_w5_*`, `test_w8a_*`, `test_w8b_*` |
| `install_*`, `deploy_*`, `phase500_*`, `startup_*` (operational scripts) | 9 | `test_install_production_helpers.py`, `test_install_script_contracts.py`, `test_deploy_cli_contracts.py`, `test_phase500_script_contracts.py`, `test_startup_script_contracts.py` |
| `rate_limit_*` | 3 | `test_rate_limit_components.py`, `test_rate_limit_redis_integration.py`, `test_rate_limit_redis_resilience.py` |
| `monitoring_*`, `siem_logging`, `log_rotation*` | 4 | `test_monitoring_status*.py`, `test_siem_logging.py`, `test_log_rotation_config.py` |
| `notification*` | 3 | `test_notification_preferences.py`, `test_notification_service.py`, `test_notifications.py` |
| `outbox*` | 1 | `test_outbox_approval_flow.py` |
| `postgres_*` (PG-only) | 2 | `test_postgres_datetime_roundtrip.py`, `test_postgres_schema_contracts.py` |
| `seed_*` | 2 | `test_seed_rbac_parity.py`, `test_seed_risk_types.py` |
| `directory_*`, `graph_directory*` | 3 | `test_directory_import.py`, `test_directory_lookup.py`, `test_graph_directory_components.py` |
| Remaining (~70) | — | `test_health.py`, `test_executions.py`, `test_users.py`, `test_visibility_helpers.py`, `test_threshold_propagation.py`, `test_timezone_policy.py`, `test_email_canonicalization.py`, … |

Risk ID package facade dependency: `test_risks.py` and
`test_risk_id_generation.py` import `generate_risk_id_code` from
`app.api.v1.endpoints.risks`, so that package re-export is a test-surface
contract.

### 6.1 Architecture-deepening contracts at root

`tests/backend/pytest/test_architecture_deepening_contracts.py` (also marked `pytestmark = pytest.mark.contract` — `:9`) — bundles many cross-cutting AST and import contracts. Helpers: `_imports_module`, `_assigned_names`, `_calls_private_audit_method`, `_function_body_source`, `_production_frontend_import_count` (which scans `frontend/src/**/*.ts*` for production usages).

---

## 7. Frontend testing — `vitest` + Playwright

### 7.1 `frontend/vitest.config.ts`

- `dir: testRoot` where `testRoot = path.resolve(__dirname, '../tests/frontend/unit')` — `:6, :46`
- `setupFiles: [path.resolve(__dirname, 'vitest.setup.ts')]` — `:52`
- `include: ['src/**/*.{test,spec}.{ts,tsx}']` — `:53`
- Coverage thresholds: `statements: 57, branches: 47, functions: 47, lines: 58` — `:59-62`
- Aliases: `'@': path.resolve(__dirname, 'src')`, `'@test': path.resolve(__dirname, '../tests/frontend/unit/src/test')` — `:67-69`
- Custom `externalTestPackageResolver` plugin re-resolves `react`, `react-router-dom`, `@azure/msal-browser`, `@tanstack/react-query`, `@testing-library/react`, `msw`, `msw/node`, `react-i18next` from `frontend/src/main.tsx` to keep test imports identical to production resolution — `:8-40`.

### 7.2 `frontend/playwright.config.ts`

- `testDir: path.resolve(frontendRoot, '../tests/frontend/e2e')` — `:23`
- `testMatch: ['**/*.spec.ts']` — `:24`
- `webServer.command: 'npm run dev'`, base URL default `http://localhost:5173` — `:17, 70-75`
- Projects: `chromium`, `firefox`, `webkit`, `ci` — `:48-67`
- E2E is **out of plan gate scope** per task instructions.

### 7.3 `frontend/vitest.setup.ts` (test bootstrap)

- Imports `@testing-library/jest-dom/vitest`, `cleanup`, and `./src/i18n` once — `:1-3`
- Installs `localStorage`/`sessionStorage` mocks via `Object.defineProperty` — `:25-41`
- JSDOM polyfills for Radix UI: `hasPointerCapture`, `setPointerCapture`, `releasePointerCapture`, `Element.prototype.scrollIntoView` — `:46-60`
- `afterEach`: `cleanup()` + clears storage + `__resetSessionStoreForTests()` + `clearAuthConfigCache()` + `cleanupTestQueryClients()` — `:62-77`
- `beforeAll`: `mswServer = (await import('@test/mocks/server')).server; mswServer.listen({ onUnhandledRequest: 'error' })` — `:87-92`
- `afterEach`: `mswServer?.resetHandlers()` — `:94`

### 7.4 MSW server / handlers

`tests/frontend/unit/src/test/mocks/server.ts:1-7`:
```typescript
import { setupServer } from 'msw/node';
import { handlers } from './handlers';
export const server = setupServer(...handlers);
```

`tests/frontend/unit/src/test/mocks/handlers.ts` — exports fixture builders (`buildControlDetail`, `buildRiskDetail`, `buildExecutionAuditItem`) and `mockAuthUser`, `mockDemoPersonas`. Per-test override: `server.use(http.get('...', () => HttpResponse.json(...)))` (the typical MSW v2 pattern; the directory's tests import `http, HttpResponse` from `'msw'` — see `UserRouteGuards.test.tsx:5`).

### 7.5 Render harness — `tests/frontend/unit/src/test/render.tsx`

`AllProviders` wraps with `QueryClientProvider`, `BrowserRouter`, `AuthProvider`, `DashboardFilterProvider` — `render.tsx:16-30`. `customRender` exposed as `render` — `:32-37`. `renderWithQueryClient` and `renderWithoutProviders` for narrower scopes — `:39-58`.

### 7.6 Auth-bootstrap probe — `tests/frontend/unit/src/test/authBootstrap.tsx`

```typescript
function AuthReadyProbe() {
    const { isLoading, isPreferencesHydrated } = useAuth();
    const isReady = !isLoading && isPreferencesHydrated;
    return <div data-testid={AUTH_READY_TEST_ID} data-ready={isReady ? 'true' : 'false'} hidden />;
}
export function AuthProviderWithReady({ children }) { ... }
export async function waitForAuthBootstrapReady(): Promise<void> { ... }
```
— `authBootstrap.tsx:8-30`. Used by route-guard tests to wait for `AuthContext` bootstrap before asserting on rendered output.

### 7.7 Access-token harness — `tests/frontend/unit/src/test/accessTokenStoreHarness.ts`

`setAccessToken(token)`, `clearAccessToken()`, `getAccessToken()`, `subscribeAccessToken(listener)` — backed by `setSessionSnapshot` / `getSessionSnapshot` from `@/services/session/store` (`:1-43`).

### 7.8 Test query client — `tests/frontend/unit/src/test/queryClient.ts`

`createTestQueryClient` with `retry: false`, `gcTime: Infinity`; tracked in module-level `Set` and torn down by `cleanupTestQueryClients()` — `:5-39`.

### 7.9 No `vi.mock('react-i18next', ...)` outside one allowed file

`tests/frontend/unit/src/architecture/noInlineReactI18nextMock.test.ts:24-33`:
```typescript
const directReactI18nextMock = /vi\.mock\(\s*['"]react-i18next['"]/;
const offenders = listTestFiles(unitRoot)
    .filter((filePath) => directReactI18nextMock.test(readFileSync(filePath, 'utf8')))
    ...
expect(offenders).toEqual([]);
```
Allowlist: `path.normalize('src/i18n/hooks.spec.tsx')` — `:7-8`.

---

## 8. Frontend authz invariant test — canonical capability change pattern

`tests/frontend/unit/src/authz/useAuthz.invariant.test.ts` (the accepted FE-authz invariant home per `architecture/test_w11_docs_index_completeness_red.py:27`).

### 8.1 Source-text invariant pattern

`useAuthz.invariant.test.ts:8-22`:
```typescript
const REPO_ROOT = resolve(__dirname, '../../../../..');
function readRepoSource(path: string): string {
    return readFileSync(resolve(REPO_ROOT, path), 'utf-8');
}

describe('useAuthz invariants', () => {
    it('does not fall back from MeCapabilities to local permission checks in buildAuthz', () => {
        const policySource = readRepoSource('frontend/src/authz/policy.ts');
        const buildAuthzBody = policySource.slice(policySource.indexOf('export function buildAuthz'));
        expect(buildAuthzBody).not.toContain('?? hasPermission(');
        expect(buildAuthzBody).not.toContain('?? hasPermission');
        expect(buildAuthzBody).not.toMatch(/meCapabilities\?\.[A-Za-z0-9_]+ \?\?/);
    });
```

### 8.2 Behavioral invariant — exhaustive route-resource enumeration

`useAuthz.invariant.test.ts:38-84`:
```typescript
it('strict mode covers every business route read resource permission', () => {
    const businessRoutesSource = readRepoSource('frontend/src/routing/business.tsx');
    const routeResources = new Set([...businessRoutesSource.matchAll(/authz\.can\('read', '([^']+)'\)/g)].map(([, resource]) => resource));
    expect(routeResources).toEqual(new Set(['controls', 'risks', 'issues', 'vendors', 'departments']));
    const resource_permissions = Object.fromEntries([...routeResources].map((r) => [`${r}:read`, true]));
    const meCapabilities: MeCapabilities = { ..., resource_permissions };
    const authz = buildAuthz({ role: 'risk_manager', access_scope: 'global', me_capabilities: meCapabilities }, () => false, meCapabilities, true);
    for (const resource of routeResources) {
        expect(authz.can('read', resource)).toBe(true);
    }
});
```
Pattern: enumerate from source via regex, then assert behavior with the production builder against a synthesized `MeCapabilities`.

### 8.3 Capability-flag-flip subscription test

`tests/frontend/unit/src/authz/__tests__/useAuthz.strictCapabilities.test.tsx:60-70`:
```typescript
it('recomputes authorization when strict capabilities flips mid-session', () => {
    const { result } = renderHook(() => useAuthz());
    expect(result.current.can('read', 'risks')).toBe(true);
    act(() => { setStrictCapabilitiesEnabled(true); });
    expect(result.current.can('read', 'risks')).toBe(false);
});
```
Uses `vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockUseAuth() }))` — `:9-11`. Pattern for testing capability-flag transitions.

### 8.4 Per-row capability resolver test

`tests/frontend/unit/src/lib/capabilities.test.ts:5-40`:
```typescript
it('resolves named capability flags from optional capability objects', () => {
    expect(resolveCapabilityFlag({ can_update: true }, 'can_update')).toBe(true);
    expect(resolveCapabilityFlag({ can_update: false }, 'can_update')).toBe(false);
    expect(resolveCapabilityFlag(null, 'can_update')).toBe(false);
});
```
Per-row caps remain on `{Risk,Control,Vendor,Issue,KRI}Read.capabilities` (per CLAUDE.md "Authorization Capability Contract"); this resolver is the canonical seam.

### 8.5 Frontend raw-ID-display guard (deletion-style invariant)

`tests/frontend/unit/src/quality/noRawIdDisplay.test.ts:9-34`:
```typescript
const guardedFiles = ['frontend/src/pages/vendors/VendorsTableSection.tsx', ...];
const rawIdFallbackPatterns = [/String\([^)]*(?:owner_id|...)\)/, ...];
describe('frontend raw ID display guardrails', () => {
    it.each(guardedFiles)('%s does not use technical IDs as visible fallbacks', (filePath) => {
        const source = readFileSync(resolve(repoRoot, filePath), 'utf8');
        for (const pattern of rawIdFallbackPatterns) {
            expect(source).not.toMatch(pattern);
        }
    });
});
```
Pattern: `it.each` over an explicit guarded-files list; equivalent of architecture lock for frontend file content.

---

## 9. Frontend e2e (Playwright) — out of plan gate scope

Test files at `tests/frontend/e2e/`:
- Specs: `access-scope.spec.ts`, `accessibility-smoke.spec.ts`, `admin.spec.ts`, `auth.spec.ts`, `controls.spec.ts`, `dashboard.spec.ts`, `department-access.spec.ts`, `issues-contextual-create.spec.ts`, `issues-workflow.spec.ts`, `kris.spec.ts`, `navigation-stability.spec.ts`, `polish-audit.spec.ts`, `questionnaires.spec.ts`, `readme_screenshots.spec.ts`, `risks.spec.ts`, `roles-access.spec.ts`, `settings-isolation.spec.ts`
- Sub-suites: `activity-logging/`, `approval-workflows/`, `cross-department/`, `entity-ownership/`, `pages/`, `permissions/`, `sensitive-fields/`, `legacy/`
- Support: `fixtures/`, `helpers/`, `setup/global-setup.ts` (referenced by `playwright.config.ts:76`)

(Listed for completeness; user has explicitly excluded e2e from the plan's gates.)

---

## 10. TDD-friendly seams summary

| Plan operation | Recipe | Citations |
|---|---|---|
| **Delete a module** | `assert not (REPO_ROOT / "<path>").exists()` lock + remove module + run lock | `architecture/test_w6_bc_d_register_listing_centralization.py:45`, `test_w11b_test_infra_polish_red.py:63-66` |
| **Forbid an import** | AST `ast.ImportFrom` walk, allow set; assert empty offenders | `test_authz_contract_doc_drift_red.py` style + `test_w9_schema_datetime_ban.py:11-24` |
| **Ratchet a count down** | TOML allowlist + `assert sites <= allowed` + `assert len(sites) <= len(allowed)` + `expires_at` justification | `test_w12_riskhub_config_service_commit_ratchet_red.py:35-48`, `test_w5_endpoint_commit_ratchet_red.py:37-58` |
| **Allowlist set equality** (must remove from list when removing site) | `assert assignments == ALLOWED_AUTOMATED_STATUS_ASSIGNMENTS` | `test_w12_issue_status_automation_lock_red.py:36-52` |
| **Module `__all__` allowlist** | `assert _module_all_names(MODULE) == public_names` | `test_w10_capabilities_all_allowlist_red.py:29-33` |
| **Consolidation equivalence** (snapshot) | Wire `snapshot` fixture → `assert payload == snapshot` → commit `__snapshots__/...ambr` | `test_w0_harness_contract_red.py:25-26` + `RedactingSnapshotExtension` (`conftest.py:146-167`) |
| **Behavioral regression** (e.g. `risk.process → risk.name`) | Add `pytest.mark.asyncio` test using `auth_client` fixture; assert response field; co-locate next to existing domain coverage at `tests/backend/pytest/test_risks.py` (recognized B1 home per `architecture/test_w11_docs_index_completeness_red.py:28`) | `test_risks.py:11-42`, `auth_client` (`conftest.py:938-959`) |
| **Capability/authz catalog change** | Backend: `architecture/test_w12_resource_permissions_keys_match_capability_contract_red.py` regenerates from `build_me_capabilities` and asserts catalog parity. Frontend: add invariant in `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts` per source-grep + behavioral assertion pattern | `test_w12_resource_permissions_keys_match_capability_contract_red.py:46-72`, `useAuthz.invariant.test.ts:14-84` |
| **New backend integration test** | `client_factory` async-context fixture (`conftest.py:875-935`) — pass `current_user=` for `dependency_overrides`, `user=` for `X-Mock-User-Id`, optional `db_override`. Or pre-built role-clients (`auth_client`, `client_employee`, `client_platform_admin`, `client_cro`, `client_risk_manager`, `client_directory_reader`, `client_approval_requester`, `client_department_head`) | `conftest.py:875-1159` |
| **Forbidden source-string** | `path.read_text(); assert "<symbol>" not in source` | `test_w8b_archivable_encapsulation_red.py:36-39, 54-58, 73-76` |
| **Frontend file-content guard** | `it.each(guardedFiles)` + `readFileSync` + `expect(source).not.toMatch(pattern)` | `noRawIdDisplay.test.ts:9-34` |
| **Frontend authz behavior on route** | `renderHook(() => useAuthz())` with mocked `useAuth` returning `MeCapabilities`; assert `result.current.can(...)` | `useAuthz.strictCapabilities.test.tsx:60-70` |
| **Cross-stack parity** | Read both backend + frontend source, assert symmetric symbol presence | `test_w12_committee_authz_parity_red.py:25-34` |
| **Migration rehearsal** | `subprocess.run([sys.executable, "-m", "alembic", "check"], ...)` + assert "No new upgrade operations detected" | `test_w12_alembic_clean_diff_red.py:16-34` |
| **Architecture-test self-policing** | New architecture lock files MUST include `pytestmark = pytest.mark.contract` or `test_w11b_test_infra_polish_red.py:32-43` will flag them | `test_w11b_test_infra_polish_red.py:32-43` |

---

## 11. Quick-reference paths

- Backend pytest config: `backend/pytest.ini`
- Backend conftest: `tests/backend/pytest/conftest.py`
- Backend test factories: `tests/backend/pytest/factories.py`
- Architecture locks dir: `tests/backend/pytest/architecture/`
- Allowlist registries: `tests/backend/pytest/architecture/_*.toml`
- Backend snapshots: `tests/backend/pytest/__snapshots__/`
- Frontend vitest config: `frontend/vitest.config.ts`
- Frontend test setup: `frontend/vitest.setup.ts`
- Frontend test root: `tests/frontend/unit/`
- Shared frontend test helpers: `tests/frontend/unit/src/test/`
- MSW handlers: `tests/frontend/unit/src/test/mocks/handlers.ts`
- Canonical authz invariant test: `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts`
- Playwright config (e2e, out of scope): `frontend/playwright.config.ts`
- E2e tests dir: `tests/frontend/e2e/`
