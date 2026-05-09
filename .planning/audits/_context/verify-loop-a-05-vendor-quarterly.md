# Phase 2 Loop A — Verification: Vendor + Quarterly Comparison + Reports + Monitoring

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Verification only. No edits.

Conventions: `file:line` cite + ≤15-word quote per finding.

---

## Item #13 — S5.1 / C-N2: Vendor-link helpers shim delete + contract sync

**Verdict: ACCEPT (P1) — confirmed by current repo state.**

### Code state

- `backend/app/api/v1/endpoints/vendor_link_helpers.py:14-107` — full duplicate of `_vendor_governance/links.py` primitives.
  - `vendor_link_helpers.py:14-16` quote: `VendorLink: TypeAlias = VendorRiskLink | VendorControlLink | VendorKRILink`.
  - `vendor_link_helpers.py:91` quote: `await commit_service_transaction(db)` (in `create_vendor_link`).
  - `vendor_link_helpers.py:107` quote: `await commit_service_transaction(db)` (in `delete_vendor_link`).
  - Differs from `_vendor_governance/links.py` in two ways:
    - Raises `HTTPException` (`vendor_link_helpers.py:34, 37, 42, 45, 50, 79, 104`) vs. `NotFoundError`/`ConflictError`/`AuthorizationError`/`ValidationError` in `_vendor_governance/links.py:9, 47-60, 89, 114`.
    - Archive precedence: `vendor_link_helpers.py:44-50` raises 409 (archived) BEFORE 403 (write). `_vendor_governance/links.py:54-60` raises 403 first. Two divergent orderings — C-N2.
  - Uses `commit_service_transaction(db)` whereas service-side `_vendor_governance/links.py:101, 117` only calls `await db.flush()` — ADR-002 transaction-ownership ambiguity.

### Importers (production + tests)

`grep "from app.api.v1.endpoints.vendor_link_helpers" --include="*.py"` returns ZERO hits across both `backend/` and `tests/`. Confirmed.

The only consumers of the live helpers are `backend/app/services/_vendor_links/workflow.py:33-39`:
> `from app.services._vendor_governance.links import (VendorLinkField, VendorLinkModel, create_vendor_link, delete_vendor_link, require_vendor_access,)`

### Doc/contract citations to update (4 in two files)

- `docs/security/authorization-capability-contract.md:121` — line cites `backend/app/api/v1/endpoints/vendor_link_helpers.py` in AUTHZ-VENDORS-READ `service_policy`.
- `docs/security/authorization-capability-contract.md:122` — same module cited again in AUTHZ-VENDORS-WRITE.
- `docs/security/authorization-capability-contract.json:55` — entry in `sensitive_change_paths`. Quote: `"backend/app/api/v1/endpoints/vendor_link_helpers.py"`.
- `docs/security/authorization-capability-contract.json:479` — service_policy citation under AUTHZ-VENDORS-READ.
- `docs/security/authorization-capability-contract.json:502` — service_policy citation under AUTHZ-VENDORS-WRITE.

(Three JSON entries, two MD entries. Audit phrasing "4 citations" rounded; actual count is 5 lines.)

### Verification status

C-N2 (archive precedence inconsistency) is REAL — same-named helper exists in two locations with divergent ordering. Deleting `vendor_link_helpers.py` collapses the divergence. Developer Accept (P1) holds; orchestrator no override needed.

---

## Item #16 — S8.10: Reports legacy-excel tombstone removal

**Verdict: ACCEPT WITH MOD (P2) — confirmed.**

### Tombstone routes (current repo)

Three files; two are exclusively tombstones, two are mixed live-plus-tombstone.

#### Pure tombstone (entire file)
- `backend/app/api/v1/endpoints/reports/legacy_excel.py:14` — `@router.get("/controls/excel", responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE)`. Body: `raise excel_export_removed(...)` (line 20).
- `backend/app/api/v1/endpoints/reports/legacy_excel.py:23` — `@router.get("/risks/excel", responses=...)`. Body: `raise excel_export_removed(...)` (line 29).
- 2 tombstone routes, 30 lines total. Both raise 410 GONE.

