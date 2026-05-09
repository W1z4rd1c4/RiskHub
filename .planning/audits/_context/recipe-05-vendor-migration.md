# Phase 5 — Recipes (Domain 5: Vendor + Quarterly + Reports + Migration + Ownership Factory)

Scope: 10 items. Single sequential developer; TDD red→green; ADR-010 forward-only; lock/doc edits land in the same commit; subagents not required at the recipe level. Migration recipe (#69+#70) is the long pole; all other items are leaf-style.

Cross-domain handoff sequence (top-of-file):

1. **#13 (S5.1)** — independent leaf; can land first.
2. **#16 (S8.10)** — independent leaf; can land in parallel with #13.
3. **#17 (S2.1)** — independent leaf; one-commit inline of 14 importers.
4. **#31 (S5.5)** — depends on `_vendor_governance/reports.py` stub (already exists, line 7); independent of migration.
5. **#57 (S8.1)** — independent leaf; orchestrator override; doc + lock + delete in one commit.
6. **#49 (S2.2)** — independent leaf.
7. **#45a (BE-N8a)** — characterization tests (handoff to Domain Crosscut, but referenced here for #45b prereq).
8. **#45b (BE-N8b)** — must wait for #45a green.
9. **#69+#70 (S5.2 + S5.7)** — vendor migration bundle (XL). Single Alembic revision, single commit. Schedule outside any other vendor-touching commit window.
10. **#77b** — frontend TS cleanup; lands AFTER #69+#70 ships and cache invalidates.

Lock conflict matrix (top-of-file):

- `tests/backend/pytest/test_architecture_deepening_contracts.py:188,192` (#49)
- `tests/backend/pytest/test_architecture_deepening_contracts.py:559-569` (#57)
- `backend/app/services/_quarterly_comparison/README.md:16` (#57)
- `.planning/codebase/CONVENTIONS.md:22` (#57)
- `.planning/codebase/CONCERNS.md:14` (#57)
- `tests/backend/pytest/architecture/test_vendor_link_mixin_red.py` (#69+#70 NEW)
- `tests/backend/pytest/architecture/test_vendor_status_drop_red.py` (#69+#70 NEW)
- `tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py` (#69+#70 NEW; postgres lane)
- `tests/backend/pytest/migrations/test_vendor_link_migration_forward_only_red.py` (#69+#70 NEW)
- `tests/backend/pytest/migrations/test_vendor_migration_idempotency_red.py` (#69+#70 NEW Phase 4)
- `tests/backend/pytest/migrations/test_vendor_link_concurrent_writes_red.py` (#69+#70 NEW Phase 4)
- `tests/backend/pytest/migrations/test_vendor_link_orphan_precheck_red.py` (#69+#70 NEW Phase 4)
- `tests/backend/pytest/migrations/test_vendor_link_partial_failure_recovery_red.py` (#69+#70 NEW Phase 4)
- `backend/app/models/_archivable.py:60-65` (#69+#70 lock collapse)
- `tests/backend/pytest/test_ownership_resolver_factory_equivalence_red.py` (#45b NEW)

Postgres-lane mandatory for: §6.3, §Phase4 (concurrent-write, FK-orphan precheck, partial-failure recovery, idempotency).

Test infra: every backend test uses `client_factory` from `tests/backend/pytest/conftest.py`; no `dependency_overrides[get_db]` blocks; all postgres-lane tests carry `pytestmark = [pytest.mark.contract, pytest.mark.postgres]`; non-postgres tests carry `pytestmark = pytest.mark.contract`.

---

## Item #13 (S5.1 / C-N2) — Delete `vendor_link_helpers.py` shim

### Final disposition
ACCEPT (P0). 107-line shim at `backend/app/api/v1/endpoints/vendor_link_helpers.py:1-107`, 0 prod importers (verified via `grep -rn "vendor_link_helpers" backend --include="*.py"` → only its own file). Archive precedence diverges from canonical helpers in `_vendor_links/workflow.py` and `_vendor_governance/links.py`.

### Dependencies
NONE. Independent leaf.

### TDD shape
Failing-existence-test-first.

### Failing test(s) to write FIRST
Path: `tests/backend/pytest/architecture/test_vendor_link_helpers_removed_red.py`

```python
"""RED: vendor_link_helpers shim must be deleted; canonical surface is _vendor_links."""
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract


def test_vendor_link_helpers_shim_removed() -> None:
    assert not Path("backend/app/api/v1/endpoints/vendor_link_helpers.py").exists()


def test_canonical_vendor_link_workflow_module_still_imports() -> None:
    from app.services._vendor_links import workflow  # canonical
    assert hasattr(workflow, "__file__")
```

### Code/file changes
- DELETE `backend/app/api/v1/endpoints/vendor_link_helpers.py` (entire file, 107 lines).
- Verify zero importers via:
  ```bash
  grep -rn "vendor_link_helpers" backend tests --include="*.py" | grep -v __pycache__
  ```
  Expected output: empty. If non-empty, repoint each line to `app.services._vendor_links.workflow`.

### Lock/TOML/contract updates
NONE. No architecture-lock test references the shim path.

### README / doc updates
- `backend/app/services/_vendor_links/README.md` — verify the canonical helper surface is documented (already documented post-`1ee872a4`; verify no edits required).

### Verification commands
```bash
pytest tests/backend/pytest/architecture/test_vendor_link_helpers_removed_red.py
ruff check backend tests
mypy backend/app
make -f scripts/Makefile test-architecture-locks
```

### Commit boundary
ONE commit: `refactor(vendor-links): delete dead vendor_link_helpers shim`. Test goes red on `main`, green after delete.

### Rollback note
`git revert <commit>` restores 107 lines. No DB, no schema, no data. Trivially reversible.

### Effort
**S** (~30 min).

---

## Item #16 (S8.10) — Remove 4 reports legacy-excel tombstones

### Final disposition
ACCEPT (P1). Four tombstone routes in `backend/app/api/v1/endpoints/reports/`:

- `legacy_excel.py:14` `@router.get("/controls/excel")`
- `legacy_excel.py:23` `@router.get("/risks/excel")`
- `summary_excel.py:97` `@router.get("/summary/excel")`
- `audit_trail_excel.py:133` `@router.get("/audit-trail/excel")`

KEEP LIVE the `xlsx`-rejection at:

- `audit_trail_excel.py:142` `@router.get("/audit-trail/export")` — calls `resolve_export_format(format, ...)` which raises `excel_export_removed` if `format == "xlsx"`.
- `summary_excel.py:106` `@router.get("/summary/export")` — same shape.

These two `/export` endpoints serve `format=csv` and reject `format=xlsx` per the `EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE` contract.

### Dependencies
NONE.

### TDD shape
Update existing OpenAPI parity + RBAC tests to expect the four tombstone routes are absent; keep all `xlsx`-rejection assertions on the live `/export` endpoints.

### Failing test(s) to write FIRST
Path: `tests/backend/pytest/api/v1/test_reports_excel_tombstones_removed_red.py`

```python
"""RED: 4 legacy /excel tombstones removed; /export?format=xlsx rejection preserved."""
import pytest

pytestmark = pytest.mark.contract


@pytest.mark.asyncio
async def test_excel_tombstones_return_404(client_factory) -> None:
    async with client_factory() as client:
        for path in (
            "/api/v1/reports/controls/excel",
            "/api/v1/reports/risks/excel",
            "/api/v1/reports/summary/excel",
            "/api/v1/reports/audit-trail/excel",
        ):
            response = await client.get(path)
            assert response.status_code == 404, path


@pytest.mark.asyncio
async def test_export_xlsx_format_still_rejected(client_factory) -> None:
    async with client_factory() as client:
        for path in (
            "/api/v1/reports/audit-trail/export?format=xlsx",
            "/api/v1/reports/summary/export?format=xlsx",
        ):
            response = await client.get(path)
            assert response.status_code == 410
            assert response.json()["detail"]["code"] == "excel_export_removed"
```

### Code/file changes
- DELETE `backend/app/api/v1/endpoints/reports/legacy_excel.py` (entire file: 30 lines).
- DELETE `legacy_router` import + `include_router` line in `backend/app/api/v1/endpoints/reports/__init__.py:11` and `:16`.
- DELETE in `backend/app/api/v1/endpoints/reports/summary_excel.py:97-103` the `download_summary_excel` function (7 lines incl. decorator).
- DELETE in `backend/app/api/v1/endpoints/reports/audit_trail_excel.py:133-139` the `download_audit_trail_excel` function.
- UPDATE existing tests:
  - `tests/backend/pytest/test_protocol_contract_probe.py:26,108` — drop `/api/v1/reports/controls/excel` from the probe path list; the response excerpt expectation moves to `/api/v1/reports/controls/export?format=xlsx`.
  - `tests/backend/pytest/test_openapi_contract_parity.py:26-29` — drop the four `/excel` paths from the OpenAPI parity list (keep `/export` paths).
  - `tests/backend/pytest/test_reports_rbac.py:193,369,379,391` — repoint each `/api/v1/reports/<x>/excel` GET to `/api/v1/reports/<x>/export?format=xlsx`. Status code stays 410, `detail.code` stays `excel_export_removed`.
  - `tests/backend/pytest/api/v1/test_reports_audit.py:274` — repoint `/api/v1/reports/audit-trail/excel` to `/api/v1/reports/audit-trail/export?format=xlsx`.
  - `tests/backend/pytest/test_vendor_reports.py:53,57` — already exercises `/vendor-reports/<x>?format=xlsx`; no edit (different routes).

### Lock/TOML/contract updates
- `backend/app/api/v1/endpoints/reports/__init__.py` — remove `legacy_router` (1 import + 1 include_router).
- No allowlist toml entries.

### README / doc updates
- `backend/app/api/v1/endpoints/reports/README.md` — strike the `legacy_excel.py` row from the route inventory.
- `docs/BUSINESS_LOGIC.md:758` — verify "format = csv (xlsx returns 410 excel_export_removed)" remains accurate (no edit needed; tombstones removed but rejection contract preserved on `/export`).

### Verification commands
```bash
pytest tests/backend/pytest/api/v1/test_reports_excel_tombstones_removed_red.py
pytest tests/backend/pytest/test_protocol_contract_probe.py tests/backend/pytest/test_openapi_contract_parity.py tests/backend/pytest/test_reports_rbac.py tests/backend/pytest/api/v1/test_reports_audit.py
ruff check backend tests
mypy backend/app
make -f scripts/Makefile test-architecture-locks
```

### Commit boundary
ONE commit: `refactor(reports): remove 4 excel tombstones; preserve xlsx rejection on /export`.

### Rollback note
`git revert <commit>` restores routes. No data, no schema. Frontend never called these (they 410'd anyway).

### Effort
**M** (~2h with test repointing).

---

## Item #17 (S2.1) — INLINE `_monitoring_response.py` shim into 14 importers

### Final disposition
ACCEPT (P1). 26-line compatibility adapter at `backend/app/api/v1/endpoints/_monitoring_response.py:1-26` re-exports 9 names from `app.services._monitoring_response`. 14 importers (verified):

```
backend/app/api/v1/endpoints/departments/controls.py:10
backend/app/api/v1/endpoints/departments/kris.py:8
backend/app/api/v1/endpoints/controls/crud/create.py:6
backend/app/api/v1/endpoints/controls/crud/detail.py:6
backend/app/api/v1/endpoints/controls/crud/restore.py:6
backend/app/api/v1/endpoints/controls/linking.py:4
backend/app/api/v1/endpoints/risks/control_links.py:4
backend/app/api/v1/endpoints/risks/crud/restore.py:6
backend/app/api/v1/endpoints/risks/crud/detail.py:6
backend/app/api/v1/endpoints/risks/crud/create.py:7
backend/app/api/v1/endpoints/kris/crud/detail.py:6
backend/app/api/v1/endpoints/kris/crud/create.py:6
backend/app/api/v1/endpoints/kris/crud/restore.py:6
backend/app/api/v1/endpoints/kris/crud/breaches.py:8
```

### Dependencies
NONE. Independent leaf. Pure import-rewrite + file delete.

### TDD shape
Failing-existence-test-first.

### Failing test(s) to write FIRST
Path: `tests/backend/pytest/architecture/test_monitoring_response_shim_removed_red.py`

```python
"""RED: _monitoring_response endpoints shim deleted; canonical service path used."""
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract


def test_endpoint_shim_file_deleted() -> None:
    assert not Path("backend/app/api/v1/endpoints/_monitoring_response.py").exists()


def test_no_endpoint_imports_shim() -> None:
    import subprocess
    out = subprocess.run(
        ["grep", "-rn", "from app.api.v1.endpoints._monitoring_response", "backend", "--include=*.py"],
        capture_output=True, text=True,
    )
    assert out.stdout == "", f"Unexpected importers:\n{out.stdout}"


def test_canonical_service_module_exposes_surface() -> None:
    from app.services import _monitoring_response as svc
    for name in (
        "MonitoringResponseContext", "build_control_monitoring_fields",
        "build_kri_monitoring_fields", "load_monitoring_response_context",
        "serialize_control_brief_for_link", "serialize_control_read",
        "serialize_control_risk_link", "serialize_kri_response",
        "serialize_risk_read",
    ):
        assert hasattr(svc, name), name
```

### Code/file changes
For each of the 14 importers, rewrite the import line:
- Replace `from app.api.v1.endpoints._monitoring_response import (...)` with `from app.services._monitoring_response import (...)` keeping the imported names verbatim.

Mechanical sed-equivalent (verify per-file):
```bash
# Inspect first
grep -rn "from app.api.v1.endpoints._monitoring_response" backend --include="*.py"
# Then per file: open in editor, swap module path. Names imported are unchanged.
```

After all 14 are rewritten, DELETE `backend/app/api/v1/endpoints/_monitoring_response.py` (26 lines).

### Lock/TOML/contract updates
NONE. The deepening-contract test does not pin this shim.

### README / doc updates
NONE.

### Verification commands
```bash
pytest tests/backend/pytest/architecture/test_monitoring_response_shim_removed_red.py
pytest tests/backend/pytest/test_architecture_deepening_contracts.py
ruff check backend tests
mypy backend/app
make -f scripts/Makefile test-architecture-locks
```

### Commit boundary
ONE commit: `refactor(monitoring): inline endpoint shim; 14 importers repointed to service`.

### Rollback note
`git revert <commit>`. No DB, no schema.

### Effort
**S** (~45 min — 14 imports rewritten in lockstep + file delete + RED test).

---

## Item #31 (S5.5) — EXTRACT vendor reporting row formatting

### Final disposition
ACCEPT (P2). Move `_annual_report_rows` (`vendor_reports.py:36-73`) and `_dora_register_rows` (`vendor_reports.py:76-119`) — pure pure-data row formatters with no FastAPI/DB coupling — into `backend/app/services/_vendor_governance/reports.py:7` (stub already exists at the destination).

The endpoint module then imports `from app.services._vendor_governance.reports import annual_report_rows, dora_register_rows` (rename drops leading underscore — they become public package-internal names since used by sibling endpoint module).

### Dependencies
- `backend/app/services/_vendor_governance/reports.py` already exists (file is a 12-line stub with `VendorReportDefinition`). Adds two functions to it.

### TDD shape
Move-then-rename: failing-import-test first.

### Failing test(s) to write FIRST
Path: `tests/backend/pytest/architecture/test_vendor_governance_reports_extraction_red.py`

```python
"""RED: row formatters live in _vendor_governance.reports, not in the endpoint."""
import inspect

import pytest

pytestmark = pytest.mark.contract


def test_annual_report_rows_lives_in_vendor_governance() -> None:
    from app.services._vendor_governance.reports import annual_report_rows
    assert callable(annual_report_rows)


def test_dora_register_rows_lives_in_vendor_governance() -> None:
    from app.services._vendor_governance.reports import dora_register_rows
    assert callable(dora_register_rows)


def test_endpoint_does_not_redefine_row_formatters() -> None:
    from app.api.v1.endpoints import vendor_reports as ep
    src = inspect.getsource(ep)
    assert "def _annual_report_rows" not in src
    assert "def _dora_register_rows" not in src
    assert "from app.services._vendor_governance.reports import" in src


def test_annual_headers_preserved() -> None:
    from app.services._vendor_governance.reports import annual_report_rows
    # Smoke check: signature still returns (headers, rows) tuple.
    sig = inspect.signature(annual_report_rows)
    assert list(sig.parameters) == ["report"]
```

### Code/file changes

**`backend/app/services/_vendor_governance/reports.py`** — append after the existing `VendorReportDefinition`:

```python
def annual_report_rows(report) -> tuple[list[str], list[list[object]]]:
    headers = [
        "Vendor ID", "Name", "Legal Name", "Vendor Type", "Department",
        "Owner", "Process", "Subprocess", "Supports Core Function",
        "DORA Relevant", "Significant Vendor", "Risk Score (1-5)",
        "Report Year", "Generated At",
    ]
    rows: list[list[object]] = []
    for vendor in report.vendors:
        rows.append(
            [
                vendor.vendor_id, vendor.name, vendor.legal_name or "",
                vendor.vendor_type, vendor.department_name or "",
                vendor.outsourcing_owner_name or "", vendor.process,
                vendor.subprocess or "",
                bool(vendor.supports_important_core_insurance_function),
                bool(vendor.dora_relevant), bool(vendor.is_significant_vendor),
                vendor.risk_score_1_5, report.process_evaluation.year,
                report.generated_at.isoformat(),
            ]
        )
    return headers, rows


def dora_register_rows(rows) -> tuple[list[str], list[list[object]]]:
    headers = [
        "vendor_id", "name", "legal_name", "registration_id", "vendor_type",
        "dora_relevant", "is_significant_vendor",
        "supports_important_core_insurance_function", "risk_score_1_5",
        "outsourcing_owner_user_id", "outsourcing_owner_name",
        "department_id", "department_name", "process", "subprocess",
        "replaceability", "has_alternative_providers",
    ]
    data_rows: list[list[object]] = []
    for row in rows:
        data_rows.append(
            [
                row.vendor_id, row.name, row.legal_name or "",
                row.registration_id or "", row.vendor_type,
                bool(row.dora_relevant), bool(row.is_significant_vendor),
                bool(row.supports_important_core_insurance_function),
                row.risk_score_1_5, row.outsourcing_owner_user_id or "",
                row.outsourcing_owner_name or "", row.department_id or "",
                row.department_name or "", row.process, row.subprocess or "",
                row.replaceability or "", bool(row.has_alternative_providers),
            ]
        )
    return headers, data_rows
```

**`backend/app/api/v1/endpoints/vendor_reports.py`** edits:
- L36-119 — DELETE both `_annual_report_rows` and `_dora_register_rows` definitions.
- After line 26 imports add: `from app.services._vendor_governance.reports import annual_report_rows, dora_register_rows`.
- L146 — change `_annual_report_rows(report)` to `annual_report_rows(report)`.
- L170 — change `_dora_register_rows(rows)` to `dora_register_rows(rows)`.

### Lock/TOML/contract updates
NONE.

### README / doc updates
- `backend/app/services/_vendor_governance/__init__.py` — if file currently re-exports `VendorReportDefinition` only, add the two new function names. Verify by reading file.

### Verification commands
```bash
pytest tests/backend/pytest/architecture/test_vendor_governance_reports_extraction_red.py
pytest tests/backend/pytest/test_vendor_reports.py
ruff check backend tests
mypy backend/app
make -f scripts/Makefile test-architecture-locks
```

### Commit boundary
ONE commit: `refactor(vendor-reports): extract row formatters to _vendor_governance.reports`.

### Rollback note
`git revert <commit>` — code-shape-only.

### Effort
**M** (~1.5h).

---

## Item #57 (S8.1) — DELETE 20-line `quarterly_comparison_service.py` facade

### Final disposition
ACCEPT (P2). **Doc-only Reject overruled.** Facade at `backend/app/services/quarterly_comparison_service.py:1-20` is a 20-line redirect with one prod caller (`backend/app/api/v1/endpoints/dashboard/quarterly.py:12`). Three docs still bless the facade pattern; rewrite/remove all three, rewrite the lock test, and delete the file in one commit.

### Dependencies
NONE.

### TDD shape
Failing-existence-test-first; the existing lock test at `:559-569` is REWRITTEN as part of this PR (not deleted).

### Failing test(s) to write FIRST
Path: `tests/backend/pytest/architecture/test_quarterly_comparison_facade_removed_red.py`

```python
"""RED: facade deleted; dashboard endpoint imports composition directly."""
import inspect
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract


def test_facade_module_deleted() -> None:
    assert not Path("backend/app/services/quarterly_comparison_service.py").exists()


def test_dashboard_quarterly_imports_composition_directly() -> None:
    from app.api.v1.endpoints.dashboard import quarterly
    src = inspect.getsource(quarterly)
    assert "from app.services._quarterly_comparison.composition import build_quarterly_comparison" in src
    assert "from app.services.quarterly_comparison_service" not in src


def test_no_facade_importers_remain() -> None:
    import subprocess
    out = subprocess.run(
        ["grep", "-rn", "quarterly_comparison_service", "backend", "tests", "--include=*.py"],
        capture_output=True, text=True,
    )
    # Allow this very test file to mention the string in its docstring/asserts.
    leaked = [
        ln for ln in out.stdout.splitlines()
        if "test_quarterly_comparison_facade_removed_red.py" not in ln
    ]
    assert leaked == [], f"Importers leaked:\n{chr(10).join(leaked)}"
```

### Code/file changes

1. **REWRITE** `tests/backend/pytest/test_architecture_deepening_contracts.py:559-569`. Replace:

```python
def test_quarterly_comparison_service_is_composition_facade() -> None:
    from app.services import quarterly_comparison_service
    from app.services._quarterly_comparison import composition

    assert hasattr(composition, "QuarterMetricComposition")
    assert hasattr(composition, "SnapshotSourceDecision")
    assert hasattr(composition, "MetricAvailability")
    assert quarterly_comparison_service.build_quarterly_comparison is composition.build_quarterly_comparison

    facade_source = inspect.getsource(quarterly_comparison_service)
    assert "async def build_quarterly_comparison" not in facade_source
```

with:

```python
def test_quarterly_comparison_composition_owns_public_surface() -> None:
    from app.services._quarterly_comparison import composition
    from app.api.v1.endpoints.dashboard import quarterly as dashboard_quarterly

    assert hasattr(composition, "QuarterMetricComposition")
    assert hasattr(composition, "SnapshotSourceDecision")
    assert hasattr(composition, "MetricAvailability")
    assert callable(composition.build_quarterly_comparison)

    src = inspect.getsource(dashboard_quarterly)
    assert "from app.services._quarterly_comparison.composition import build_quarterly_comparison" in src
```

2. **DELETE** `backend/app/services/quarterly_comparison_service.py` (entire file, 20 lines).

3. **EDIT** `backend/app/api/v1/endpoints/dashboard/quarterly.py:12` — change `from app.services.quarterly_comparison_service import build_quarterly_comparison` to `from app.services._quarterly_comparison.composition import build_quarterly_comparison`. (`parse_quarter` lives at `app.services._quarterly_comparison.periods.parse_quarter` — repoint that too if imported by the dashboard endpoint; verify by reading `dashboard/quarterly.py` lines 1-30.)

### Lock/TOML/contract updates

Doc edits land in same commit:

- **`backend/app/services/_quarterly_comparison/README.md:16`** — REMOVE the line:
  > `Keep backend/app/services/quarterly_comparison_service.py as the public service entrypoint. New period or snapshot rules should be tested through the dashboard regression tests before changing these helpers.`
  Replace with:
  > `The dashboard endpoint at backend/app/api/v1/endpoints/dashboard/quarterly.py imports build_quarterly_comparison directly from .composition. New period or snapshot rules should be tested through the dashboard regression tests before changing these helpers.`

- **`.planning/codebase/CONVENTIONS.md:22`** — REMOVE `quarterly_comparison_service.py` from the facade list. The line currently reads (parameterising the long list):
  > `…risk_questionnaire_service.py, quarterly_comparison_service.py, …/_approval_execution/, …`
  Drop `quarterly_comparison_service.py, ` (and trailing comma cleanup).

- **`.planning/codebase/CONCERNS.md:14`** — REWRITE the concern. Currently:
  > `Committee quarterly snapshot semantics: backend/app/services/quarterly_comparison_service.py, backend/app/services/_quarterly_comparison/, backend/app/api/v1/endpoints/dashboard/quarterly.py`
  Replace with:
  > `Committee quarterly snapshot semantics: backend/app/services/_quarterly_comparison/composition.py (orchestrator), backend/app/services/_quarterly_comparison/periods.py (quarter math), backend/app/api/v1/endpoints/dashboard/quarterly.py (HTTP surface).`
  Per the orchestrator override, suggest removing the lock-line entirely if downstream tooling supports a shorter list. Recommended: KEEP the rewritten line so the concern still appears in the registry; do NOT silently drop the row.

### README / doc updates
Same as above (3 docs are the doc-update set).

### Verification commands
```bash
pytest tests/backend/pytest/architecture/test_quarterly_comparison_facade_removed_red.py
pytest tests/backend/pytest/test_architecture_deepening_contracts.py::test_quarterly_comparison_composition_owns_public_surface
pytest tests/backend/pytest/api/v1/test_dashboard_quarterly.py 2>/dev/null || pytest -k quarterly tests/backend/pytest
ruff check backend tests
mypy backend/app
make -f scripts/Makefile test-architecture-locks
```

### Commit boundary
ONE commit: `refactor(quarterly): delete 20-line facade; dashboard imports composition directly`.

### Rollback note
`git revert <commit>` — restores 20-line facade + 3 doc lines + lock test body. No DB, no schema.

### Effort
**S** (~45 min: 1 file delete, 1 import rewrite, 3 doc edits, 1 lock-test rewrite, 1 RED test).

---

## Item #69 + #70 — VENDOR MIGRATION BUNDLE (atomic)

### Final disposition
ACCEPT (P3). **Effort XL (35-42h).** Single Alembic revision `k6l7m8n9o0p1_vendor_link_cascade_and_status_drop.py`. Adds `AbstractVendorLink` mixin, drops `Vendor.status` column + enum, adds `ON DELETE CASCADE` to vendor_risk_links and vendor_control_links FKs. Forward-only with `NotImplementedError` downgrade.

### Dependencies
- ADR-010 forward-only contract.
- Postgres lane mandatory (FK rebuild cannot be tested on sqlite).
- Loop 4 (KRI domain) MUST NOT touch `vendor_kri_link.py` in the same migration window.
- Pre-merge snapshot capture per ADR-010 §"Rollback Strategy".

### TDD shape
Multi-file RED-test bundle (4 base + 4 Phase 4 = 8 RED files). Mixin/model edits, then migration, then schema/service scrub, then lock collapse, then docs, then bundled commit.

### Reference state confirmations (from `plan-loop-2-06-migration-window.md`)

- `backend/app/models/vendor.py:22-23` — `class VendorStatus(str, PyEnum): active = "active"`.
- `backend/app/models/vendor.py:82` — `status: Mapped[str] = mapped_column(String(20), default=VendorStatus.active.value, index=True)`.
- `backend/app/models/_archivable.py:60-64` — legacy_values dict including `"vendors": ("inactive",)`.
- `backend/app/schemas/vendor.py:12-13,53,83` — VendorStatusEnum + 2 fields.
- `backend/app/schemas/__init__.py:115,212` — re-exports.
- Current Alembic head: `j5k6l7m8n9o0` (per `j5k6l7m8n9o0_rename_kri_archived_by_fk.py:16`).
- Forward-only precedent: `backend/alembic/versions/h3i4j5k6l7m8_unify_archive_state.py:28-31`.
- 8 prod call sites consume `vendor.status`:
  - `backend/app/services/_register_listings/vendors.py:15,53,89,103,108,121,131,200,273,482,501`
  - `backend/app/services/_register_listings/controls.py:554`
  - `backend/app/services/_register_listings/risks.py:430`
  - `backend/app/services/_monitoring_response.py:219`
  - `backend/app/services/_reporting/exports/rows.py:120`
  - `backend/app/services/_kri_history/direct_application.py:36`

### Full 9-step sequence

#### Step 1 — Write 4 base + 4 Phase 4 RED tests (ALL fail on `main`)

##### 1.1 `tests/backend/pytest/architecture/test_vendor_link_mixin_red.py`

```python
"""RED: AbstractVendorLink mixin invariants. Fails until #69 mixin lands."""
import pytest
from sqlalchemy.sql.schema import Column

pytestmark = pytest.mark.contract


def test_abstract_vendor_link_marked_abstract() -> None:
    from app.models._vendor_link_mixin import AbstractVendorLink  # ImportError today
    assert getattr(AbstractVendorLink, "__abstract__", False) is True


def test_concrete_link_models_inherit_mixin() -> None:
    from app.models._vendor_link_mixin import AbstractVendorLink
    from app.models import VendorRiskLink, VendorControlLink, VendorKRILink
    for cls in (VendorRiskLink, VendorControlLink, VendorKRILink):
        assert issubclass(cls, AbstractVendorLink), cls.__name__


def test_vendor_id_fk_uniformly_cascades() -> None:
    from app.models import VendorRiskLink, VendorControlLink, VendorKRILink
    for cls in (VendorRiskLink, VendorControlLink, VendorKRILink):
        col: Column = cls.__table__.c.vendor_id
        fk = next(iter(col.foreign_keys))
        assert fk.ondelete == "CASCADE", f"{cls.__name__}.vendor_id missing cascade"


def test_unique_constraint_names_preserved() -> None:
    from app.models import VendorRiskLink, VendorControlLink, VendorKRILink
    pairs = {
        "vendor_risk_links": "uq_vendor_risk_link",
        "vendor_control_links": "uq_vendor_control_link",
        "vendor_kri_links": "uq_vendor_kri_link",
    }
    for cls in (VendorRiskLink, VendorControlLink, VendorKRILink):
        names = {c.name for c in cls.__table__.constraints if c.name and c.name.startswith("uq_")}
        assert pairs[cls.__tablename__] in names
```

##### 1.2 `tests/backend/pytest/architecture/test_vendor_status_drop_red.py`

```python
"""RED: Vendor.status column / VendorStatusEnum / archived_clause shape."""
import inspect

import pytest
from sqlalchemy.dialects import postgresql

pytestmark = pytest.mark.contract


def test_vendor_status_column_dropped() -> None:
    from app.models import Vendor
    assert "status" not in Vendor.__table__.c, "Vendor.status column must be dropped"


def test_vendor_status_enum_class_removed() -> None:
    import app.models.vendor as vendor_module
    import app.schemas.vendor as schema_module
    assert not hasattr(vendor_module, "VendorStatus")
    assert not hasattr(schema_module, "VendorStatusEnum")


def test_archived_clause_collapsed_to_flag_only() -> None:
    from app.models import Vendor
    from app.models._archivable import archived_clause
    clause = archived_clause(Vendor, archived=True)
    sql = str(clause.compile(dialect=postgresql.dialect()))
    assert "vendors.is_archived" in sql
    assert "vendors.status" not in sql


def test_vendor_list_criteria_has_no_status_filter() -> None:
    from app.services._register_listings.vendors import VendorListCriteria
    fields = {f.name for f in VendorListCriteria.__dataclass_fields__.values()}
    assert "status_filter" not in fields
    assert "archived_status_filter" not in fields


def test_coerce_vendor_list_criteria_signature_drops_status_filter() -> None:
    from app.services._register_listings.vendors import coerce_vendor_list_criteria
    sig = inspect.signature(coerce_vendor_list_criteria)
    assert "status_filter" not in sig.parameters
```

##### 1.3 `tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py`

```python
"""RED: postgres-lane FK CASCADE + column drop assertions on the new migration."""
import pytest
from sqlalchemy import text

pytestmark = [pytest.mark.contract, pytest.mark.postgres]


@pytest.mark.asyncio
async def test_vendor_link_fks_cascade_after_upgrade(postgres_session) -> None:
    rows = await postgres_session.execute(text("""
        SELECT conname, confdeltype FROM pg_constraint
        WHERE conname IN (
            'fk_vendor_risk_links_vendor_id_vendors',
            'fk_vendor_risk_links_risk_id_risks',
            'fk_vendor_control_links_vendor_id_vendors',
            'fk_vendor_control_links_control_id_controls',
            'fk_vendor_kri_links_vendor_id_vendors',
            'fk_vendor_kri_links_kri_id_key_risk_indicators'
        )
    """))
    by_name = {r.conname: r.confdeltype for r in rows}
    assert len(by_name) == 6, f"missing constraints: {by_name}"
    for name, deltype in by_name.items():
        assert deltype == "c", f"{name} confdeltype={deltype!r}, expected 'c' (CASCADE)"


@pytest.mark.asyncio
async def test_vendors_status_column_absent_after_upgrade(postgres_session) -> None:
    row = await postgres_session.execute(text("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'vendors' AND column_name = 'status'
    """))
    assert row.first() is None, "vendors.status column must be dropped"


@pytest.mark.asyncio
async def test_ix_vendors_status_index_absent(postgres_session) -> None:
    row = await postgres_session.execute(text("""
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'vendors' AND indexname = 'ix_vendors_status'
    """))
    assert row.first() is None, "ix_vendors_status must be dropped with the column"
```

##### 1.4 `tests/backend/pytest/migrations/test_vendor_link_migration_forward_only_red.py`

```python
"""RED: ADR-010 forward-only contract on the new migration."""
import importlib
import inspect

import pytest

pytestmark = pytest.mark.contract


def test_downgrade_raises_not_implemented() -> None:
    module = importlib.import_module(
        "alembic.versions.k6l7m8n9o0p1_vendor_link_cascade_and_status_drop"
    )
    with pytest.raises(NotImplementedError, match="Forward-only"):
        module.downgrade()


def test_revision_chain_points_at_prior_head() -> None:
    module = importlib.import_module(
        "alembic.versions.k6l7m8n9o0p1_vendor_link_cascade_and_status_drop"
    )
    assert module.revision == "k6l7m8n9o0p1"
    assert module.down_revision == "j5k6l7m8n9o0"


def test_migration_source_cites_adr_010() -> None:
    module = importlib.import_module(
        "alembic.versions.k6l7m8n9o0p1_vendor_link_cascade_and_status_drop"
    )
    source = inspect.getsource(module)
    assert "raise NotImplementedError" in source
    assert "ADR-010" in source
```

##### Phase 4 NEW 1.5 — `tests/backend/pytest/migrations/test_vendor_migration_idempotency_red.py`

```python
"""RED Phase 4: running upgrade() twice on Postgres must not corrupt state."""
import pytest
from sqlalchemy import text

pytestmark = [pytest.mark.contract, pytest.mark.postgres]


@pytest.mark.asyncio
async def test_upgrade_then_re_upgrade_is_safe(postgres_engine) -> None:
    """The migration must be idempotent: re-running upgrade() in a fresh
    session against a post-upgraded DB must either no-op or raise a clean,
    deterministic error WITHOUT half-applied state.

    Strategy: take a baseline snapshot of vendors and link tables, run the
    migration via alembic stamp+upgrade, then attempt to apply the same
    revision body manually and assert no rows mutated and column still absent.
    """
    from alembic.versions.k6l7m8n9o0p1_vendor_link_cascade_and_status_drop import upgrade

    async with postgres_engine.connect() as conn:
        # First call (already applied via test fixture); capture pre-state.
        baseline = await conn.execute(text("SELECT COUNT(*) FROM vendors"))
        baseline_count = baseline.scalar()

        # Re-running upgrade body inside a transaction must roll back cleanly.
        try:
            await conn.run_sync(lambda sync_conn: upgrade())
        except Exception as exc:
            # Expected: index/column already absent. Must be a deterministic
            # ProgrammingError, not a partial-state corruption.
            assert "does not exist" in str(exc).lower() or "already" in str(exc).lower(), exc

        post = await conn.execute(text("SELECT COUNT(*) FROM vendors"))
        assert post.scalar() == baseline_count, "row count drift after re-upgrade"

        col = await conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name='vendors' AND column_name='status'
        """))
        assert col.first() is None
```

##### Phase 4 NEW 1.6 — `tests/backend/pytest/migrations/test_vendor_link_concurrent_writes_red.py`

```python
"""RED Phase 4: concurrent INSERT into vendor_risk_links during a CASCADE
DELETE on vendors must NOT leave orphans and must not deadlock the migration."""
import asyncio

import pytest
from sqlalchemy import text

pytestmark = [pytest.mark.contract, pytest.mark.postgres]


@pytest.mark.asyncio
async def test_cascade_serializes_with_concurrent_inserts(postgres_engine, seeded_vendor) -> None:
    """After upgrade, deleting a vendor under concurrent writes leaves no orphans."""
    vendor_id = seeded_vendor.id

    async def insert_link():
        async with postgres_engine.begin() as conn:
            await conn.execute(text(
                "INSERT INTO vendor_risk_links (vendor_id, risk_id, created_at) "
                "VALUES (:v, (SELECT id FROM risks LIMIT 1), now())"
            ), {"v": vendor_id})

    async def cascade_delete():
        async with postgres_engine.begin() as conn:
            await conn.execute(text("DELETE FROM vendors WHERE id = :v"), {"v": vendor_id})

    # Race: 5 concurrent inserts vs 1 cascade delete.
    results = await asyncio.gather(
        *(insert_link() for _ in range(5)),
        cascade_delete(),
        return_exceptions=True,
    )

    # Some inserts may FK-fail (acceptable post-cascade); none may leave orphans.
    async with postgres_engine.connect() as conn:
        orphans = await conn.execute(text(
            "SELECT COUNT(*) FROM vendor_risk_links l "
            "LEFT JOIN vendors v ON v.id = l.vendor_id WHERE v.id IS NULL"
        ))
        assert orphans.scalar() == 0, "orphan vendor_risk_links rows after concurrent writes"
```

##### Phase 4 NEW 1.7 — `tests/backend/pytest/migrations/test_vendor_link_orphan_precheck_red.py`

```python
"""RED Phase 4: before applying the migration, run an FK-orphan precheck.
If pre-existing orphan link rows exist (from before any cascade), the
migration must surface a deterministic ValueError listing them, not silently
drop rows or fail mid-FK-rebuild."""
import pytest
from sqlalchemy import text

pytestmark = [pytest.mark.contract, pytest.mark.postgres]


@pytest.mark.asyncio
async def test_precheck_reports_orphans_before_migration(postgres_engine_pre_migration) -> None:
    """Hand-craft an orphan in a fixture DB at revision j5k6l7m8n9o0 (one
    rev before our new migration), then call the precheck helper exposed
    by the migration module; expect a ValueError with the orphan ids."""
    from alembic.versions.k6l7m8n9o0p1_vendor_link_cascade_and_status_drop import (
        check_no_link_orphans,  # NEW helper to be added.
    )

    async with postgres_engine_pre_migration.begin() as conn:
        # Insert orphan vendor_risk_link (vendor_id missing in vendors).
        await conn.execute(text(
            "INSERT INTO vendor_risk_links (id, vendor_id, risk_id, created_at) "
            "VALUES (-1, 99999, (SELECT id FROM risks LIMIT 1), now())"
        ))

    with pytest.raises(ValueError, match="orphan"):
        async with postgres_engine_pre_migration.connect() as conn:
            await conn.run_sync(lambda sync: check_no_link_orphans(sync))
```

##### Phase 4 NEW 1.8 — `tests/backend/pytest/migrations/test_vendor_link_partial_failure_recovery_red.py`

```python
"""RED Phase 4: if upgrade() fails partway (e.g. between FK rebuild #1 and
#2), the transaction must roll back to a fully PRE-upgrade state, not a
half-migrated state."""
import pytest
from sqlalchemy import text
from unittest.mock import patch

pytestmark = [pytest.mark.contract, pytest.mark.postgres]


@pytest.mark.asyncio
async def test_failure_midway_rolls_back_to_pre_upgrade(postgres_engine_pre_migration) -> None:
    """Force a synthetic failure on the second op.create_foreign_key call.
    Assert that after rollback no constraint or column changes are visible."""
    from alembic.versions.k6l7m8n9o0p1_vendor_link_cascade_and_status_drop import upgrade

    call_count = {"n": 0}

    def patched_create_fk(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 2:
            raise RuntimeError("synthetic mid-upgrade failure")
        from alembic import op as real_op
        return real_op.create_foreign_key(*args, **kwargs)

    with patch("alembic.op.create_foreign_key", side_effect=patched_create_fk):
        async with postgres_engine_pre_migration.begin() as conn:
            with pytest.raises(RuntimeError, match="synthetic"):
                await conn.run_sync(lambda sync: upgrade())

    # Post-rollback: vendors.status MUST still exist (column drop never ran).
    async with postgres_engine_pre_migration.connect() as conn:
        col = await conn.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='vendors' AND column_name='status'"
        ))
        assert col.first() is not None, "Partial failure left vendors.status dropped"

        # Original FK should still be in place (no CASCADE).
        delcode = await conn.execute(text(
            "SELECT confdeltype FROM pg_constraint "
            "WHERE conname='fk_vendor_risk_links_vendor_id_vendors'"
        ))
        row = delcode.first()
        assert row is not None, "FK was dropped without rebuild — partial state"
        assert row[0] != "c", "CASCADE applied despite mid-upgrade failure"
```

Run all 8 RED files; expect 4 failures on sqlite-only path (mixin/status drop/forward-only) and 4 skips (postgres lane not provisioned). On postgres lane, expect all 8 to fail/error.

#### Step 2 — Introduce `AbstractVendorLink` mixin (no DB change yet)

Path: `backend/app/models/_vendor_link_mixin.py` (NEW).

```python
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, declared_attr, mapped_column


class AbstractVendorLink:
    """Shared column shape for vendor link junction tables.

    Concrete subclasses keep their own ``__tablename__``, target FK column,
    and per-target unique constraint. The mixin enforces uniform shape on
    ``id``, ``vendor_id`` (with DB-level ``ON DELETE CASCADE``), and
    ``created_at`` so all three vendor-link tables stay in sync.

    Vendor-link tables are NOT archivable; this mixin is independent of
    ``ArchivableMixin``. See ADR-005 for the archivable column-shape contract.
    """

    __abstract__ = True

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    @declared_attr
    def vendor_id(cls) -> Mapped[int]:
        return mapped_column(
            ForeignKey("vendors.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
```

After this file lands and only `_vendor_link_mixin.py` is added (no DB migration), §6.1 is partly green for the abstract-marker test; subclass tests still red until step 3.

#### Step 3 — Rebase 3 link models to inherit

##### `backend/app/models/vendor_risk_link.py` (overwrite)

```python
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models._vendor_link_mixin import AbstractVendorLink

if TYPE_CHECKING:
    from app.models.risk import Risk
    from app.models.vendor import Vendor


class VendorRiskLink(AbstractVendorLink, Base):
    __tablename__ = "vendor_risk_links"
    __table_args__ = (UniqueConstraint("vendor_id", "risk_id", name="uq_vendor_risk_link"),)

    risk_id: Mapped[int] = mapped_column(
        ForeignKey("risks.id", ondelete="CASCADE"), index=True, nullable=False,
    )

    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="risk_links")
    risk: Mapped["Risk"] = relationship("Risk", back_populates="vendor_links")
```

##### `backend/app/models/vendor_control_link.py` (overwrite)

Same pattern, swap `risk_id`/`Risk`/`risks`/`uq_vendor_risk_link` for `control_id`/`Control`/`controls`/`uq_vendor_control_link`.

##### `backend/app/models/vendor_kri_link.py` (overwrite)

Same pattern, swap to `kri_id`/`KeyRiskIndicator`/`key_risk_indicators`/`uq_vendor_kri_link`. Note: kri_links already had ondelete=CASCADE on its FKs; the mixin formalises `vendor_id` cascade.

After step 3, §6.1 fully GREEN on sqlite ORM-metadata lane.

#### Step 4 — Generate Alembic migration; run upgrade; postgres-lane GREEN

Path: `backend/alembic/versions/k6l7m8n9o0p1_vendor_link_cascade_and_status_drop.py` (NEW).

```python
"""Unify vendor link cascade and drop Vendor.status.

Revision ID: k6l7m8n9o0p1
Revises: j5k6l7m8n9o0
Create Date: 2026-05-09

Forward-only per ADR-010. Bundled changes:
  * Add ON DELETE CASCADE to vendor_risk_links FKs (vendor_id, risk_id).
  * Add ON DELETE CASCADE to vendor_control_links FKs (vendor_id, control_id).
  * Drop ix_vendors_status index.
  * Drop vendors.status column (single-value enum 'active' after unify cutover).

vendor_kri_links FKs already carry ON DELETE CASCADE per
``v2w3x4y5z6a_add_vendor_kri_links.py:28-29`` and are intentionally untouched.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


revision: str = "k6l7m8n9o0p1"
down_revision: Union[str, Sequence[str], None] = "j5k6l7m8n9o0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def check_no_link_orphans(connection) -> None:
    """Phase-4 precheck: refuse to apply if FK-orphan link rows exist.

    Surfaces a deterministic ValueError listing offending row ids instead
    of letting Postgres fail mid-FK-rebuild with an opaque error.
    """
    for table, fk_col, ref_table in (
        ("vendor_risk_links", "vendor_id", "vendors"),
        ("vendor_risk_links", "risk_id", "risks"),
        ("vendor_control_links", "vendor_id", "vendors"),
        ("vendor_control_links", "control_id", "controls"),
    ):
        rows = connection.execute(text(
            f"SELECT id FROM {table} l "
            f"WHERE NOT EXISTS (SELECT 1 FROM {ref_table} r WHERE r.id = l.{fk_col})"
        )).all()
        if rows:
            ids = [r[0] for r in rows]
            raise ValueError(f"orphan {table}.{fk_col} rows: {ids}")


def upgrade() -> None:
    if op.get_context().dialect.name == "sqlite":
        op.drop_index("ix_vendors_status", table_name="vendors", if_exists=True)
        with op.batch_alter_table("vendors") as batch:
            batch.drop_column("status")
        return

    bind = op.get_bind()
    check_no_link_orphans(bind)

    op.drop_constraint(
        "fk_vendor_risk_links_vendor_id_vendors", "vendor_risk_links", type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_vendor_risk_links_vendor_id_vendors", "vendor_risk_links", "vendors",
        ["vendor_id"], ["id"], ondelete="CASCADE",
    )
    op.drop_constraint(
        "fk_vendor_risk_links_risk_id_risks", "vendor_risk_links", type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_vendor_risk_links_risk_id_risks", "vendor_risk_links", "risks",
        ["risk_id"], ["id"], ondelete="CASCADE",
    )

    op.drop_constraint(
        "fk_vendor_control_links_vendor_id_vendors", "vendor_control_links", type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_vendor_control_links_vendor_id_vendors", "vendor_control_links", "vendors",
        ["vendor_id"], ["id"], ondelete="CASCADE",
    )
    op.drop_constraint(
        "fk_vendor_control_links_control_id_controls", "vendor_control_links", type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_vendor_control_links_control_id_controls", "vendor_control_links", "controls",
        ["control_id"], ["id"], ondelete="CASCADE",
    )

    op.drop_index("ix_vendors_status", table_name="vendors", if_exists=True)
    op.drop_column("vendors", "status")


def downgrade() -> None:
    """Forward-only per ADR-010; restore from a pre-upgrade snapshot."""
    raise NotImplementedError(
        "Forward-only migration. Restore from snapshot per ADR-010."
    )
```

##### Postgres-lane test plan (Step 4 GREEN sequence)

Bring up postgres lane:
```bash
make -f scripts/Makefile postgres-up
alembic upgrade head
pytest -m postgres tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py
pytest -m postgres tests/backend/pytest/migrations/test_vendor_link_migration_forward_only_red.py
pytest -m postgres tests/backend/pytest/migrations/test_vendor_migration_idempotency_red.py
pytest -m postgres tests/backend/pytest/migrations/test_vendor_link_concurrent_writes_red.py
pytest -m postgres tests/backend/pytest/migrations/test_vendor_link_orphan_precheck_red.py
pytest -m postgres tests/backend/pytest/migrations/test_vendor_link_partial_failure_recovery_red.py
```

Pre-upgrade row-count capture (snapshot/restore):
```sql
SELECT COUNT(*) FROM vendors;                  -- N0
SELECT COUNT(*) FROM vendor_risk_links;        -- L0
SELECT COUNT(*) FROM vendor_control_links;     -- L1
SELECT COUNT(*) FROM vendor_kri_links;         -- L2
```

Post-upgrade verification:
- All 6 FKs `confdeltype = 'c'`.
- `vendors.status` absent.
- `ix_vendors_status` absent.
- N0/L0/L1/L2 unchanged (the migration does not delete data; only re-shapes constraints + drops a column).

##### Snapshot/restore procedure for #69+#70

Pre-merge requirements (per ADR-010):
1. **Snapshot**: `pg_dump --format=custom --jobs=4 --file=pre_k6l7m8n9o0p1.dump` against staging clone. Validate `pg_restore --list pre_k6l7m8n9o0p1.dump | wc -l > 0`.
2. **Row counts**: capture N0/L0/L1/L2 in a checked-in artifact (e.g. `.planning/audits/_context/migration-snapshot-k6l7m8n9o0p1.txt`).
3. **Run migration on clone**: `alembic upgrade head`.
4. **Verify**: `pytest -m postgres` green; row counts unchanged.
5. **Production rehearsal**: same on a live-replica clone if available.

Rollback (forward-only — no `downgrade()`):
1. Stop application traffic.
2. `pg_restore --clean --no-owner --jobs=4 --dbname=$DB pre_k6l7m8n9o0p1.dump`.
3. Redeploy the prior application version (which still references `Vendor.status`).
4. Frontend cache MUST be invalidated simultaneously to avoid `vendor.status` undefined errors on cached bundles.

#### Step 5 — Drop status: `models/vendor.py:22-23,82`, `schemas/vendor.py:12-13`, 8 prod sites

##### `backend/app/models/vendor.py` edits
- L22-23 — DELETE `class VendorStatus(str, PyEnum):\n    active = "active"`.
- L82 — DELETE `status: Mapped[str] = mapped_column(String(20), default=VendorStatus.active.value, index=True)`.
- L5 — KEEP `from enum import Enum as PyEnum` (still used by `VendorType` L26 and `VendorReplaceability` L34).

##### `backend/app/models/__init__.py` edits
- Drop `VendorStatus` from import line (line ~34).
- Drop `"VendorStatus"` from `__all__` (line ~80).

##### `backend/app/schemas/vendor.py` edits
- L12-13 — DELETE `class VendorStatusEnum(str, Enum):\n    active = "active"`.
- L53 — DELETE `status: VendorStatusEnum = VendorStatusEnum.active` from `VendorBase`.
- L83 — DELETE `status: VendorStatusEnum | None = None` from `VendorUpdate`.
- L4 — KEEP `from enum import Enum` (still used by `VendorTypeEnum`, `VendorReplaceabilityEnum`).

##### `backend/app/schemas/__init__.py` edits
- L115 — drop `VendorStatusEnum,` from imports.
- L212 — drop `"VendorStatusEnum"` from `__all__`.

##### 8 prod sites (per `plan-loop-2-06-migration-window.md` §5)
- `backend/app/services/_register_listings/vendors.py` — drop import L15, dataclass field L53-54, function param L89, value L103, dict entry L108, computation L121-124, constructor args L129-132, sort col L200, projection L273, fn signature param L482, call kwarg L501.
- `backend/app/services/_register_listings/controls.py:554` — DELETE `status=link.vendor.status,`.
- `backend/app/services/_register_listings/risks.py:430` — DELETE `status=vendor.status,`.
- `backend/app/services/_monitoring_response.py:219` — DELETE `status=vendor.status,`.
- `backend/app/services/_reporting/exports/rows.py:120` — DELETE `"status": vendor.status,`.
- `backend/app/services/_kri_history/direct_application.py:36` — DELETE `status=link.vendor.status,`.
- `backend/scripts/seed_e2e_vendors.py:13` — drop `VendorStatus`. L35,56,77,98,119,140 — DELETE 6 `"status": VendorStatus.active.value,` keys.
- `backend/scripts/seed_e2e_archives.py:283` — replace `vendor.status = entry["status"]` with `vendor.is_archived = bool(entry.get("is_archived", False))`.

Test fixture deletions:
- `tests/backend/pytest/test_vendors.py:436` — DELETE `assert vendor.status == "active"`.
- `tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py:7,37` — DELETE `VendorStatusEnum` import + `status=VendorStatusEnum.active.value` fixture line.
- `tests/backend/pytest/test_dashboard.py:960,970,980` — DELETE `VendorStatus.active.value` fixture lines.

#### Step 6 — Lock collapse: remove `_archivable.py:60-65 legacy_values["vendors"]` entry

`backend/app/models/_archivable.py:60-64` — change:
```python
legacy_values = {
    "risks": ("archived",),
    "controls": ("archived",),
    "vendors": ("inactive",),
}.get(getattr(model, "__tablename__", ""))
```
to:
```python
legacy_values = {
    "risks": ("archived",),
    "controls": ("archived",),
}.get(getattr(model, "__tablename__", ""))
```

The early-return at L67 fires when `legacy_values is None`, so `archived_clause(Vendor)` collapses to `Vendor.is_archived.is_(archived)`.

Run architecture locks:
```bash
make -f scripts/Makefile test-architecture-locks
```

#### Step 7 — Doc updates (7 files)

1. `backend/app/models/README.md` — add `AbstractVendorLink` to mixin inventory section; cross-link `_archivable.py`. ~3-line bullet describing shared shape, `__abstract__ = True`, vendor-link tables NOT archivable.
2. `backend/app/services/_vendor_links/README.md` — replace any line claiming cascade is "ORM-level only" with "DB-level via ON DELETE CASCADE on `vendor_id` and the target FK".
3. `docs/adr/ADR-005-archivable-mixin-schema-contract.md:13-16` — add paragraph noting `Vendor.status` was dropped in revision `k6l7m8n9o0p1`; the legacy `("inactive",)` alias is retired; vendors archive solely via `is_archived`.
4. `docs/adr/ADR-010-postgres-migration-rehearsal-contract.md:23-30` — append bullet under "Migration Impact":
   > `vendors.status` column dropped (single-value enum `'active'` after unify cutover); `vendor_risk_links` and `vendor_control_links` FKs rebuilt with `ON DELETE CASCADE` to match `vendor_kri_links` semantics. Bundled in revision `k6l7m8n9o0p1`.
5. `docs/README.md:111-112` — strike any sentence mentioning `Vendor.status`.
6. `docs/DOCUMENTATION_TREE.md:84` — strike `vendor.status` reference.
7. `docs/BUSINESS_LOGIC.md:619` — replace `Vendor.status` reference with note that vendor lifecycle is managed exclusively through `is_archived` per ADR-005.

#### Step 8 — Final gates

```bash
make -f scripts/Makefile test-architecture-locks
pytest -m postgres
pytest tests/backend/pytest/test_vendors.py tests/backend/pytest/test_vendor_links.py tests/backend/pytest/test_kris_rbac.py tests/backend/pytest/test_vendor_link_workflow_module.py tests/backend/pytest/api/v1/test_collection_grouping_api.py tests/backend/pytest/test_dashboard.py tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py tests/backend/pytest/test_e2e_seed_archive_state_red.py
ruff check backend tests
mypy backend/app
python scripts/security/validate_authz_capability_contract.py
```

#### Step 9 — Single bundled commit

Title: `refactor(vendor): introduce AbstractVendorLink mixin and drop Vendor.status`

Bundled because:
1. Both axes touch `vendor*` schema in one Alembic revision.
2. Both share ADR-010 forward-only entry.
3. Both share rehearsal scope (snapshot pre-upgrade, run upgrade, verify counts).
4. Single migration window minimises operational risk.

Allow split into 2 commits if diff > 400 lines OR mypy can't type-check intermediate state cleanly:
- C1 (mixin): mixin + 3 link model rebases + RED tests §1.1, §1.4 + docs `models/README.md`, `_vendor_links/README.md`, ADR-010 mixin entry.
- C2 (status drop + cascade migration): Alembic revision + Vendor model edits + 8 service sites + seed scripts + remaining docs + RED tests §1.2, §1.3, §1.5, §1.6, §1.7, §1.8.

### Lock/TOML/contract updates summary
- `tests/backend/pytest/architecture/_archive_allowlist.toml` — verify vendor-link tables not listed as archivable (Loop B confirmed).
- `tests/backend/pytest/architecture/_naming_allowlist.toml` — verify `_vendor_link_mixin` not flagged by underscore-prefix rule (compare with `_archivable.py`).
- `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml` — no change.
- `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` — no change.

### Rollback note
Forward-only. `downgrade()` raises `NotImplementedError`. Operational rollback = `pg_restore` from pre-upgrade snapshot per ADR-010 §"Rollback Strategy". Application rollback = redeploy prior version with frontend cache invalidation simultaneously.

### Effort
**XL (35-42h, NOT L+).** Aligned with Phase 4 effort correction.

---

## Item #77b (NEW from Loop 3 A7) — Vendor.status FE TS cleanup

### Final disposition
ACCEPT (P3 trailer). Lands AFTER #69+#70 ships and frontend bundle ship-cycle invalidates cache.

### Dependencies
**HARD prerequisite**: #69+#70 merged + deployed; backend `Vendor.status` no longer in API responses.

### TDD shape
Frontend unit-test parity with `tests/frontend/unit/src/lib/capabilities.test.ts`.

### Failing test(s) to write FIRST
Path: `tests/frontend/unit/src/types/vendor.types.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import type { Vendor, VendorListParams } from '@/types/vendor';

describe('Vendor type post-status-drop', () => {
    it('Vendor type has no status field', () => {
        const v: Vendor = {
            id: 1,
            name: 'X',
            outsourcing_owner_user_id: 1,
            linked_risks: [],
            vendor_type: 'ict',
            risk_score_1_5: 1,
            supports_important_core_insurance_function: false,
            dora_relevant: false,
            is_significant_vendor: false,
            has_alternative_providers: false,
            process: 'p',
            is_archived: false,
            created_at: 'now',
            updated_at: 'now',
        };
        // @ts-expect-error status field must not exist on Vendor
        const s = v.status;
        expect(s).toBeUndefined();
    });

    it('VendorListParams has no status query field', () => {
        const p: VendorListParams = {};
        // @ts-expect-error status query removed
        const s = p.status;
        expect(s).toBeUndefined();
    });
});
```

### Code/file changes

##### `frontend/src/types/vendor.ts` edits
- L1 — DELETE `export type VendorStatus = 'active';`.
- L64 — DELETE `status: VendorStatus;` from `Vendor` interface.
- L94 — DELETE `status?: VendorStatus | 'inactive' | 'archived';` from `VendorListParams`.
- DELETE any other `VendorStatus` re-exports in this file.

##### `frontend/src/services/api/schemas/entities/vendors.ts` edits
- Drop any `status` field on the Zod schema for the vendor entity (verify by reading file; remove the corresponding `.status` schema line and any `VendorStatus`/`VendorStatusEnum` import).

##### UI display logic
- `frontend/src/components/kri/useKriModalState.ts:90,134` — DELETE `status: vendor.status,` lines.
- `frontend/src/components/kri-form/useKriLookups.ts:115` — DELETE `status: vendor.status,` line.
- `frontend/src/components/vendor-form/vendorForm.types.ts:4,74` — DELETE `VendorStatus` import + `normalizeVendorStatus(value: VendorStatus | undefined): VendorStatus` function (becomes dead code; remove all callers).
- `frontend/src/pages/vendors/vendorsPagePresentation.ts:3` — DELETE `VendorStatus` from import.
- `frontend/src/pages/vendors/vendorsPagePresentation.ts:22-23` — DELETE `VendorListStatusFilter` and `VendorDisplayStatus` type aliases (dead after removal). Audit consumers and replace with `is_archived`-based display.

##### Frontend e2e cleanup (NOT in this commit; flagged for Loop 6)
- `tests/frontend/e2e/vendors.spec.ts` `ensureVendorStatus(...)` helpers — Loop 6 owns rename to `ensureVendorArchived(...)`.
- `tests/frontend/unit/src/e2e/apiAuth.archive-state.test.ts:114` — Loop 6 owns.

### Lock/TOML/contract updates
NONE.

### README / doc updates
- `frontend/README.md` — if it mentions `vendor.status`, strike. (Verify by reading file; likely silent.)

### Verification commands
```bash
cd frontend
npm run typecheck
npm run test:unit -- vendor.types
npm run lint
cd ..
```

### Commit boundary
ONE commit: `chore(frontend): drop Vendor.status references after backend column drop`. Lands in PR cycle after backend `k6l7m8n9o0p1` is in main + deployed.

### Rollback note
`git revert <commit>` — frontend-only; no DB.

### Effort
**S** (~1h).

---

## Item #49 (S2.2) — INLINE `_control_execution/monitoring.py` 11-line wrapper

### Final disposition
ACCEPT (P1). Wrapper at `backend/app/services/_control_execution/monitoring.py:1-11` is an 11-line passthrough:
```python
async def load_control_execution_monitoring_context(db: AsyncSession) -> MonitoringResponseContext:
    now = utc_now()
    return await load_monitoring_response_context(db, now=now, today=now.date())
```

4 callers, all in `backend/app/services/_control_execution/link_governance.py:25,62,91,141,170`. Lock pinned at `tests/backend/pytest/test_architecture_deepening_contracts.py:188,192`.

### Dependencies
NONE.

### TDD shape
Failing-existence-test-first; lock test at `:188,192` is REWRITTEN.

### Failing test(s) to write FIRST
Path: `tests/backend/pytest/architecture/test_control_execution_monitoring_inlined_red.py`

```python
"""RED: monitoring.py wrapper deleted; inlined into link_governance."""
import inspect
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract


def test_monitoring_wrapper_module_removed() -> None:
    assert not Path("backend/app/services/_control_execution/monitoring.py").exists()


def test_link_governance_inlines_load_call() -> None:
    from app.services._control_execution import link_governance
    src = inspect.getsource(link_governance)
    assert "from app.services._monitoring_response import" in src
    assert "load_control_execution_monitoring_context" not in src
    assert "load_monitoring_response_context" in src
```

### Code/file changes

1. **DELETE** `backend/app/services/_control_execution/monitoring.py` (11 lines).

2. **EDIT** `backend/app/services/_control_execution/link_governance.py`:
   - L25 — change `from app.services._control_execution.monitoring import load_control_execution_monitoring_context` to `from app.services._monitoring_response import load_monitoring_response_context\nfrom app.core.datetime_utils import utc_now`.
   - L62 — change `context = await load_control_execution_monitoring_context(db)` to:
     ```python
     now = utc_now()
     context = await load_monitoring_response_context(db, now=now, today=now.date())
     ```
   - L91 — change `monitoring_context=await load_control_execution_monitoring_context(db),` similarly to inline `now`/`today` args.
   - L141, L170 — same inlining.

   Alternative: keep one local helper at the top of `link_governance.py`:
   ```python
   async def _ctx(db: AsyncSession) -> MonitoringResponseContext:
       now = utc_now()
       return await load_monitoring_response_context(db, now=now, today=now.date())
   ```
   and call `_ctx(db)` 4 times. Cleaner; recommended.

3. **REWRITE** `tests/backend/pytest/test_architecture_deepening_contracts.py:183-194`:
   - L188 — change `assert hasattr(monitoring, "load_control_execution_monitoring_context")` to a test for `_ctx` helper or remove this assertion entirely.
   - L192 — change `assert "from app.services._control_execution.monitoring" in governance_source` to `assert "from app.services._monitoring_response import" in governance_source`.
   - L184 — drop `monitoring` from the imports tuple.

   New body:
   ```python
   def test_control_execution_governance_uses_split_modules() -> None:
       from app.services._control_execution import access, link_governance, link_policy, projection

       assert hasattr(access, "ControlRiskAccessDecision")
       assert hasattr(projection, "ControlExecutionProjection")
       assert hasattr(link_policy, "ControlRiskLinkPlan")

       governance_source = inspect.getsource(link_governance)
       assert "from app.services._monitoring_response import" in governance_source
       assert "app.api.v1.endpoints" not in governance_source
   ```

### Lock/TOML/contract updates
- `tests/backend/pytest/test_architecture_deepening_contracts.py:188,192` — rewrite per above.

### README / doc updates
- `backend/app/services/_control_execution/README.md` (if exists) — strike `monitoring.py` from inventory; note inlining.

### Verification commands
```bash
pytest tests/backend/pytest/architecture/test_control_execution_monitoring_inlined_red.py
pytest tests/backend/pytest/test_architecture_deepening_contracts.py::test_control_execution_governance_uses_split_modules
ruff check backend tests
mypy backend/app
make -f scripts/Makefile test-architecture-locks
```

### Commit boundary
ONE commit: `refactor(control-execution): inline monitoring wrapper into link_governance`.

### Rollback note
`git revert <commit>` — code-shape-only.

### Effort
**S** (~45 min).

---

## Item #45b (BE-N8b) — Ownership resolver factory

### Final disposition
ACCEPT (P4) **conditional on #45a green**. Replaces 8 free functions in `backend/app/core/_permissions/ownership.py:1-142` with factory `make_ownership_resolvers(*, model, owner_column, archived_column?, bridge?)`. **Phase 4 correction: factory MUST accept per-method archived filter** (KRI side has asymmetric `is_archived.is_(False)` only on risk-scope expansion paths at L33,L68; KRI-direct paths at L13,L51 do NOT filter archived).

### Dependencies
- **#45a green** (3 characterization tests in main): `test_ownership_resolver_kri_archived_asymmetry.py`, `test_ownership_resolver_control_join.py`, `test_visible_ids_via_ownership.py`.

### TDD shape
Factory-equivalence test asserting factory output ≡ legacy free-function output across a fixture matrix (archived/non-archived rows × present/absent links × matching/non-matching owners).

### Failing test(s) to write FIRST
Path: `tests/backend/pytest/test_ownership_resolver_factory_equivalence_red.py`

```python
"""RED: factory-produced resolvers are byte-equivalent to legacy free functions."""
import pytest

pytestmark = pytest.mark.contract


@pytest.mark.asyncio
async def test_kri_factory_resolvers_equivalent(client_factory, kri_fixture_matrix):
    from app.core._permissions._ownership_factory import make_ownership_resolvers
    from app.models import KeyRiskIndicator
    from app.core._permissions import ownership as legacy

    async with client_factory() as client:
        async with client.app.state.db_factory() as db:
            kri_resolvers = make_ownership_resolvers(
                model=KeyRiskIndicator,
                owner_column="reporting_owner_id",
                archived_column="is_archived",
                bridge=None,
            )
            for case in kri_fixture_matrix:
                a = await kri_resolvers.is_owner(db, case.user_id, case.kri_id)
                b = await legacy.is_kri_reporting_owner(db, case.user_id, case.kri_id)
                assert a == b, f"is_owner mismatch on {case}"

                a = await kri_resolvers.is_target_owner(db, case.user_id, case.risk_id)
                b = await legacy.is_risk_kri_reporting_owner(db, case.user_id, case.risk_id)
                assert a == b, f"is_target_owner mismatch on {case}"

                a = sorted(await kri_resolvers.ids_where_owner(db, case.user_id))
                b = sorted(await legacy.get_kri_ids_where_reporting_owner(db, case.user_id))
                assert a == b, f"ids_where_owner mismatch on {case}"

                a = sorted(await kri_resolvers.target_ids_where_owner(db, case.user_id))
                b = sorted(await legacy.get_risk_ids_where_kri_reporting_owner(db, case.user_id))
                assert a == b, f"target_ids_where_owner mismatch on {case}"


@pytest.mark.asyncio
async def test_control_factory_resolvers_equivalent(client_factory, control_fixture_matrix):
    from app.core._permissions._ownership_factory import make_ownership_resolvers
    from app.models import Control, ControlRiskLink
    from app.core._permissions import ownership as legacy

    async with client_factory() as client:
        async with client.app.state.db_factory() as db:
            control_resolvers = make_ownership_resolvers(
                model=Control,
                owner_column="control_owner_id",
                archived_column=None,
                bridge=(ControlRiskLink, "control_id", "risk_id"),
            )
            for case in control_fixture_matrix:
                a = await control_resolvers.is_owner(db, case.user_id, case.control_id)
                b = await legacy.is_control_owner(db, case.user_id, case.control_id)
                assert a == b

                a = await control_resolvers.is_target_owner(db, case.user_id, case.risk_id)
                b = await legacy.is_risk_control_owner(db, case.user_id, case.risk_id)
                assert a == b

                a = sorted(await control_resolvers.ids_where_owner(db, case.user_id))
                b = sorted(await legacy.get_control_ids_where_owner(db, case.user_id))
                assert a == b

                a = sorted(await control_resolvers.target_ids_where_owner(db, case.user_id))
                b = sorted(await legacy.get_risk_ids_where_control_owner(db, case.user_id))
                assert a == b


def test_archived_filter_applied_per_method() -> None:
    """Phase 4 invariant: KRI risk-scope methods filter is_archived=False;
    KRI-direct methods do NOT (asymmetric)."""
    from app.core._permissions._ownership_factory import make_ownership_resolvers
    from app.models import KeyRiskIndicator

    resolvers = make_ownership_resolvers(
        model=KeyRiskIndicator,
        owner_column="reporting_owner_id",
        archived_column="is_archived",
        bridge=None,
    )
    # The factory must expose the per-method filter wiring on the resolver
    # bundle (e.g. via metadata/predicate inspection):
    assert resolvers.archived_filter_methods == {"is_target_owner", "target_ids_where_owner"}
```

### Code/file changes

**NEW** `backend/app/core/_permissions/_ownership_factory.py`:

```python
"""Factory producing ownership resolver bundles from a (model, columns, bridge) spec.

Phase 4 invariant: the factory accepts per-method archived filter selection.
KRI-direct methods (is_owner, ids_where_owner) do NOT filter archived rows;
risk-scope methods (is_target_owner, target_ids_where_owner) DO filter
``is_archived.is_(False)``. This matches the original asymmetry at
``ownership.py:33`` and ``ownership.py:68``.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True)
class OwnershipResolvers:
    is_owner: Callable[[AsyncSession, int, int], Awaitable[bool]]
    is_target_owner: Callable[[AsyncSession, int, int], Awaitable[bool]]
    ids_where_owner: Callable[[AsyncSession, int], Awaitable[list[int]]]
    target_ids_where_owner: Callable[[AsyncSession, int], Awaitable[list[int]]]
    archived_filter_methods: frozenset[str]


def make_ownership_resolvers(
    *,
    model: Any,
    owner_column: str,
    archived_column: Optional[str] = None,
    bridge: Optional[tuple[Any, str, str]] = None,
) -> OwnershipResolvers:
    owner_col = getattr(model, owner_column)
    archived_col = getattr(model, archived_column) if archived_column else None

    archived_methods: set[str] = set()

    async def is_owner(db: AsyncSession, user_id: int, entity_id: int) -> bool:
        # KRI-direct path: NEVER filter archived.
        result = await db.execute(select(owner_col).where(model.id == entity_id))
        return result.scalar_one_or_none() == user_id

    async def ids_where_owner(db: AsyncSession, user_id: int) -> list[int]:
        # KRI-direct path: NEVER filter archived.
        result = await db.execute(select(model.id).where(owner_col == user_id))
        return [r[0] for r in result.all()]

    if bridge is None:
        # KRI shape: target_id is on the model itself (risk_id).
        target_attr = getattr(model, "risk_id")

        async def is_target_owner(db: AsyncSession, user_id: int, target_id: int) -> bool:
            stmt = select(model.id).where(target_attr == target_id, owner_col == user_id)
            if archived_col is not None:
                stmt = stmt.where(archived_col.is_(False))
                archived_methods.add("is_target_owner")
            result = await db.execute(stmt.limit(1))
            return result.scalar_one_or_none() is not None

        async def target_ids_where_owner(db: AsyncSession, user_id: int) -> list[int]:
            stmt = select(target_attr).where(owner_col == user_id)
            if archived_col is not None:
                stmt = stmt.where(archived_col.is_(False))
                archived_methods.add("target_ids_where_owner")
            stmt = stmt.distinct()
            result = await db.execute(stmt)
            return [r[0] for r in result.all()]
    else:
        # Control shape: bridge through ControlRiskLink.
        bridge_model, bridge_local_fk, bridge_target_fk = bridge
        bridge_local_col = getattr(bridge_model, bridge_local_fk)
        bridge_target_col = getattr(bridge_model, bridge_target_fk)

        async def is_target_owner(db: AsyncSession, user_id: int, target_id: int) -> bool:
            stmt = (
                select(model.id)
                .join(bridge_model, model.id == bridge_local_col)
                .where(bridge_target_col == target_id, owner_col == user_id)
                .limit(1)
            )
            if archived_col is not None:
                stmt = stmt.where(archived_col.is_(False))
                archived_methods.add("is_target_owner")
            result = await db.execute(stmt)
            return result.scalar_one_or_none() is not None

        async def target_ids_where_owner(db: AsyncSession, user_id: int) -> list[int]:
            stmt = (
                select(bridge_target_col)
                .join(model, model.id == bridge_local_col)
                .where(owner_col == user_id)
                .distinct()
            )
            if archived_col is not None:
                stmt = stmt.where(archived_col.is_(False))
                archived_methods.add("target_ids_where_owner")
            result = await db.execute(stmt)
            return [r[0] for r in result.all()]

    # Pre-compute archived_filter_methods set: introspect at construction time.
    if archived_col is not None:
        archived_methods.update({"is_target_owner", "target_ids_where_owner"})

    return OwnershipResolvers(
        is_owner=is_owner,
        is_target_owner=is_target_owner,
        ids_where_owner=ids_where_owner,
        target_ids_where_owner=target_ids_where_owner,
        archived_filter_methods=frozenset(archived_methods),
    )
```

**REWRITE** `backend/app/core/_permissions/ownership.py`:

```python
"""Ownership resolvers (KRI + Control), produced by the shared factory.

Public surface preserves the 8 free-function names so external callers in
``entity_access.py`` keep importing the same identifiers. Internally the
implementation is a single factory call per entity.
"""
from __future__ import annotations

from app.core._permissions._ownership_factory import make_ownership_resolvers
from app.models import Control, ControlRiskLink, KeyRiskIndicator

_kri = make_ownership_resolvers(
    model=KeyRiskIndicator,
    owner_column="reporting_owner_id",
    archived_column="is_archived",
    bridge=None,
)
_control = make_ownership_resolvers(
    model=Control,
    owner_column="control_owner_id",
    archived_column=None,
    bridge=(ControlRiskLink, "control_id", "risk_id"),
)

is_kri_reporting_owner = _kri.is_owner
is_risk_kri_reporting_owner = _kri.is_target_owner
get_kri_ids_where_reporting_owner = _kri.ids_where_owner
get_risk_ids_where_kri_reporting_owner = _kri.target_ids_where_owner

is_control_owner = _control.is_owner
is_risk_control_owner = _control.is_target_owner
get_control_ids_where_owner = _control.ids_where_owner
get_risk_ids_where_control_owner = _control.target_ids_where_owner
```

`backend/app/core/_permissions/entity_access.py:21,23,48` — likely no edit needed (import names preserved). Verify via grep before merge.

### Lock/TOML/contract updates
- Cross-check `tests/backend/pytest/architecture/test_w12_resource_permissions_keys_match_capability_contract_red.py:46-72` stays green (no `MeCapabilities.resource_permissions` shape change).

### README / doc updates
- `backend/app/core/_permissions/README.md` (if exists; create if not) — note factory + asymmetry-by-design comment: "KRI risk-scope filters `is_archived=False`; KRI-direct does not. This is intentional."

### Verification commands
```bash
pytest tests/backend/pytest/test_ownership_resolver_factory_equivalence_red.py
pytest tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py
pytest tests/backend/pytest/test_ownership_resolver_control_join.py
pytest tests/backend/pytest/test_visible_ids_via_ownership.py
pytest tests/backend/pytest/architecture/test_w12_resource_permissions_keys_match_capability_contract_red.py
ruff check backend tests
mypy backend/app
make -f scripts/Makefile test-architecture-locks
```

### Commit boundary
ONE commit: `refactor(permissions): introduce ownership resolver factory; preserve public surface`.

### Rollback note
Internal-only; revert restores 8 free functions. No data migration; no schema change.

### Effort
**M** (~3-4h: factory + rewrite + 4 fixture-matrix tests + verification).

---

## Cross-domain handoff notes

### #45b → #45a (hard prereq)
- #45a is in the **Crosscut domain** (Phase 5 D8). It owns the 3 characterization tests:
  - `tests/backend/pytest/test_ownership_resolver_kri_archived_asymmetry.py`
  - `tests/backend/pytest/test_ownership_resolver_control_join.py`
  - `tests/backend/pytest/test_visible_ids_via_ownership.py`
- These tests must be GREEN against current `ownership.py` BEFORE #45b lands. They become regression locks against #45b's factory rewrite.
- If #45a tests fail unexpectedly when added, that signals divergence between what the recipe assumes and current code; halt and investigate.

### #69+#70 → #77b (hard prereq with deployment gate)
- Backend revision `k6l7m8n9o0p1` must be in main + deployed to all environments where frontend bundles ship from.
- Frontend bundle ship-cycle must invalidate cached `vendor.status` references between deploy of backend + deploy of #77b's TS cleanup.

### #69+#70 → KRI domain (parallel-write conflict)
- `vendor_kri_link.py` is rebased to `AbstractVendorLink` in step 3. Loop 4 (KRI domain) MUST NOT touch this file in the same migration window. If KRI domain plans to edit `vendor_kri_link.py` (verify via `plan-loop-1-04-kris.md` before starting), sequence one before the other (this loop first; KRI loop merges after).

### #16 → frontend (no handoff)
- Tombstones return 404 post-deletion; frontend never called these (always 410'd via OpenAPI contract).

### #57 → no handoff
- Pure backend cleanup; one endpoint repointed; no frontend impact.

### #17 → no handoff
- Pure backend cleanup; 14 import lines repointed.

### #13 → no handoff
- Dead-code delete; 0 importers.

### #31 → no handoff
- Pure backend extraction; same module name + same return shapes preserved.

### #49 → no handoff
- 11-line wrapper inlined; same `link_governance.py` callsites.

---

## Postgres-lane test plan (consolidated for #69+#70)

| Test | Path | Phase | Markers |
|------|------|-------|---------|
| 1 | `tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py` | base | `[contract, postgres]` |
| 2 | `tests/backend/pytest/migrations/test_vendor_link_migration_forward_only_red.py` | base | `[contract]` (no DB) |
| 3 | `tests/backend/pytest/migrations/test_vendor_migration_idempotency_red.py` | Phase 4 | `[contract, postgres]` |
| 4 | `tests/backend/pytest/migrations/test_vendor_link_concurrent_writes_red.py` | Phase 4 | `[contract, postgres]` |
| 5 | `tests/backend/pytest/migrations/test_vendor_link_orphan_precheck_red.py` | Phase 4 | `[contract, postgres]` |
| 6 | `tests/backend/pytest/migrations/test_vendor_link_partial_failure_recovery_red.py` | Phase 4 | `[contract, postgres]` |
| 7 | `tests/backend/pytest/architecture/test_vendor_link_mixin_red.py` | base | `[contract]` |
| 8 | `tests/backend/pytest/architecture/test_vendor_status_drop_red.py` | base | `[contract]` |

Postgres-lane invocation:
```bash
make -f scripts/Makefile postgres-up
alembic upgrade head
pytest -m "contract and postgres" tests/backend/pytest/migrations/
```

Sqlite-lane (architecture-only):
```bash
pytest -m "contract and not postgres" tests/backend/pytest/architecture/
```

---

## Snapshot/restore procedure for #69+#70 (operational)

Pre-merge (in staging):
```bash
# 1. Capture snapshot.
pg_dump --format=custom --jobs=4 \
  --file=pre_k6l7m8n9o0p1_$(date +%Y%m%d-%H%M).dump $STAGING_DB

# 2. Capture row counts (checked into .planning/audits/_context/migration-snapshot-k6l7m8n9o0p1.txt).
psql $STAGING_DB -c "SELECT 'vendors' AS t, COUNT(*) FROM vendors
                     UNION ALL SELECT 'vendor_risk_links', COUNT(*) FROM vendor_risk_links
                     UNION ALL SELECT 'vendor_control_links', COUNT(*) FROM vendor_control_links
                     UNION ALL SELECT 'vendor_kri_links', COUNT(*) FROM vendor_kri_links;"

# 3. Run migration on staging clone.
alembic upgrade head

# 4. Verify post-state.
pytest -m "contract and postgres" tests/backend/pytest/migrations/

# 5. Verify row counts unchanged (re-run query above; assert same).
```

Production cutover (operational rollback):
```bash
# If post-deploy issue surfaces:
# 1. Stop application traffic.
# 2. Restore snapshot.
pg_restore --clean --no-owner --jobs=4 \
  --dbname=$PROD_DB pre_k6l7m8n9o0p1_<timestamp>.dump

# 3. Redeploy prior backend version.
# 4. Invalidate frontend bundle caches (CDN purge).
```

`downgrade()` is **never** called; it raises `NotImplementedError`. Forward-only per ADR-010.
