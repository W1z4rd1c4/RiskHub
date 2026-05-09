# Final Section 3 — Per-Item Recipes (Items 1-26)

Phase: **7 (production-write)**. Build commit ref: `1ee872a4` on `main`.
Source: Phase 5 recipes (`recipe-01-issues.md`, `recipe-02-risks-and-endpoints.md`, `recipe-03-approvals.md`, `recipe-04-kris.md`, `recipe-05-vendor-migration.md`, `recipe-06-frontend-deadcode.md`, `recipe-07-frontend-authz.md`, `recipe-08-crosscut-adrs.md`, `plan-loop-3-06-adr-drafts.md`).
Phase 6 corrections applied: see verify-recipe-01..08 reports.
Master sequence: `plan-loop-3-07-integration-v2.md:343-422` (79 items).

This section documents items 1-26 of the 79-item v2 master sequence:
- Wave 1 ADRs: 4 items (#72, #73, #74a, #74b)
- Wave 2 P1 quick wins: 11 items (#10, #57, #12, #13, #1, #19, #11, #14, #15, #37, #76)
- Wave 3 P2 dead-code A: 11 items (#2, #3, #4, #5, #6, #7, #41, #50, #52, #53, #20)

All recipes assume single sequential developer; TDD red→green; new architecture
tests carry `pytestmark = pytest.mark.contract`; backend integration tests use
`client_factory` from `tests/backend/pytest/conftest.py`. Quote rule: ≤15 words.

---

### Item #1 — #72 — ADR-011 Auth Scheme and Session Model

**Wave**: 1  | **Slot**: v2 Seq 1  | **Effort**: M (6-8h)  | **Priority**: P1  | **Domain**: crosscut

**Dependencies**: none  
**Atomic with**: none  
**Validator?**: no — but adds 4 architecture-lock tests gating future regression on auth idiom

#### Why this work

ADR-011 is the missing canonical statement for RiskHub's authentication scheme. Today three transport surfaces coexist on protected routes (`require_permission` factory, body-call `_require_*` helpers, inline `if not has_permission: 403`); the mock-auth fallback inside `core/security.py:107-136` is undocumented at the architecture level. Audit ID = #72; developer verdict = ACCEPT (P1). This ADR ratifies the rule that #76 (auth/ commit migration, v2 Seq 70) implements; landing #72 first is a hard prerequisite for #76.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 1 (`plan-loop-3-07-integration-v2.md:344`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of `backend/app/core/security.py:107-136`, `backend/app/api/v1/endpoints/auth/{sso.py,refresh.py,logout.py,password.py,_sso_helpers.py,demo.py}`, `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml`.
- [ ] No concurrent feature-work conflicts on these files.

#### TDD Step 1 — Write Failing Test (RED)

**Test files** (4 new architecture locks):
- `tests/backend/pytest/architecture/test_w12_auth_idiom_ratchet_red.py`
- `tests/backend/pytest/architecture/test_w12_get_current_user_isolation_red.py`
- `tests/backend/pytest/architecture/test_w12_mock_auth_guard_red.py`
- `tests/backend/pytest/architecture/test_w12_sso_token_exchange_boundary_red.py`

**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
# tests/backend/pytest/architecture/test_w12_auth_idiom_ratchet_red.py
from __future__ import annotations

import ast
import tomllib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ENDPOINTS = REPO_ROOT / "backend/app/api/v1/endpoints"
BASELINE = Path(__file__).parent / "_auth_idiom_baseline.toml"


def _count_legacy_idioms(root: Path) -> dict[str, int]:
    body_calls = 0
    inline_403 = 0
    for path in root.rglob("*.py"):
        try:
            tree = ast.parse(path.read_text())
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                fn = node.func
                name = (
                    fn.id if isinstance(fn, ast.Name)
                    else fn.attr if isinstance(fn, ast.Attribute)
                    else None
                )
                if name and name.startswith("_require_") and isinstance(node.parent_function, ast.AsyncFunctionDef):  # type: ignore[attr-defined]
                    body_calls += 1
            if isinstance(node, ast.If):
                test = ast.unparse(node.test)
                if "has_permission" in test and "not " in test:
                    for child in ast.walk(node):
                        if isinstance(child, ast.Raise) and "403" in ast.unparse(child):
                            inline_403 += 1
    return {"body_call_require": body_calls, "inline_403": inline_403}


def test_auth_idiom_count_non_increasing() -> None:
    baseline = tomllib.loads(BASELINE.read_text())
    current = _count_legacy_idioms(ENDPOINTS)
    assert current["body_call_require"] <= baseline["body_call_require"], (
        "new body-call _require_* introduced; ADR-011 forbids growth"
    )
    assert current["inline_403"] <= baseline["inline_403"], (
        "new inline 'if not has_permission: 403' introduced"
    )
```

```python
# tests/backend/pytest/architecture/test_w12_get_current_user_isolation_red.py
from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ALLOWED = {"backend/app/core/security.py", "backend/app/api/deps.py"}


def test_get_current_user_imports_only_inside_allowed_files() -> None:
    offenders: list[str] = []
    for path in (REPO_ROOT / "backend/app").rglob("*.py"):
        rel = str(path.relative_to(REPO_ROOT))
        if rel in ALLOWED:
            continue
        text = path.read_text()
        if "from app.core.security import" in text and "get_current_user" in text:
            offenders.append(rel)
    assert offenders == [], (
        "get_current_user must be imported via app.api.deps, not app.core.security"
    )
```

```python
# tests/backend/pytest/architecture/test_w12_mock_auth_guard_red.py
from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SECURITY = REPO_ROOT / "backend/app/core/security.py"


def test_mock_auth_branch_is_guarded_by_and_of_two_conjuncts() -> None:
    tree = ast.parse(SECURITY.read_text())
    found = False
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            target = ast.unparse(node.targets[0])
            if target == "mock_auth_enabled":
                value = ast.unparse(node.value)
                if "mock_auth_enabled" in value and "debug" in value and " and " in value:
                    found = True
    assert found, "mock-auth fallback must be gated by mock_auth_enabled AND debug"
```

```python
# tests/backend/pytest/architecture/test_w12_sso_token_exchange_boundary_red.py
from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SSO = REPO_ROOT / "backend/app/api/v1/endpoints/auth/sso.py"
HELPERS = REPO_ROOT / "backend/app/api/v1/endpoints/auth/_sso_helpers.py"


def test_sso_module_calls_exchange_helper() -> None:
    sso_text = SSO.read_text()
    assert "from app.api.v1.endpoints.auth._sso_helpers" in sso_text or "from .._sso_helpers" in sso_text
    helpers_text = HELPERS.read_text()
    assert "create_access_token" in helpers_text or "create_refresh_token" in helpers_text
```

**Expected result**: RED. Run:
```
pytest tests/backend/pytest/architecture/test_w12_auth_idiom_ratchet_red.py tests/backend/pytest/architecture/test_w12_get_current_user_isolation_red.py tests/backend/pytest/architecture/test_w12_mock_auth_guard_red.py tests/backend/pytest/architecture/test_w12_sso_token_exchange_boundary_red.py -q
```
Tests fail because baseline TOML, isolation invariant, and SSO boundary lock are not yet asserted.

#### TDD Step 2 — Implement Change

**Files to create**:
- `docs/adr/ADR-011-auth-scheme-and-session-model.md` — full ADR text per `recipe-08-crosscut-adrs.md:316-376`. Decision states `require_permission(resource, action)` is canonical (defined at `core/security.py:170` per Phase 6 Probe 1 fix). Cross-refs ADR-001/002/003/004 (NOT ADR-006 — Phase 4 REJECT). Includes `## SSO Token-Exchange Boundary` subsection.
- `tests/backend/pytest/architecture/_auth_idiom_baseline.toml` — captures current counts of body-call `_require_*` and inline-403 raises (the lock asserts non-increasing).
- 4 new architecture lock tests above.

**Files to edit**:
- None (this is doc + locks; no production code change).

**Files to delete**:
- None.

#### TDD Step 3 — Confirm GREEN

After ADR-011 is written and the 4 tests are landed (with the baseline TOML capturing today's count):
```
pytest tests/backend/pytest/architecture/test_w12_*_red.py -q
```
All 4 tests pass.

#### Lock/TOML/Contract updates (same commit)

- New `_auth_idiom_baseline.toml` (captures current `body_call_require` and `inline_403` counts; future PRs cannot exceed these).
- Existing lock at `tests/backend/pytest/architecture/test_w5_endpoint_commit_ratchet_red.py::test_auth_commit_allowlist_entries_are_complete_and_unexpired` extends to enforce cap-0 after `2026-09-01` (no edit needed; the existing date check fires once #76 removes the entries).

#### README / doc updates (same commit)

- `docs/adr/README.md` (if present) — append ADR-011 row to the index.
- `AGENTS.md` — cross-reference ADR-011 in the auth-flow section if it cites ADR-002.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_w12_auth_idiom_ratchet_red.py -q` — must pass.
2. `pytest tests/backend/pytest/architecture/test_w12_get_current_user_isolation_red.py -q` — must pass.
3. `pytest tests/backend/pytest/architecture/test_w12_mock_auth_guard_red.py -q` — must pass.
4. `pytest tests/backend/pytest/architecture/test_w12_sso_token_exchange_boundary_red.py -q` — must pass.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
7. `ruff check tests/backend/pytest/architecture/test_w12_*_red.py` — clean.
8. `mypy tests/backend/pytest/architecture/test_w12_*_red.py` — clean.

#### Commit boundary

Single commit titled: `docs(adr): land ADR-011 auth scheme and session model with 4 invariant locks`.

#### Rollback

- Class: **DOC-ONLY** with lock-ratchet companion.
- Procedure:
  1. `git revert <SHA>` to remove ADR-011, the 4 lock tests, and the baseline TOML.
  2. No production code change is reverted (none was made).
  3. Re-run `make -f scripts/Makefile test-architecture-locks` — must pass without the new locks.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: 6-8h (ADR text + 4 AST locks + baseline TOML + verification).
- Risk: LOW — doc + lock only; no runtime code touched.
- Mitigations: baseline TOML captures today's counts so the lock ratchet is empirically grounded; #76 lands later to drive counts down.

---

### Item #2 — #73 — ADR-012 KRI Time-Series Period Algebra

**Wave**: 1  | **Slot**: v2 Seq 2  | **Effort**: M (6-8h)  | **Priority**: P2  | **Domain**: crosscut

**Dependencies**: none  
**Atomic with**: none  
**Validator?**: no

#### Why this work

ADR-012 codifies KRI period algebra and deadline classification as single-source-of-truth concerns. Today period algebra lives in `_kri_history/periods.py` but classification reaches across `kri_deadline_service.py`, `_kri_history.queries`, and `kri_deadline_decisions.py`. `REPORTING_GRACE_DAYS` is duplicated at `_kri_history/constants.py:2` (SSOT) and `_config/lookup.py:26`. Audit ID = #73; developer verdict = ACCEPT (P2). The implementation work (kri_deadline_service collapse) is in Section 6 (item #71), but ADR-012 must land first to ratify the rule.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 2 (`plan-loop-3-07-integration-v2.md:345`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of `backend/app/services/_kri_history/periods.py:21,50,59,87,109`, `backend/app/services/_kri_history/constants.py:2`, `backend/app/services/_config/lookup.py:26`, `backend/app/services/kri_deadline_service.py:64,77,78`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
# tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py
from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
PERIODS = REPO_ROOT / "backend/app/services/_kri_history/periods.py"
KRI_HISTORY_ROOT = REPO_ROOT / "backend/app/services/_kri_history"

CANONICAL_FUNCTIONS = {
    "period_bounds_for_date",
    "latest_closed_period_for_date",
    "is_period_end_boundary",
    "due_date",
    "is_within_reporting_window",
}


def test_canonical_period_helpers_defined_only_in_periods_py() -> None:
    """ADR-012: period algebra has exactly one home (_kri_history/periods.py)."""
    offenders: list[str] = []
    for path in (REPO_ROOT / "backend/app").rglob("*.py"):
        rel = str(path.relative_to(REPO_ROOT))
        if rel == "backend/app/services/_kri_history/periods.py":
            continue
        try:
            tree = ast.parse(path.read_text())
        except SyntaxError:
            continue
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if node.name in CANONICAL_FUNCTIONS:
                    offenders.append(f"{rel}:{node.lineno}::{node.name}")
    assert offenders == [], (
        f"ADR-012 forbids duplicate definitions: {offenders}"
    )


def test_reporting_grace_days_has_one_canonical_definition() -> None:
    """ADR-012: REPORTING_GRACE_DAYS = 15 lives only in _kri_history/constants.py."""
    offenders: list[str] = []
    for path in (REPO_ROOT / "backend/app").rglob("*.py"):
        rel = str(path.relative_to(REPO_ROOT))
        if rel == "backend/app/services/_kri_history/constants.py":
            continue
        text = path.read_text()
        if "REPORTING_GRACE_DAYS" in text and "= 15" in text:
            offenders.append(rel)
    assert offenders == [], (
        f"ADR-012 forbids duplicate REPORTING_GRACE_DAYS: {offenders}"
    )
```

**Expected result**: RED. Run:
```
pytest tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py -q
```
Tests fail today because `REPORTING_GRACE_DAYS = 15` is duplicated at `_config/lookup.py:26` (and other static-method reaches scatter period helpers).

#### TDD Step 2 — Implement Change

**Files to create**:
- `docs/adr/ADR-012-kri-time-series.md` — full ADR text per `plan-loop-3-06-adr-drafts.md:94-158`. Decision pins `_kri_history/periods.py` as canonical, `_kri_history/constants.py:2` as the SSOT for `REPORTING_GRACE_DAYS = 15`, and the 5-state vocabulary (`new`, `not_submitted`, `breach`, `warning`, `optimal`). Cross-refs ADR-007 (bounded contexts), ADR-008 (SSOT pattern), ADR-009 (alias deprecation window).
- `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py` (above).

**Files to edit**:
- None for #73 itself (the implementation work — collapsing `kri_deadline_service.py:64,77,78` and removing `_config/lookup.py:26 ConfigDefaults.REPORTING_GRACE_DAYS` — lands in #71's recipe in Section 6 of the final plan).

**Files to delete**:
- None.

#### TDD Step 3 — Confirm GREEN

ADR-012 establishes the rule; the lock test passes once the duplicate at `_config/lookup.py:26` is removed by #71. For Wave 1 #73, write the lock test to **document the invariant** but accept it may be RED until #71 lands. Two options:
- **Option A (recommended)**: write the lock test in #73 commit but accept RED until #71. Tag it `@pytest.mark.xfail(reason="ADR-012 invariant; cleared by #71")` and remove the xfail in #71's commit.
- **Option B**: defer the lock test to #71 commit and ship #73 as ADR-only.

This recipe uses **Option B** for clean wave separation: ADR-012 ships as doc-only in Wave 1; the SSOT lock + collapse ships in #71 (Section 6).

#### Lock/TOML/Contract updates (same commit)

- None for #73 ADR-only Wave 1 commit.

#### README / doc updates (same commit)

- `docs/adr/README.md` (if present) — append ADR-012 row to the index.
- `docs/BUSINESS_LOGIC.md:758` — cross-reference ADR-012 if §2.3 (KRI state vocabulary) is cited there.

#### Verification commands (run all in order)

1. `make -f scripts/Makefile test-architecture-locks` — locks green (no new lock added in this commit per Option B).
2. `pytest tests/backend/pytest -q -k "kri"` — broad KRI suite green.
3. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
4. `ruff check docs/adr` — N/A for ADR Markdown.

#### Commit boundary

Single commit titled: `docs(adr): land ADR-012 KRI time-series period algebra and deadline classification`.

#### Rollback

- Class: **DOC-ONLY**.
- Procedure:
  1. `git revert <SHA>` to remove ADR-012.
  2. No production code change to revert.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 6-8h (ADR text + cross-references + verification).
- Risk: LOW — doc only; no runtime code touched in Wave 1.
- Mitigations: lock test deferred to #71 (Section 6) where the duplicate is actually removed, avoiding intermediate RED state.

---

### Item #3 — #74a — ADR-007 census (5-TOML classification of 31 packages)

**Wave**: 1  | **Slot**: v2 Seq 3  | **Effort**: XL (26-30h)  | **Priority**: P3  | **Domain**: crosscut

**Dependencies**: none (paired with #74b — same wave)  
**Atomic with**: none — but #74b (Seq 45) consumes the TOMLs created here  
**Validator?**: no — but creates 4 new architecture-lock tests including disjointness lock

#### Why this work

#74a is the empirical census deliverable for ADR-007's bounded-context taxonomy: every underscore-prefixed package under `backend/app/services/` (31 today, excluding `__pycache__`) is classified into exactly one of 5 TOML allowlists (write-side, read-shape, workflow-pairs, adapters, **cross-cutting** — Phase 6 correction: NOT `core`). The disjointness lock fails on unclassified packages. Audit ID = #74a; developer verdict = ACCEPT. **Phase 6 critical**: `_orphaned_items` and `_notification_inbox` are paired with `_identity_access_lifecycle` (NOT `_admin_telemetry`).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 3 (`plan-loop-3-07-integration-v2.md:346`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read each of the 31 package `__init__.py` files to verify classification.
- [ ] Run `ls -d backend/app/services/_*/ | grep -v __pycache__ | wc -l` — must return 31.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py` (new or extended)
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
# tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py
from __future__ import annotations

import tomllib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SERVICES = REPO_ROOT / "backend/app/services"
ARCH_DIR = Path(__file__).parent

WRITE_SIDE = ARCH_DIR / "_bounded_context_write_side.toml"
READ_SHAPE = ARCH_DIR / "_bounded_context_read_shape.toml"
WORKFLOW_PAIRS = ARCH_DIR / "_bounded_context_workflow_pairs.toml"
ADAPTERS = ARCH_DIR / "_bounded_context_adapters.toml"
CROSS_CUTTING = ARCH_DIR / "_bounded_context_cross_cutting.toml"


def _load_toml(path: Path) -> dict:
    return tomllib.loads(path.read_text())


def _underscored_packages() -> set[str]:
    return {
        p.name for p in SERVICES.iterdir()
        if p.is_dir() and p.name.startswith("_") and p.name != "__pycache__"
    }


def test_every_package_in_exactly_one_primary_allowlist() -> None:
    pkgs = _underscored_packages()
    write_side = set(_load_toml(WRITE_SIDE).get("packages", []))
    read_shape = set(_load_toml(READ_SHAPE).get("packages", []))
    adapters = set(_load_toml(ADAPTERS).get("packages", []))
    cross_cutting = set(_load_toml(CROSS_CUTTING).get("packages", []))
    pairs = _load_toml(WORKFLOW_PAIRS).get("pairs", [])
    workflow_lefts = {pair["left"] for pair in pairs}

    primaries = write_side | read_shape | adapters | cross_cutting | workflow_lefts
    unclassified = pkgs - primaries
    assert unclassified == set(), (
        f"ADR-007 amendment: unclassified packages: {unclassified}"
    )

    # _register_listings is the only documented dual-class
    documented_dual = {"_register_listings"}
    overlaps = (write_side & read_shape) - documented_dual
    assert overlaps == set(), f"undocumented dual-class: {overlaps}"


def test_register_listings_is_dual_classed() -> None:
    write_side = set(_load_toml(WRITE_SIDE).get("packages", []))
    read_shape = set(_load_toml(READ_SHAPE).get("packages", []))
    assert "_register_listings" in write_side
    assert "_register_listings" in read_shape


def test_monitoring_response_is_file_entry_in_read_shape() -> None:
    files = set(_load_toml(READ_SHAPE).get("files", []))
    assert "backend/app/services/_monitoring_response.py" in files


def test_at_least_31_packages_classified() -> None:
    """Phase 6: change 'exactly 31' to '>= 31; 32 after #61 lands'."""
    pkgs = _underscored_packages()
    assert len(pkgs) >= 31, (
        f"expected >= 31 underscored packages today; 32 after #61 lands; got {len(pkgs)}"
    )
```

**Expected result**: RED. The 5 TOMLs do not yet exist; lock fires on missing files.

#### TDD Step 2 — Implement Change

**Files to create**:
- `tests/backend/pytest/architecture/_bounded_context_write_side.toml` — 7 canonical write-side contexts.
- `tests/backend/pytest/architecture/_bounded_context_read_shape.toml` — 6 read-shape (incl. `_register_listings` dual + `_monitoring_response.py` file entry).
- `tests/backend/pytest/architecture/_bounded_context_workflow_pairs.toml` — 11 pairs (Phase 6 correction).
- `tests/backend/pytest/architecture/_bounded_context_adapters.toml` — 6 adapters (`_directory_identity`, `_directory_sync`, `_graph_directory` (post-#61, pre-listed with comment), `_admin_telemetry`, `_activity_log_query`, `_auth_session`).
- `tests/backend/pytest/architecture/_bounded_context_cross_cutting.toml` — 2 cross-cutting (`_authorization_capabilities`, `_config`). **Phase 6 correction**: filename uses `cross_cutting` (NOT `core`).
- `tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py` (above).
- `tests/backend/pytest/architecture/test_w13_read_shape_no_commit_red.py` — asserts read-shape packages do not call `await db.commit()`.
- `tests/backend/pytest/architecture/test_w13_adapter_exception_translation_red.py` — asserts adapter packages translate external errors to `DomainError`.
- `tests/backend/pytest/architecture/test_w13_cross_cutting_ssot_red.py` — asserts cross-cutting packages bind to ADR-001 / ADR-008 SSOT chains.

Sample TOML body for write-side:
```toml
# _bounded_context_write_side.toml
# 7 canonical write-side bounded contexts per ADR-007 §Decision.

packages = [
    "_riskhub_config",
    "_identity_access_lifecycle",
    "_vendor_governance",
    "_register_listings",  # dual-classed; also in read_shape
    "_approval_execution",
    "_entity_mutation_lifecycle",
    "_kri_history",
]
```

Sample for adapters (with #61 pre-list note per Phase 6 #74a correction):
```toml
# _bounded_context_adapters.toml
# Adapter contexts per ADR-007 amendment §Decision §3.

packages = [
    "_directory_identity",
    "_directory_sync",
    "_graph_directory",  # planned-package; created by #61 (v2 Seq 44).
    "_admin_telemetry",
    "_activity_log_query",
    "_auth_session",
]
```

Sample for workflow-pairs (Phase 6 correction: `_orphaned_items` and `_notification_inbox` pair with `_identity_access_lifecycle`):
```toml
# _bounded_context_workflow_pairs.toml
# 11 ordered (left, right) pairs per ADR-007 amendment §Decision §2.

[[pairs]]
left = "_approval_queue"
right = "_approval_execution"

[[pairs]]
left = "_issue_register"
right = "_issue_workflow"

[[pairs]]
left = "_vendor_links"
right = "_vendor_governance"

[[pairs]]
left = "_access_workflow"
right = "_identity_access_lifecycle"

[[pairs]]
left = "_control_execution"
right = "_entity_mutation_lifecycle"

[[pairs]]
left = "_deadline_execution"
right = "_kri_history"

[[pairs]]
left = "_auth_session_workflow"
right = "_auth_session"

[[pairs]]
left = "_risk_questionnaires"
right = "_vendor_governance"

[[pairs]]
left = "_vendor_workflow"
right = "_vendor_governance"

[[pairs]]
left = "_orphaned_items"
right = "_identity_access_lifecycle"

[[pairs]]
left = "_notification_inbox"
right = "_identity_access_lifecycle"
```

**Files to edit**:
- None.

**Files to delete**:
- None.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py tests/backend/pytest/architecture/test_w13_read_shape_no_commit_red.py tests/backend/pytest/architecture/test_w13_adapter_exception_translation_red.py tests/backend/pytest/architecture/test_w13_cross_cutting_ssot_red.py -q
```
All 4 tests pass once TOMLs are populated.

#### Lock/TOML/Contract updates (same commit)

- 5 new TOMLs (above).
- 4 new architecture lock tests (above).
- Note: `_graph_directory` is pre-listed in `_bounded_context_adapters.toml` with a "post-#61" comment per Phase 6 #74a wording — the disjointness lock allows this because it accepts the package once it exists; the `_at_least_31` test enforces "≥ 31 today; 32 after #61 lands".

#### README / doc updates (same commit)

- `tests/backend/pytest/architecture/README.md` (if present) — index the 5 new TOMLs.
- `AGENTS.md:170-180` (Architecture Locks section) — cross-reference the disjointness lock.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py -q` — must pass.
2. `pytest tests/backend/pytest/architecture/test_w13_*_red.py -q` — must pass.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `ruff check tests/backend/pytest/architecture/` — clean.
6. `mypy tests/backend/pytest/architecture/` — clean.

#### Commit boundary

Single commit titled: `feat(architecture): classify 31 underscore packages into 5 bounded-context allowlists (ADR-007 census)`.

#### Rollback

- Class: **CROSS-DOMAIN** (lock-ratchet + 5 TOMLs + 4 tests).
- Procedure:
  1. `git revert <SHA>` to remove the 5 TOMLs and 4 tests.
  2. Re-run `make -f scripts/Makefile test-architecture-locks` — confirm legacy state.
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: 26-30h XL (per Phase 4 promotion from M; subtask breakdown: 6h verify each package + 4h TOMLs + 6h disjointness lock + 6h secondary tests + 2h cross-validate + 2h ADR-007 amendment cross-refs + 2h adversarial review + 2h buffer).
- Risk: MEDIUM — broad surface; misclassification could cascade. Mitigations: read each `__init__.py` before classifying; ADR-007 amendment text (#74b) cross-references the table; disjointness lock catches drift.

---

### Item #4 — #74b — ADR-007 amendment text (Wave 1 draft only; lands in Wave 5)

**Wave**: 1 (draft) / 5 (commit)  | **Slot**: v2 Seq 45  | **Effort**: M (4-6h)  | **Priority**: P3  | **Domain**: crosscut

**Dependencies**: #74a (Wave 1 — TOMLs); #61 (cross-domain; v2 Seq 44 — `_graph_directory` package move)  
**Atomic with**: none  
**Validator?**: no

#### Why this work

#74b is the ADR-007 amendment **text** that cross-references the 5 TOMLs created by #74a. The amendment introduces three secondary categories (read-shape, workflow-paired, adapter) plus a cross-cutting category (Phase 6: NOT `core`). The text states "Each package's PRIMARY classification is exactly one. Workflow-pair right-halves may appear in their primary allowlist AND in the workflow-pair allowlist." Audit ID = #74b; developer verdict = ACCEPT. v2 places the commit at Seq 45 (after #61 at Seq 44) because the amendment cites `_graph_directory` as an adapter — the package must exist before the doc cites it.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 45 (`plan-loop-3-07-integration-v2.md:388`).
- [ ] Confirm prerequisites complete:
  - `pytest tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py -q` (must pass — proves #74a landed).
  - `ls backend/app/services/_graph_directory/__init__.py` (must exist — proves #61 landed).
- [ ] Read latest state of `docs/adr/ADR-007-bounded-context-taxonomy.md` (full file).
- [ ] No concurrent feature-work conflicts.

**Wave 1 deliverable**: write the amendment **draft** to a working file (e.g., `.planning/audits/_drafts/adr-007-amendment-draft.md`) for #74a's author to review alongside the census. **Wave 5 commit**: append the final text to `docs/adr/ADR-007-bounded-context-taxonomy.md`.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/backend/pytest/architecture/test_adr_007_amendment_present_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
# tests/backend/pytest/architecture/test_adr_007_amendment_present_red.py
from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ADR_007 = REPO_ROOT / "docs/adr/ADR-007-bounded-context-taxonomy.md"


def test_amendment_section_exists() -> None:
    text = ADR_007.read_text()
    assert "## Amendment 1 — Read-Shape, Workflow-Paired, Adapter, and Cross-cutting Contexts" in text


def test_amendment_uses_cross_cutting_not_core() -> None:
    text = ADR_007.read_text()
    assert "Cross-cutting contexts" in text
    assert "Cross-cutting contexts: `_authorization_capabilities`, `_config`" in text


def test_amendment_lists_eleven_workflow_pairs() -> None:
    text = ADR_007.read_text()
    assert "_orphaned_items` ↔ `_identity_access_lifecycle`" in text
    assert "_notification_inbox` ↔ `_identity_access_lifecycle`" in text


def test_amendment_cross_references_graph_directory_post_61() -> None:
    text = ADR_007.read_text()
    assert "_graph_directory` (after the package move planned under finding 61)" in text or "_graph_directory" in text
```

**Expected result**: RED. The amendment is not yet in the ADR file.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `docs/adr/ADR-007-bounded-context-taxonomy.md` — append the full amendment text per `recipe-08-crosscut-adrs.md:521-581`. Verbatim sections:
  - `## Amendment 1 — Read-Shape, Workflow-Paired, Adapter, and Cross-cutting Contexts`
  - `### Status: Accepted`
  - `### Context`, `### Decision` (4 categories), `### Alternatives Rejected`, `### Migration Impact`, `### Rollback Strategy`, `### Invariant Tests`
  - The 11 workflow pairs verbatim (Phase 6 correction: includes `_orphaned_items ↔ _identity_access_lifecycle` and `_notification_inbox ↔ _identity_access_lifecycle`).

**Files to create**:
- None (the test file is created in Wave 5 commit; the draft was created in Wave 1).

**Files to delete**:
- `.planning/audits/_drafts/adr-007-amendment-draft.md` (if used in Wave 1 draft step; remove after Wave 5 commit).

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_adr_007_amendment_present_red.py -q
```
All 4 assertions pass after the amendment text is appended.

#### Lock/TOML/Contract updates (same commit)

- 5 TOMLs created by #74a are now cited by the amendment text (no edit; the lock test from #74a remains green).
- `tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py` — no edit (already green).

#### README / doc updates (same commit)

- `docs/adr/README.md` (if present) — note ADR-007 has an Amendment 1.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_adr_007_amendment_present_red.py -q` — must pass.
2. `pytest tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py -q` — still pass (no regression).
3. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled: `docs(adr-007): append Amendment 1 — read-shape, workflow-paired, adapter, cross-cutting categories`.

#### Rollback

- Class: **DOC-ONLY**.
- Procedure:
  1. `git revert <SHA>` to remove the amendment.
  2. The test file (added in this commit) is also reverted.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 4-6h (text + cross-references + 1 lock test).
- Risk: LOW — doc only; the lock-test ratchet is the only enforcement.
- Mitigations: text is identical to the draft from Wave 1, reviewed alongside #74a's TOMLs.

---

### Item #5 — #10 — KEEP `riskhub_questionnaires.py` (presence-lock)

**Wave**: 2  | **Slot**: v2 Seq 4  | **Effort**: S (≤2h)  | **Priority**: P1  | **Domain**: endpoints

**Dependencies**: none  
**Atomic with**: none — but presence-lock gates #38 (Section 4)  
**Validator?**: no

#### Why this work

`riskhub_questionnaires.py` hosts a live route + UI button (`RiskQuestionnairesPanel.tsx:257` → `riskHubApi.ts:308-310` → `riskhub_questionnaires.py:37 @router.post("/batch-send", ...)`). Audit flagged the module for deletion ("0 routes mis-flag"); developer rejected. Phase 4 directive: ADD a presence-lock test so future "0 routes" mis-flag cannot delete the module silently. Audit ID = #10; developer verdict = REJECT-CONFIRMED.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 4 (`plan-loop-3-07-integration-v2.md:347`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of `backend/app/api/v1/endpoints/riskhub_questionnaires.py`.
- [ ] Confirm `frontend/src/services/riskHubApi.ts:308-310` (NOT `services/api/riskHubApi.ts` — Phase 6 path drift correction).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
# tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py
"""Lock that riskhub_questionnaires.py exists and exposes its router.

Module hosts the CRO-only batch-send route consumed by
RiskQuestionnairesPanel Send button. Presence is load-bearing.
"""
from __future__ import annotations

import importlib
from pathlib import Path

import pytest
from fastapi import APIRouter

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
MODULE_PATH = (
    REPO_ROOT / "backend/app/api/v1/endpoints/riskhub_questionnaires.py"
)


def test_riskhub_questionnaires_module_file_exists() -> None:
    assert MODULE_PATH.exists()


def test_riskhub_questionnaires_module_exports_router() -> None:
    module = importlib.import_module(
        "app.api.v1.endpoints.riskhub_questionnaires"
    )
    assert isinstance(getattr(module, "router", None), APIRouter)


def test_riskhub_questionnaires_route_count_at_least_one() -> None:
    module = importlib.import_module(
        "app.api.v1.endpoints.riskhub_questionnaires"
    )
    routes = [
        route for route in module.router.routes
        if hasattr(route, "path")
    ]
    assert len(routes) >= 1
```

**Expected result**: PASS-today (presence ratchet). The test is not RED; it is a future-facing lock that fails the moment a future "0 routes" mis-flag tries to delete the module.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/api/v1/endpoints/riskhub_questionnaires.py:1` — extend the docstring to:
  ```python
  """Risk Hub questionnaire endpoints (CRO-only batch send).

  Live module: hosts POST /api/v1/riskhub/questionnaires/batch-send,
  consumed by RiskQuestionnairesPanel.tsx Send button via
  frontend/src/services/riskHubApi.ts batchSendQuestionnaires.
  Inline schemas relocate under #38 (schemas/riskhub.py); module stays.
  """
  ```
  (Phase 6 path correction: `frontend/src/services/riskHubApi.ts`, NOT `services/api/`.)

**Files to create**:
- The new architecture test (above).

**Files to delete**:
- None.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py -q
```
All 3 assertions pass.

#### Lock/TOML/Contract updates (same commit)

- New presence-lock test IS the contract.
- No TOML edits.

#### README / doc updates (same commit)

- `backend/app/api/v1/endpoints/README.md` (if present) — note this is a sibling-of-package single-file module hosting one CRO route.
- AGENTS.md cross-reference at `:162` (`get_cro_user`) verified intact.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_riskhub_questionnaires.py -q` — existing 226-line behavior coverage still green.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/api/v1/endpoints/riskhub_questionnaires.py` — clean.

#### Commit boundary

Single commit titled: `chore(riskhub): lock riskhub_questionnaires module presence`.

#### Rollback

- Class: **LOCK-RATCHET**.
- Procedure:
  1. `git revert <SHA>` to drop the test and revert the docstring.
  2. Module is live regardless.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: ≤2h (test + docstring + verification).
- Risk: very low — module is live, presence-lock is purely additive.
- Mitigations: future "0 routes" mis-flag will fail RED on the new lock.

---

### Item #6 — #57 — Quarterly comparison facade delete

**Wave**: 2  | **Slot**: v2 Seq 5  | **Effort**: S (1-2h)  | **Priority**: P2  | **Domain**: vendor

**Dependencies**: none  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`quarterly_comparison_service.py:1-20` is a 20-line facade with one prod caller (`backend/app/api/v1/endpoints/dashboard/quarterly.py:12`). Three docs still bless the facade pattern. **Doc-only Reject overruled** (developer answered Reject; Phase 4/5 plan overrules: orchestrator override). Audit ID = #57; developer verdict = REJECT-OVERRULED.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 5 (`plan-loop-3-07-integration-v2.md:348`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of `backend/app/services/quarterly_comparison_service.py`, `backend/app/services/_quarterly_comparison/composition.py`, `backend/app/api/v1/endpoints/dashboard/quarterly.py`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/backend/pytest/architecture/test_quarterly_comparison_facade_removed_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
# tests/backend/pytest/architecture/test_quarterly_comparison_facade_removed_red.py
"""RED: facade deleted; dashboard endpoint imports composition directly."""
from __future__ import annotations

import inspect
import subprocess
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]


def test_facade_module_deleted() -> None:
    assert not (REPO_ROOT / "backend/app/services/quarterly_comparison_service.py").exists()


def test_dashboard_quarterly_imports_composition_directly() -> None:
    from app.api.v1.endpoints.dashboard import quarterly
    src = inspect.getsource(quarterly)
    assert "from app.services._quarterly_comparison.composition import build_quarterly_comparison" in src
    assert "from app.services.quarterly_comparison_service" not in src


def test_no_facade_importers_remain() -> None:
    out = subprocess.run(
        ["grep", "-rn", "quarterly_comparison_service",
         str(REPO_ROOT / "backend"), str(REPO_ROOT / "tests"), "--include=*.py"],
        capture_output=True, text=True,
    )
    leaked = [
        ln for ln in out.stdout.splitlines()
        if "test_quarterly_comparison_facade_removed_red.py" not in ln
    ]
    assert leaked == [], f"Importers leaked:\n{chr(10).join(leaked)}"
```

**Expected result**: RED. Run:
```
pytest tests/backend/pytest/architecture/test_quarterly_comparison_facade_removed_red.py -q
```
All 3 assertions fail today (file exists; dashboard imports the facade).

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/api/v1/endpoints/dashboard/quarterly.py:12` — change `from app.services.quarterly_comparison_service import build_quarterly_comparison` to `from app.services._quarterly_comparison.composition import build_quarterly_comparison`. Verify `parse_quarter` (if imported) lives at `app.services._quarterly_comparison.periods.parse_quarter` and repoint accordingly.
- `tests/backend/pytest/test_architecture_deepening_contracts.py:559-569` — REWRITE the existing lock `test_quarterly_comparison_service_is_composition_facade` to `test_quarterly_comparison_composition_owns_public_surface` per `recipe-05-vendor-migration.md:516-527`.

**Files to create**:
- The new architecture test (above).

**Files to delete**:
- `backend/app/services/quarterly_comparison_service.py` (entire 20-line file).

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_quarterly_comparison_facade_removed_red.py tests/backend/pytest/test_architecture_deepening_contracts.py -q -k quarterly
```
Both tests pass.

#### Lock/TOML/Contract updates (same commit)

- `tests/backend/pytest/test_architecture_deepening_contracts.py:559-569` — REWRITE per above.
- No TOML allowlist edits.

#### README / doc updates (same commit)

- `backend/app/services/_quarterly_comparison/README.md:16` — REMOVE the line blessing the facade pattern; replace with: `The dashboard endpoint at backend/app/api/v1/endpoints/dashboard/quarterly.py imports build_quarterly_comparison directly from .composition. New period or snapshot rules should be tested through the dashboard regression tests before changing these helpers.`
- `.planning/codebase/CONVENTIONS.md:22` — REMOVE `quarterly_comparison_service.py` from the facade list.
- `.planning/codebase/CONCERNS.md:14` — REWRITE the concern row to: `Committee quarterly snapshot semantics: backend/app/services/_quarterly_comparison/composition.py (orchestrator), backend/app/services/_quarterly_comparison/periods.py (quarter math), backend/app/api/v1/endpoints/dashboard/quarterly.py (HTTP surface).`

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_quarterly_comparison_facade_removed_red.py -q` — must pass.
2. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py::test_quarterly_comparison_composition_owns_public_surface -q` — must pass.
3. `pytest tests/backend/pytest -q -k quarterly` — broad quarterly suite green.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `ruff check backend tests` — clean.
6. `mypy backend/app` — clean.

#### Commit boundary

Single commit titled: `refactor(quarterly): delete quarterly_comparison_service facade; dashboard imports composition`.

#### Rollback

- Class: **LOCK-RATCHET**.
- Procedure:
  1. `git revert <SHA>` to restore facade + 3 doc lines + lock-test wording.
  2. Run `make -f scripts/Makefile test-architecture-locks`.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: 1-2h (delete + 1 import repoint + lock rewrite + 3 doc edits + new test).
- Risk: LOW — single prod caller; identical signatures.
- Mitigations: 3-doc rewrite lands atomically with code; new lock catches re-introduction.

---

### Item #7 — #12 — Narrow blanket-except in `users/summary.py`

**Wave**: 2  | **Slot**: v2 Seq 7  | **Effort**: S (≤2h)  | **Priority**: P1  | **Domain**: endpoints

**Dependencies**: #37 (Seq 6 — must land first per Correction A `users/summary.py` 3-way overlap)  
**Atomic with**: none  
**Validator?**: no

#### Why this work

Two blanket `except Exception:` clauses at `users/summary.py:48` and `:62` swallow all errors. Audit recommended narrowing to `AuthorizationError`, but Phase 4 critical correction: `ensure_business_view_access` raises `HTTPException` (per `core/_permissions/evaluation.py:53`), NOT `AuthorizationError`. **Phase 6 confirmation**: narrow target MUST be `HTTPException` for `_can_view_governance`; `_build_shell_summary` narrows to `(HTTPException, SQLAlchemyError)`. Audit ID = #12; developer verdict = ACCEPT (P1).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 7 (`plan-loop-3-07-integration-v2.md:350`).
- [ ] Confirm prerequisites complete: #37 lock test must be GREEN (proves `_can_view_governance` mirror was replaced; `users/summary.py` shape is now `build_me_capabilities`-driven, leaving only the `_build_shell_summary` blanket-except — recipe handles both since #37 may not delete the entire file).
- [ ] Read latest state of `backend/app/api/v1/endpoints/users/summary.py`, `backend/app/core/_permissions/evaluation.py`.
- [ ] Confirm `ensure_business_view_access` raises `HTTPException` (NOT `AuthorizationError`) at `evaluation.py:53`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file 1 (behavioral)**: `tests/backend/pytest/api/v1/test_users_summary_blanket_except_red.py`

```python
# tests/backend/pytest/api/v1/test_users_summary_blanket_except_red.py
"""Lock blanket-except narrowing in users/summary.py.

Phase 4 correction: ensure_business_view_access raises HTTPException(403),
NOT AuthorizationError. Narrow targets must catch the actual raise types.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_unrelated_exception_in_questionnaire_inbox_propagates(
    client_employee: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """ZeroDivisionError must NOT be silently swallowed (today: returns 0)."""

    async def boom(*args, **kwargs):
        raise ZeroDivisionError("synthetic")

    monkeypatch.setattr(
        "app.api.v1.endpoints.users.summary._count_questionnaire_inbox",
        boom,
    )

    response = await client_employee.get("/api/v1/me/shell-summary")
    assert response.status_code == 500


async def test_http_exception_in_questionnaire_inbox_returns_zero(
    client_employee: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """HTTPException-based denial degrades to questionnaire_inbox_count=0."""

    async def deny(*args, **kwargs):
        raise HTTPException(status_code=403, detail="denied")

    monkeypatch.setattr(
        "app.api.v1.endpoints.users.summary._count_questionnaire_inbox",
        deny,
    )

    response = await client_employee.get("/api/v1/me/shell-summary")
    assert response.status_code == 200
    assert response.json()["questionnaire_inbox_count"] == 0
```

**Test file 2 (architecture lock)**: `tests/backend/pytest/architecture/test_users_summary_narrow_excepts_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SUMMARY_PATH = REPO_ROOT / "backend/app/api/v1/endpoints/users/summary.py"


def test_no_blanket_except_in_users_summary() -> None:
    source = SUMMARY_PATH.read_text(encoding="utf-8")
    assert "except Exception:" not in source
```

**Expected result**: RED. Run:
```
pytest tests/backend/pytest/architecture/test_users_summary_narrow_excepts_red.py tests/backend/pytest/api/v1/test_users_summary_blanket_except_red.py -q
```
Architecture test fails (2 blanket excepts present); behavioral test for ZeroDivisionError fails (today the blanket-except swallows it and returns 0 instead of 500).

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/api/v1/endpoints/users/summary.py` — add imports at top:
  ```python
  from fastapi import HTTPException
  from sqlalchemy.exc import SQLAlchemyError
  ```
  (Note: if #37 already imports `HTTPException` for the `_count_questionnaire_inbox` chain, skip the duplicate.)

- `users/summary.py:45-50` (`_can_view_governance`) — replace `except Exception:` with `except HTTPException:`. Final form:
  ```python
  def _can_view_governance(current_user: User) -> bool:
      try:
          ensure_business_view_access(
              current_user,
              detail="Platform admins cannot access Governance business data",
          )
      except HTTPException:
          return False
      return can_manage_users(current_user)
  ```
  **Note**: if #37 (Seq 6) already replaced this function with `build_me_capabilities`, skip — only the `_build_shell_summary` block needs narrowing. Recipe assumes #37 may NOT have deleted `_can_view_governance` (Phase 6 verification of #37 says it does delete; coordinate per pre-flight).

- `users/summary.py:60-63` (`_build_shell_summary` questionnaire-inbox try) — replace `except Exception:` with `except (HTTPException, SQLAlchemyError):`. Final form:
  ```python
      try:
          questionnaire_inbox_count = await _count_questionnaire_inbox(db, current_user)
      except (HTTPException, SQLAlchemyError):
          questionnaire_inbox_count = 0
  ```

**Files to create**:
- The two test files above.

**Files to delete**:
- None.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_users_summary_narrow_excepts_red.py tests/backend/pytest/api/v1/test_users_summary_blanket_except_red.py -q
```
Both files pass.

#### Lock/TOML/Contract updates (same commit)

- New architecture lock (above).
- No TOML allowlist edits.

#### README / doc updates (same commit)

- None required.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/api/v1/test_users_summary_blanket_except_red.py -q` — must pass.
2. `pytest tests/backend/pytest/architecture/test_users_summary_narrow_excepts_red.py -q` — must pass.
3. `pytest tests/backend/pytest -q -k users` — broad users suite green.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `ruff check backend/app/api/v1/endpoints/users` — clean.
6. `mypy backend/app/api/v1/endpoints/users` — clean.

#### Commit boundary

Single commit titled: `fix(users): narrow blanket-except in users summary endpoint to HTTPException + SQLAlchemyError`.

#### Rollback

- Class: **LOCK-RATCHET**.
- Procedure:
  1. `git revert <SHA>` to restore blanket excepts.
  2. Drop both new test files.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: 2h (test + edit + verification).
- Risk: LOW — narrow target chosen empirically (Phase 6 verified `evaluation.py:53` raises `HTTPException`).
- Mitigations: ZeroDivisionError test catches future blanket-except regressions; Phase 6 path audit confirms narrow target.

---

### Item #8 — #13 — Delete `vendor_link_helpers.py` shim

**Wave**: 2  | **Slot**: v2 Seq 8  | **Effort**: S (~30 min)  | **Priority**: P1  | **Domain**: vendor

**Dependencies**: none  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`backend/app/api/v1/endpoints/vendor_link_helpers.py` is a 107-line shim with **0 prod importers** (verified via `grep -rn "vendor_link_helpers" backend --include="*.py"` → only its own file). Archive precedence diverges from canonical helpers in `_vendor_links/workflow.py` and `_vendor_governance/links.py`. Audit ID = #13 (S5.1 / C-N2); developer verdict = ACCEPT (P1).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 8 (`plan-loop-3-07-integration-v2.md:351`).
- [ ] Confirm prerequisites complete: none.
- [ ] Verify zero importers via `grep -rn "vendor_link_helpers" backend tests --include="*.py" | grep -v __pycache__` → empty.
- [ ] Read latest state of `backend/app/api/v1/endpoints/vendor_link_helpers.py`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/backend/pytest/architecture/test_vendor_link_helpers_removed_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
# tests/backend/pytest/architecture/test_vendor_link_helpers_removed_red.py
"""RED: vendor_link_helpers shim must be deleted; canonical surface is _vendor_links."""
from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]


def test_vendor_link_helpers_shim_removed() -> None:
    assert not (REPO_ROOT / "backend/app/api/v1/endpoints/vendor_link_helpers.py").exists()


def test_canonical_vendor_link_workflow_module_still_imports() -> None:
    from app.services._vendor_links import workflow  # canonical
    assert hasattr(workflow, "__file__")
```

**Expected result**: RED. Run:
```
pytest tests/backend/pytest/architecture/test_vendor_link_helpers_removed_red.py -q
```
Test 1 fails (file exists at 107 lines).

#### TDD Step 2 — Implement Change

**Files to edit**:
- None.

**Files to create**:
- The new architecture test (above).

**Files to delete**:
- `backend/app/api/v1/endpoints/vendor_link_helpers.py` (entire 107-line file).

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_vendor_link_helpers_removed_red.py -q
```
Both assertions pass.

#### Lock/TOML/Contract updates (same commit)

- New architecture lock IS the contract.
- No TOML allowlist edits.

#### README / doc updates (same commit)

- `backend/app/services/_vendor_links/README.md` — verify the canonical helper surface is documented (already documented post-`1ee872a4`; verify no edits required).

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_vendor_link_helpers_removed_red.py -q` — must pass.
2. `grep -rn "vendor_link_helpers" backend tests --include="*.py" | grep -v __pycache__` — empty.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend tests` — clean.
5. `mypy backend/app` — clean.

#### Commit boundary

Single commit titled: `refactor(vendor-links): delete dead vendor_link_helpers shim`.

#### Rollback

- Class: **TRIVIAL** (pure deletion).
- Procedure:
  1. `git revert <SHA>` restores 107 lines.
  2. No DB, no schema, no data.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 30 min (test + delete + verification).
- Risk: very low — 0 importers verified.
- Mitigations: pre-flight grep confirms no production hits.

---

### Item #9 — #1 — Drop `validate_risk_type` re-export from risks/crud package

**Wave**: 2  | **Slot**: v2 Seq 9  | **Effort**: S (≤2h)  | **Priority**: P2  | **Domain**: risks

**Dependencies**: none (chain head; #19 follows)  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`backend/app/api/v1/endpoints/risks/crud/__init__.py:2,23` re-exports `validate_risk_type` from `._shared`. Zero external importers verified — re-export is dead code. Audit ID = #1 (A-N1); developer verdict = ACCEPT (DELETE). **Phase 6 correction**: `crud/__init__.py:2` (import line) AND `:23` (`__all__` entry) — both must be edited.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 9 (`plan-loop-3-07-integration-v2.md:352`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of `backend/app/api/v1/endpoints/risks/crud/__init__.py:2,23`.
- [ ] Verify `crud/create.py:20` still uses `from ._shared import validate_risk_type` (will continue working — only the **package re-export** is dropped here; #19 handles the deeper consolidation).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/backend/pytest/architecture/test_risks_crud_public_surface_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
# tests/backend/pytest/architecture/test_risks_crud_public_surface_red.py
"""Lock that risks/crud package no longer re-exports validate_risk_type."""
from __future__ import annotations

import importlib

import pytest

pytestmark = pytest.mark.contract


def test_validate_risk_type_not_re_exported_in_crud_all() -> None:
    crud = importlib.import_module("app.api.v1.endpoints.risks.crud")
    assert "validate_risk_type" not in getattr(crud, "__all__", ())


def test_validate_risk_type_attribute_absent_on_crud_facade() -> None:
    crud = importlib.import_module("app.api.v1.endpoints.risks.crud")
    assert not hasattr(crud, "validate_risk_type")
```

**Expected result**: RED. Run:
```
pytest tests/backend/pytest/architecture/test_risks_crud_public_surface_red.py -q
```
Both assertions fail today.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/api/v1/endpoints/risks/crud/__init__.py` — delete:
  - **Line 2**: `from ._shared import validate_risk_type`
  - **Line 23**: `"validate_risk_type",` (inside `__all__`)
  
  **Phase 6 critical correction**: BOTH `:2` and `:23` must be edited in this commit. Do NOT touch `_shared.py` (that is #19). Do NOT touch `create.py:20`.

**Files to create**:
- The new architecture test (above).

**Files to delete**:
- None.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_risks_crud_public_surface_red.py -q
```
Both assertions pass.

#### Lock/TOML/Contract updates (same commit)

- New architecture lock IS the contract.
- No TOML allowlist edits (verified: no TOML mentions `validate_risk_type`).

#### README / doc updates (same commit)

- `.planning/audits/_context/02-backend-endpoints.md` — note risks/crud package no longer re-exports `validate_risk_type`; only `_shared.validate_risk_type` (private) consumed by `crud/create.py:20` until #19.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_risks_crud_public_surface_red.py -q` — must pass after Step 2.
2. `pytest tests/backend/pytest/test_risks.py -q` — sanity (`crud/create.py` still imports from `._shared`).
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/api/v1/endpoints/risks/crud/__init__.py` — clean.
5. `mypy backend/app/api/v1/endpoints/risks` — clean.

#### Commit boundary

Single commit titled: `chore(risks): drop unused validate_risk_type re-export from crud/__init__.py`.

#### Rollback

- Class: **LOCK-RATCHET**.
- Procedure:
  1. Re-add the import line at `:2` and the `__all__` entry at `:23`.
  2. Delete the new test file.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: ≤2h (test + 2 line edits + verification).
- Risk: LOW — Phase 2-B verified zero external importers.
- Mitigations: lock test pins re-export absence; #19 picks up the underlying consolidation work.

---

### Item #10 — #19 — Risk-type validation consolidation onto service policy

**Wave**: 2  | **Slot**: v2 Seq 10  | **Effort**: S (≤2h)  | **Priority**: P1  | **Domain**: risks

**Dependencies**: #1 (Seq 9 — must land first; both touch `risks/crud/__init__.py`)  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`backend/app/api/v1/endpoints/risks/crud/_shared.py:8` carries `async def validate_risk_type(db, risk_type_code) -> None:` whose body raises `HTTPException(400)`. The canonical service-policy version at `backend/app/services/_entity_mutation_lifecycle/policy.py:29` raises `ValidationError` (which projects to HTTP 400 via `core/exceptions.py:67,89-95,112-118` → `main.py:237`). HTTP 400 wire parity verified end-to-end. Audit ID = #19; developer verdict = ACCEPT (CONSOLIDATE).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 10 (`plan-loop-3-07-integration-v2.md:353`).
- [ ] Confirm prerequisites complete: `pytest tests/backend/pytest/architecture/test_risks_crud_public_surface_red.py -q` (#1 must be GREEN).
- [ ] Read latest state of `backend/app/api/v1/endpoints/risks/crud/_shared.py`, `backend/app/api/v1/endpoints/risks/crud/create.py:20`, `backend/app/services/_entity_mutation_lifecycle/policy.py:29,64`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file 1 (parity)**: `tests/backend/pytest/api/v1/test_risks_validation_parity.py`

```python
# tests/backend/pytest/api/v1/test_risks_validation_parity.py
"""HTTP 400 wire parity for unknown risk_type before/after consolidation."""
from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_create_risk_with_unknown_risk_type_returns_400_with_canonical_detail(
    client_employee: AsyncClient,
) -> None:
    payload = {
        "risk_id_code": "PARITY-1",
        "name": "Parity Test Risk",
        "process": "Parity Process",
        "description": "Parity test risk",
        "category": "Operational",
        "department_id": 1,
        "risk_type": "__unknown__",
        "gross_probability": 1,
        "gross_impact": 1,
        "net_probability": 1,
        "net_impact": 1,
        "status": "active",
    }
    response = await client_employee.post("/api/v1/risks", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Unknown risk type '__unknown__'. "
        "Available types can be viewed in Risk Hub configuration."
    )
```

**Test file 2 (architecture lock)**: `tests/backend/pytest/architecture/test_validate_risk_type_single_owner_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
from __future__ import annotations

import importlib
import inspect
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]


def test_endpoint_shared_no_longer_exports_validate_risk_type() -> None:
    shared_path = REPO_ROOT / "backend/app/api/v1/endpoints/risks/crud/_shared.py"
    assert not shared_path.exists(), "endpoint copy must be deleted"


def test_service_policy_owns_validate_risk_type() -> None:
    policy = importlib.import_module(
        "app.services._entity_mutation_lifecycle.policy"
    )
    assert callable(getattr(policy, "validate_risk_type", None))


def test_create_endpoint_imports_from_service_policy() -> None:
    create_module = importlib.import_module(
        "app.api.v1.endpoints.risks.crud.create"
    )
    source = inspect.getsource(create_module)
    assert (
        "from app.services._entity_mutation_lifecycle.policy "
        "import validate_risk_type"
    ) in source
    assert "from ._shared import validate_risk_type" not in source
```

**Expected result**: parity test PASSES today (HTTP 400 body identical pre/post-swap); architecture test fails on all three assertions.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/api/v1/endpoints/risks/crud/create.py:20` — change `from ._shared import validate_risk_type` to `from app.services._entity_mutation_lifecycle.policy import validate_risk_type`. Call site at `:35` (`await validate_risk_type(db, risk_data.risk_type)`) is unchanged (same signature `(db, risk_type_code)`).

**Files to create**:
- The two new test files above.

**Files to delete**:
- `backend/app/api/v1/endpoints/risks/crud/_shared.py` — entire 20-line file (only contains `validate_risk_type`).

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/api/v1/test_risks_validation_parity.py tests/backend/pytest/architecture/test_validate_risk_type_single_owner_red.py -q
```
All 3 lock assertions pass; parity test stays green.

#### Lock/TOML/Contract updates (same commit)

- New architecture lock IS the contract.
- No TOML allowlist edits (verified: no allowlist references `validate_risk_type`).

#### README / doc updates (same commit)

- `.planning/audits/_context/01-backend-services.md` — under `_entity_mutation_lifecycle`, record `validate_risk_type` is the single-owner risk-type validator (covers create + update paths).
- `.planning/audits/_context/02-backend-endpoints.md` — under risks package map, drop reference to `crud/_shared.validate_risk_type`; replace with pointer to service-policy owner.
- Cross-link ADR-003 (DomainError taxonomy) in commit body.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/api/v1/test_risks_validation_parity.py -q` — parity gate; must stay green.
2. `pytest tests/backend/pytest/architecture/test_validate_risk_type_single_owner_red.py -q` — must pass.
3. `pytest tests/backend/pytest/test_risks.py -q` — broad coverage.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0 (capability sanity; no surface change).
6. `ruff check backend/app/api/v1/endpoints/risks` — clean.
7. `mypy backend/app/api/v1/endpoints/risks` — clean.

#### Commit boundary

Single commit titled: `refactor(risks): consolidate validate_risk_type onto entity-mutation policy`.

#### Rollback

- Class: **CROSS-DOMAIN** (capability contract sanity touched).
- Procedure:
  1. Re-add `crud/_shared.py` (HTTPException variant).
  2. Revert import in `create.py:20`.
  3. Delete the two new tests.
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: 2h (parity test + lock + delete + import rewire + 2 doc updates).
- Risk: LOW — Phase 6 verified parity chain end-to-end (`core/exceptions.py:67,89-95,112-118` → `main.py:237`).
- Mitigations: parity test green pre AND post-swap; lock catches drift.

---

### Item #11 — #11 — `risk.process` → `risk.name` truth-in-naming fix

**Wave**: 2  | **Slot**: v2 Seq 11  | **Effort**: S (≤2h)  | **Priority**: P1  | **Domain**: risks

**Dependencies**: none  
**Atomic with**: none — but assertion inversion at `tests/backend/pytest/test_executions.py:325` MUST land in same commit  
**Validator?**: no

#### Why this work

`backend/app/services/_control_execution/workflow.py:155` has `names.append(risk.process)` instead of `names.append(risk.name)`. The audit-trail parity test at `tests/backend/pytest/api/v1/test_reports_audit.py:185-186` already enforces "name not process" — fix removes a parity drift. **Phase 6 critical**: `tests/backend/pytest/test_executions.py:325` literally locks the bug; assertion MUST be inverted in the SAME commit as the fix. Audit ID = #11 (S2.7); developer verdict = ACCEPT (FIX + update test).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 11 (`plan-loop-3-07-integration-v2.md:354`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of `backend/app/services/_control_execution/workflow.py:155`, `tests/backend/pytest/test_executions.py:268,287,288,325`.
- [ ] Confirm fixture distinguishes `name="Execution List Linked Risk"` (line 287) from `process="Visible Execution Process"` (line 288).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test edit (in same commit as Step 2)**: `tests/backend/pytest/test_executions.py:325` — invert the assertion.

Original line:
```python
assert item["linked_risks"] == [risk.process]
```

Replace with:
```python
assert item["linked_risks"] == [risk.name]
assert risk.name in item["linked_risks"]
assert risk.process not in item["linked_risks"]
```

**Expected result**: with the assertion inverted but the source NOT yet fixed, the test fails RED. The fix in Step 2 turns it green.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/services/_control_execution/workflow.py:155` — replace `names.append(risk.process)` with `names.append(risk.name)`.
- `tests/backend/pytest/test_executions.py:325` — invert assertion (above; **same commit** mandatory per Phase 4/6 critical directive).

**Files to create**:
- None.

**Files to delete**:
- None.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/test_executions.py::test_list_executions_filters_linked_risks_without_scalar_per_row_checks -q
```
Test passes.

#### Lock/TOML/Contract updates (same commit)

- `tests/backend/pytest/test_architecture_deepening_contracts.py:178` — string-symbol presence check (`"linked_risk_names_for_visible_ids("`) is unaffected by `.process` → `.name` swap. No edit needed.
- No TOML allowlist edits.

#### README / doc updates (same commit)

- `.planning/audits/_context/01-backend-services.md` — under `_control_execution`, note `linked_risk_names_for_visible_ids` returns `risk.name` (parity with audit-trail export).
- `.planning/audits/_context/06-test-surface.md` — cross-reference `test_executions.py:325` and `test_reports_audit.py:185-186` so future readers see the symmetric prefer-name lock.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/test_executions.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_reports_audit.py -q` — parity sanity; must remain green.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/services/_control_execution` — clean.
5. `mypy backend/app/services/_control_execution` — clean.

#### Commit boundary

Single commit (the inversion + fix MUST land together) titled: `fix(execution): return risk.name (not risk.process) from linked_risk_names`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` to restore `risk.process` and the original test assertion.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 2h (1 line fix + assertion inversion + 2 doc updates).
- Risk: LOW — CSV/audit export already used `risk.name`.
- Mitigations: parity test on audit-trail export catches future regression.

---

### Item #12 — #14 — Issues outbox-only notification cleanup

**Wave**: 2  | **Slot**: v2 Seq 12  | **Effort**: M (8h)  | **Priority**: P1  | **Domain**: issues

**Dependencies**: none (gates #30 — barrel prune)  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`backend/app/api/v1/endpoints/issues/_shared/notifications.py:24,43,80` defines three direct-send helpers (`_notify_issue_assigned`, `_notify_exception_requested`, `_notify_exception_approved`). Production never called them — the outbox handler drives notifications. Audit ID = #14 (S4.4); developer verdict = ACCEPT (P1). **Phase 6 confirmation**: test imports go through SUBMODULE (`from app.api.v1.endpoints.issues._shared.notifications import ...` at `test_issue_workflow.py:10`), NOT through the barrel — so #30 alone does not break the test, but #14 must remove the underlying functions before #30 prunes the barrel.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 12 (`plan-loop-3-07-integration-v2.md:355`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of `backend/app/api/v1/endpoints/issues/_shared/notifications.py`, `tests/backend/pytest/api/v1/test_issue_workflow.py`, `backend/app/services/outbox/handlers/issues.py`.
- [ ] Confirm three direct-send helpers still exist at `_shared/notifications.py:24,43,80`.
- [ ] Confirm test imports go through SUBMODULE at `test_issue_workflow.py:10`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file 1 (new architecture lock)**: `tests/backend/pytest/architecture/test_issue_notifications_have_no_direct_send_helpers_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
NOTIFICATIONS = REPO_ROOT / "backend/app/api/v1/endpoints/issues/_shared/notifications.py"
SHARED_INIT = REPO_ROOT / "backend/app/api/v1/endpoints/issues/_shared/__init__.py"


def test_direct_send_helpers_removed_from_notifications_module() -> None:
    from app.api.v1.endpoints.issues._shared import notifications

    assert not hasattr(notifications, "_notify_issue_assigned")
    assert not hasattr(notifications, "_notify_exception_requested")
    assert not hasattr(notifications, "_notify_exception_approved")


def test_barrel_no_longer_re_exports_notify_helpers() -> None:
    text = SHARED_INIT.read_text()
    for forbidden in (
        "_notify_issue_assigned",
        "_notify_exception_requested",
        "_notify_exception_approved",
    ):
        assert forbidden not in text, f"{forbidden!r} must not appear in barrel after #14"
```

**Test file 2 (rewrite existing)**: `tests/backend/pytest/api/v1/test_issue_workflow.py:10,679-708` — replace direct-send helper calls with outbox-enqueue assertions. Use `client_factory` to drive the workflow endpoint, then assert `OutboxEvent` row exists.

```python
# replace lines 10 (import) and 679-691 (helper calls)
from sqlalchemy import select

from app.models import OutboxEvent  # if not already imported

# inside the rewritten test block:
async with client_factory() as client:
    response = await client.post(
        f"/api/v1/issues/{assigned_issue_id}/assign",
        json={"owner_user_id": recipient_id, "due_at": "2026-12-31T00:00:00Z"},
        headers=auth_headers(actor),
    )
    assert response.status_code == 200

events = (await db_session.execute(select(OutboxEvent).where(
    OutboxEvent.event_type == "issue.assigned",
    OutboxEvent.aggregate_id == assigned_issue_id,
))).scalars().all()
assert len(events) == 1
assert events[0].idempotency_key
```
Repeat the pattern for `issue.exception_approved` event_type and `exception_issue_id`.

**Expected result**: RED. Run:
```
pytest tests/backend/pytest/architecture/test_issue_notifications_have_no_direct_send_helpers_red.py tests/backend/pytest/api/v1/test_issue_workflow.py -q
```
Both fail (architecture lock fires; outbox-rewrite test fires once direct-send is gone).

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/api/v1/endpoints/issues/_shared/notifications.py:24-103` — delete:
  - `_notify_issue_assigned` (`:24-40`)
  - `_notify_exception_requested` (`:43-77`)
  - `_notify_exception_approved` (`:80-103`)
  
  Decide on `_get_active_user_with_permissions` (`:14-21`): KEEP if any retained code calls it; otherwise delete. Loop B verified no production importer outside this file once the three helpers are gone — if the file becomes empty, `git rm`.
- `backend/app/api/v1/endpoints/issues/_shared/__init__.py:12-17,62-64` — drop the three `_notify_*` imports and their `__all__` entries. Drop `_get_active_user_with_permissions` from `:13,53` if it was deleted from `notifications.py`.
- `tests/backend/pytest/api/v1/test_issue_workflow.py:10,679-708` — finalize the rewrite (outbox assertion).

**Files to create**:
- The new architecture test (above).

**Files to delete (recommended)**:
- `backend/app/api/v1/endpoints/issues/_shared/notifications.py` — if all functions were removed.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_issue_notifications_have_no_direct_send_helpers_red.py tests/backend/pytest/api/v1/test_issue_workflow.py -q
```
Both pass.

#### Lock/TOML/Contract updates (same commit)

- New architecture lock (above).
- No capability-contract change (helpers not cited in `service_policy`).
- No TOML allowlist edits.

#### README / doc updates (same commit)

- `backend/app/api/v1/endpoints/issues/_shared/README.md:14` — strike `notifications.py` from Contents list IF the file is deleted.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/api/v1/test_issue_workflow.py -q` — must pass.
2. `pytest tests/backend/pytest/architecture/test_issue_notifications_have_no_direct_send_helpers_red.py -q` — must pass.
3. `pytest tests/backend/pytest -q -k "outbox and issue"` — outbox handler integration green.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `ruff check backend/app/api/v1/endpoints/issues/_shared` — clean.
6. `mypy backend/app/api/v1/endpoints/issues/_shared` — clean.

#### Commit boundary

Single commit titled: `S4.4: drop direct-send issue notifications; outbox is the single transport`.

#### Rollback

- Class: **LOCK-RATCHET**.
- Procedure:
  1. `git revert <SHA>` to restore the three helpers.
  2. Drop the new architecture test.
  3. Re-run `pytest tests/backend/pytest/test_issue_workflow_*` to confirm `test_issue_workflow_routes_use_lifecycle_module:1189` still passes.
- Coordination: chain into #30. If #30 landed, sequence revert as `#30 → #14`.
- Estimated revert time: 20 min.

#### Effort & Risk

- Estimated time: 5h (test rewrite is the bulk; helper deletion is mechanical).
- Risk: LOW — production uses outbox; helpers are dead.
- Mitigations: outbox test rewrite in same commit; architecture lock prevents re-introduction.

---

### Item #13 — #15 — Add `access_user` capability surface (8th surface)

**Wave**: 2  | **Slot**: v2 Seq 13  | **Effort**: M (half-day)  | **Priority**: P1  | **Domain**: endpoints + frontend

**Dependencies**: none  
**Atomic with**: none  
**Validator?**: yes — `python3 scripts/security/validate_authz_capability_contract.py` MUST exit 0 after the catalog change

#### Why this work

7 capability fields verified verbatim at `backend/app/schemas/access.py:66-72`:
- `:66 can_edit_identity: bool`
- `:67 can_edit_business_access: bool`
- `:68 can_edit_role: bool`
- `:69 can_deactivate: bool`
- `:70 can_change_active_status: bool`
- `:71 can_break_glass_enable: bool`
- `:72 can_revoke_sessions: bool`

Backend class is `AccessUserCapabilities(BaseModel)` at `:63`. Frontend mirror is a TS interface at `frontend/src/types/access.ts:51` — but the catalog parser at `scripts/security/authz_contract_validator/capability_catalog.py:112-126` requires a Zod `passthroughObject({...})` literal. **Phase 6 critical**: 7 fields verbatim at `access.py:66-72`; new Zod must use `passthroughObject({...})` (NOT `.merge()` / `.extend()` continuations). Audit ID = #15 (D-N2); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 13 (`plan-loop-3-07-integration-v2.md:356`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read 7 fields verbatim at `backend/app/schemas/access.py:66-72`.
- [ ] Confirm `passthroughObject` helper at `frontend/src/services/api/schemas/common.ts:5`.
- [ ] Verify `frontend/src/services/api/schemas/entities/` directory exists; `access.ts` does NOT yet exist.
- [ ] Confirm `docs/security/capability-catalog.json` has 7 surface entries today (`grep -c '"id":' = 7`).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/backend/pytest/architecture/test_capability_catalog_access_user_surface_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
"""Lock that capability-catalog declares an access_user surface."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
CATALOG = REPO_ROOT / "docs/security/capability-catalog.json"

EXPECTED_FIELDS = {
    "can_edit_identity",
    "can_edit_business_access",
    "can_edit_role",
    "can_deactivate",
    "can_change_active_status",
    "can_break_glass_enable",
    "can_revoke_sessions",
}


def _catalog() -> dict:
    return json.loads(CATALOG.read_text(encoding="utf-8"))


def test_access_user_surface_declared() -> None:
    surfaces = _catalog()["surfaces"]
    ids = {entry["id"] for entry in surfaces}
    assert "access_user" in ids


def test_access_user_surface_points_at_backend_schema() -> None:
    surfaces = _catalog()["surfaces"]
    surface = next(entry for entry in surfaces if entry["id"] == "access_user")
    assert surface["backend"]["path"] == "backend/app/schemas/access.py"
    assert surface["backend"]["class"] == "AccessUserCapabilities"


def test_access_user_surface_points_at_frontend_zod_schema() -> None:
    surfaces = _catalog()["surfaces"]
    surface = next(entry for entry in surfaces if entry["id"] == "access_user")
    fe_path = REPO_ROOT / surface["frontend"]["path"]
    assert fe_path.exists(), surface["frontend"]
    body = fe_path.read_text(encoding="utf-8")
    schema_name = surface["frontend"]["schema"]
    # Phase 6 catalog-parser requirement: passthroughObject({...}) literal.
    assert f"{schema_name} = passthroughObject(" in body or (
        f"const {schema_name}" in body and "passthroughObject(" in body
    )


def test_access_user_surface_lists_seven_fields() -> None:
    surfaces = _catalog()["surfaces"]
    surface = next(entry for entry in surfaces if entry["id"] == "access_user")
    assert set(surface["fields"]) == EXPECTED_FIELDS
```

**Expected result**: RED. All 4 assertions fail today.

#### TDD Step 2 — Implement Change

**Files to create**:
- `frontend/src/services/api/schemas/entities/access.ts`:
  ```typescript
  import { z } from "zod";

  import { passthroughObject } from "../common";

  export const accessUserCapabilitiesSchema = passthroughObject({
    can_edit_identity: z.boolean(),
    can_edit_business_access: z.boolean(),
    can_edit_role: z.boolean(),
    can_deactivate: z.boolean(),
    can_change_active_status: z.boolean(),
    can_break_glass_enable: z.boolean(),
    can_revoke_sessions: z.boolean(),
  });

  export type AccessUserCapabilitiesParsed =
    z.infer<typeof accessUserCapabilitiesSchema>;
  ```
  **Phase 6 critical**: must use `passthroughObject({...})` literal — NOT `.merge()` / `.extend()`.

- The new architecture test above.

**Files to edit**:
- `docs/security/capability-catalog.json` — append 8th surface to `surfaces` array (after `vendor`):
  ```json
  {
    "id": "access_user",
    "backend": {
      "path": "backend/app/schemas/access.py",
      "class": "AccessUserCapabilities"
    },
    "frontend": {
      "path": "frontend/src/services/api/schemas/entities/access.ts",
      "schema": "accessUserCapabilitiesSchema"
    },
    "fields": [
      "can_edit_identity",
      "can_edit_business_access",
      "can_edit_role",
      "can_deactivate",
      "can_change_active_status",
      "can_break_glass_enable",
      "can_revoke_sessions"
    ]
  }
  ```
- `docs/security/authorization-capability-contract.md` — add a row in the capability matrix referencing the new `access_user` surface and the schema/Zod paths.

**Files to delete**:
- None.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_capability_catalog_access_user_surface_red.py -q
python3 scripts/security/validate_authz_capability_contract.py
```
Both must succeed; validator MUST exit 0.

#### Lock/TOML/Contract updates (same commit)

- New architecture lock IS the contract assertion.
- `tests/backend/pytest/architecture/test_authz_contract_doc_drift_red.py` — confirm not broken (adds a row but does not delete needles).
- `tests/backend/pytest/architecture/test_w11_docs_index_completeness_red.py` — substring asserts must pass.
- No TOML allowlist edits.

#### README / doc updates (same commit)

- `docs/security/authorization-capability-contract.md` — matrix row.
- `docs/security/capability-catalog.json` — 8th surface.
- Optional: cross-link from `AGENTS.md:209` if listed there.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_capability_catalog_access_user_surface_red.py -q` — must pass.
2. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `cd frontend && npx tsc --noEmit` — Zod schema typechecks.
5. `cd frontend && npm run test:run` — Vitest Zod schema parses.
6. `ruff check tests/backend/pytest/architecture/test_capability_catalog_access_user_surface_red.py` — clean.

#### Commit boundary

Single commit titled: `feat(security): add access_user surface (8th) to capability catalog`.

#### Rollback

- Class: **CROSS-DOMAIN** (validator-touching).
- Procedure:
  1. `git revert <SHA>` — drops Zod schema, catalog row, doc matrix row, lock test.
  2. Re-run validator and Vitest.
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: 4h (half-day; doc + Zod schema + matrix update + test).
- Risk: LOW — Pydantic↔Zod parity strict; Phase 6 verified `passthroughObject` helper exists.
- Mitigations: validator script runs in CI and locally; lock test pins surface declaration.

---

### Item #14 — #37 — Replace `_can_view_governance` mirror with canonical `build_me_capabilities`

**Wave**: 2  | **Slot**: v2 Seq 6  | **Effort**: S (4h)  | **Priority**: P1  | **Domain**: backend

**Dependencies**: none (gates #12 — must land first per Correction A; soft-gates #66)  
**Atomic with**: none  
**Validator?**: validator-neutral (capability surface unchanged) — but verify exit 0

#### Why this work

`backend/app/api/v1/endpoints/users/summary.py:45-50` defines local private `_can_view_governance` that algebraically duplicates `build_me_capabilities(current_user).can_view_governance`. **Phase 4 correction**: algebraically equivalent today; this is a drift-surface elimination, not a current-bug fix. The contract test must be a regression-pin against future divergence. Audit ID = #37 (S7.10); developer verdict = ACCEPT (P1). v2 promotes #37 to Seq 6 (was 14) per Correction A: 3-way overlap with #12 and #34 on `users/summary.py`.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 6 (`plan-loop-3-07-integration-v2.md:349`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of `backend/app/api/v1/endpoints/users/summary.py:10,23,24,45-50,53,54`, `backend/app/services/_authorization_capabilities/me.py` (verify `build_me_capabilities` exists).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file 1 (behavioral)**: `tests/backend/pytest/api/v1/users/test_summary_can_view_governance.py`

```python
import pytest
from app.services._authorization_capabilities.me import build_me_capabilities

pytestmark = pytest.mark.asyncio


@pytest.mark.parametrize("user_fixture_name", ["admin", "cro", "risk_manager", "dept_head", "compliance", "end_user"])
async def test_shell_summary_can_view_governance_matches_build_me_capabilities(
    client_factory, request, user_fixture_name
):
    user = request.getfixturevalue(f"test_user_{user_fixture_name}")
    client = await client_factory(user)
    resp = await client.get("/api/v1/users/me/shell-summary")
    assert resp.status_code == 200
    expected = build_me_capabilities(user).can_view_governance
    assert resp.json()["can_view_governance"] == expected
```

**Test file 2 (structural)**: `tests/backend/pytest/api/v1/users/test_summary_structural.py`

```python
from __future__ import annotations

import inspect

import pytest


def test_summary_imports_build_me_capabilities_only() -> None:
    from app.api.v1.endpoints.users import summary
    source = inspect.getsource(summary)
    assert "_can_view_governance" not in source
    assert "from app.core.permissions import can_manage_users" not in source
    assert "ensure_business_view_access" not in source
    assert "build_me_capabilities" in source
```

**Expected result**: RED. Behavioral test passes today (algebraic equivalence) but structural test fails on all 4 assertions.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/api/v1/endpoints/users/summary.py`:
  - Line 10 imports — remove `from app.core.permissions import can_manage_users, ensure_business_view_access, has_permission`. Re-add `has_permission` (still used by `_count_questionnaire_inbox` line 40).
  - Lines 45-50 — remove the `_can_view_governance` function entirely.
  - In `_build_shell_summary` (line 53), import `build_me_capabilities` from `app.services._authorization_capabilities.me` and replace line 54 with:
    ```python
    can_view_governance = build_me_capabilities(current_user).can_view_governance
    ```

**Files to create**:
- The two new test files above.

**Files to delete**:
- None.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/api/v1/users/test_summary_can_view_governance.py tests/backend/pytest/api/v1/users/test_summary_structural.py -v
```
Both pass.

#### Lock/TOML/Contract updates (same commit)

- `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml` — confirm `can_view_governance` listed; no edit expected.
- `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` — `/me/shell-summary` payload schema unchanged; no edit.
- Capability contract validator must remain green.

#### README / doc updates (same commit)

- `docs/security/authorization-capability-contract.md` — note `can_view_governance` has a single source of truth (`build_me_capabilities`).

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/api/v1/users/test_summary_can_view_governance.py -v` — must pass (matrix).
2. `pytest tests/backend/pytest/api/v1/users/test_summary_structural.py -v` — must pass.
3. `pytest tests/backend/pytest/test_aggregate_overviews.py -v` — existing summary tests still pass.
4. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `ruff check backend/app/api/v1/endpoints/users` — clean.
7. `mypy backend/app/api/v1/endpoints/users` — clean.

#### Commit boundary

Single commit titled: `refactor(backend/users): consume build_me_capabilities for shell-summary governance gate`.

#### Rollback

- Class: **LOCK-RATCHET** (regression-pin).
- Procedure:
  1. `git revert <SHA>` to restore the local mirror.
  2. Algebraic equivalence today means no behavior change either way; rollback risk is purely loss of the regression-pin.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: 4h (test matrix + edit + verification).
- Risk: very low — Phase 4 confirms algebraic equivalence today.
- Mitigations: matrix test parametrizes over 6 roles to pin the contract.

---

### Item #15 — #76 — Migrate 8 auth-flow `db.commit` sites to service-owned transactions

**Wave**: 2  | **Slot**: v2 Seq 70  | **Effort**: L (12-16h)  | **Priority**: P3  | **Domain**: crosscut

**Dependencies**: #72 (Wave 1 — ADR-011 must ratify the rule first)  
**Atomic with**: none — but architecture lock test required  
**Validator?**: no

#### Why this work

ADR-011 (#72) freezes the auth idiom. ADR-002 records 8 auth-flow endpoint commit exemptions in `_endpoint_commit_allowlist.toml` with `expires_at = "2026-09-01"`. **Phase 6 critical**: 8 sites verified at exact lines:
1. `auth/refresh.py:177` (1 commit)
2. `auth/logout.py:101` (1 commit)
3. `auth/logout.py:132` (1 commit)
4. `auth/sso.py:170` (1 commit)
5. `auth/_sso_helpers.py:48` (1 commit)
6. `auth/password.py:128` (1 commit)
7. `auth/password.py:161` (1 commit)
8. `auth/demo.py:67` (1 commit)

Audit ID = #76 (NEW item per Correction D); developer verdict = ACCEPT (P1 deadline).

**Note**: master sequence places #76 at Seq 70 (P3 wave). The task brief lists #76 in Wave 2 (P1 deadline) per the developer's "must complete by 2026-09-01" framing. This recipe captures #76 as the P1-deadline-driven item; calendar feasibility may require escalation per the master DAG open question 6.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 70 (`plan-loop-3-07-integration-v2.md:413`).
- [ ] Confirm prerequisites complete: ADR-011 (#72) must be merged (`docs/adr/ADR-011-auth-scheme-and-session-model.md` exists).
- [ ] Read latest state of all 8 auth files at the cited lines.
- [ ] Confirm `_endpoint_commit_allowlist.toml` has 8 entries with `expires_at = "2026-09-01"`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/backend/pytest/architecture/test_auth_flow_no_endpoint_commit_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
# tests/backend/pytest/architecture/test_auth_flow_no_endpoint_commit_red.py
from __future__ import annotations

import ast
import pathlib

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]
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


@pytest.mark.parametrize("rel_path", AUTH_FILES)
def test_auth_flow_no_endpoint_commit(rel_path: str) -> None:
    source = (REPO_ROOT / rel_path).read_text()
    tree = ast.parse(source)
    assert not _has_commit(tree), f"{rel_path} still contains await db.commit()"
```

**Expected result**: RED. All 6 parametrized cases fail today (8 commit sites across 6 files).

#### TDD Step 2 — Implement Change

**Files to edit (8 sites across 6 files)**: each migration wraps the commit in a service-owned transaction.

1. **`auth/sso.py:170`** — wrap in `app.services._auth_session.session_lifecycle.complete_sso_login(...)`.
2. **`auth/_sso_helpers.py:48`** — fold into the same `_auth_session` service method.
3. **`auth/refresh.py:177`** — wrap in `app.services._auth_session.session_lifecycle.rotate_refresh_token(...)`.
4. **`auth/logout.py:101`** — wrap in `app.services._auth_session.session_lifecycle.logout_session(...)`.
5. **`auth/logout.py:132`** — wrap in same `logout_session` (or `logout_all_sessions` variant).
6. **`auth/password.py:128`** — wrap in `app.services._identity_access_lifecycle.password.update_password(...)`.
7. **`auth/password.py:161`** — wrap in same service (different code path).
8. **`auth/demo.py:67`** — wrap in `app.services._identity_access_lifecycle.demo.create_demo_session(...)`.

**Files to create**:
- New service methods under `backend/app/services/_auth_session/session_lifecycle.py` and `backend/app/services/_identity_access_lifecycle/{password.py,demo.py}` (one method per logical operation).
- The new architecture lock test above.

**Files to delete**:
- 8 entries from `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml`.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_auth_flow_no_endpoint_commit_red.py -v
```
All 6 parametrized cases pass.

#### Lock/TOML/Contract updates (same commit)

- `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` — remove 8 entries (one per site).
- The lock at `test_w5_endpoint_commit_ratchet_red.py::test_auth_commit_allowlist_entries_are_complete_and_unexpired` is no longer applicable to auth-flow entries (count = 0).

#### README / doc updates (same commit)

- `docs/adr/ADR-002-service-owned-transactions.md` — note auth-flow allowlist count drops to 0 ahead of `2026-09-01`.
- `backend/app/services/_auth_session/README.md` — append session-lifecycle method inventory.
- `backend/app/services/_identity_access_lifecycle/README.md` — append password / demo method inventory.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_auth_flow_no_endpoint_commit_red.py -v` — all 6 parametrized cases pass.
2. `pytest tests/backend/pytest/architecture/test_w5_endpoint_commit_ratchet_red.py -q` — auth-flow entries removed.
3. `pytest tests/backend/pytest -q -k "auth"` — broad auth suite green.
4. `pytest tests/backend/pytest -q -k "session"` — session lifecycle green.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
7. `ruff check backend/app/api/v1/endpoints/auth backend/app/services/_auth_session backend/app/services/_identity_access_lifecycle` — clean.
8. `mypy backend/app` — clean.

#### Commit boundary

**Recommended**: 8 commits, one per site (incremental migration). Each commit removes 1 commit site, adds 1 service method, removes 1 allowlist entry. Single-commit alternative is acceptable but increases blast radius.

Per-site commit titles (example):
1. `refactor(auth/sso): migrate db.commit to _auth_session.session_lifecycle.complete_sso_login`
2. `refactor(auth/_sso_helpers): fold commit into _auth_session.session_lifecycle.complete_sso_login`
3. `refactor(auth/refresh): migrate db.commit to _auth_session.session_lifecycle.rotate_refresh_token`
4. `refactor(auth/logout): migrate :101 db.commit to _auth_session.session_lifecycle.logout_session`
5. `refactor(auth/logout): migrate :132 db.commit to _auth_session.session_lifecycle.logout_all_sessions`
6. `refactor(auth/password): migrate :128 db.commit to _identity_access_lifecycle.password.update_password`
7. `refactor(auth/password): migrate :161 db.commit to _identity_access_lifecycle.password.reset_password`
8. `refactor(auth/demo): migrate db.commit to _identity_access_lifecycle.demo.create_demo_session`

#### Rollback

- Class: **CROSS-DOMAIN** (per-site).
- Procedure:
  1. Each of the 8 migrations is a separate commit.
  2. Rollback per-site by reverting the commit and restoring the corresponding allowlist entry.
- Estimated revert time: 15 min per site.

#### Effort & Risk

- Estimated time: 12-16h L (Phase 4 promotion from M; 8 sites × ~90 min including service method design + per-site behavioral test + verification).
- Risk: HIGH — auth-flow regressions break login. Per-site behavioral test mandatory.
- Mitigations: per-site commits enable surgical revert; behavioral tests use `client_factory`; ADR-011 idiom ratchet catches re-introduction.

---

### Item #16 — #2 — Drop 4 underscore aliases in `_issue_workflow/source_validation.py`

**Wave**: 3  | **Slot**: v2 Seq 14  | **Effort**: S (1.5h)  | **Priority**: P2  | **Domain**: issues

**Dependencies**: none (chain head; gates #8)  
**Atomic with**: none — soft pair-with #41 (same anti-pattern)  
**Validator?**: no

#### Why this work

`backend/app/services/_issue_workflow/source_validation.py:117-120` carries 4 self-alias bindings (`_ensure_owner_assignable = ensure_owner_assignable`, etc.). Loop B confirmed zero callers of the underscored variants. Audit ID = #2 (B-N1); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 14 (`plan-loop-3-07-integration-v2.md:357`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of `backend/app/services/_issue_workflow/source_validation.py:117-120,122-130`.
- [ ] Confirm 4 alias literals present at `:117-120`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/backend/pytest/architecture/test_issue_workflow_no_underscored_self_aliases_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SOURCE_VALIDATION = REPO_ROOT / "backend/app/services/_issue_workflow/source_validation.py"


def test_no_underscored_self_aliases_in_source_validation() -> None:
    text = SOURCE_VALIDATION.read_text()
    for forbidden in (
        "_ensure_owner_assignable = ensure_owner_assignable",
        "_issue_link_department_ids = issue_link_department_ids",
        "_resolve_vendor_department_and_access = resolve_vendor_department_and_access",
        "_validate_user_exists = validate_user_exists",
    ):
        assert forbidden not in text, f"{forbidden!r} must be removed"
```

**Expected result**: RED. Run:
```
pytest tests/backend/pytest/architecture/test_issue_workflow_no_underscored_self_aliases_red.py -q
```
Test fails (4 forbidden literals at `:117-120`).

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/services/_issue_workflow/source_validation.py:117-120` — delete:
  ```
  _ensure_owner_assignable = ensure_owner_assignable
  _issue_link_department_ids = issue_link_department_ids
  _resolve_vendor_department_and_access = resolve_vendor_department_and_access
  _validate_user_exists = validate_user_exists
  ```
  After edit, `__all__` (`:122-130`) is unchanged (it never listed the underscored names).

**Files to create**:
- The new architecture test (above).

**Files to delete**:
- None.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_issue_workflow_no_underscored_self_aliases_red.py -q
```
Test passes.

#### Lock/TOML/Contract updates (same commit)

- New architecture lock IS the contract.
- No TOML allowlist edits.
- Capability contract: NO change.

#### README / doc updates (same commit)

- None required.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_issue_workflow_no_underscored_self_aliases_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_issue_workflow.py -q` — domain suite green.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `python3 -m pyflakes backend/app/services/_issue_workflow/source_validation.py` — no warnings.
5. `ruff check backend/app/services/_issue_workflow/source_validation.py` — clean.
6. `mypy backend/app/services/_issue_workflow/source_validation.py` — clean.

#### Commit boundary

Single commit titled: `B-N1: drop dead underscore aliases in _issue_workflow/source_validation`.

#### Rollback

- Class: **LOCK-RATCHET**.
- Procedure:
  1. `git revert <SHA>` — re-introduces 4 alias lines.
  2. Drop the new lock test.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 1.5h (test + 4 deletions + verification).
- Risk: very low — Loop B confirmed zero callers.
- Mitigations: structural assertion catches re-introduction.

---

### Item #17 — #3 — Delete `kriFormWorkflow.ts`

**Wave**: 3  | **Slot**: v2 Seq 15  | **Effort**: S (~30 min)  | **Priority**: P2  | **Domain**: frontend

**Dependencies**: none  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`frontend/src/components/kri-form/kriFormWorkflow.ts` is a 14-line dead-code shim. Sole consumer is the test importer at `tests/frontend/unit/src/components/__tests__/EntityFormWorkflow.test.ts:8,28-29`. Audit ID = #3 (S3.11); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 15 (`plan-loop-3-07-integration-v2.md:358`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of `frontend/src/components/kri-form/kriFormWorkflow.ts`.
- [ ] Run `rg "buildVendorContextWarning|kriFormWorkflow" frontend/ tests/frontend/` — verify only test importer hit.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: append to existing `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py` OR new vitest file.

Backend lock approach (recommended for cross-stack absence):
```python
# tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py (append)
def test_kri_form_workflow_shim_is_removed() -> None:
    assert not (REPO_ROOT / "frontend/src/components/kri-form/kriFormWorkflow.ts").exists()
```

Alternative: vitest `kriFormWorkflow.absence.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('kriFormWorkflow.ts dead-code is deleted', () => {
    it('does not exist on disk', () => {
        const target = path.resolve(
            __dirname,
            '../../../../../../frontend/src/components/kri-form/kriFormWorkflow.ts',
        );
        expect(fs.existsSync(target)).toBe(false);
    });
});
```

**Expected result**: RED. Run pytest (or vitest) — file currently exists.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `tests/frontend/unit/src/components/__tests__/EntityFormWorkflow.test.ts` — delete the import at `:8` and the two assertions at `:28-29`. If the file becomes empty, delete it entirely.

**Files to create**:
- The new architecture test (above).

**Files to delete**:
- `frontend/src/components/kri-form/kriFormWorkflow.ts` (14 lines).

#### TDD Step 3 — Confirm GREEN

Re-run the test from Step 1 — passes.

#### Lock/TOML/Contract updates (same commit)

- None.

#### README / doc updates (same commit)

- None.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py -q -k kri_form_workflow` — must pass.
2. `cd frontend && pnpm test -- EntityFormWorkflow` — must pass.
3. `rg "buildVendorContextWarning|kriFormWorkflow" frontend/ tests/frontend/` — must return zero hits.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `cd frontend && npx tsc --noEmit` — clean.

#### Commit boundary

Single commit titled: `chore(kri-form): delete dead kriFormWorkflow shim`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` — restores 14-line file plus test importer.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 30 min (test + delete + test importer cleanup + verification).
- Risk: very low — sole consumer is one test.
- Mitigations: lock test pins absence.

---

### Item #18 — #4 — Delete `controlFormWorkflow.ts`

**Wave**: 3  | **Slot**: v2 Seq 16  | **Effort**: S (~30 min)  | **Priority**: P2  | **Domain**: frontend

**Dependencies**: none  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`frontend/src/components/control-form/controlFormWorkflow.ts` is a 3-line file containing only `export function buildControlOwnerOptionLabel(name: string | null | undefined): string { ... }`. Pre-flight grep `rg "controlFormWorkflow" frontend/ tests/frontend/` returns 0 matches — truly orphan. Audit ID = #4 (FE-deadcode-1); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 16 (`plan-loop-3-07-integration-v2.md:359`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of `frontend/src/components/control-form/controlFormWorkflow.ts`.
- [ ] Run `rg "controlFormWorkflow" frontend/ tests/frontend/` — must return 0 matches.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/frontend/unit/src/components/control-form/controlFormWorkflow.absence.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('controlFormWorkflow.ts dead-code is deleted', () => {
    it('does not exist on disk', () => {
        const target = path.resolve(
            __dirname,
            '../../../../../../frontend/src/components/control-form/controlFormWorkflow.ts',
        );
        expect(fs.existsSync(target)).toBe(false);
    });
});
```

**Expected result**: RED. Run:
```
npm run -w tests/frontend/unit test -- controlFormWorkflow.absence
```

#### TDD Step 2 — Implement Change

**Files to edit**:
- None.

**Files to create**:
- The new vitest absence test (above).

**Files to delete**:
- `frontend/src/components/control-form/controlFormWorkflow.ts`.

#### TDD Step 3 — Confirm GREEN

Re-run the test from Step 1 — passes.

#### Lock/TOML/Contract updates (same commit)

- None.

#### README / doc updates (same commit)

- None.

#### Verification commands (run all in order)

1. `npm run -w tests/frontend/unit test -- controlFormWorkflow.absence` — must pass.
2. `npm run -w tests/frontend/unit lint` — clean.
3. `npm run -w tests/frontend/unit typecheck` — clean (would fail if `buildControlOwnerOptionLabel` is referenced anywhere).
4. `npm run -w tests/frontend/unit test` — full vitest green.

#### Commit boundary

Single commit titled: `chore(control-form): delete dead controlFormWorkflow.ts`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` (or `git restore --source=HEAD~1 -- frontend/src/components/control-form/controlFormWorkflow.ts`).
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 30 min.
- Risk: very low — 0 importers verified pre-flight.
- Mitigations: typecheck catches accidental consumers.

---

### Item #19 — #5 — Delete `orphanResolutionPresentation.ts`

**Wave**: 3  | **Slot**: v2 Seq 17  | **Effort**: S (~30 min)  | **Priority**: P2  | **Domain**: frontend

**Dependencies**: none  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`frontend/src/components/governance/orphanResolutionPresentation.ts` is a 1-line re-export `export { buildOrphanResolutionLabel } from './orphanResolutionState';`. Pre-flight grep `rg "orphanResolutionPresentation" frontend/ tests/frontend/` returns 0 matches. Audit ID = #5 (FE-deadcode-2); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 17 (`plan-loop-3-07-integration-v2.md:360`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of `frontend/src/components/governance/orphanResolutionPresentation.ts`.
- [ ] Run `rg "orphanResolutionPresentation" frontend/ tests/frontend/` — must return 0 matches.
- [ ] Verify canonical `frontend/src/components/governance/orphanResolutionState.ts` exports `buildOrphanResolutionLabel`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/frontend/unit/src/components/governance/orphanResolutionPresentation.absence.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('orphanResolutionPresentation.ts dead-code is deleted', () => {
    it('does not exist on disk', () => {
        const target = path.resolve(
            __dirname,
            '../../../../../../frontend/src/components/governance/orphanResolutionPresentation.ts',
        );
        expect(fs.existsSync(target)).toBe(false);
    });

    it('orphanResolutionState still exports buildOrphanResolutionLabel', async () => {
        const mod = await import('@/components/governance/orphanResolutionState');
        expect(typeof mod.buildOrphanResolutionLabel).toBe('function');
    });
});
```

**Expected result**: RED. First assertion fails (file exists).

#### TDD Step 2 — Implement Change

**Files to edit**:
- None.

**Files to create**:
- The new vitest test (above).

**Files to delete**:
- `frontend/src/components/governance/orphanResolutionPresentation.ts` (1 line).

#### TDD Step 3 — Confirm GREEN

Re-run — both assertions pass.

#### Lock/TOML/Contract updates (same commit)

- None.

#### README / doc updates (same commit)

- None.

#### Verification commands (run all in order)

1. `npm run -w tests/frontend/unit test -- orphanResolutionPresentation.absence` — must pass.
2. `npm run -w tests/frontend/unit lint` — clean.
3. `npm run -w tests/frontend/unit typecheck` — clean.
4. `npm run -w tests/frontend/unit test` — full vitest green.

#### Commit boundary

Single commit titled: `chore(governance): delete dead orphanResolutionPresentation re-export`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>`.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 30 min.
- Risk: very low.
- Mitigations: canonical export still verified by second assertion.

---

### Item #20 — #6 — Delete `notifications/resourcePath.ts`

**Wave**: 3  | **Slot**: v2 Seq 18  | **Effort**: S (~30 min)  | **Priority**: P2  | **Domain**: frontend

**Dependencies**: none  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`frontend/src/components/notifications/resourcePath.ts` is a 4-line re-export of `getNotificationPath, getNotificationResourcePath` from `./notificationPresentation`. Pre-flight grep `rg "from '@/components/notifications/resourcePath'" frontend/ tests/frontend/` returns 0 matches. Audit ID = #6 (FE-deadcode-3); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 18 (`plan-loop-3-07-integration-v2.md:361`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of `frontend/src/components/notifications/resourcePath.ts`.
- [ ] Verify canonical `notificationPresentation.ts` exports both helpers.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/frontend/unit/src/components/notifications/resourcePath.absence.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('notifications/resourcePath.ts dead-code is deleted', () => {
    it('does not exist on disk', () => {
        const target = path.resolve(
            __dirname,
            '../../../../../../frontend/src/components/notifications/resourcePath.ts',
        );
        expect(fs.existsSync(target)).toBe(false);
    });

    it('notificationPresentation still exports the canonical helpers', async () => {
        const mod = await import('@/components/notifications/notificationPresentation');
        expect(typeof mod.getNotificationPath).toBe('function');
        expect(typeof mod.getNotificationResourcePath).toBe('function');
    });
});
```

**Expected result**: RED. First assertion fails.

#### TDD Step 2 — Implement Change

**Files to edit**:
- None.

**Files to create**:
- The new vitest test (above).

**Files to delete**:
- `frontend/src/components/notifications/resourcePath.ts` (4 lines).

#### TDD Step 3 — Confirm GREEN

Re-run — both assertions pass.

#### Lock/TOML/Contract updates (same commit)

- None.

#### README / doc updates (same commit)

- None.

#### Verification commands (run all in order)

1. `npm run -w tests/frontend/unit test -- resourcePath.absence` — must pass.
2. `npm run -w tests/frontend/unit lint` — clean.
3. `npm run -w tests/frontend/unit typecheck` — clean.
4. `npm run -w tests/frontend/unit test` — full vitest green.

#### Commit boundary

Single commit titled: `chore(notifications): delete dead resourcePath re-export`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>`.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 30 min.
- Risk: very low.
- Mitigations: canonical exports verified by second assertion.

---

### Item #21 — #7 — Delete `_get_approval_department_id` endpoint shim

**Wave**: 3  | **Slot**: v2 Seq 19  | **Effort**: S (~1h)  | **Priority**: P2  | **Domain**: approvals

**Dependencies**: none  
**Atomic with**: none — co-touches `_shared.py` with #18; do them in separate commits  
**Validator?**: no

#### Why this work

`backend/app/api/v1/endpoints/approvals/_shared.py:17-31` defines a dead shim `_get_approval_department_id`. Service-canonical `get_approval_department_id` already serves all 4 production callers (`approval_execution_service.py:84,128,193`, `_approval_execution/logging.py:16`). Phase 6 grep verified zero importers of the underscore variant. Audit ID = #7 (C-N1); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 19 (`plan-loop-3-07-integration-v2.md:362`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of `backend/app/api/v1/endpoints/approvals/_shared.py:17-31`.
- [ ] Run `grep -rn "_get_approval_department_id" backend/` — verify only definition site.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: append to `tests/backend/pytest/test_architecture_deepening_contracts.py` (file already declares `pytestmark = pytest.mark.contract` at `:9`).

```python
def test_endpoint_shim_get_approval_department_id_deleted() -> None:
    """C-N1: dead endpoint helper removed; canonical service helper retained."""
    import importlib
    shared = importlib.import_module("app.api.v1.endpoints.approvals._shared")
    loading = importlib.import_module("app.services._approval_execution.loading")
    assert not hasattr(shared, "_get_approval_department_id"), (
        "C-N1: endpoint shim _get_approval_department_id must be deleted"
    )
    assert hasattr(loading, "get_approval_department_id"), (
        "Canonical service helper get_approval_department_id must remain"
    )
```

**Expected result**: RED. Run:
```
pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k get_approval_department_id
```
Test fails (shim still defined).

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/api/v1/endpoints/approvals/_shared.py` — delete lines `:17-31` (the entire `async def _get_approval_department_id(...)` body).
- Drop now-unused imports if `_build_approval_read` is still present (do NOT remove `from sqlalchemy import select` if needed elsewhere). Verify with `python -c "from app.api.v1.endpoints.approvals import _shared"` post-edit.

**Files to create**:
- None (test appended to existing file).

**Files to delete**:
- None (file remains until #18 deletes `_build_approval_read` too).

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k get_approval_department_id
```
Test passes.

#### Lock/TOML/Contract updates (same commit)

- New deepening assertion above (architecture lock).
- No TOML allowlist update.

#### README / doc updates (same commit)

- None. AUTHZ-APPROVALS row at `docs/security/authorization-capability-contract.md:119` already cites `services/_approval_execution/`.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k get_approval_department_id` — must pass.
2. `pytest tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approvals.py tests/backend/pytest/test_approval_resolution.py -x` — must pass.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/api/v1/endpoints/approvals` — clean.
5. `mypy backend/app/api/v1/endpoints/approvals` — clean.

#### Commit boundary

Single commit titled: `chore(approvals): drop dead _get_approval_department_id endpoint shim`.

#### Rollback

- Class: **TRIVIAL**.
- Procedure:
  1. `git revert <SHA>` — restores the shim.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: 1h (test + delete + verification).
- Risk: very low — Phase 6 verified zero callers.
- Mitigations: deepening assertion catches re-introduction.

---

### Item #22 — #41 — Drop bidirectional underscore aliases in `_issue_workflow/serialization.py`

**Wave**: 3  | **Slot**: v2 Seq 20  | **Effort**: S (2h)  | **Priority**: P2  | **Domain**: issues

**Dependencies**: none — soft pair-with #2 (same anti-pattern)  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`backend/app/services/_issue_workflow/serialization.py:18` (`active_exception = _active_exception`) and `:41` (`_serialize_exception_with_user_names = serialize_exception_with_user_names`) are self-aliases that should be removed. Recipe promotes `_active_exception` to public `active_exception` in `_issue_register/serialization.py` and updates the workflow-side import. **Phase 6 CRITICAL correction**: `_active_exception` is ALSO imported by `backend/app/api/v1/endpoints/issues/_shared/serialization.py:18` (re-exported as endpoint shim) and `_shared/__init__.py:19,51`. The recipe MUST add the explicit edit to `_shared/serialization.py:18,30` in the same commit. Audit ID = #41 (B-N3); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 20 (`plan-loop-3-07-integration-v2.md:363`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of `backend/app/services/_issue_workflow/serialization.py:9-11,18,41`, `backend/app/services/_issue_register/serialization.py:47,246`, `backend/app/api/v1/endpoints/issues/_shared/serialization.py:18,30`.
- [ ] Confirm `_active_exception` consumer at `_shared/serialization.py:18` (Phase 6 critical: missed by Phase 5 recipe).
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/backend/pytest/architecture/test_issue_workflow_serialization_has_no_self_aliases_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
WORKFLOW_SERIALIZATION = REPO_ROOT / "backend/app/services/_issue_workflow/serialization.py"


def test_no_self_aliases_in_workflow_serialization() -> None:
    text = WORKFLOW_SERIALIZATION.read_text()
    assert "active_exception = _active_exception" not in text
    assert (
        "_serialize_exception_with_user_names = serialize_exception_with_user_names"
        not in text
    )
```

**Expected result**: RED. Run:
```
pytest tests/backend/pytest/architecture/test_issue_workflow_serialization_has_no_self_aliases_red.py -q
```
Test fails (both literals present).

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/services/_issue_register/serialization.py` — promote underscored `_active_exception` (around `:47`) to public `active_exception` (rename function definition).
- `backend/app/services/_issue_workflow/serialization.py:9-11` — change `from app.services._issue_register.serialization import (_active_exception,)` to `from app.services._issue_register.serialization import active_exception`. Drop the `:18 active_exception = _active_exception` line.
- `backend/app/services/_issue_workflow/serialization.py:41` — delete the line `_serialize_exception_with_user_names = serialize_exception_with_user_names`.
- **`backend/app/api/v1/endpoints/issues/_shared/serialization.py:18`** — Phase 6 critical: rename import from `_active_exception` to `active_exception`. The endpoint barrel re-export must point to the new public name.
- **`backend/app/api/v1/endpoints/issues/_shared/serialization.py:30`** — Phase 6 critical: update `__all__` entry from `_active_exception` to `active_exception` (or drop entirely if the public name is already exported via the workflow-serialization re-export — verify pre-edit).

**Files to create**:
- The new architecture test (above).

**Files to delete**:
- None.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_issue_workflow_serialization_has_no_self_aliases_red.py -q
```
Test passes.

#### Lock/TOML/Contract updates (same commit)

- New architecture lock IS the contract.
- No capability-contract change (function rename only).
- No TOML allowlist edits.

#### README / doc updates (same commit)

- None required.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_issue_workflow_serialization_has_no_self_aliases_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_issue_workflow.py -q` — domain suite green.
3. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k issue_workflow` — locks green.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `ruff check backend/app/services/_issue_workflow backend/app/services/_issue_register backend/app/api/v1/endpoints/issues/_shared` — clean.
6. `mypy backend/app/services/_issue_workflow backend/app/services/_issue_register backend/app/api/v1/endpoints/issues/_shared` — clean.

#### Commit boundary

Single commit titled: `B-N3: remove bidirectional underscore aliases in _issue_workflow/serialization (incl. endpoint barrel)`.

#### Rollback

- Class: **LOCK-RATCHET**.
- Procedure:
  1. `git revert <SHA>` — restores all alias lines and rename.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: 2h (rename + 4 file edits + test).
- Risk: LOW (after Phase 6 correction) — without the `_shared/serialization.py:18,30` edit, the endpoint barrel would point at a non-existent name between Seq 20 and Seq 54.
- Mitigations: lock test pins absence; Phase 6 critical correction caught the hidden consumer.

---

### Item #23 — #50 — Delete `_kri_history/submission.py` wrapper

**Wave**: 3  | **Slot**: v2 Seq 21  | **Effort**: S (~1h)  | **Priority**: P2  | **Domain**: kris

**Dependencies**: none  
**Atomic with**: none — but coordinated with #51 and #52 (same `DEAD_KRI_HISTORY_SERVICE_FILES` lock pattern)  
**Validator?**: yes — `python3 scripts/security/validate_authz_capability_contract.py` MUST exit 0 after stripping the `submission.py` citations from the `.md`/`.json`

#### Why this work

`backend/app/services/_kri_history/submission.py` is a 22-line wrapper with **0 production importers**. Canonical `create_kri_submission_approval` in `approval_intake.py` already serves all live consumers. Audit ID = #50 (S3.2); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 21 (`plan-loop-3-07-integration-v2.md:364`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of `backend/app/services/_kri_history/submission.py`.
- [ ] Run `grep -rn "_kri_history/submission\|_create_kri_submission_approval" backend/` — verify only ourselves match.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: append to `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`.

```python
def test_kri_history_submission_wrapper_is_removed() -> None:
    assert not (REPO_ROOT / "backend/app/services/_kri_history/submission.py").exists()


def test_no_module_references_create_kri_submission_approval_underscore() -> None:
    history_root = REPO_ROOT / "backend/app/services/_kri_history"
    offenders: list[str] = []
    for path in history_root.rglob("*.py"):
        if "_create_kri_submission_approval" in path.read_text(encoding="utf-8"):
            offenders.append(str(path.relative_to(REPO_ROOT)))
    assert offenders == []
```

Also reuse the `DEAD_KRI_HISTORY_FACADES` pattern at `tests/backend/pytest/architecture/test_w11b_test_infra_polish_red.py:18-25` by adding:

```python
DEAD_KRI_HISTORY_SERVICE_FILES = {
    "backend/app/services/_kri_history/submission.py",
    "backend/app/services/_kri_history/value_application.py",
    "backend/app/services/_kri_history/correction_plans.py",
}


def test_dead_kri_history_service_files_are_removed() -> None:
    existing = sorted(p for p in DEAD_KRI_HISTORY_SERVICE_FILES if (REPO_ROOT / p).exists())
    assert existing == []
```

**Expected result**: RED. Run:
```
pytest tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py tests/backend/pytest/architecture/test_w11b_test_infra_polish_red.py -q
```
Tests fail.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `tests/backend/pytest/test_architecture_deepening_contracts.py:998` — drop the now-dead string `"from app.services._kri_history.submission import _create_kri_submission_approval"` from the negative-assertion tuple at `:997-1002`.

**Files to create**:
- The new test additions (above).

**Files to delete**:
- `backend/app/services/_kri_history/submission.py` (22 lines).

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py -q -k submission
pytest tests/backend/pytest/architecture/test_w11b_test_infra_polish_red.py -q -k dead_kri_history
```
Both pass.

#### Lock/TOML/Contract updates (same commit)

- `tests/backend/pytest/test_architecture_deepening_contracts.py:998` — string drop (above).
- No TOML allowlist edits.

#### README / doc updates (same commit)

- `backend/app/services/_kri_history/README.md` — remove the `submission.py` inventory row.
- `docs/security/authorization-capability-contract.md:117,118,161` — strip `submission.py` from the service-policy / inventory cells (3 strings).
- `docs/security/authorization-capability-contract.json:389,411` — strip `submission.py` from the JSON `service_policy` strings (2 places).

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py -q -k submission` — must pass.
2. `pytest tests/backend/pytest/architecture/test_w11b_test_infra_polish_red.py -q -k dead_kri_history` — must pass.
3. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
4. `pytest tests/backend/pytest/test_w1_privileged_escalation_red.py tests/backend/pytest/test_kris_submission_rbac_api.py -q` — green.
5. `grep -rn "_kri_history/submission\|_create_kri_submission_approval" backend/ tests/backend/` — empty.
6. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled: `chore(_kri_history): delete dead submission wrapper`.

#### Rollback

- Class: **CROSS-DOMAIN** (capability contract validator).
- Procedure:
  1. `git revert <SHA>` — restores 22-line file + lock-tuple entry + 5 doc-citation strings.
  2. Re-run validator.
- Estimated revert time: 15 min.

#### Effort & Risk

- Estimated time: 1h (test + delete + 4 doc edits + lock cleanup + validator run).
- Risk: LOW — 0 production importers.
- Mitigations: validator green check pins the contract.

---

### Item #24 — #52 — Delete `_kri_history/correction_plans.py`

**Wave**: 3  | **Slot**: v2 Seq 22  | **Effort**: S (~1h)  | **Priority**: P2  | **Domain**: kris

**Dependencies**: none  
**Atomic with**: none — coordinated with #50 (same `DEAD_KRI_HISTORY_SERVICE_FILES` lock)  
**Validator?**: no — but lock-test edits at `:956,962` MUST land same commit

#### Why this work

`backend/app/services/_kri_history/correction_plans.py` is 14 lines with **0 production consumers**; only the contract test at `tests/backend/pytest/test_architecture_deepening_contracts.py:962` keeps it alive. Audit ID = #52 (S3.5); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 22 (`plan-loop-3-07-integration-v2.md:365`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of `backend/app/services/_kri_history/correction_plans.py`, `tests/backend/pytest/test_architecture_deepening_contracts.py:956,962`.
- [ ] Run `grep -rn "correction_plans\|build_kri_correction_plan\|KriCorrectionDraft" backend/ tests/backend/` — verify scope.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: append to `tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py`.

```python
def test_kri_history_correction_plans_is_removed() -> None:
    assert not (REPO_ROOT / "backend/app/services/_kri_history/correction_plans.py").exists()


def test_no_module_references_kri_correction_draft() -> None:
    history_root = REPO_ROOT / "backend/app/services/_kri_history"
    offenders: list[str] = []
    for path in history_root.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        for symbol in ("KriCorrectionDraft", "build_kri_correction_plan", "correction_plans"):
            if symbol in text and path.name != "correction_plans.py":
                offenders.append(f"{path.relative_to(REPO_ROOT)}::{symbol}")
    assert offenders == []
```

**Expected result**: RED. Run:
```
pytest tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py -q -k correction
```
Test fails (file present at `:1-14`).

#### TDD Step 2 — Implement Change

**Files to edit**:
- `tests/backend/pytest/test_architecture_deepening_contracts.py:956` — drop `correction_plans` from the import tuple `from app.services._kri_history import approval_intake, correction_plans, ...`.
- `tests/backend/pytest/test_architecture_deepening_contracts.py:962` — drop the line `assert hasattr(correction_plans, "build_kri_correction_plan")`.
  
  Both edits MUST land in the same commit; otherwise `pytest` raises `ImportError`.

**Files to create**:
- The new architecture test (above).

**Files to delete**:
- `backend/app/services/_kri_history/correction_plans.py` (14 lines).

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py -q -k correction
pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k kri_history
```
Both pass.

#### Lock/TOML/Contract updates (same commit)

- 2 lock-test line edits at `:956,962` (above).
- No TOML allowlist edits.

#### README / doc updates (same commit)

- `backend/app/services/_kri_history/README.md` — remove the `correction_plans.py` inventory row if listed.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_w4_bc_g_kri_history_boundaries_red.py -q -k correction` — must pass.
2. `pytest tests/backend/pytest/test_kris_history_corrections_api.py tests/backend/pytest/test_architecture_deepening_contracts.py::test_kri_history_uses_service_owned_intake_and_projection -q` — must pass.
3. `grep -rn "correction_plans\|build_kri_correction_plan\|KriCorrectionDraft" backend/ tests/backend/` — empty.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled: `chore(_kri_history): delete dead correction_plans module`.

#### Rollback

- Class: **LOCK-RATCHET**.
- Procedure:
  1. `git revert <SHA>` — restores file + 2 lock lines.
- Estimated revert time: 10 min.

#### Effort & Risk

- Estimated time: 1h (test + delete + 2 lock edits + README cleanup).
- Risk: LOW — 0 production consumers.
- Mitigations: same-commit lock edit prevents `ImportError`.

---

### Item #25 — #53 — Drop `IssueWorkflowService` facade

**Wave**: 3  | **Slot**: v2 Seq 23  | **Effort**: S (3h)  | **Priority**: P2  | **Domain**: issues

**Dependencies**: none  
**Atomic with**: none  
**Validator?**: no — but coordinates with #8(b) on `:1193,1199,1203` import tuple

#### Why this work

`backend/app/services/issue_workflow_service.py` is a 5-line facade. `_issue_workflow/service.py:33-41` is a static-method passthrough class. `_issue_workflow/execution.py:49,119,143,162,183,202,237,266` calls 7 static methods of `IssueWorkflowService`. Phase 6 verified zero importers outside `execution.py`. Audit ID = #53 (S4.1); developer verdict = ACCEPT.

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 23 (`plan-loop-3-07-integration-v2.md:366`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of `backend/app/services/issue_workflow_service.py`, `backend/app/services/_issue_workflow/service.py`, `backend/app/services/_issue_workflow/execution.py:49,119,143,162,183,202,237,266`.
- [ ] Run `grep -rn "IssueWorkflowService" backend/ tests/backend/` — verify only `execution.py` and the facade itself.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/backend/pytest/architecture/test_issue_workflow_execution_imports_lifecycle_directly_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
EXECUTION = REPO_ROOT / "backend/app/services/_issue_workflow/execution.py"
SERVICE_FACADE = REPO_ROOT / "backend/app/services/issue_workflow_service.py"
INTERNAL_SERVICE = REPO_ROOT / "backend/app/services/_issue_workflow/service.py"


def test_execution_imports_lifecycle_directly() -> None:
    text = EXECUTION.read_text()
    assert "IssueWorkflowService" not in text
    assert "from app.services._issue_workflow.assignment import" in text
    assert "from app.services._issue_workflow.remediation import" in text
    assert "from app.services._issue_workflow.exceptions import" in text
    assert "from app.services._issue_workflow.closure import" in text


def test_facade_files_deleted() -> None:
    assert not SERVICE_FACADE.exists(), "issue_workflow_service.py facade must be deleted"
    if INTERNAL_SERVICE.exists():
        text = INTERNAL_SERVICE.read_text()
        assert "class IssueWorkflowService" not in text
```

**Expected result**: RED. Run:
```
pytest tests/backend/pytest/architecture/test_issue_workflow_execution_imports_lifecycle_directly_red.py -q
```
Test fails.

#### TDD Step 2 — Implement Change

**Files to edit**:
- `backend/app/services/_issue_workflow/execution.py:49` — delete `from app.services.issue_workflow_service import IssueWorkflowService`. Replace each `IssueWorkflowService.<method>(...)` call with the underlying function (mapping per `_issue_workflow/service.py:33-41`):
  - `IssueWorkflowService.assign_issue` (`:119`) → `from .assignment import assign_issue`; call `assign_issue(...)`.
  - `IssueWorkflowService.start_remediation` (`:143`) → `from .remediation import start_remediation`.
  - `IssueWorkflowService.update_progress` (`:162`) → `from .remediation import update_progress`.
  - `IssueWorkflowService.close_issue` (`:183`) → `from .closure import close_issue`.
  - `IssueWorkflowService.request_exception` (`:202`) → `from .exceptions import request_exception`.
  - `IssueWorkflowService.approve_exception` (`:237`) → `from .exceptions import approve_exception`.
  - `IssueWorkflowService.revoke_exception` (`:266`) → `from .exceptions import revoke_exception`.

**Files to create**:
- The new architecture test (above).

**Files to delete**:
- `backend/app/services/issue_workflow_service.py` (5 lines — pure re-export).
- `backend/app/services/_issue_workflow/service.py` if no test or import remains. Verified via grep: only `_issue_workflow/__init__.py:3` mentions `app.services.issue_workflow_service` as a comment.

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_issue_workflow_execution_imports_lifecycle_directly_red.py -q
```
Test passes.

#### Lock/TOML/Contract updates (same commit)

- New architecture lock (above).
- Existing lock at `tests/backend/pytest/test_architecture_deepening_contracts.py:1237` (`assert "IssueWorkflowService." not in lifecycle_source`) still passes.
- **Coordinate with #8(b)**: line `:1193` imports `from app.services._issue_workflow import execution, lifecycle, loading, outbox, serialization, source_validation`. After #8(b) deletes `source_validation`, drop it from the import tuple. For #53 in isolation, the import tuple is unchanged.

#### README / doc updates (same commit)

- `backend/app/services/_issue_workflow/README.md:11-16` — drop `service.py` from Contents; ensure other module entries (`assignment.py, closure.py, exceptions.py, remediation.py, transitions.py, loading.py, outbox.py, serialization.py, lifecycle.py, execution.py, update_plans.py, exception_selection.py, contracts.py`) are documented. **Phase 6 phrasing**: update line 15 (which IS `service.py`) to remove that line; ADD lines for any modules currently missing.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_issue_workflow_execution_imports_lifecycle_directly_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_issue_workflow.py -q` — domain suite green.
3. `pytest tests/backend/pytest -q -k issue` — broad issue suite green.
4. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q -k issue_workflow` — locks green.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `ruff check backend/app/services/_issue_workflow backend/app/services` — clean.
7. `mypy backend/app/services/_issue_workflow backend/app/services` — clean.

#### Commit boundary

Single commit titled: `S4.1: collapse IssueWorkflowService facade; execution.py imports lifecycle directly`.

#### Rollback

- Class: **CROSS-DOMAIN** (deepening contract).
- Procedure:
  1. **Block until issues chain (#28, #30) is reverted if landed.**
  2. `git revert <SHA>` — restores facade.
  3. Drop the new test.
  4. Restore README `service.py` listing.
- Estimated revert time: 35 min.

#### Effort & Risk

- Estimated time: 3h (mechanical replacement; existing tests cover all 7 verbs).
- Risk: LOW — static-method binds are pure passthroughs.
- Mitigations: existing test_issue_workflow.py covers all 7 lifecycle verbs.

---

### Item #26 — #20 — Risk ID generation co-location (DOC-ONLY)

**Wave**: 3  | **Slot**: v2 Seq 27  | **Effort**: S (≤2h)  | **Priority**: P2  | **Domain**: risks

**Dependencies**: none  
**Atomic with**: none  
**Validator?**: no

#### Why this work

`backend/app/api/v1/endpoints/risks/id_generation.py:7` defines `async def generate_risk_id_code(db, process)`. Package re-export at `risks/__init__.py:3` is **load-bearing** for two regression tests (`test_risks.py:556`, `test_risk_id_generation.py:13`). Phase 2-B verdict: CORRECT-WITH-CORRECTION — DOC-ONLY; no source edits. The recipe adds a structural ratchet test that fails the moment a future cleanup deletes the re-export. Audit ID = #20 (S1.6); developer verdict = ACCEPT (DOC-ONLY).

#### Pre-flight checklist

- [ ] Verify slot in master sequence: v2 Seq 27 (`plan-loop-3-07-integration-v2.md:370`).
- [ ] Confirm prerequisites complete: none.
- [ ] Read latest state of `backend/app/api/v1/endpoints/risks/id_generation.py:7`, `backend/app/api/v1/endpoints/risks/__init__.py:3,8`, `backend/app/api/v1/endpoints/risks/crud/create.py:19`, `backend/scripts/migrate_risks.py:16`.
- [ ] Read tests at `tests/backend/pytest/test_risks.py:556`, `tests/backend/pytest/test_risk_id_generation.py:13`.
- [ ] Read `docs/agent/ENDPOINT_INVARIANTS.md:11-14,21-22`.
- [ ] No concurrent feature-work conflicts.

#### TDD Step 1 — Write Failing Test (RED)

**Test file**: `tests/backend/pytest/architecture/test_risks_required_reexports_red.py`
**Pytestmark**: `pytestmark = pytest.mark.contract`

```python
"""Lock the load-bearing risks package re-export of generate_risk_id_code."""
from __future__ import annotations

import importlib
import re
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]


def test_generate_risk_id_code_is_re_exported_from_risks_package() -> None:
    pkg = importlib.import_module("app.api.v1.endpoints.risks")
    deep = importlib.import_module(
        "app.api.v1.endpoints.risks.id_generation"
    )
    assert getattr(pkg, "generate_risk_id_code") is deep.generate_risk_id_code


def test_generate_risk_id_code_listed_in_package_all() -> None:
    pkg = importlib.import_module("app.api.v1.endpoints.risks")
    assert "generate_risk_id_code" in getattr(pkg, "__all__", ())


def test_two_or_more_test_files_use_package_facade_import() -> None:
    pattern = re.compile(
        r"from\s+app\.api\.v1\.endpoints\.risks\s+import\s+generate_risk_id_code"
    )
    matches = []
    for path in (REPO_ROOT / "tests/backend/pytest").rglob("*.py"):
        if pattern.search(path.read_text(encoding="utf-8")):
            matches.append(str(path.relative_to(REPO_ROOT)))
    assert len(matches) >= 2, matches


def test_endpoint_invariants_doc_pins_required_reexport() -> None:
    invariants = (
        REPO_ROOT / "docs/agent/ENDPOINT_INVARIANTS.md"
    ).read_text(encoding="utf-8")
    assert (
        "app.api.v1.endpoints.risks.generate_risk_id_code" in invariants
    )
```

**Expected result**: PASS-today (the contract is already satisfied; the test is a forward-facing ratchet).

Run:
```
pytest tests/backend/pytest/architecture/test_risks_required_reexports_red.py -q
```
All 4 assertions pass.

#### TDD Step 2 — Implement Change (DOC-ONLY)

**Files to edit**:
- `docs/agent/ENDPOINT_INVARIANTS.md` — bump verification date stanza (currently `:21-22 Verification date: / 2026-02-16`) to `2026-05-09`.
- `.planning/audits/_context/02-backend-endpoints.md` — add note: risks package facade re-export is load-bearing for `test_risks.py:556` and `test_risk_id_generation.py:13`. Future cleanup that removes the re-export must first migrate both tests.
- `.planning/audits/_context/06-test-surface.md` — add one-line pointer to the two tests that depend on the package facade.

**Files to create**:
- The new architecture test (above).

**Files to delete**:
- None (DOC-ONLY).

#### TDD Step 3 — Confirm GREEN

```
pytest tests/backend/pytest/architecture/test_risks_required_reexports_red.py -q
```
Already green; ratchet locks the contract.

#### Lock/TOML/Contract updates (same commit)

- New architecture lock IS the contract.
- No TOML allowlist edits (no `_archive_allowlist.toml`, `_naming_allowlist.toml`, `_capabilities_all_allowlist.toml`, `_endpoint_commit_allowlist.toml` mention required).

#### README / doc updates (same commit)

- `docs/agent/ENDPOINT_INVARIANTS.md:21-22` — date bump.
- `.planning/audits/_context/02-backend-endpoints.md` — note.
- `.planning/audits/_context/06-test-surface.md` — pointer.

#### Verification commands (run all in order)

1. `pytest tests/backend/pytest/architecture/test_risks_required_reexports_red.py -q` — must be green.
2. `pytest tests/backend/pytest/test_risks.py -q` — sanity.
3. `pytest tests/backend/pytest/test_risk_id_generation.py -q` — sanity.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.

#### Commit boundary

Single commit titled: `docs(risks): lock generate_risk_id_code package re-export contract`.

#### Rollback

- Class: **DOC-ONLY**.
- Procedure:
  1. Delete the test file; revert doc edits.
  2. No source code touched.
- Estimated revert time: 5 min.

#### Effort & Risk

- Estimated time: ≤2h (test + 3 doc updates + verification).
- Risk: very low — DOC-ONLY; ratchet is pure forward-facing pin.
- Mitigations: 4-assertion test catches any future cleanup that removes the re-export.

---

End of Section 3 — Per-Item Recipes (Items 1-26) — final, Phase 6 corrections applied.