#### Mixed
- `backend/app/api/v1/endpoints/reports/audit_trail_excel.py:133` — `@router.get("/audit-trail/excel", responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE)`. Body line 139: `raise excel_export_removed(replacement="/api/v1/reports/audit-trail/export?format=csv")`.
  - Also has live `/audit-trail/export` route (line 142).
- `backend/app/api/v1/endpoints/reports/summary_excel.py:97` — `@router.get("/summary/excel", responses=...)`. Body line 103: `raise excel_export_removed(...)`.
  - Also has live `/summary/export` route (line 106).
- Note: live `audit_trail_excel.py:142` and `summary_excel.py:106` ALSO carry `EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE` for their `xlsx` rejection inside `resolve_export_format`. Removing tombstones leaves `_streaming.py` API surface intact for the live endpoints.

### Test/contract callers asserting 410

- `tests/backend/pytest/api/v1/test_reports_audit.py:270` — `async def test_audit_trail_legacy_excel_endpoint_returns_gone(`. Line 274 `await auth_client.get("/api/v1/reports/audit-trail/excel")`; line 277 `assert detail["code"] == "excel_export_removed"`.
- `tests/backend/pytest/test_reports_rbac.py:193` — `response = await auth_client.get("/api/v1/reports/controls/excel")`; line 195 `assert response.json()["detail"]["code"] == "excel_export_removed"`.
- `tests/backend/pytest/test_reports_rbac.py:369` — `response = await auth_client.get("/api/v1/reports/risks/excel")`. Line 371 same assertion.
- `tests/backend/pytest/test_reports_rbac.py:379` — `response = await auth_client.get("/api/v1/reports/summary/excel")`. Line 381 same assertion.
- `tests/backend/pytest/test_reports_rbac.py:391` — `response = await client_employee.get(f".../controls/excel?department_id=...")`.
- `tests/backend/pytest/test_reports_rbac.py:410, 424` — additional `excel_removed` assertions.
- `tests/backend/pytest/test_openapi_contract_parity.py:26-29` — quote: `"/api/v1/reports/controls/excel", "/api/v1/reports/risks/excel", "/api/v1/reports/summary/excel", "/api/v1/reports/audit-trail/excel"` listed as expected paths.
- `tests/backend/pytest/test_protocol_contract_probe.py:26` — `path="/api/v1/reports/controls/excel"`. Line 108 `"response_excerpt": '{"detail":{"code":"excel_export_removed"}}'`.
- `scripts/security/protocol_contract_probe.py:61, 71, 81, 91` — paths `/controls/excel`, `/risks/excel`, `/summary/excel`, `/audit-trail/excel`.
- `tests/backend/pytest/test_vendor_reports.py:53, 57` — `assert detail["code"] == "excel_export_removed"` (vendor route uses `resolve_export_format`, not a tombstone — these are independent).

### Other doc/security references

- `docs/security/reports/contract-drift-remediation-2026-02-21.md:25` — quote: `backend/app/api/v1/endpoints/reports/legacy_excel.py` listed.
- `docs/security/reports/deep-scan-remediation-2026-02-20.md:81` — same module cited.

### Live callers of `/excel` paths

ZERO frontend or backend live callers (only test and probe assertions). Confirmed via grep of `controls/excel|risks/excel|summary/excel|audit-trail/excel` — all hits are server-side routes or test assertions.

### Verification status

Removing the four `/excel` route variants and `_streaming.py` 410 helpers requires deleting 4 test cases plus 2 OpenAPI/protocol parity entries plus 2 doc citations. Phase 1 path inventory matches.

---

## Item #17 — S2.1: `_monitoring_response` shim consolidation

**Verdict: ACCEPT (P2) — confirmed.**

### Endpoint shim

