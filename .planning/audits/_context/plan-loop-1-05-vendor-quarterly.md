# Phase 3 Loop 1 Plan — Vendor + Quarterly + Reports

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Planning artefact only — **no production edits**.

Conventions:
- Every change starts with a failing test or failing structural assertion (TDD red).
- Single developer, sequential execution. **No parallelism.**
- Doc/lock-only Reject arguments are INVALID (#57). Defers are NOT respected (#69, #70).
- `file:line` cite + ≤15-word quote per finding.
- Effort scale: S ≤2h, M half-day–1 day, L 1–3 days, XL >3 days.

---

## Item #13 — S5.1 / C-N2 — Delete `vendor_link_helpers.py` shim
- Final disposition: **DELETE** the 107-line endpoint shim `backend/app/api/v1/endpoints/vendor_link_helpers.py`. Zero importers. Archive precedence diverges (shim raises 409 before 403; `_vendor_governance/links.py:54-60` raises 403 first). ADR-002 transaction divergence (`vendor_link_helpers.py:91,107` `await commit_service_transaction(db)` vs `_vendor_governance/links.py:101,117` `await db.flush()`).
- Dependencies (in-domain): independent.
- Cross-domain prerequisites: none — `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` does not list `vendor_link_helpers.py`; no domain-external lock to coordinate.
- TDD shape:
  - **RED 1** (precedence invariant): assert canonical service raises 403 before 409 for archived vendor + missing-write actor (no fallback to shim ordering).
  - **RED 2** (structural): assert `backend/app/api/v1/endpoints/vendor_link_helpers.py` does not exist on disk; assert grep `from app.api.v1.endpoints.vendor_link_helpers` returns zero hits in `backend/` and `tests/`.
  - **RED 3** (doc-contract drift): assert `docs/security/authorization-capability-contract.json` `sensitive_change_paths` does not contain `backend/app/api/v1/endpoints/vendor_link_helpers.py`; same for `service_policy` strings under AUTHZ-VENDORS-READ/WRITE.
- Failing test(s) to write FIRST:
  - New: `tests/backend/pytest/architecture/test_vendor_link_helpers_shim_removed_red.py` — combines structural existence + grep-zero + JSON contract scrub.
  - New (or reuse `tests/backend/pytest/test_vendor_link_workflow_module.py`): precedence test asserting `_vendor_governance/links.require_vendor_access` raises `AuthorizationError` (403) BEFORE `ConflictError` (409) for the archived-vendor + non-write actor case.
- Code/file changes:
  - Delete `backend/app/api/v1/endpoints/vendor_link_helpers.py`.
- Lock/TOML/contract updates:
  - `docs/security/authorization-capability-contract.json:55` — remove `"backend/app/api/v1/endpoints/vendor_link_helpers.py"` from `sensitive_change_paths`.
  - `docs/security/authorization-capability-contract.json:479` — remove same path from `AUTHZ-VENDORS-READ.service_policy`.
  - `docs/security/authorization-capability-contract.json:502` — remove same path from `AUTHZ-VENDORS-WRITE.service_policy`.
  - `docs/security/authorization-capability-contract.md:121,122` — remove the two MD lines that cite the shim path.
  - Re-run `scripts/security/validate_authz_capability_contract.py` to regenerate parity hash if any.
- README / doc updates: none beyond the two doc files in the contract update.
- Verification commands:
  - `make -f scripts/Makefile test-architecture-locks`
  - `pytest tests/backend/pytest/architecture/test_vendor_link_helpers_shim_removed_red.py tests/backend/pytest/test_vendor_link_workflow_module.py`
  - `python scripts/security/validate_authz_capability_contract.py`
- Commit boundary: single commit `chore(vendor): delete vendor_link_helpers shim and sync authz contract` containing the test additions, file deletion, and JSON+MD edits.
- Rollback note: revert the single commit; no DB migration; no data risk.
- Effort: **S**.

---

## Item #16 — S8.10 — Remove reports legacy-excel tombstones
- Final disposition: **REMOVE** four 410-tombstone routes plus their supporting test/probe assertions and OpenAPI parity entries. **KEEP** the live `xlsx`-format rejection inside `audit_trail_excel.py:142` and `summary_excel.py:106` (`resolve_export_format` path) — these are not tombstones; they reject `?format=xlsx` on live `/export` routes.
- Dependencies (in-domain): none.
- Cross-domain prerequisites: cross-check `tests/backend/pytest/test_openapi_contract_parity.py:26-29` and `scripts/security/protocol_contract_probe.py:61,71,81,91` are part of the cross-cutting OpenAPI/protocol-probe lock (Loop 8 owns the lock; this domain owns the path removals).
- TDD shape:
  - **RED 1** (route absent): structural test asserting four FastAPI routes `/api/v1/reports/{controls,risks,summary,audit-trail}/excel` do **not** exist in the OpenAPI schema.
  - **RED 2** (file delete): assert `backend/app/api/v1/endpoints/reports/legacy_excel.py` does not exist.
  - **RED 3** (file mixed): assert `audit_trail_excel.py` does not contain a `@router.get("/audit-trail/excel"` declaration; assert `summary_excel.py` does not contain `@router.get("/summary/excel"`. Live `/export` routes plus their `EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE` for `xlsx` rejection still present.
  - **RED 4** (xlsx rejection still works): keep an existing test asserting `GET /api/v1/reports/audit-trail/export?format=xlsx` returns 410 — this is the surviving behavior.
- Failing test(s) to write FIRST:
  - New: `tests/backend/pytest/architecture/test_reports_legacy_excel_tombstones_removed_red.py` — bundles route-absent + file-delete + mixed-file scrub.
  - Edit (RED): `tests/backend/pytest/test_openapi_contract_parity.py:26-29` — drop the four `/excel` paths from the expected list (test will fail until the deletion is performed).
- Code/file changes:
  - Delete `backend/app/api/v1/endpoints/reports/legacy_excel.py` (whole file).
  - Edit `backend/app/api/v1/endpoints/reports/audit_trail_excel.py` — delete the `@router.get("/audit-trail/excel", responses=...)` block at line 133-139 (leave live `/audit-trail/export` route at line 142 intact).
  - Edit `backend/app/api/v1/endpoints/reports/summary_excel.py` — delete the `@router.get("/summary/excel", responses=...)` block at line 97-103 (leave live `/summary/export` route at line 106 intact).
  - Edit the reports router registry (where `legacy_excel.router` is included) to drop that include. Locate via `grep "legacy_excel" backend/app/api/v1/endpoints/reports/`.
- Lock/TOML/contract updates:
  - `tests/backend/pytest/test_openapi_contract_parity.py:26-29` — remove the four `/excel` path entries.
  - `tests/backend/pytest/test_protocol_contract_probe.py:26,108` — remove `/api/v1/reports/controls/excel` path probe and the `excel_export_removed` response excerpt that targets it.
  - `scripts/security/protocol_contract_probe.py:61,71,81,91` — remove the four `/excel` probe entries.
- README / doc updates:
  - `docs/security/reports/contract-drift-remediation-2026-02-21.md:25` — remove or update the `legacy_excel.py` citation.
  - `docs/security/reports/deep-scan-remediation-2026-02-20.md:81` — remove or update.
- Test removals (cited from Loop A):
  - `tests/backend/pytest/api/v1/test_reports_audit.py:270` — delete `test_audit_trail_legacy_excel_endpoint_returns_gone`.
  - `tests/backend/pytest/test_reports_rbac.py:193,369,379,391,410,424` — delete the six `/excel` 410 assertions.
- Verification commands:
  - `pytest tests/backend/pytest/architecture/test_reports_legacy_excel_tombstones_removed_red.py tests/backend/pytest/test_openapi_contract_parity.py tests/backend/pytest/test_protocol_contract_probe.py tests/backend/pytest/api/v1/test_reports_audit.py tests/backend/pytest/test_reports_rbac.py`
  - `pytest tests/backend/pytest/test_vendor_reports.py` — confirm vendor `/excel` rejection (which uses `resolve_export_format`, not a route) still passes.
  - `python scripts/security/protocol_contract_probe.py --self-check` (or equivalent runner).
- Commit boundary: single commit `chore(reports): remove legacy excel 410 tombstones` containing tests, route deletions, parity-list edits, doc edits.
- Rollback note: revert the single commit; OpenAPI surface re-emits the four 410 routes; data unchanged.
- Effort: **M**.

---

## Item #17 — S2.1 — Inline `_monitoring_response` endpoint shim
- Final disposition: **DELETE** `backend/app/api/v1/endpoints/_monitoring_response.py` (25-line pure re-export). Repoint **14** endpoint importers (Loop B confirmed count) to `from app.services._monitoring_response import …`.
- Dependencies (in-domain): independent.
- Cross-domain prerequisites: none — service module already in `authorization-capability-contract.json:97,310,351`; endpoint shim is not in any lock.
- TDD shape:
  - **RED 1** (file absent): structural test asserting `backend/app/api/v1/endpoints/_monitoring_response.py` does not exist.
  - **RED 2** (importer scrub): grep-based assertion that no source file contains `from app.api.v1.endpoints._monitoring_response`.
  - **RED 3** (canonical home): grep-based assertion that the **service** module has at least the 8 service-side importers it had pre-change plus the 14 endpoint importers post-change.
- Failing test(s) to write FIRST:
  - New: `tests/backend/pytest/architecture/test_monitoring_response_endpoint_shim_removed_red.py` — combines file-absent + importer-scrub.
- Code/file changes:
  - Delete `backend/app/api/v1/endpoints/_monitoring_response.py`.
  - Repoint the 14 endpoint importers to `from app.services._monitoring_response import …` (Loop A enumerates them):
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
- Lock/TOML/contract updates: none.
- README / doc updates: none — `authorization-capability-contract.json` cites the service module, not the shim.
- Verification commands:
  - `pytest tests/backend/pytest/architecture/test_monitoring_response_endpoint_shim_removed_red.py`
  - `make -f scripts/Makefile test-architecture-locks`
  - `pytest tests/backend/pytest/api/v1/` (smoke on touched endpoint families)
  - `mypy backend/app/api/v1/endpoints/`
- Commit boundary: single commit `chore(monitoring): inline _monitoring_response endpoint shim into 14 importers`.
- Rollback note: revert the commit; the 14 endpoint imports flip back to the shim path.
- Effort: **S**.

---

## Item #31 — S5.5 — Extract vendor reporting row formatters
- Final disposition: **MOVE** `_annual_report_rows` (`backend/app/api/v1/endpoints/vendor_reports.py:36-73`) and `_dora_register_rows` (`vendor_reports.py:76-119`) into `backend/app/services/_vendor_governance/reports.py:7` (existing 12-line `VendorReportDefinition` stub). Endpoint retains `resolve_export_format`, `_stream_binary`, `_require_vendor_report_role`, and context build.
- Dependencies (in-domain): independent.
- Cross-domain prerequisites: none — `VendorReportDefinition` already has lock test in `tests/backend/pytest/test_architecture_deepening_contracts.py:1082` (`assert hasattr(reports, "VendorReportDefinition")`). New definitions strengthen it.
- TDD shape:
  - **RED 1** (function home): assert `app.services._vendor_governance.reports` exposes module-level callables `annual_report_rows(report)` and `dora_register_rows(rows)` returning `(headers, rows)`.
  - **RED 2** (endpoint owner-check): assert `backend/app/api/v1/endpoints/vendor_reports.py` source does NOT contain `def _annual_report_rows` or `def _dora_register_rows`. Endpoint imports the public versions from the service module.
  - **RED 3** (output equivalence): for representative `VendorAnnualReport` + `VendorDoraRegisterRow` fixtures, the new `annual_report_rows` and `dora_register_rows` produce identical headers + ordered row tuples to the snapshotted endpoint helpers (use existing fixtures in `tests/backend/pytest/test_vendor_reports.py`).
- Failing test(s) to write FIRST:
  - New: `tests/backend/pytest/services/test_vendor_governance_reports_red.py` — RED 1 + RED 3 (functional equivalence + module-level home).
  - New: `tests/backend/pytest/architecture/test_vendor_reports_endpoint_no_row_builders_red.py` — RED 2 (source scrub).
- Code/file changes:
  - `backend/app/services/_vendor_governance/reports.py` — add `annual_report_rows(report) -> tuple[list[str], list[list[object]]]` and `dora_register_rows(rows) -> tuple[list[str], list[list[object]]]`. Keep `VendorReportDefinition` dataclass (used by deepening contract). Optionally instantiate two `VendorReportDefinition` constants `ANNUAL_REPORT_DEFINITION` and `DORA_REGISTER_DEFINITION` to bind headers + row_mapper. Update `__all__`.
  - `backend/app/api/v1/endpoints/vendor_reports.py:36-119` — delete the two private helpers.
  - `backend/app/api/v1/endpoints/vendor_reports.py:146,170` — repoint `headers, rows = _annual_report_rows(report)` to `headers, rows = annual_report_rows(report)` from the new module; repoint `headers, data_rows = _dora_register_rows(rows)` to `dora_register_rows(rows)`.
  - Update import at `vendor_reports.py:26` to also import the two new public functions (or via `VendorReportDefinition` constants).
- Lock/TOML/contract updates: none — current contract test stays satisfied.
- README / doc updates:
  - `backend/app/services/_vendor_governance/README.md` (if exists) — add `reports.py` to module surface description.
  - Optional: extend `tests/backend/pytest/test_architecture_deepening_contracts.py:1082` lock to also assert `hasattr(reports, "annual_report_rows")` and `hasattr(reports, "dora_register_rows")`. (Lock strengthening, not breaking.)
- Verification commands:
  - `pytest tests/backend/pytest/services/test_vendor_governance_reports_red.py tests/backend/pytest/architecture/test_vendor_reports_endpoint_no_row_builders_red.py tests/backend/pytest/test_vendor_reports.py tests/backend/pytest/test_architecture_deepening_contracts.py::test_vendor_governance_reports_module`
  - `mypy backend/app/services/_vendor_governance/reports.py backend/app/api/v1/endpoints/vendor_reports.py`
- Commit boundary: single commit `refactor(vendor): move vendor reporting row formatters into _vendor_governance.reports`.
- Rollback note: revert the commit; helpers return to endpoint-private; no schema/data risk.
- Effort: **M**.

---

## Item #57 — S8.1 — Delete `quarterly_comparison_service.py` facade
- Final disposition: **DELETE** the 20-line facade `backend/app/services/quarterly_comparison_service.py`. Repoint single prod importer at `backend/app/api/v1/endpoints/dashboard/quarterly.py:12` to `from app.services._quarterly_comparison.composition import build_quarterly_comparison`. Doc-only Reject argument is invalid (override applies). Type-shadow nuance noted: `parse_quarter` wrapper at `quarterly_comparison_service.py:11-12` drops `-> datetime` annotation but has zero callers; loss is benign.
- Dependencies (in-domain): independent.
- Cross-domain prerequisites: none. Test consumers `tests/backend/pytest/test_dashboard.py:1041` (imports `from app.services._quarterly_comparison.period_metrics import get_quarter_period_metrics`) and `tests/backend/pytest/test_architecture_deepening_contracts.py:561` (imports `from app.services._quarterly_comparison import composition`) already use package paths — unchanged.
- TDD shape:
  - **RED 1** (file absent): assert `backend/app/services/quarterly_comparison_service.py` does not exist on disk.
  - **RED 2** (importer scrub): grep `from app.services.quarterly_comparison_service` returns zero hits in `backend/` and `tests/`.
  - **RED 3** (endpoint repoint): assert `backend/app/api/v1/endpoints/dashboard/quarterly.py` source contains `from app.services._quarterly_comparison.composition import build_quarterly_comparison` and does NOT contain `quarterly_comparison_service`.
  - **RED 4** (replacement contract): rewrite `tests/backend/pytest/test_architecture_deepening_contracts.py:559-569 test_quarterly_comparison_service_is_composition_facade` → new name e.g. `test_quarterly_comparison_dashboard_imports_composition_directly` asserting endpoint imports `build_quarterly_comparison` directly from the package, no facade exists, `composition.QuarterMetricComposition`/`SnapshotSourceDecision`/`MetricAvailability` still present.
- Failing test(s) to write FIRST:
  - New: `tests/backend/pytest/architecture/test_quarterly_comparison_facade_removed_red.py` — RED 1 + RED 2 + RED 3.
  - Edit (RED): `tests/backend/pytest/test_architecture_deepening_contracts.py:559-569` — rewrite per RED 4 above. Test fails until the facade is deleted and the endpoint repointed.
- Code/file changes:
  - Delete `backend/app/services/quarterly_comparison_service.py`.
  - Edit `backend/app/api/v1/endpoints/dashboard/quarterly.py:12` — replace `from app.services.quarterly_comparison_service import build_quarterly_comparison` with `from app.services._quarterly_comparison.composition import build_quarterly_comparison`.
- Lock/TOML/contract updates: none in TOML; the deepening contract test rewrite is captured in RED 4.
- README / doc updates (doc-only Reject anchors that fall):
  - `backend/app/services/_quarterly_comparison/README.md:16` — replace `Keep backend/app/services/quarterly_comparison_service.py as the public service entrypoint.` with statement that `dashboard/quarterly.py` consumes `_quarterly_comparison.composition` directly.
  - `.planning/codebase/CONVENTIONS.md:22` — remove `quarterly_comparison_service.py` from the blessed-facade list.
  - `.planning/codebase/CONCERNS.md:14` — remove or rewrite the line that names the facade as load-bearing concern.
  - `.planning/codebase/STRUCTURE.md:25` — verify the `_quarterly_comparison` helper-package entry; no edit needed if it already references the package not the facade (Loop A flagged it as already aligned).
  - `.planning/codebase/ARCHITECTURE.md:42` — already references package (`backend/app/services/_quarterly_comparison/`); confirm no edit needed.
- Verification commands:
  - `pytest tests/backend/pytest/architecture/test_quarterly_comparison_facade_removed_red.py tests/backend/pytest/test_architecture_deepening_contracts.py::test_quarterly_comparison_dashboard_imports_composition_directly tests/backend/pytest/test_dashboard.py`
  - `make -f scripts/Makefile test-architecture-locks`
  - `mypy backend/app/api/v1/endpoints/dashboard/quarterly.py`
- Commit boundary: single commit `refactor(quarterly): delete quarterly_comparison_service facade and repoint dashboard endpoint`. Bundle: file deletion + endpoint repoint + doc updates (`_quarterly_comparison/README.md`, `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/CONCERNS.md`) + deepening-contract rewrite + new RED file. **All in one commit per orchestrator override** so doc lock and code change land atomically.
- Rollback note: revert the commit; facade and endpoint return to facade import path; no DB/data risk.
- Effort: **S**.

---

## Item #69 — S5.2 — Introduce `AbstractVendorLink` mixin (Phase 1)
- Final disposition: **INTRODUCE** Phase 1 abstract mixin `AbstractVendorLink` providing `id` PK, `vendor_id` FK indexed, `created_at`. Three concrete tables (`vendor_risk_link.py:16`, `vendor_control_link.py:16`, `vendor_kri_link.py:16`) keep their `__tablename__` and per-target FK column. **Forward-only Alembic migration adds `ON DELETE CASCADE`** to FKs that lack it: `vendor_risk_links.vendor_id`, `vendor_risk_links.risk_id`, `vendor_control_links.vendor_id`, `vendor_control_links.control_id`. `vendor_kri_links` already has `ondelete="CASCADE"` per `vendor_kri_link.py:21-22`. Phase 2 polymorphic merge is **NOT** in scope here.
- Dependencies (in-domain): **bundled with #70** (single migration window for vendor* ADR-010 changes). Run #69 RED first (mixin invariant), then #70 RED (column drop), then implement both as a single migration revision.
- Cross-domain prerequisites: ADR-010 (`docs/adr/ADR-010-postgres-migration-rehearsal-contract.md`) `downgrade()` raising `NotImplementedError` pattern (see existing precedent `backend/alembic/versions/h3i4j5k6l7m8_unify_archive_state.py:28-31`).
- TDD shape:
  - **RED 1** (mixin column shape): structural test asserting each concrete vendor-link model declares an `id` PK autoincrement int, `vendor_id` FK with `ondelete="CASCADE"`, `created_at` server_default. Test imports `VendorRiskLink`, `VendorControlLink`, `VendorKRILink` and inspects column metadata.
  - **RED 2** (mixin presence): assert `app.models._vendor_link_mixin.AbstractVendorLink` exists, declares `__abstract__ = True`, and is a base of all three concrete classes (via `issubclass(VendorRiskLink, AbstractVendorLink)`).
  - **RED 3** (DB-level cascade — Postgres lane): introspect `pg_constraint` after `alembic upgrade head` on a Postgres lane and assert all four FKs (`vendor_risk_links.vendor_id`, `.risk_id`, `vendor_control_links.vendor_id`, `.control_id`) have `confdeltype = 'c'` (CASCADE).
  - **RED 4** (uniqueness preserved): assert `uq_vendor_risk_link(vendor_id, risk_id)`, `uq_vendor_control_link(vendor_id, control_id)`, `uq_vendor_kri_link(vendor_id, kri_id)` all still exist post-migration.
  - **RED 5** (downgrade contract): assert running migration `downgrade()` raises `NotImplementedError`.
- Failing test(s) to write FIRST:
  - New: `tests/backend/pytest/architecture/test_vendor_link_mixin_red.py` — RED 1 + RED 2 + RED 4 (model-shape, no DB needed).
  - New: `tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py` — RED 3 + RED 5 (Postgres-lane only; gated by `make -f scripts/Makefile test-architecture-locks` Postgres lane).
- Code/file changes:
  - New: `backend/app/models/_vendor_link_mixin.py` — define `class AbstractVendorLink:` with `__abstract__ = True`, `id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)`, `vendor_id: Mapped[int]` declared via `@declared_attr` (so the FK target uses `ForeignKey("vendors.id", ondelete="CASCADE")`), `created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())`. Mixin is shape-only — does not own `vendor` relationship (concrete classes still own `back_populates`).
  - Edit `backend/app/models/vendor_risk_link.py:16` — change to `class VendorRiskLink(AbstractVendorLink, Base):`. Remove the local `id`, `vendor_id`, and `created_at` redeclarations; keep `risk_id`, `risk` relationship, `vendor` relationship, `__table_args__`.
  - Edit `backend/app/models/vendor_control_link.py:16` — same pattern.
  - Edit `backend/app/models/vendor_kri_link.py:16` — same pattern; the existing `vendor_id` has `ondelete="CASCADE"` already, but mixin redeclares uniformly.
  - New Alembic revision (bundled with #70 — see commit boundary): `backend/alembic/versions/<rev>_unify_vendor_link_cascade_and_drop_vendor_status.py`. Upgrade body uses `op.drop_constraint` + `op.create_foreign_key` to rebuild `vendor_risk_links.vendor_id`, `.risk_id`, `vendor_control_links.vendor_id`, `.control_id` with `ondelete="CASCADE"`. Downgrade `raise NotImplementedError(...)` per ADR-010.
- Lock/TOML/contract updates:
  - `tests/backend/pytest/architecture/_archive_allowlist.toml` — no entry needed; vendor-link tables are not archivable (Loop B confirmed).
  - `tests/backend/pytest/architecture/_naming_allowlist.toml` — only if mixin name is flagged by naming lock (likely not).
- README / doc updates:
  - `backend/app/models/README.md` — add `AbstractVendorLink` to the mixin inventory; cross-link to `_archivable.py` so authors can see "abstract base classes for repeatable shape" pattern.
  - `backend/app/services/_vendor_links/README.md` — note that the three concrete tables share `AbstractVendorLink`; semantics of cascade on vendor delete now uniform at the DB layer.
  - `docs/adr/ADR-010-postgres-migration-rehearsal-contract.md` — append the new migration revision to the forward-only migration ledger.
  - `docs/adr/ADR-005-archive-state.md` (or its current name) — note that vendor-link tables are NOT archivable; mixin is independent.
- Verification commands:
  - `pytest tests/backend/pytest/architecture/test_vendor_link_mixin_red.py`
  - `make -f scripts/Makefile test-architecture-locks`
  - Postgres lane: bring up local Postgres, `alembic upgrade head`, run `tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py`
  - `pytest tests/backend/pytest/test_vendor_links.py tests/backend/pytest/test_kris_rbac.py tests/backend/pytest/test_vendors.py tests/backend/pytest/api/v1/test_collection_grouping_api.py tests/backend/pytest/test_vendor_link_workflow_module.py` — confirm ~70 existing constructor/select sites still pass with the mixin.
  - `mypy backend/app/models/`
- Commit boundary: **single bundled commit with #70** — `refactor(vendor): introduce AbstractVendorLink mixin and drop Vendor.status`. Single migration revision touches both. Bundling per Loop A's recommendation (single migration window).
- Rollback note: forward-only per ADR-010; no clean downgrade. Rollback strategy is "restore from pre-upgrade snapshot per ADR-010" identical to `h3i4j5k6l7m8_unify_archive_state.py:29` precedent. Pre-merge: rehearse the migration on a Postgres replica or fresh dev lane and verify all six FKs end with `ondelete="CASCADE"` semantics before pushing.
- Effort: **L**.

---

## Item #70 — S5.7 — Drop `Vendor.status` enum
- Final disposition: **DROP** `Vendor.status` column. Single live value `active` per `models/vendor.py:22-23 class VendorStatus(str, PyEnum): active = "active"`. Loop B confirmed **9 sites** total (8 prod sites + 1 seed write `seed_e2e_archives.py:283`); 6 seed dicts in `seed_e2e_vendors.py:35,56,77,98,119,140` set `"status": VendorStatus.active.value`. Last legacy `'inactive'` consumer is `_archivable.py:60-65` `legacy_values["vendors"] = ("inactive",)` — collapse `archived_clause(Vendor)` to single `is_archived.is_(...)` predicate.
- Dependencies (in-domain): **bundled with #69** (single migration window).
- Cross-domain prerequisites: depends on #69 mixin being applied first within the bundled commit — order-of-operations within the commit: (1) add mixin file; (2) rebase concrete vendor-link models; (3) add Alembic revision that DROPS `vendor_status` column AND ADDS the four `ON DELETE CASCADE` FKs; (4) remove `Vendor.status`/`VendorStatus`/`VendorStatusEnum` model + schema; (5) scrub 9 prod/seed sites + listing-criteria field.
- TDD shape:
  - **RED 1** (column absent): introspect `Vendor.__table__.c` and assert `"status"` is NOT a column (model-shape test).
  - **RED 2** (enum class absent): assert `not hasattr(app.models.vendor, "VendorStatus")` and `not hasattr(app.schemas.vendor, "VendorStatusEnum")`.
  - **RED 3** (legacy archive collapse): assert `archived_clause(Vendor)` returns a clause whose SQL string contains `vendors.is_archived` and does NOT contain `vendors.status`. Use SQL compiler (`str(clause.compile(dialect=postgresql.dialect()))`).
  - **RED 4** (DB column dropped — Postgres lane): introspect `information_schema.columns` and assert `vendors.status` does NOT exist post-`alembic upgrade head`.
  - **RED 5** (listing criteria scrub): assert `app.services._register_listings.vendors.coerce_vendor_list_criteria` no longer accepts `status_filter` parameter (or coerces it to no-op while logging a deprecation if backwards-compat is desired). Default plan: drop the parameter outright (no live caller passes anything other than `None`/`active`).
  - **RED 6** (downgrade contract): assert running migration `downgrade()` raises `NotImplementedError`.
- Failing test(s) to write FIRST:
  - New: `tests/backend/pytest/architecture/test_vendor_status_drop_red.py` — RED 1 + RED 2 + RED 3 + RED 5 (model + service shape).
  - New: `tests/backend/pytest/migrations/test_vendor_status_column_dropped_postgres_red.py` — RED 4 + RED 6 (Postgres lane).
- Code/file changes:
  - Edit `backend/app/models/vendor.py:22-23` — delete `class VendorStatus(str, PyEnum)`.
  - Edit `backend/app/models/vendor.py:82` — delete `status: Mapped[str] = mapped_column(String(20), default=VendorStatus.active.value, index=True)`.
  - Edit `backend/app/models/__init__.py:34,80` — remove `VendorStatus` re-export.
  - Edit `backend/app/schemas/vendor.py:12-13,53,83` — delete `class VendorStatusEnum(str, Enum)` and uses (response/request schema fields).
  - Edit `backend/app/models/_archivable.py:60-65` — remove `"vendors": ("inactive",)` entry; collapses `archived_clause(Vendor)` to flag-only.
  - Edit `backend/app/services/_register_listings/vendors.py:53,89,103,131,161,200,273,482,516` — drop `status_filter: VendorStatusEnum | None`, `archived_status_filter` coercion, `Vendor.status == criteria.status_filter.value` predicate, `"status": Vendor.status` sort key, `Vendor.status.label("status")` projection.
  - Edit `backend/app/services/_monitoring_response.py:219` — drop `status=vendor.status,` from `LinkedVendorRead` builder.
  - Edit `backend/app/services/_register_listings/controls.py:554` — drop `status=link.vendor.status,`.
  - Edit `backend/app/services/_register_listings/risks.py:430` — drop `status=vendor.status,`.
  - Edit `backend/app/services/_reporting/exports/rows.py:120` — drop `"status": vendor.status,`.
  - Edit `backend/app/services/_kri_history/direct_application.py:36` — drop `status=link.vendor.status,`.
  - Edit `backend/scripts/seed_e2e_vendors.py:35,56,77,98,119,140` — drop the six `"status": VendorStatus.active.value` keys from seed dicts.
  - Edit `backend/scripts/seed_e2e_archives.py:283` — replace `vendor.status = entry["status"]` with `vendor.is_archived = entry.get("is_archived", False)` (or remove if seed already manages `is_archived` upstream).
  - Schema/response shape: `LinkedVendorRead`-like Pydantic models that exposed `status` need their field removed; downstream callers (frontend) treated as out-of-scope here but flagged for Loop 6 (frontend) to verify.
  - Bundled Alembic revision (same file as #69): in `upgrade()`, run `op.drop_index('ix_vendors_status', table_name='vendors')` (if such index exists per `index=True`) then `op.drop_column('vendors', 'status')`. Then run the four `ON DELETE CASCADE` FK rebuilds from #69. `downgrade()` raises `NotImplementedError`.
- Lock/TOML/contract updates:
  - `tests/backend/pytest/architecture/_archive_allowlist.toml` — review: any entry citing `Vendor.status` legacy archive coercion can be removed.
  - `tests/backend/pytest/test_e2e_seed_archive_state_red.py:13,21,44,53` — already negative-asserts on `VendorStatus.inactive`; leave as-is (passes by construction post-drop).
  - `tests/backend/pytest/architecture/test_w8b_archivable_encapsulation_red.py:39,57` — already negative-asserts on listing files; leave as-is.
  - `tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py:7,37` — uses `VendorStatusEnum`; rewrite or delete the import + the `status=VendorStatusEnum.active.value` fixture line.
  - `tests/backend/pytest/test_dashboard.py:960,970,980` — drop `VendorStatus.active.value` from vendor fixtures.
  - `tests/backend/pytest/test_vendors.py:436` — quote `assert vendor.status == "active"` → DELETE this assertion line entirely (the column no longer exists).
- README / doc updates:
  - `docs/README.md:111-112` — remove `Vendor.status` mention.
  - `docs/DOCUMENTATION_TREE.md:84` — same.
  - `docs/adr/ADR-005-archive-state.md:13-16` — note `Vendor.status` retired; archive state is `is_archived` only across all three register entities.
  - `docs/adr/ADR-010-postgres-migration-rehearsal-contract.md:23-30` — append revision; document the bundled migration.
  - `docs/BUSINESS_LOGIC.md:619` — remove `Vendor.status` reference.
- Verification commands:
  - `pytest tests/backend/pytest/architecture/test_vendor_status_drop_red.py`
  - Postgres lane: `alembic upgrade head` + `pytest tests/backend/pytest/migrations/test_vendor_status_column_dropped_postgres_red.py tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py`
  - `pytest tests/backend/pytest/test_vendors.py tests/backend/pytest/test_dashboard.py tests/backend/pytest/test_w4_bc_c_vendor_governance_domain_errors_red.py tests/backend/pytest/test_e2e_seed_archive_state_red.py`
  - `make -f scripts/Makefile test-architecture-locks`
  - `mypy backend/app/`
- Commit boundary: **single bundled commit with #69** (per Loop A guidance lines 396-401 + Loop B). Title: `refactor(vendor): introduce AbstractVendorLink mixin and drop Vendor.status`. Single Alembic revision contains both schema changes (cascade FKs + column drop). Bundled because: (1) both touch `vendor*` tables, (2) both need ADR-010 forward-only entries, (3) both share rehearsal scope, (4) one migration window minimizes operational risk.
- Rollback note: forward-only per ADR-010; `downgrade()` raises `NotImplementedError`. Pre-merge rehearsal on snapshot replica is mandatory. If the column drop fails post-deploy, restore from the pre-upgrade Postgres snapshot per ADR-010 contract; no in-place rollback path.
- Effort: **M** (bundled with #69 L → effective L for the bundle).

---

## Domain dependency graph

```
#13 (vendor_link_helpers DELETE)        — independent, ship first
#16 (legacy excel tombstones REMOVE)    — independent
#17 (_monitoring_response shim INLINE)  — independent
#31 (vendor reporting rows EXTRACT)     — independent
#57 (quarterly facade DELETE)           — independent
#69 (AbstractVendorLink mixin)  ⎫
                                ⎬— BUNDLED single commit + single Alembic revision
#70 (Vendor.status DROP)        ⎭
```

Sequential execution order (single dev, no parallelism):
1. **#17** first (purely mechanical 14-import repoint, no migrations, low blast radius — warms up the test infra).
2. **#13** second (small file delete, JSON contract scrub, no DB).
3. **#57** third (small file delete + endpoint repoint + doc-anchor scrub + lock-test rewrite).
4. **#16** fourth (medium: 4 routes + 4 tests + parity list + doc edits).
5. **#31** fifth (medium: helper move + new tests).
6. **#69 + #70 bundle** last (largest blast radius; single migration window). Run mixin RED 1+2 → status RED 1+2+3 → implement model + Alembic + 9-site scrub → Postgres-lane RED 3+4+6 → green run → bundled commit.

## Cross-domain prerequisites and notes
- **#13 / #57**: edits to `docs/security/authorization-capability-contract.{md,json}` (#13) and `.planning/codebase/{CONVENTIONS,CONCERNS}.md` (#57) — orchestrator owns the doc anchors; this domain only touches the two contract files plus the three planning docs.
- **#16**: shares OpenAPI parity list (`tests/backend/pytest/test_openapi_contract_parity.py:26-29`) and protocol probe (`scripts/security/protocol_contract_probe.py:61,71,81,91`) with the cross-cut endpoints loop. Notify Loop 8 (cross-cut) before commit so they can sync any sibling expectations.
- **#17**: no cross-domain prerequisites; the 14 endpoint files span Risks, Controls, KRIs, Departments — but the change is import-path only, no signature change.
- **#69 + #70 bundle**: requires Postgres lane CI to run `alembic upgrade head` against a fresh DB. ADR-010 forward-only contract precedent at `backend/alembic/versions/h3i4j5k6l7m8_unify_archive_state.py:28-31`. Rehearsal must be confirmed before merging.
- **Frontend impact (out of scope here, flag for Loop 6)**: dropping `Vendor.status` from API response payloads (#70) and changing 14 monitoring-response endpoint imports (#17 — no payload change). The frontend's `LinkedVendor` / `Vendor` TypeScript types may carry `status?: string` and need pruning under Loop 6.
- **Test infra**: `client_factory` from `tests/backend/pytest/conftest.py` is the contract-compliant client for any new API tests. New `dependency_overrides[get_db]` blocks would require an entry in `tests/backend/pytest/_get_db_override_whitelist.toml` — none of the planned RED tests need such overrides (they are model/architecture/source-grep tests, not API tests).
- **Capability contract revalidation**: any of #13, #57, #69, #70 that touch `docs/security/authorization-capability-contract.{json,md}` must end with `python scripts/security/validate_authz_capability_contract.py` clean.
- **`test_quarterly_comparison_service_is_composition_facade` lock test** (`test_architecture_deepening_contracts.py:559-569`) is a *facade-pinning* lock that explicitly forbids facade-deletion. Per orchestrator override, this lock falls and is rewritten under #57.

## Effort summary
| Item | Disposition | Effort |
|------|-------------|--------|
| #13  | DELETE shim + contract scrub | S |
| #16  | REMOVE 4 tombstones + parity edits | M |
| #17  | INLINE shim into 14 importers | S |
| #31  | EXTRACT 2 row-builder helpers | M |
| #57  | DELETE 20-line facade + lock rewrite | S |
| #69  | INTRODUCE mixin + cascade migration | L |
| #70  | DROP `Vendor.status` + bundled migration | M |
| Bundle (#69+#70) | Single migration window | **L** |

Total domain effort if executed sequentially: ~3 S + 2 M + 1 L = ~5–7 dev-days including rehearsal of the bundled migration.
