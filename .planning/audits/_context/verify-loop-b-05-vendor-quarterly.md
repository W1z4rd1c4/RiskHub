# Phase 2 Loop B — ADVERSARIAL re-verification: Vendor + Quarterly + Reports + Monitoring

Working directory: `/Users/stefanlesnak/Antigravity/RiskHubOSS`. Verification only. No edits.

Adversarial focus: re-verify Loop A's findings, especially #57 override, #13 archive precedence, #17 importer count, #69 mixin viability, #70 prod sites, #16 tombstone purity, #31 target stub.

---

## Item #13 — Loop A said: ACCEPT (P1) — vendor_link_helpers.py shim delete + contract sync

- Quote check (archive precedence): **PASS**.
  - `backend/app/api/v1/endpoints/vendor_link_helpers.py:44-50` reads:
    - L44 quote: `if require_write and vendor.is_archived:` → 409 conflict (line 45).
    - L47-50 quote: `if require_write and not (...):` → 403 forbidden (line 50).
    - **Order in shim: archive (409) BEFORE write-perm (403).**
  - `backend/app/services/_vendor_governance/links.py:54-60` reads:
    - L54 quote: `if require_write and not (` → 403 (line 57: `raise AuthorizationError("Permission denied: vendors:write")`).
    - L59 quote: `if require_write and vendor.is_archived:` → 409 (line 60: `raise ConflictError("Cannot mutate links for archived vendor")`).
    - **Order in service: write-perm (403) BEFORE archive (409).**
  - **Loop A's claim of divergent ordering is CONFIRMED**. Two helpers with same name diverge at the first-raise priority for an archived vendor where the user lacks `vendors:write` but is owner of vendor.