- `backend/app/api/v1/endpoints/_monitoring_response.py:1` — quote: `"""Compatibility Adapter for monitoring response projection helpers."""`.
- `backend/app/api/v1/endpoints/_monitoring_response.py:3-13` — pure `from app.services._monitoring_response import (...)` re-export with no policy added.
- `backend/app/api/v1/endpoints/_monitoring_response.py:15-25` — `__all__ = [...]` listing the same nine names.
- File is 25 lines total. Adds zero logic.

### Importers (endpoint-side shim) — 14 endpoint files

`grep "from app.api.v1.endpoints._monitoring_response"`:

1. `backend/app/api/v1/endpoints/departments/controls.py:10`
2. `backend/app/api/v1/endpoints/departments/kris.py:8`
3. `backend/app/api/v1/endpoints/controls/linking.py:4`
4. `backend/app/api/v1/endpoints/controls/crud/create.py:6`
5. `backend/app/api/v1/endpoints/controls/crud/restore.py:6`
6. `backend/app/api/v1/endpoints/controls/crud/detail.py:6`
7. `backend/app/api/v1/endpoints/risks/crud/create.py:7`
8. `backend/app/api/v1/endpoints/risks/crud/restore.py:6`
9. `backend/app/api/v1/endpoints/risks/crud/detail.py:6`
10. `backend/app/api/v1/endpoints/risks/control_links.py:4`
11. `backend/app/api/v1/endpoints/kris/crud/restore.py:6`
12. `backend/app/api/v1/endpoints/kris/crud/detail.py:6`
13. `backend/app/api/v1/endpoints/kris/crud/create.py:6`
14. `backend/app/api/v1/endpoints/kris/crud/breaches.py:8`

(Phase 1 said "7 endpoint files"; the actual count from grep is **14**. Larger fan-out than reported.)

### Importers of the live service module — 8 sites (already canonical)

`grep "from app.services._monitoring_response"`:

1. `backend/app/api/v1/endpoints/_monitoring_response.py:3` (the shim itself)
2. `backend/app/services/_register_listings/controls.py:41`
3. `backend/app/services/_register_listings/kris.py:32`
4. `backend/app/services/_entity_mutation_lifecycle/projection.py:12`
5. `backend/app/services/_control_execution/monitoring.py:6`
6. `backend/app/services/_vendor_links/workflow.py:28`
7. `backend/app/services/_control_execution/projection.py:29`
8. `backend/app/services/_kri_history/projection.py:10`

### Doc references

- `docs/security/authorization-capability-contract.json:97` — entry in `sensitive_change_paths`: `"backend/app/services/_monitoring_response.py"`.
- `docs/security/authorization-capability-contract.json:310, 351` — service_policy lines reference the service module. None reference the endpoint shim.

### Verification status

Endpoint shim is pure re-export with 14 importers. Migration is mechanical: rewrite imports endpoint-side to `from app.services._monitoring_response import ...` and delete the shim file. No policy/test churn beyond import paths.

---

## Item #31 — S5.5: Vendor reporting service extraction

**Verdict: ACCEPT WITH MOD (P3) — confirmed.**

### Current split

- Domain builder lives in service module: `backend/app/services/vendor_reporting_service.py:19` quote: `class VendorReportingService:`. Static methods `build_annual_report` (line 21) and `build_dora_register` (line 77).
- Output row formatters live in endpoint: `backend/app/api/v1/endpoints/vendor_reports.py:36` `def _annual_report_rows(report) -> tuple[list[str], list[list[object]]]:` and line 76 `def _dora_register_rows(rows) -> tuple[list[str], list[list[object]]]:`. They produce CSV `(headers, rows)` and feed `generate_tabular_csv`.
- The endpoint then passes the rows to `_stream_binary` (lines 147-152, 171-176).

### Existing reports stub

