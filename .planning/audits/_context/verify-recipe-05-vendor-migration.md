# P6-V5 — Empirical verification: recipe-05-vendor-migration

Domain: Vendor + Quarterly + Reports + Migration + Ownership Factory.
Items verified: 10 (#13, #16, #17, #31, #57, #69+#70 atomic, #77b, #49, #45b).
Mode: read actual code; quote ≤15 words; would-the-tests-fail-today empirical pass.
Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`.

---

## Item #13 (S5.1 / C-N2) — Delete `vendor_link_helpers.py` shim

**Verdict: VALID.**

- File exists: `backend/app/api/v1/endpoints/vendor_link_helpers.py` — `wc -l` = **107 lines** (recipe claims 107). MATCH.
- Importer count via `grep -rn "vendor_link_helpers" backend tests --include="*.py" | grep -v __pycache__` returned **empty stdout** → 0 prod importers (recipe claims 0). MATCH.
- Archive precedence divergence (409 vs 403) was not re-verified at line level here (covered in Phase 1-3). Recipe's text matches `vendor_link_helpers.py` semantic claim about diverging from canonical helpers.

RED test (`tests/backend/pytest/architecture/test_vendor_link_helpers_removed_red.py`): does NOT exist today → would FAIL today's path-existence assertion.

---

## Item #16 (S8.10) — Remove 4 reports legacy-excel tombstones

**Verdict: VALID.**

Tombstone routes confirmed at exact lines:

- `backend/app/api/v1/endpoints/reports/legacy_excel.py:14` — `@router.get("/controls/excel", responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE)`
- `legacy_excel.py:23` — `@router.get("/risks/excel", responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE)`
- `summary_excel.py:97` — `@router.get("/summary/excel", responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE)`
- `audit_trail_excel.py:133` — `@router.get("/audit-trail/excel", responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE)`

All four bodies call `excel_export_removed(replacement=…)` (raise 410). MATCH.

Live `xlsx`-rejection on `/export` confirmed REAL (NOT a tombstone):

- `audit_trail_excel.py:142` — `@router.get("/audit-trail/export", …)` body calls `resolve_export_format(format, replacement="…")` (L153) which raises `excel_export_removed` if `format == "xlsx"`.
- `summary_excel.py:106` — `@router.get("/summary/export", …)` body calls `resolve_export_format(format, …)` (L113) — same shape.

Both `/export` endpoints actually serve `format=csv` (data path runs in body). The OpenAPI `responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE` is documentation; rejection is enforced at runtime via `resolve_export_format`. CONFIRMED real.

Minor numerical discrepancy: recipe at line 166 says "DELETE legacy_excel.py (entire file: 30 lines)"; actual file is **29 lines**.

RED test path (`tests/backend/pytest/api/v1/test_reports_excel_tombstones_removed_red.py`): does NOT exist today.

---

## Item #17 (S2.1) — INLINE `_monitoring_response.py` shim

**Verdict: VALID with minor discrepancy.**

- File: `backend/app/api/v1/endpoints/_monitoring_response.py` — `wc -l` = **25 lines**.
- Recipe at line 281 says "DELETE … (26 lines)"; recipe header summary at line 208 says "26-line compatibility adapter at … `:1-26`". Actual 25 lines. Off-by-one.
- Importer count via `grep -rn "from app.api.v1.endpoints._monitoring_response" backend --include="*.py" | grep -v __pycache__ | wc -l` = **14**. MATCH (recipe claims 14).
- All 14 importer paths match recipe list at `recipe:210-225` — verified against grep output.

RED test path: does NOT exist today.

---

## Item #31 (S5.5) — EXTRACT vendor reporting row formatting

**Verdict: VALID.**

- `backend/app/api/v1/endpoints/vendor_reports.py:36` — `def _annual_report_rows(report) -> tuple[list[str], list[list[object]]]:`
- `vendor_reports.py:76` — `def _dora_register_rows(rows) -> tuple[list[str], list[list[object]]]:`
- Calls at L146 (`headers, rows = _annual_report_rows(report)`) and L170 (`headers, data_rows = _dora_register_rows(rows)`). MATCH.
- `backend/app/services/_vendor_governance/reports.py:7` — `class VendorReportDefinition:` exists (12-line stub). MATCH.

RED test path: does NOT exist today.

---

## Item #57 (S8.1) — DELETE 20-line `quarterly_comparison_service.py`

**Verdict: VALID.**

- `backend/app/services/quarterly_comparison_service.py` — `wc -l` = **20 lines**. MATCH.
- Only "logic": `parse_quarter:11-12` is `def parse_quarter(quarter_str): return _parse_quarter(quarter_str)` (passthrough). MATCH.
- Single prod importer: `grep -rn "quarterly_comparison_service" backend --include="*.py"` returned only `backend/app/api/v1/endpoints/dashboard/quarterly.py:12: from app.services.quarterly_comparison_service import build_quarterly_comparison`. MATCH.
- Lock test at `tests/backend/pytest/test_architecture_deepening_contracts.py:559-569` — `def test_quarterly_comparison_service_is_composition_facade()` body confirmed at recipe-stated lines. MATCH.

3 doc lines confirmed:
- `backend/app/services/_quarterly_comparison/README.md:16` — "Keep `backend/app/services/quarterly_comparison_service.py` as the public service entrypoint…" (matches recipe quote).
- `.planning/codebase/CONVENTIONS.md:22` — facade list contains `quarterly_comparison_service.py` literally. MATCH.
- `.planning/codebase/CONCERNS.md:14` — concern row reads "Committee quarterly snapshot semantics: `backend/app/services/quarterly_comparison_service.py`, `backend/app/services/_quarterly_comparison/`, …". MATCH.

RED test path: does NOT exist today.

---

## Item #69+#70 (atomic) — Vendor migration bundle

**Verdict: VALID with 2 fixture/operational gaps to flag.**

### Pre-state confirmations

- `backend/app/models/vendor.py:22-23` — `class VendorStatus(str, PyEnum):\n    active = "active"`. MATCH.
- `vendor.py:82` — `status: Mapped[str] = mapped_column(String(20), default=VendorStatus.active.value, index=True)`. MATCH.
- `backend/app/models/_archivable.py:60-64` — `legacy_values = {"risks": ("archived",), "controls": ("archived",), "vendors": ("inactive",)}.get(...)`. EXACT MATCH; this is the last consumer of legacy `"inactive"`. CONFIRMED.
- `backend/app/schemas/vendor.py:12-13` — `class VendorStatusEnum(str, Enum):\n    active = "active"`. MATCH.
- `schemas/vendor.py:53` — `status: VendorStatusEnum = VendorStatusEnum.active` on `VendorBase`. MATCH.
- `schemas/vendor.py:83` — `status: VendorStatusEnum | None = None` on `VendorUpdate`. MATCH.
- `backend/app/services/_register_listings/vendors.py:15` — `from app.schemas.vendor import VendorListResponse, VendorStatusEnum, VendorTypeEnum`. MATCH.
- `_register_listings/vendors.py:53,54` — `status_filter: VendorStatusEnum | None`, `archived_status_filter: bool`. MATCH.

### 8 prod sites for status drop

`grep -rn "vendor.status\|status=vendor.status\|...\b" backend/app backend/scripts` returned 6 files matching recipe's enumerated 6 service files plus `seed_e2e_archives.py:283` (= +1 seed). The 8th in the recipe is the larger `_register_listings/vendors.py` (multiple line refs in same file). Recipe's "8 prod sites" tally is consistent with the +1-seed correction (Loop B: 9 sites total). VALID.

### Migration revision name

- File `backend/alembic/versions/k6l7m8n9o0p1_vendor_link_cascade_and_status_drop.py` — does NOT exist today. CONFIRMED.
- Current head: `cd backend && python -m alembic heads` returned `j5k6l7m8n9o0 (head)`. Recipe's `down_revision = "j5k6l7m8n9o0"` is CORRECT.
- Multiple alembic heads exist on disk (`a9b8c7d6e5f4`, `b8c3d2e1f4a5`, `cfd46dc4cb71`, `j5k6l7m8n9o0`) but `7e4603a6e32c_merge_heads_for_approval_status.py` merges them; alembic CLI reports a single head. CONFIRMED single migration window safe.
- `backend/alembic/versions/v2w3x4y5z6a_add_vendor_kri_links.py:28-29` — both FKs already CASCADE. Recipe's "vendor_kri_links FKs already carry ON DELETE CASCADE" is CORRECT.
- `backend/alembic/versions/18c1d2e3f4a5_add_vendor_risk_factors_and_links.py` — 4 FKs (`vendor_risk_links.vendor_id`, `vendor_risk_links.risk_id`, `vendor_control_links.vendor_id`, `vendor_control_links.control_id`) lack `ondelete="CASCADE"`. Recipe's claim "4 FKs lack CASCADE today" CONFIRMED.

### 8 RED tests — would they fail today?

| # | Path | Status today | Would fail? |
|---|------|-------------|-------------|
| 1 | `tests/backend/pytest/architecture/test_vendor_link_mixin_red.py` | absent | YES (`AbstractVendorLink` import would raise; `_vendor_link_mixin.py` not present) |
| 2 | `tests/backend/pytest/architecture/test_vendor_status_drop_red.py` | absent | YES (`Vendor.status` exists at `vendor.py:82`; `VendorStatus` exists at `vendor.py:22`) |
| 3 | `tests/backend/pytest/migrations/test_vendor_link_cascade_postgres_red.py` | absent | YES (4 FKs lack CASCADE per migration `18c1d2e3f4a5`; column `vendors.status` present) |
| 4 | `tests/backend/pytest/migrations/test_vendor_link_migration_forward_only_red.py` | absent | YES (importlib for revision `k6l7m8n9o0p1` would `ImportError`) |
| 5 | `tests/backend/pytest/migrations/test_vendor_migration_idempotency_red.py` | absent | YES (same import target absent) |
| 6 | `tests/backend/pytest/migrations/test_vendor_link_concurrent_writes_red.py` | absent | YES (depends on cascade FKs not present) |
| 7 | `tests/backend/pytest/migrations/test_vendor_link_orphan_precheck_red.py` | absent | YES (`check_no_link_orphans` import target does not exist) |
| 8 | `tests/backend/pytest/migrations/test_vendor_link_partial_failure_recovery_red.py` | absent | YES (same import target absent) |

All 8 RED tests would fail today. CONFIRMED.

### Migration window readiness — gaps surfaced

- **`tests/backend/pytest/migrations/` directory does NOT exist** today. Phase 4 RED test paths put files there; the directory must be created (recipe assumes it implicitly).
- **Postgres-lane fixtures `postgres_session`, `postgres_engine`, `postgres_engine_pre_migration`, `seeded_vendor`** are NOT defined in `tests/backend/pytest/conftest.py`. The recipe's RED tests reference them but recipe does not specify the conftest additions. Phase 4 tests will `ERROR` on fixture-not-found, not `FAIL` on assertion — still satisfies "would fail" but the failure shape is fixture-resolution, not invariant assertion.
- **Makefile target `make -f scripts/Makefile postgres-up`** does NOT exist. Closest is `test-postgres-ci` (which assumes `TEST_DATABASE_URL` is exported, doesn't bring postgres up). Recipe's `postgres-up` reference at `recipe:1157,1858` is misleading. `_USING_POSTGRES = TEST_DATABASE_URL.startswith("postgresql")` at conftest.py:66 selects the lane via env var.

### Step ordering — 9 migration steps

All 9 steps verified against recipe text (Steps 1-9 at recipe:609-1293):
- Step 1: 8 RED tests (verified above)
- Step 2: introduce `AbstractVendorLink` (file does not exist; would create)
- Step 3: rebase 3 link models (currently inherit `Base` only; verified ad-hoc)
- Step 4: generate Alembic migration with `check_no_link_orphans` precheck helper
- Step 5: drop status across 8 prod sites + seeds + tests
- Step 6: collapse `_archivable.py:60-65` legacy_values["vendors"]
- Step 7: 7 doc updates (models/README, _vendor_links/README, ADR-005, ADR-010, docs/README, DOCUMENTATION_TREE, BUSINESS_LOGIC)
- Step 8: final gates (`pytest -m postgres`, `pytest tests/backend/pytest/test_vendors.py …`)
- Step 9: single bundled commit

Sequencing is internally consistent; no order violations. VALID.

---

## Item #77b — Vendor.status FE TS cleanup

**Verdict: VALID.**

- `frontend/src/types/vendor.ts:1` — `export type VendorStatus = 'active';`. MATCH.
- `vendor.ts:64` — `status: VendorStatus;` on `Vendor` interface. MATCH.
- `vendor.ts:94` — `status?: VendorStatus | 'inactive' | 'archived';` on `VendorListParams`. MATCH (literal union including `'inactive'` and `'archived'`).

RED test path (`tests/frontend/unit/src/types/vendor.types.test.ts`): does NOT exist today.

Hard prerequisite (#69+#70 deployed first) is correctly flagged at recipe:1314-1318.

---

## Item #49 (S2.2) — INLINE `_control_execution/monitoring.py` 11-line wrapper

**Verdict: VALID.**

- `backend/app/services/_control_execution/monitoring.py` — `wc -l` = **11 lines**. MATCH.
- File body is the verbatim recipe quote at `recipe:1410-1414`: `now = utc_now()` then `return await load_monitoring_response_context(db, now=now, today=now.date())`. MATCH.
- 4 calls in `link_governance.py` at L62, L91, L141, L170 — `grep` confirmed exactly 4 invocations of `load_control_execution_monitoring_context`. Recipe says "4 callers, all in `…link_governance.py:25,62,91,141,170`" — L25 is the import line; calls at L62/91/141/170. MATCH.
- Lock pinned at `tests/backend/pytest/test_architecture_deepening_contracts.py:188,192`:
  - L188 — `assert hasattr(monitoring, "load_control_execution_monitoring_context")`.
  - L192 — `assert "from app.services._control_execution.monitoring" in governance_source`.
  Both lines verified against recipe quotes at `recipe:1471-1474`. MATCH.

RED test path: does NOT exist today.

---

## Item #45b — Ownership resolver factory

**Verdict: VALID.**

`backend/app/core/_permissions/ownership.py` confirmed as 8 functions in 4×2 grid (4 KRI + 4 Control):

KRI side (file lines):
- L1 `is_kri_reporting_owner` — direct path; NO archived filter (L11-13 query).
- L16 `is_risk_kri_reporting_owner` — risk-scope; archived filter PRESENT (L33: `KeyRiskIndicator.is_archived.is_(False)`).
- L40 `get_kri_ids_where_reporting_owner` — direct path; NO archived filter (L50 query).
- L54 `get_risk_ids_where_kri_reporting_owner` — risk-scope; archived filter PRESENT (L68: `KeyRiskIndicator.is_archived.is_(False)`).

Control side:
- L75 `is_control_owner` — direct.
- L90 `is_risk_control_owner` — risk-scope via `ControlRiskLink` join.
- L111 `get_control_ids_where_owner` — direct.
- L125 `get_risk_ids_where_control_owner` — risk-scope via `ControlRiskLink` join.

Per-method archived filter ASYMMETRY confirmed REAL: KRI risk-scope methods filter `is_archived.is_(False)`; KRI-direct methods do NOT. Recipe's "Phase 4 correction: factory MUST accept per-method archived filter" claim at recipe:1519 is CORRECT.

RED test path (`tests/backend/pytest/test_ownership_resolver_factory_equivalence_red.py`): does NOT exist today.

---

## Migration window readiness check

| Concern | Status |
|---------|--------|
| Single Alembic head | YES — `j5k6l7m8n9o0` (verified via `alembic heads`) |
| Migration revision name in recipe matches available chain | YES — `down_revision = "j5k6l7m8n9o0"` correct |
| `vendor_kri_link.py` cascade already done | YES — at `v2w3x4y5z6a:28-29` |
| 4 FKs lacking CASCADE today | YES — `vendor_risk_links` × 2, `vendor_control_links` × 2 |
| `legacy_values["vendors"]` exists at `_archivable.py:60-65` | YES — last consumer of `("inactive",)` |
| `Vendor.status` column / `VendorStatusEnum` schema both present today | YES |
| 8 prod sites + 1 seed (= 9 sites per Loop B) | YES — `seed_e2e_archives.py:283` is the +1 |
| `tests/backend/pytest/migrations/` directory exists | NO — must be created |
| Postgres fixtures (`postgres_engine`, `postgres_session`, `postgres_engine_pre_migration`, `seeded_vendor`) registered in conftest | NO — not present |
| `make postgres-up` Makefile target | NO — only `test-postgres-ci` exists; postgres lane via `TEST_DATABASE_URL` env |
| `postgres` pytest marker registered | YES — at `conftest.py:193` |

Migration window is OPERATIONALLY READY for the migration itself (single head, correct down_revision, FK target tables identified, status drop sites enumerated correctly). However, the recipe **does not specify** the Phase 4 fixture work — `migrations/` directory creation, postgres fixture additions, and `postgres-up` target are gaps.

---

## 8 RED tests — would they fail today?

All 8 RED test files do NOT exist on disk today.

| Test | Failure mode if added today |
|------|----------------------------|
| `test_vendor_link_mixin_red.py` | `ImportError: cannot import name 'AbstractVendorLink'` (file `_vendor_link_mixin.py` absent) |
| `test_vendor_status_drop_red.py` | `assert "status" not in Vendor.__table__.c` → AssertionError (column present at `vendor.py:82`) |
| `test_vendor_link_cascade_postgres_red.py` | `confdeltype` is `'a'` (NO ACTION) for 4 FKs; assertion `confdeltype == "c"` fails |
| `test_vendor_link_migration_forward_only_red.py` | `ImportError` on `alembic.versions.k6l7m8n9o0p1_vendor_link_cascade_and_status_drop` |
| `test_vendor_migration_idempotency_red.py` | Same `ImportError` on missing migration module |
| `test_vendor_link_concurrent_writes_red.py` | Fixture-resolution error (`postgres_engine`, `seeded_vendor` undefined) before assertion runs; effectively fails |
| `test_vendor_link_orphan_precheck_red.py` | `ImportError` on `check_no_link_orphans` from missing migration module |
| `test_vendor_link_partial_failure_recovery_red.py` | Same `ImportError` on missing migration module |

All 8 would fail (or error) today. CONFIRMED.

---

## Issues found

1. **Missing `tests/backend/pytest/migrations/` directory.** Recipe writes 6 files under this path; recipe does not specify the directory creation step (assumed implicit). Add `__init__.py` or empty conftest in step.
2. **Missing postgres fixtures in conftest.** Recipe's Phase 4 RED tests reference `postgres_engine`, `postgres_session`, `postgres_engine_pre_migration`, `seeded_vendor`. These are NOT in `tests/backend/pytest/conftest.py`. Either add them to conftest as part of Step 1, or they will error with fixture-not-found. The existing postgres-marked tests (`test_w4b_outbox_atomicity_red.py`, `test_postgres_datetime_roundtrip.py`) use the standard `db_session` fixture — adding new postgres-only fixtures is recipe scope.
3. **`make -f scripts/Makefile postgres-up` does not exist.** Recipe at lines 1157, 1858 invokes a non-existent target. Should reference `test-postgres-ci` or be reworded to "ensure `TEST_DATABASE_URL=postgresql://…` is exported, then run `pytest -m postgres …`".
4. **Off-by-one on `_monitoring_response.py` line count.** Recipe says 26 lines; actual is 25. Cosmetic.
5. **Off-by-one on `legacy_excel.py` line count.** Recipe says 30 lines; actual is 29. Cosmetic.
6. **Multiple alembic heads on disk** (4 visible: `a9b8c7d6e5f4`, `b8c3d2e1f4a5`, `cfd46dc4cb71`, `j5k6l7m8n9o0`) are merged via `7e4603a6e32c_merge_heads_for_approval_status.py` so the live head is single (`j5k6l7m8n9o0`). Recipe's claim of single head is correct, but worth a one-line callout in the recipe to avoid confusion when grepping versions.

None of these block the recipe's correctness; (1)-(3) are operational additions that should be folded into the recipe to make Phase 4 RED tests runnable on day one.

---

## Recommendations

- ADD to recipe Step 1: explicit creation of `tests/backend/pytest/migrations/__init__.py` and `tests/backend/pytest/migrations/conftest.py` with the `postgres_engine`, `postgres_session`, `postgres_engine_pre_migration`, and `seeded_vendor` fixture stubs.
- REPLACE recipe references to `make -f scripts/Makefile postgres-up` (lines 1157, 1858) with: `TEST_DATABASE_URL="postgresql+asyncpg://…" make -f scripts/Makefile test-postgres-ci` (or document that postgres provisioning is operator-side).
- FIX cosmetic off-by-one numbers (`_monitoring_response.py`: 25 not 26; `legacy_excel.py`: 29 not 30) for consistency.
- KEEP all 10 items as ACCEPT; no item flips to REJECT or DEFER on empirical re-verification.

End of P6-V5 verification.