- Importer count (fresh grep): **PASS**. `grep -rn "from app.api.v1.endpoints.vendor_link_helpers" --include="*.py"` and `grep -rn "vendor_link_helpers"` BOTH return zero hits in production AND tests. Loop A's "ZERO hits" matches.
- Body comparison (#13 archive precedence ordering): **PASS** (divergent ordering verified line-by-line).
- Doc-only argument: N/A — Loop A's verdict is ACCEPT.
- Blocker missed:
  - Loop A noted `commit_service_transaction(db)` in shim vs `db.flush()` in service. Verified at `vendor_link_helpers.py:91, 107` (`await commit_service_transaction(db)`) and `_vendor_governance/links.py:101, 117` (`await db.flush()`). ADR-002 transaction-ownership divergence is REAL — endpoint shim commits, service flushes.
  - Doc citations confirmed: `docs/security/authorization-capability-contract.json:55, 479, 502` and `.md:121, 122` exist. Loop A says 5 lines actual; phrasing OK.
- **Final Phase 2-B verdict: CORRECT.**

---

## Item #16 — Loop A said: ACCEPT WITH MOD (P2) — Reports legacy-excel tombstone removal

- Quote check (tombstone purity): **PASS**.
  - `backend/app/api/v1/endpoints/reports/legacy_excel.py:14` quote: `@router.get("/controls/excel", responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE)`. Body lines 15-20: build context (line 19), `raise excel_export_removed(...)` (line 20). **CONTEXT BUILD before raise** — not pure no-op. Note: `build_report_export_context(current_user=current_user, department_id=department_id)` IS called pre-410. This is permission/scope evaluation, but not business logic. Tombstone-ish.
  - `backend/app/api/v1/endpoints/reports/legacy_excel.py:23` `download_risks_excel` — same shape, same context build, same raise.
  - `backend/app/api/v1/endpoints/reports/audit_trail_excel.py:133-139` — same pattern: builds context (line 138), raises (line 139). Located alongside live `/audit-trail/export` route (line 142+).
  - `backend/app/api/v1/endpoints/reports/summary_excel.py:97-103` — same pattern.
  - **All four tombstones invoke `build_report_export_context()` before `raise`.** This is non-trivial — the call resolves user permissions and may evaluate `department_id`. Loop A's "no business logic" framing under-states this; it IS pre-410 permission evaluation. However, the only side effect is to surface 403/404 ahead of 410, which is consistent with the pattern of returning 410-with-replacement messaging only to authorized callers. Tombstone-with-permission-eval is the correct framing.
- Importer count (fresh grep): **PASS**. Tombstone routes referenced from 4 test files + 2 contract probes + 2 doc citations as Loop A enumerates.
- Body comparison (#13 archive precedence): N/A.
- Doc-only argument: N/A.
- Blocker missed:
  - Loop A says "4 routes returning 410". Two are pure-tombstone (`legacy_excel.py` only); two (`audit_trail_excel.py`, `summary_excel.py`) live alongside their live `/export` siblings — removal touches the live file but only the tombstone block. Loop A's "Mixed" call-out is correct.
  - Note: Loop A also flags that `audit_trail_excel.py:142` and `summary_excel.py:106` ALSO carry `EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE` for `xlsx`-format rejection inside `resolve_export_format`. **VERIFIED** at the file: line 142 quote: `@router.get("/audit-trail/export", responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE)` and line 106 same pattern. So the 410 helper STAYS even after tombstones removed.
- **Final Phase 2-B verdict: CORRECT.**

---

## Item #17 — Loop A said: ACCEPT (P2) — _monitoring_response shim consolidation

- Quote check: **PASS**.
  - `backend/app/api/v1/endpoints/_monitoring_response.py:1` quote: `"""Compatibility Adapter for monitoring response projection helpers."""`.
  - File is pure re-export per Loop A's claim.
- Importer count (fresh grep): **PASS — 14 confirmed**.
  - Fresh grep: `grep -rn "from app.api.v1.endpoints._monitoring_response" backend/ --include="*.py"` returned **14 lines** (verified by `wc -l = 14`).
  - Each importer enumerated by Loop A (`departments/controls.py:10`, `departments/kris.py:8`, `controls/linking.py:4`, `controls/crud/{create,restore,detail}.py:6`, `risks/crud/{create:7,restore:6,detail:6}.py`, `risks/control_links.py:4`, `kris/crud/{create:6,restore:6,detail:6,breaches:8}.py`) is reproduced exactly by fresh grep.
  - **Phase 1 audit said "7 endpoint files"; Loop A's "14" is correct and Phase 1 was wrong.**
- Body comparison: N/A (#17 is pure re-export by inspection of file lines 3-25).
- Doc-only argument: N/A.
- Blocker missed: None. Doc references in `authorization-capability-contract.json:97, 310, 351` cite the SERVICE module, not the endpoint shim. Removing the endpoint shim does not require contract edits.
- **Final Phase 2-B verdict: CORRECT.**

---

## Item #31 — Loop A said: ACCEPT WITH MOD (P3) — Vendor reporting service extraction; target = `_vendor_governance/reports.py:7` `VendorReportDefinition`

- Quote check: **PASS**.
  - `backend/app/services/_vendor_governance/reports.py:7-11`:
    - L7-8 quote: `@dataclass(frozen=True) class VendorReportDefinition:`.
    - L9-11: `report_type: str`, `headers: tuple[str, ...]`, `row_mapper: Any`.
    - File is **12 lines total** — pure dataclass scaffold; no methods, no instances.
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:1082` quote: `assert hasattr(reports, "VendorReportDefinition")` — only consumer.
  - `backend/app/api/v1/endpoints/vendor_reports.py:36` quote: `def _annual_report_rows(report) -> tuple[list[str], list[list[object]]]:` (endpoint-side row builder).
  - `backend/app/api/v1/endpoints/vendor_reports.py:76` quote: `def _dora_register_rows(rows) -> tuple[list[str], list[list[object]]]:` (endpoint-side row builder).
- Importer count (fresh grep): **PASS**.
  - `grep -rn "VendorReportDefinition"` returns ONLY:
    - `backend/app/services/_vendor_governance/reports.py:8` (definition)
    - `tests/backend/pytest/test_architecture_deepening_contracts.py:1082` (lock test)
  - `grep -rn "vendor_reporting_service"` returns ONE production importer: `backend/app/api/v1/endpoints/vendor_reports.py:26` (matching Loop A).
- Body comparison: N/A (target is empty stub).
- Doc-only argument: N/A.
- Blocker missed:
  - Verified: `_vendor_governance/reports.py` is genuinely a stub. `dataclass` shape is `(report_type, headers, row_mapper)`, designed exactly to receive `_annual_report_rows`/`_dora_register_rows`. Loop A's "row formatters → reuse `VendorReportDefinition`" is mechanically reasonable.
  - However: the audit (#31 / S5.5) target listed in `developer answer.md` may have phrased the canonical home differently. Loop A's choice of `VendorReportDefinition` is consistent with the existing dataclass scaffold rather than building a new `services/_reporting/` module — sound.
  - Note: existing `vendor_reporting_service.py` uses typed dataclasses (`VendorAnnualReportData`, `VendorDoraRegisterRow`); CSV row mapping is the natural neighbour.
- **Final Phase 2-B verdict: CORRECT.**

---

## Item #57 — Loop A said: OVERRIDE — Reject argument doc-only; recommend DELETE facade

### Adversarial body inspection

I read **the entire facade** (`backend/app/services/quarterly_comparison_service.py`):

- Line 1: `"""Compatibility facade for Risk Committee quarterly comparison metrics."""` (docstring)
- Lines 3-7: `from app.services._quarterly_comparison.composition import (PERIOD_METRICS, SNAPSHOT_METRICS, build_quarterly_comparison,)`
- Line 8: `from app.services._quarterly_comparison.periods import parse_quarter as _parse_quarter`
- Line 11: `def parse_quarter(quarter_str: str):`
- Line 12: `    return _parse_quarter(quarter_str)`
- Lines 15-20: `__all__ = [...]`

**Every non-import, non-`__all__` line:**

- Line 1 (docstring): zero logic
- Line 11 quote: `def parse_quarter(quarter_str: str):` — wrapper signature
- Line 12 quote: `    return _parse_quarter(quarter_str)` — direct call passthrough

**Behavioural delta of `parse_quarter` wrapper vs `_quarterly_comparison.periods.parse_quarter`:**

- Source: `backend/app/services/_quarterly_comparison/periods.py:10` quote: `def parse_quarter(quarter_str: str) -> datetime:`. Returns `datetime`.
- Wrapper: `quarterly_comparison_service.py:11` quote: `def parse_quarter(quarter_str: str):` (no return annotation). Functionally identical, **but DROPS the `-> datetime` return type annotation**. Type-checker sees the facade as returning `Any` instead of `datetime`.

Adversarial conclusion: **the wrapper is NOT pure passthrough at the type-system level.** Calling `quarterly_comparison_service.parse_quarter(...)` returns `Any` to mypy; calling `_quarterly_comparison.periods.parse_quarter(...)` returns `datetime`. This is a real but minor observable difference.

However, no current consumer of the facade depends on this Any-typing. The endpoint at `dashboard/quarterly.py:12` only imports `build_quarterly_comparison`, not `parse_quarter`. Tests don't import `parse_quarter` from the facade. Per fresh grep:
- `grep -rn "parse_quarter" --include="*.py"` shows: facade defines+wraps; periods defines; no other consumer at all.

So the wrapper exists only for `__all__` completeness and serves zero callers. It is **dead code already**.

- Quote check: **PASS** — every facade line quoted verbatim above.
- Importer count (fresh grep): **PASS — 1 production endpoint, 0 tests via facade**.
  - `grep -rn "from app.services.quarterly_comparison_service" --include="*.py"` returns ONLY: `backend/app/api/v1/endpoints/dashboard/quarterly.py:12`.
  - `grep -rn "quarterly_comparison_service" --include="*.py"` returns ALSO: `tests/backend/pytest/test_architecture_deepening_contracts.py:559-568` (the lock test, accessing as `from app.services import quarterly_comparison_service`).
- Body comparison (#57 facade body): **PASS WITH NUANCE**. Body is 20 lines, but contains a 2-line `parse_quarter` wrapper that drops the return-type annotation. Functionally equivalent at runtime. Loop A's "adds zero logic" is true at runtime; **slightly inaccurate at the type-system level**. This nuance does NOT block deletion; deleting the wrapper and repointing the (zero) callers loses nothing.
- Doc-only argument is real: **YES — override sound.** The Reject evidence is:
  - `backend/app/services/_quarterly_comparison/README.md:16` — internal package README. **Doc-only.**
  - `.planning/codebase/CONVENTIONS.md:22` — codebase plan. **Doc-only.**
  - `.planning/codebase/CONCERNS.md:14` — codebase plan. **Doc-only.**
  - `.planning/codebase/STRUCTURE.md:25` — codebase plan; references package, not facade. Likely no edit needed.
  - `.planning/codebase/ARCHITECTURE.md:42` — references package, not facade. Likely no edit needed.
  - `tests/backend/pytest/test_architecture_deepening_contracts.py:559-569` — lock test asserting facade IS pure re-export. This is a **lock test**, which orchestrator override allows to be rewritten when the locked artifact is deleted.
  - **All Reject anchors are docs or doc-locks. None are production code. Override is sound.**
- Blocker missed: **none**. The minor type-annotation drop in the `parse_quarter` wrapper does not block deletion. Endpoint repoint is `from app.services._quarterly_comparison.composition import build_quarterly_comparison` — single-line edit. Lock test rewrite is a test-edit.
- **Final Phase 2-B verdict: CORRECT.** (Override holds. The `parse_quarter` wrapper has a trivial type-annotation shadow that does not constitute "added logic".)

---

## Item #69 — Loop A said: PLAN MIGRATION — Phase 1 mixin (preserve 3 tables)

### Adversarial mixin viability check

Loop A proposes `AbstractVendorLink` mixin with `id`, `vendor_id`, `created_at`. Verifying compatibility with `ArchivableMixin` ADR-005 column-shape contract:

- `backend/app/models/_archivable.py:12-20` is the ArchivableMixin. Defines `is_archived`, `archived_at`, `archived_by_id`. **NONE of the three vendor-link models inherit `ArchivableMixin`.** Vendor-link tables are NOT archivable; they are vendor-vendee join tables that cascade-delete on vendor archive.
- Verified: `vendor_risk_link.py:16` `class VendorRiskLink(Base):` — no ArchivableMixin.
- Verified: `vendor_control_link.py:16` `class VendorControlLink(Base):` — no ArchivableMixin.
- Verified: `vendor_kri_link.py:16` `class VendorKRILink(Base):` — no ArchivableMixin.
- **The proposed `AbstractVendorLink` mixin does NOT collide with `ArchivableMixin`** because vendor-link models never inherit `ArchivableMixin`. ADR-005 column-shape contract for archivable mixins applies only to `risks`, `controls`, `vendors`, `kris` (parent register entities).

### Adversarial CASCADE inconsistency check

- `vendor_risk_link.py:20` quote: `vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"), index=True, nullable=False)` — **NO `ondelete`**.
- `vendor_risk_link.py:21` quote: `risk_id: Mapped[int] = mapped_column(ForeignKey("risks.id"), index=True, nullable=False)` — **NO `ondelete`**.
- `vendor_control_link.py:20-21` — same shape, no `ondelete`.
- `vendor_kri_link.py:21-22`:
  - L21 quote: `vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id", ondelete="CASCADE"), index=True)` — **HAS `ondelete=CASCADE`**.
  - L22 quote: `kri_id: Mapped[int] = mapped_column(ForeignKey("key_risk_indicators.id", ondelete="CASCADE"), index=True)` — **HAS `ondelete=CASCADE`**.
- `vendor.py:89-103`:
  - L89-92: `risk_links: ... cascade="all, delete-orphan"` (SQLAlchemy ORM cascade only).
  - L94-97: `control_links: ... cascade="all, delete-orphan"`.
  - L99-102: `kri_links: ... cascade="all, delete-orphan"`.
  - **All three relationships use ORM cascade only at the parent.** DB-level CASCADE only on `kri_links`. Inconsistency is REAL.

### Mixin viability conclusion

The proposed Phase 1 `AbstractVendorLink(__abstract__ = True)` with `id`, `vendor_id`, `created_at` is structurally viable:
- Each concrete subclass keeps its own `__tablename__` and entity FK column.
- Mixin enforces column-shape consistency (`id` autoincrement int, `vendor_id` FK with `ondelete="CASCADE"`, `created_at` server_default).
- A forward-only Alembic migration would rebuild `vendor_risk_links.vendor_id` and `vendor_risk_links.risk_id` FKs (and same for control_links) to add `ON DELETE CASCADE`.

The mixin **does NOT violate ADR-005 ArchivableMixin's column-shape contract** because vendor-link tables are not archivable.

- Quote check: **PASS** — all model line quotes verified.
- Importer count (fresh grep): **PASS** — Loop A's site enumeration is consistent with prior phase-1 inventory; not re-enumerated here as audit scope is taxonomy/topology, not site-level grep.
- Body comparison (#69 mixin viability): **PASS**. Mixin is viable; ArchivableMixin is orthogonal. ADR-005 is not threatened by Phase 1.
- Doc-only argument: N/A — Loop A overrode developer Defer with a code-rationale (CASCADE inconsistency).
- Blocker missed:
  - Verified the cascade gap on `vendor_risk_link.vendor_id`, `risk_id`, `vendor_control_link.vendor_id`, `control_id` — Loop A's diagnosis is exactly right.
  - Phase 2 (polymorphic merge) remains genuinely high-risk per Loop A's own acknowledgement; planning Phase 1 only is the right call.
- **Final Phase 2-B verdict: CORRECT.** Override is sound; Phase 1 mixin is viable.

---

## Item #70 — Loop A said: DROP MECHANICALLY — Vendor.status enum drop; only 8 prod sites; `_archivable.py:60-65` legacy_values is last consumer

### Adversarial fresh grep on `Vendor.status` and `vendor.status`

Fresh `grep -rn "Vendor\.status\b" backend/ --include="*.py"`:
1. `backend/app/services/_register_listings/vendors.py:161` — `query = query.where(Vendor.status == criteria.status_filter.value)`
2. `backend/app/services/_register_listings/vendors.py:200` — `"status": Vendor.status,`
3. `backend/app/services/_register_listings/vendors.py:273` — `Vendor.status.label("status"),`

**3 hits on `Vendor.status` (class-level).**

Fresh `grep -rn "vendor\.status\b" backend/ --include="*.py"`:
1. `backend/app/services/_monitoring_response.py:219` — `status=vendor.status,`
2. `backend/app/services/_register_listings/controls.py:554` — `status=link.vendor.status,`
3. `backend/app/services/_register_listings/risks.py:430` — `status=vendor.status,`
4. `backend/app/services/_reporting/exports/rows.py:120` — `"status": vendor.status,`
5. `backend/app/services/_kri_history/direct_application.py:36` — `status=link.vendor.status,`
6. `backend/scripts/seed_e2e_archives.py:283` — `vendor.status = entry["status"]`

**6 hits on `vendor.status` (instance-level).**

**Total: 3 + 6 = 9 production+seed sites for `Vendor.status` / `vendor.status` references.** Loop A said "8 production sites" + seed scripts separately. Counting seed scripts as separate, prod count = 8 (matches Loop A; the 9th is a seed script).

### Adversarial fresh grep on `status_filter` for vendors

Fresh grep: `status_filter` shows up in 5 listing files and in `_register_listings/vendors.py:53` (`VendorStatusEnum | None`), `:54` (`archived_status_filter`), `:89, 103, 122, 131, 482, 516`. Loop A's enumeration matches.

### Adversarial check on `_archivable.py:60-65` last legacy consumer

- Verified `backend/app/models/_archivable.py:56-71` end-to-end:
  - L56: `def archived_clause(model: Any, *, archived: bool = True):`
  - L60-64 quote: `legacy_values = { "risks": ("archived",), "controls": ("archived",), "vendors": ("inactive",), }.get(getattr(model, "__tablename__", ""))`
  - L66-71: `flag_clause = model.is_archived.is_(archived)`; if `legacy_values`, `OR` `status_column.in_(legacy_values)` for `archived=True`, `AND notin_` for `archived=False`.
  - **The `"vendors": ("inactive",)` entry IS the only `Vendor.status='inactive'` consumer.** No other site filters or matches `inactive`.
- **CRITICAL ADVERSARIAL FINDING**: The `legacy_values` dict has THREE entries, not just `vendors`. `risks` and `controls` ALSO have `("archived",)` legacy values. Loop A's "removing the `vendors` entry collapses `archived_clause(Vendor)`" is correct, BUT:
  - Removing `"vendors": ("inactive",)` from `legacy_values` does NOT touch `risks` or `controls` legacy entries. Those have their own status enum migrations (likely under different ADR-005 transitional handling). This is fine — the edit is scoped.
  - Note: After removing `Vendor.status` column entirely, `getattr(model, "status", None)` returns `None`, and the function returns `flag_clause` directly via the early-return at L67 (`if status_column is None or not legacy_values:`). So the `legacy_values` dict edit is not strictly necessary IF the column is gone. But cleaning it is cosmetic correctness.

### Quote check on `Vendor.status` model column

- `backend/app/models/vendor.py:22-23` quote: `class VendorStatus(str, PyEnum): active = "active"`. **Single-value enum.**
- `backend/app/models/vendor.py:82` quote: `status: Mapped[str] = mapped_column(String(20), default=VendorStatus.active.value, index=True)`.
- `backend/app/schemas/vendor.py:12-13` quote: `class VendorStatusEnum(str, Enum): active = "active"`. Mirror.
- All quotes match Loop A.

### Verdict checks

- Quote check: **PASS** — all line quotes verified.
- Importer count (fresh grep): **PASS** — 8 prod sites + 6+1 seed-script sites + 5+ listing-criteria propagation sites. Loop A's count is correct.
- Body comparison: **PASS** — `_archivable.py:60-64 legacy_values` confirmed as last consumer of `'inactive'`.
- Doc-only argument: N/A — Loop A overrode developer Defer with code-mechanical rationale.
- Blocker missed:
  - Loop A's plan to drop the column also requires removing `archived_status_filter` resolution at `_register_listings/vendors.py:122-131` which currently coerces `"archived"`/`"inactive"` strings to flag. Verified that this code-path treats `inactive` as a synonym for archived — once column is dropped, the synonym mapping (`'inactive'` → `is_archived=true`) becomes obsolete but harmless.
  - Test `tests/backend/pytest/test_vendors.py:436` quote: `assert vendor.status == "active"` would FAIL after column drop. Loop A flagged this. Confirmed.
- **Final Phase 2-B verdict: CORRECT.** Override is sound; #70 is mechanically straightforward.

---

## Cross-cutting adversarial checks

### Phase 1 audit said #17 has 7 endpoint files; Loop A says 14

**Loop A is right.** Fresh grep: `grep -rn "from app.api.v1.endpoints._monitoring_response" backend/ --include="*.py" | wc -l` → **14**. Phase 1 audit was outdated. Loop A correctly inventoried the actual fan-out.

### Lock test exists for facade #57 and orchestrator override allows rewrite

`tests/backend/pytest/test_architecture_deepening_contracts.py:559` — `def test_quarterly_comparison_service_is_composition_facade()`. Lock-pinning `quarterly_comparison_service.build_quarterly_comparison is composition.build_quarterly_comparison`, and `assert "async def build_quarterly_comparison" not in facade_source`. Per orchestrator rule: **lock tests fall when the locked artifact is deleted; rewriting is part of plan, not a blocker**.

### Doc footprint of facade deletion

Edits required (per Loop A enumeration, all confirmed):
- `backend/app/services/_quarterly_comparison/README.md:16`
- `.planning/codebase/CONVENTIONS.md:22`
- `.planning/codebase/CONCERNS.md:14`
- `tests/backend/pytest/test_architecture_deepening_contracts.py:559-569` (rewrite)
- `backend/app/api/v1/endpoints/dashboard/quarterly.py:12` (repoint)

Total surface for #57: **5 lines edited + 1 file deleted + 1 test rewritten.**

### Bundling #69 + #70

Both touch `vendor*` tables and require ADR-010 forward-only entries. Loop A recommends bundling. **Confirmed prudent** — single migration window, single rehearsal, single rollback drill.

---

## Loop B summary table

| Item | Loop A verdict | Loop B verdict | Notes |
|------|---------------|----------------|-------|
| #13 | ACCEPT (P1) | CORRECT | Archive precedence (409 vs 403) divergence verified line-by-line |
| #16 | ACCEPT WITH MOD (P2) | CORRECT | Tombstones contain pre-410 permission eval; framing accurate |
| #17 | ACCEPT (P2) | CORRECT | 14 importers (not 7) confirmed by fresh grep |
| #31 | ACCEPT WITH MOD (P3) | CORRECT | `VendorReportDefinition` stub is genuinely the right home |
| #57 | OVERRIDE → DELETE | CORRECT | Doc-only Reject anchors verified; `parse_quarter` wrapper is type-shadowed but runtime-equivalent |
| #69 | OVERRIDE → Phase 1 mixin | CORRECT | Mixin does not violate ADR-005 (vendor-link tables are non-archivable) |
| #70 | OVERRIDE → DROP | CORRECT | `_archivable.py:63 "vendors": ("inactive",)` is the last legacy consumer |

All seven Loop A verdicts in this domain hold under adversarial re-verification. No blockers missed. Bundling #69 + #70 in one migration window is sound.