- `backend/app/services/_vendor_governance/reports.py:7` — `class VendorReportDefinition: report_type, headers, row_mapper`. Currently unused except by the contract test `tests/backend/pytest/test_architecture_deepening_contracts.py:1082`: `assert hasattr(reports, "VendorReportDefinition")`. The stub is the natural target home for the row formatters.

### What should move

- `_annual_report_rows` and `_dora_register_rows` (endpoint-side row builders) → service-owned reporting/exports module (either `_vendor_governance/reports.py` or `services/_reporting/`).
- The endpoint retains: 410 export-format coercion (`resolve_export_format`), `_stream_binary` call, capability check (`_require_vendor_report_role`), and context build.

### Importers / dependents

- `backend/app/api/v1/endpoints/vendor_reports.py:26` — `from app.services.vendor_reporting_service import VendorReportingService` (the only importer of `vendor_reporting_service.py`).
- No other importers of the row-builders (they are file-private `_underscore` helpers).

### Verification status

Developer "Accept w/mod" stands. Move target should reuse `VendorReportDefinition` (already in `_vendor_governance/reports.py`) rather than create a new service file. Existing service domain layer (`vendor_reporting_service.py`) already shapes typed dataclasses (`VendorAnnualReportData`, `VendorDoraRegisterRow`); moving CSV row mapping next to that owner is consistent with bounded-context taxonomy.

---

## Item #57 — S8.1: Quarterly comparison facade deletion

**Verdict: OVERRIDE — Reject argument is doc-only and falls. Recommend DELETE facade.**

### Facade contents (verbatim)

`backend/app/services/quarterly_comparison_service.py` is **20 lines total**:

- Line 1 quote: `"""Compatibility facade for Risk Committee quarterly comparison metrics."""`.
- Lines 3-8: `from app.services._quarterly_comparison.composition import (PERIOD_METRICS, SNAPSHOT_METRICS, build_quarterly_comparison,)` and `from app.services._quarterly_comparison.periods import parse_quarter as _parse_quarter`.
- Lines 11-12: `def parse_quarter(quarter_str: str): return _parse_quarter(quarter_str)` — a one-line passthrough wrapper.
- Lines 15-20: `__all__ = ["PERIOD_METRICS", "SNAPSHOT_METRICS", "build_quarterly_comparison", "parse_quarter"]`.

Adds **zero logic**. The `parse_quarter` wrapper is a 1-line passthrough that adds no signature change, no normalization, no error wrapping; it could be replaced by `from app.services._quarterly_comparison.periods import parse_quarter`.

### `_quarterly_comparison/` package contents

Five files; full inventory:

- `__init__.py` (2 lines) — quote: `"""Internal helpers for quarterly comparison dashboard metrics."""`. No re-exports.
- `composition.py` (164 lines) — owns `PERIOD_METRICS` (line 20), `SNAPSHOT_METRICS` (line 29), `SnapshotSourceDecision` (line 43), `MetricAvailability` (line 49), `QuarterMetricComposition` (line 57), and `async def build_quarterly_comparison(...)` (line 75).
- `periods.py` (54 lines) — `parse_quarter` (line 10), `calculate_quarter_boundaries` (line 20), `validate_quarter_selection` (line 45).
- `period_metrics.py` (87 lines) — `get_quarter_period_metrics` (line 15) — six aggregation queries (new_risks, archived_risks, audit_activity, failed_audits, unaudited_controls, activity_volume).
- `snapshots.py` (37 lines) — `resolve_snapshot_department_id` (line 12), `resolve_snapshot_metrics` (line 20).
- `changes.py` (33 lines) — `calculate_changes` (line 4) — diff/percentage/direction calc.

### Importers (all paths)

- **Production endpoint**: `backend/app/api/v1/endpoints/dashboard/quarterly.py:12` — `from app.services.quarterly_comparison_service import build_quarterly_comparison`. Single endpoint usage at line 34 (`return await build_quarterly_comparison(...)`).
- **Tests via facade**: 0 hits for `from app.services.quarterly_comparison_service`. (Single backend importer is the endpoint above.)
- **Tests via package**:
  - `tests/backend/pytest/test_dashboard.py:1041` — `from app.services._quarterly_comparison.period_metrics import get_quarter_period_metrics`.
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:561` — `from app.services._quarterly_comparison import composition`.
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:566` — quote: `assert quarterly_comparison_service.build_quarterly_comparison is composition.build_quarterly_comparison`.
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:569` — quote: `assert "async def build_quarterly_comparison" not in facade_source` (lock pinning facade as pure re-export).

### Doc anchors locking the facade (developer Reject evidence)

All three doc anchors below are CITED for Reject — and orchestrator says all three doc-only anchors fall:

- `backend/app/services/_quarterly_comparison/README.md:16` — quote: `Keep backend/app/services/quarterly_comparison_service.py as the public service entrypoint.` This is a developer-written README inside the package; updating it is a doc edit.
- `.planning/codebase/CONVENTIONS.md:22` — lists `…/quarterly_comparison_service.py` among "blessed facade" file list. Removing the file from the list is a single-line edit.
- `.planning/codebase/CONCERNS.md:14` — names the facade as load-bearing concern. Editing the line is doc-only.
- `.planning/codebase/STRUCTURE.md:25` — enumerates `_quarterly_comparison` as a helper package (this entry remains valid; only the facade citation is doc-only).
- `.planning/codebase/ARCHITECTURE.md:42` — quote: `quarterly comparison period/snapshot/change helpers (backend/app/services/_quarterly_comparison/)` already points at the package, not the facade. Likely no edit needed.

### Lock test impact

`tests/backend/pytest/test_architecture_deepening_contracts.py:559-569` (`test_quarterly_comparison_service_is_composition_facade`) currently asserts the facade EXISTS as a pure re-export. If the facade is deleted, this test must be either deleted or rewritten to assert "endpoint imports from package directly". This is a single-test edit (10 lines).

### Canonical home recommendation

After delete:
- `backend/app/api/v1/endpoints/dashboard/quarterly.py:12` rewrites to `from app.services._quarterly_comparison.composition import build_quarterly_comparison`.
- `parse_quarter`, `PERIOD_METRICS`, `SNAPSHOT_METRICS` are not used outside the package; no other rewrites needed.

### Verification status

The facade is mechanically a 20-line pure re-export. The Reject argument rests entirely on three docs and one lock test. Per orchestrator override, those fall. **Recommend DELETE facade**, repoint endpoint, edit `_quarterly_comparison/README.md:16`, edit `.planning/codebase/CONVENTIONS.md:22`, edit `.planning/codebase/CONCERNS.md:14`, and rewrite `test_quarterly_comparison_service_is_composition_facade`.

---

## Item #69 — S5.2: Vendor link tables to mixin/polymorphic merge

**Verdict: PLAN MIGRATION (orchestrator override; Defer NOT respected).**

### Three vendor-link models — current schema

- `backend/app/models/vendor_risk_link.py:16` — `class VendorRiskLink(Base):`. Columns: `id` (PK), `vendor_id` (FK `vendors.id`, no `ondelete`), `risk_id` (FK `risks.id`, no `ondelete`), `created_at`. Unique `uq_vendor_risk_link(vendor_id, risk_id)` (line 28).
- `backend/app/models/vendor_control_link.py:16` — `class VendorControlLink(Base):`. Same shape. Unique `uq_vendor_control_link(vendor_id, control_id)` (line 28). FKs lack `ondelete`.
- `backend/app/models/vendor_kri_link.py:16` — `class VendorKRILink(Base):`. Columns: `id`, `vendor_id` (FK `vendors.id` `ondelete="CASCADE"`, line 21), `kri_id` (FK `key_risk_indicators.id` `ondelete="CASCADE"`, line 22), `created_at`. Unique `uq_vendor_kri_link(vendor_id, kri_id)` (line 18).

### Inconsistencies

- Only `vendor_kri_links` has DB-level `ON DELETE CASCADE`. Risks and controls cascade only via SQLAlchemy `cascade="all, delete-orphan"` (`vendor.py:89-103`).
- All three relationships on `Vendor` use `cascade="all, delete-orphan"` (`vendor.py:89, 94, 99`) — application-level deletion cascade. DB-level inconsistency is silent until DB-level vendor delete (which is rare; soft-delete via `ArchivableMixin` is the live path).
- All three tables share identical column shape (`id, vendor_id, target_id, created_at`) plus a unique constraint on `(vendor_id, target_id)`. There is **no shared mixin or abstract base**; each is a separate `Base` subclass.

### Topology choice

Two options:

1. **Shared abstract mixin** (`AbstractVendorLink` with `id`, `vendor_id`, `created_at`, plus `ondelete` policy enforced) — keeps three tables but unifies column shape and FK ondelete. Lowest migration risk (tables stay; only `vendor_risk_links` and `vendor_control_links` need FK rebuild to add `ON DELETE CASCADE`).
2. **Polymorphic single-table merge** — one table `vendor_links(id, vendor_id, target_type, target_id, created_at)` plus discriminator. Touches every vendor-link row (currently 3 tables → 1). Requires forward-only data migration per ADR-010.

The audit (line 2087-2088) phrases this as a two-phase plan: Phase 1 = mixin, Phase 2 = polymorphic merge. Phase 1 is independently shippable.

### Every query touching the three tables

Production code (`grep "VendorRiskLink|VendorControlLink|VendorKRILink"`):

- `backend/app/models/vendor.py:89-103` — three `relationship(...)` declarations.
- `backend/app/services/_vendor_governance/links.py:11` — import; lines 14-16 typealiases.
- `backend/app/services/_vendor_governance/links.py:65-78` — `get_existing_link` `select(link_model).where(...)` (generic).
- `backend/app/services/_vendor_governance/links.py:92-117` — `create_vendor_link` (line 100 `db.add(...)`), `delete_vendor_link` (line 116 `db.delete(link)`).
- `backend/app/services/_vendor_links/workflow.py:33-39` — imports primitives.
- `backend/app/services/_vendor_links/workflow.py:128, 167, 213` — `select(VendorRiskLink|VendorControlLink|VendorKRILink)` listing queries.
- `backend/app/services/_register_listings/vendors.py:12, 256-258, 530` — `VendorRiskLink` for vendor-grouped-by-risk listing.
- `backend/app/services/kri_vendor_assignment.py` (Phase 1 finding 62) — direct mutation of `VendorKRILink`.
- `backend/app/api/v1/endpoints/vendor_link_helpers.py:11, 14-15` — duplicate primitives (slated for deletion under #13).

Tests:
- `tests/backend/pytest/test_vendor_links.py:20-22, 273-275, 332-335, 543-545, 601-604, 671-672, 764-766, 866, 942` — extensive direct constructor + select usage.
- `tests/backend/pytest/test_kris_rbac.py:23, 168, 176, 225, 242, 952, 980, 1006` — KRI-scoped link tests.
- `tests/backend/pytest/test_vendors.py:8, 598-599, 662, 722-723, 787` — vendor-scoped link tests.
- `tests/backend/pytest/test_kris_value_submission_api.py:25, 226, 794` — KRI value tests.
- `tests/backend/pytest/test_approval_edit_apply.py:28, 410, 434, 438, 447-449` — approval edit tests.
- `tests/backend/pytest/test_vendor_link_workflow_module.py:1, 10, 15, 20` — workflow tests.
- `tests/backend/pytest/api/v1/test_collection_grouping_api.py:23-25, 543, 866, 1290, 1412-1413, 1516` — grouping tests.

Total: ~9 production sites + ~7 test files, ~70+ individual query/constructor uses.

### Migration steps required

For Phase 1 (shared mixin, recommended cleanest topology):

1. Define `AbstractVendorLink` mixin in `backend/app/models/_vendor_link_mixin.py` with `id`, `vendor_id`, `created_at`, plus `__abstract__ = True`. (No SQLAlchemy STI; each concrete model still has its own `__tablename__`.)
2. Rebase `VendorRiskLink`, `VendorControlLink`, `VendorKRILink` to inherit `(AbstractVendorLink, Base)`.
3. New forward-only Alembic migration to add `ON DELETE CASCADE` to the two FKs that lack it (`vendor_risk_links.vendor_id`, `.risk_id`, `vendor_control_links.vendor_id`, `.control_id`).
4. ADR-010 forward-only `downgrade()` raising `NotImplementedError`.

For Phase 2 (polymorphic single-table merge — high risk):

1. New `vendor_links` table with `target_type` discriminator and `target_id`. Copy rows from three tables; preserve unique constraint as `(vendor_id, target_type, target_id)`.
2. Rewrite all production queries to filter by `target_type`.
3. Rewrite `_vendor_governance/links.py` typealiases to a single concrete model.
4. Rebuild ~70 test sites.
5. Drop old three tables.

Phase 1 is mechanically simple and would settle most architectural concerns without touching every test. Recommend Phase 1 only.

### Verification status

Defer overruled. Phase 1 mixin migration is a self-contained ADR-010 forward-only step; Phase 2 polymorphic merge is genuinely high-risk and should remain explicitly scoped.

---

## Item #70 — S5.7: Vendor.status enum drop

**Verdict: DROP MECHANICALLY (orchestrator override; Defer NOT respected).**

### Phase 1 confirmation

- `backend/app/models/vendor.py:22-23` — quote: `class VendorStatus(str, PyEnum): active = "active"`. Single enum value.
- `backend/app/schemas/vendor.py:12-13` — `class VendorStatusEnum(str, Enum): active = "active"`. Mirror.
- `backend/app/models/vendor.py:82` — quote: `status: Mapped[str] = mapped_column(String(20), default=VendorStatus.active.value, index=True)`.

After migration `h3i4j5k6l7m8_unify_archive_state.py`, all `inactive` rows were rewritten to `active` with `is_archived=true`. Enum holds one live value.

### Every site citing `Vendor.status` / `vendor.status`

**Query/projection sites in `backend/app/services/`:**

1. `backend/app/services/_register_listings/vendors.py:161` — quote: `query = query.where(Vendor.status == criteria.status_filter.value)` (only equality predicate).
2. `backend/app/services/_register_listings/vendors.py:200` — quote: `"status": Vendor.status,` (sort key map for `vendor_order_column`).
3. `backend/app/services/_register_listings/vendors.py:273` — quote: `Vendor.status.label("status"),` (in `vendor_flag_membership_query` for grouped listing).
4. `backend/app/services/_register_listings/controls.py:554` — quote: `status=link.vendor.status,` (read projection in linked-vendor block on control rows).
5. `backend/app/services/_register_listings/risks.py:430` — quote: `status=vendor.status,` (read projection in linked-vendor block on risk rows).
6. `backend/app/services/_monitoring_response.py:219` — quote: `status=vendor.status,` (in `LinkedVendorRead` builder for KRI response).
7. `backend/app/services/_reporting/exports/rows.py:120` — quote: `"status": vendor.status,` (in vendor export row).
8. `backend/app/services/_kri_history/direct_application.py:36` — quote: `status=link.vendor.status,` (KRI history vendor projection).

(Phase 1 found "~7 sites"; actual count 8 production sites.)

**Seed scripts (write):**

- `backend/scripts/seed_e2e_vendors.py:35, 56, 77, 98, 119, 140` — six seed dicts setting `"status": VendorStatus.active.value`.
- `backend/scripts/seed_e2e_archives.py:283` — quote: `vendor.status = entry["status"]`.

**Listing criteria field:**

- `backend/app/services/_register_listings/vendors.py:53` — `status_filter: VendorStatusEnum | None`.
- `backend/app/services/_register_listings/vendors.py:89, 103, 131, 482, 516` — propagation of `status_filter` parameter.

The `coerce_vendor_list_criteria` (line 85) accepts `status_filter` and the `archived_status_filter` (line 122-124) coerces `"archived"`/`"inactive"` strings to the archive flag. Dropping `Vendor.status` simplifies this to a single `archived` flag.

### Last consumer of legacy `inactive` value

- `backend/app/models/_archivable.py:60-65` — quote: `legacy_values = { "risks": ("archived",), "controls": ("archived",), "vendors": ("inactive",), }`.
- `_archivable.py:66-71` — quote: `flag_clause = model.is_archived.is_(archived) ... return or_(flag_clause, status_column.in_(legacy_values))`.

This is the **only site** still ORing `Vendor.status IN ('inactive')` into the archive predicate. After the unify migration ran, no row matches that predicate; the OR is a defensive no-op carrying ADR-005 transitional semantics.

Confirmed: `_archivable.py:63` is the last legacy-value consumer. Removing the `"vendors": ("inactive",)` entry collapses `archived_clause(Vendor)` to `Vendor.is_archived.is_(archived)` — mechanically a 1-line edit.

### Test references

- `tests/backend/pytest/test_vendors.py:436` — quote: `assert vendor.status == "active"` (still valid post-drop if column survives; fails if column dropped).
- `tests/backend/pytest/test_e2e_seed_archive_state_red.py:13, 21, 44, 53` — RED tests asserting `"VendorStatus.inactive" not in source` and `'Vendor.status == "inactive"' not in source`. These already pass post-unify and would continue passing after enum drop (assertions are negative).
- `tests/backend/pytest/architecture/test_w8b_archivable_encapsulation_red.py:39, 57` — RED tests asserting same negative invariants on listing files.
- `tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py:7, 37` — `VendorStatusEnum` import + `status=VendorStatusEnum.active.value`.
- `tests/backend/pytest/test_dashboard.py:960, 970, 980` — vendor fixtures using `VendorStatus.active.value`.

### Mechanical drop steps

1. Remove `Vendor.status` column via forward-only Alembic migration; drop `String(20)` column (ADR-010 `raise NotImplementedError`).
2. Remove `VendorStatus` enum from `backend/app/models/vendor.py:22-23` and `__init__.py:34, 80`.
3. Remove `VendorStatusEnum` from `backend/app/schemas/vendor.py:12-13, 53, 83` and re-exports.
4. Update `_register_listings/vendors.py:155-194` to drop `status_filter` parameter; collapse `archived_status_filter` and `criteria.status_filter` branches (lines 161, 200, 273).
5. Drop `status` from listing-projection sites (controls/risks/_monitoring_response/_reporting/_kri_history) — fields can be removed from `LinkedVendorRead` and downstream.
6. Edit `backend/app/models/_archivable.py:63` — delete `"vendors": ("inactive",)` line.
7. Update seed scripts and tests.

Total surface: ~25 production sites, ~10 test sites, 1 migration, 1 ADR-010 entry. Larger than #57 facade, smaller than #69 polymorphic merge.

### Verification status

Defer overruled. The drop is mechanically straightforward; the only forward-only consideration is the column removal migration. `_archivable.py:63` is confirmed as the last legacy consumer.

Recommend bundling with #69 Phase 1 (mixin) for a single migration window — both touch `vendor*` tables, both need ADR-010 forward-only entries, both share rehearsal scope. Bundling avoids two separate migration windows.

---

## Cross-item dependencies

- #13 (delete `vendor_link_helpers.py`) is independent — can ship alone.
- #16 (legacy excel tombstones) is independent.
- #17 (`_monitoring_response` shim) is independent.
- #31 (vendor reporting row formatters move) is independent of the above.
- #57 (delete `quarterly_comparison_service` facade) is independent.
- #69 + #70 should ship in one migration window (per audit guidance lines 2092-2093 and developer evidence 70:791).

