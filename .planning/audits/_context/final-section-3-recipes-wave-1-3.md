# Final Resolution Plan — Section 3: Per-Item Recipes Part 1 (Waves 1-3, Slots 1-28)

**Build commit ref**: `1ee872a4` (`main`).
**Today**: 2026-05-09.
**Sources**:
- v2 master sequence: `.planning/audits/_context/plan-loop-3-07-integration-v2.md`.
- Final Section 2 (master sequence + wave structure): `.planning/audits/_context/final-section-2-sequence.md`.
- Phase 5 recipes: `recipe-01-issues.md` … `recipe-08-crosscut-adrs.md`.
- Phase 6 corrections: `verify-recipe-01..08-*.md`.

This section harvests the per-item recipes for the first 28 sequence slots
(Waves 1, 2, and 3) and applies every Phase 6 correction noted in the
verification reports. Each recipe carries the same shape: pre-flight checks,
TDD red→green steps, lock/TOML/contract updates, README/doc updates, ordered
verification commands, commit boundary, rollback class + procedure, and risk
notes.

---

## Wave 1-3 Introduction — Goals and Cadence

### Wave 1 — ADRs Ratified (Slots 1-4, ~14 dev-hours, Week 1)

- **Items in scope (slots 1-4)**: #72 (ADR-011 Auth Scheme & Session Model),
  #73 (ADR-012 KRI Time-Series Period Algebra), #74a (ADR-007 amendment —
  31-package census), #10 (Reject keep `riskhub_questionnaires.py` with
  presence-lock; the early-Wave-1 doc-cluster placeholder).
- **Goal**: Land all architecture decisions BEFORE any code lands. Three new
  ADRs publish their canonical statements; one doc-only Reject decision adds
  a presence-lock so a future "0 routes" audit cannot delete the live
  questionnaire send route.
- **Doc focus**: 3 ADRs + 5 new TOMLs (`_bounded_context_*.toml`) + 8+ new
  architecture-lock tests pinning the new contracts.
- **Validator runs**: 0 (Wave 1 is doc + lock only; no production code touched).
- **Why Wave 1 first**: ADRs unblock dependents. #72 gates #76 (auth/ commit
  migration in Wave 2); #74a gates #74b (amendment text in Wave 5);
  ADR-012 ratifies the rule that the eventual KRI deadline-service collapse
  enforces. #10's presence-lock prevents future regressions.

### Wave 2 — P1 Quick Wins + #76 Auth Migration (Slots 5-14, ~44 dev-hours, Weeks 2-3)

- **Items in scope (slots 5-14)**: #57 (Reject keep
  `quarterly_comparison_service.py` facade), #37 (governance mirror swap),
  #12 (`users/summary` blanket-except narrow), #13 (`vendor_link_helpers`
  shim drop), #1 (`validate_risk_type` re-export drop), #19 (risk-type
  validation onto service policy), #11 (`risk.process` → `risk.name`
  truth-in-naming), #14 (issues outbox-only notification cleanup), #15
  (`access_user` capability surface), #76 (8-site auth/ commit migration).
- **Goal**: Address every P1 audit-finding plus the deadline-sensitive #76
  (2026-09-01 commit-allowlist expiration). The `users/summary.py` 3-way
  overlap (#37 → #12 → #34) starts here in the recommended order; #34
  lands later in Wave 5.
- **Validator runs**: 4 (#13, #15, #37 directly touch the capability
  contract; #76 indirectly via `_endpoint_commit_allowlist.toml` removals).
- **Critical Wave**: #76 lands ~Week 3 (calendar 2026-05-23) — 14 weeks
  before the 2026-09-01 expiration. The P3→P1 promotion in Q-E buys
  ≥6 weeks of buffer.

### Wave 3 — P2 Dead-code A (Slots 15-28, ~56 dev-hours, Weeks 4-5)

- **Items in scope (slots 15-28)**: #2 (issue underscore aliases), #3
  (`kriFormWorkflow.ts` delete), #4 (`controlFormWorkflow.ts` delete), #5
  (`orphanResolutionPresentation.ts` delete), #6 (`notifications/resourcePath.ts`
  delete), #7 (`_get_approval_department_id` shim delete), #41 (issue-workflow
  bidirectional aliases), #50 (`_kri_history/submission.py` wrapper),
  #52 (`_kri_history/correction_plans.py` wrapper), #53 (`IssueWorkflowService`
  facade collapse), #54 (`_approval_queue/lifecycle.py` inline), #75
  (`_auto_reject_kri_approval` consolidate), #18 (endpoint
  `_build_approval_read` repoint-and-delete), #20 (Risk ID co-location
  DOC-ONLY).
- **Goal**: Maximize file-deletion velocity. Quick S-effort wins maintain
  momentum after the heavier Wave 2.
- **Validator runs**: 0 (none of these touch the capability contract).
- **Heart of dead-code phase A**: 14 items totalling 56 dev-hours; every
  item carries an architecture lock to prevent regressions.

### Cross-wave conventions

- All new architecture tests carry `pytestmark = pytest.mark.contract`.
- Backend integration tests use `client_factory` from
  `tests/backend/pytest/conftest.py`; local `dependency_overrides[get_db]`
  blocks require an entry in `_get_db_override_whitelist.toml`.
- Lock TOMLs touched include `_archive_allowlist.toml`,
  `_naming_allowlist.toml`, `_capabilities_all_allowlist.toml`, and
  `_endpoint_commit_allowlist.toml`.
- Capability-contract changes coordinate with
  `docs/security/authorization-capability-contract.{md,json}` and
  `docs/security/capability-catalog.json`.
- Quote rule: every cited code snippet ≤ 15 words.

---

## Phase 6 Corrections Applied (Wave 1-3 scope)

The recipes below incorporate the empirical corrections from
`verify-recipe-01..08-*.md`:

| Item | Phase 6 correction |
|---|---|
| #74a | "Exactly 31 packages" wording → "31 today, 32 after #61"; `_orphaned_items` and `_notification_inbox` paired with `_identity_access_lifecycle` (NOT `_admin_telemetry`); allowlist filename uses `cross_cutting` (NOT `core`). |
| #10  | FE caller path corrected: `frontend/src/services/riskHubApi.ts:308-310` (NOT `services/api/riskHubApi.ts`). |
| #15  | New Zod schema tightens the existing TS-optional drift: the FE has `capabilities?` optional today; the new Zod schema in #15 makes it required, closing the drift. |
| #41  | Recipe extended to ALSO edit `backend/app/api/v1/endpoints/issues/_shared/serialization.py:18,30` (Phase 6 V1 caught: endpoint barrel imports `_active_exception` and would break post-rename). |
| #76  | 8 commit sites verified at exact (file, line) tuples (`auth/sso.py:170`, `auth/refresh.py:177`, `auth/logout.py:101,132`, `auth/_sso_helpers.py:48`, `auth/password.py:128,161`, `auth/demo.py:67`); `_endpoint_commit_allowlist.toml` already carries 8 entries with `expires_at = "2026-09-01"`. |

(#43, #8, and #22 are in Waves 4-5, not in this section's scope.)

---

## Wave 1 — ADR Ratification (Slots 1-4)

### Item #1 — #72 — ADR-011: Auth Scheme and Session Model

**Sequence**: Wave 1, slot 1. **Effort**: M (6-8h). **Priority**: P1. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 1 (`final-section-2-sequence.md:34`).
- [ ] Read latest state of `backend/app/core/security.py:107-136`, `backend/app/core/security.py:170` (the `require_permission` factory cited by ADR-011), and `backend/app/api/v1/endpoints/auth/{sso.py,refresh.py,logout.py,password.py,_sso_helpers.py,demo.py}`.
- [ ] Read `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` (already carries 8 auth entries with `expires_at = "2026-09-01"`).
- [ ] No concurrent feature work touches `backend/app/core/security.py` or `backend/app/api/v1/endpoints/auth/`.
- [ ] `pytest tests/backend/pytest/architecture/ -q` baseline passes.

**TDD Step 1 — Write Failing Test (RED)**

Files (4 new architecture lock tests):
- `tests/backend/pytest/architecture/test_w12_auth_idiom_ratchet_red.py`
- `tests/backend/pytest/architecture/test_w12_get_current_user_isolation_red.py`
- `tests/backend/pytest/architecture/test_w12_mock_auth_guard_red.py`
- `tests/backend/pytest/architecture/test_w12_sso_token_exchange_boundary_red.py`

Each test starts with `pytestmark = pytest.mark.contract`.

```python
# tests/backend/pytest/architecture/test_w12_auth_idiom_ratchet_red.py
from __future__ import annotations
import ast, tomllib
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ENDPOINTS = REPO_ROOT / "backend/app/api/v1/endpoints"
BASELINE = Path(__file__).parent / "_auth_idiom_baseline.toml"

def _count_legacy_idioms(root: Path) -> dict[str, int]:
    body_calls, inline_403 = 0, 0
    for path in root.rglob("*.py"):
        try:
            tree = ast.parse(path.read_text())
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                fn = node.func
                name = (fn.id if isinstance(fn, ast.Name)
                        else fn.attr if isinstance(fn, ast.Attribute) else None)
                if name and name.startswith("_require_"):
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
    assert current["body_call_require"] <= baseline["body_call_require"]
    assert current["inline_403"] <= baseline["inline_403"]
```

```python
# tests/backend/pytest/architecture/test_w12_get_current_user_isolation_red.py
from __future__ import annotations
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

def test_mock_auth_branch_is_guarded_by_two_conjuncts() -> None:
    tree = ast.parse(SECURITY.read_text())
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            target = ast.unparse(node.targets[0])
            if target == "mock_auth_enabled":
                value = ast.unparse(node.value)
                if "mock_auth_enabled" in value and "debug" in value and " and " in value:
                    return
    raise AssertionError("mock-auth fallback must be gated by mock_auth_enabled AND debug")
```

```python
# tests/backend/pytest/architecture/test_w12_sso_token_exchange_boundary_red.py
from __future__ import annotations
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SSO = REPO_ROOT / "backend/app/api/v1/endpoints/auth/sso.py"
HELPERS = REPO_ROOT / "backend/app/api/v1/endpoints/auth/_sso_helpers.py"

def test_sso_module_calls_exchange_helper() -> None:
    sso_text = SSO.read_text()
    assert (
        "from app.api.v1.endpoints.auth._sso_helpers" in sso_text
        or "from .._sso_helpers" in sso_text
    )
    helpers_text = HELPERS.read_text()
    assert "create_access_token" in helpers_text or "create_refresh_token" in helpers_text
```

Expected: RED. Run:
```
pytest tests/backend/pytest/architecture/test_w12_auth_idiom_ratchet_red.py tests/backend/pytest/architecture/test_w12_get_current_user_isolation_red.py tests/backend/pytest/architecture/test_w12_mock_auth_guard_red.py tests/backend/pytest/architecture/test_w12_sso_token_exchange_boundary_red.py -q
```
Tests fail because the baseline TOML, the isolation invariant, and the SSO boundary lock are not yet asserted.

**TDD Step 2 — Implement Change**

Files to create:
- `docs/adr/ADR-011-auth-scheme-and-session-model.md` — full ADR text per `recipe-08-crosscut-adrs.md:316-376`. Decision states `require_permission(resource, action)` is canonical (defined at `backend/app/core/security.py:170` per Phase 6 Probe 1 fix). Cross-refs ADR-001/002/003/004 (NOT ADR-006 — Phase 4 REJECT). Includes `## SSO Token-Exchange Boundary` subsection.
- `tests/backend/pytest/architecture/_auth_idiom_baseline.toml` — captures current counts of body-call `_require_*` and inline-403 raises (the lock asserts non-increasing).
- The 4 new architecture lock tests above.

Files to edit:
- None. ADR + locks only; no production code touched in #72.

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

After ADR-011 lands and the baseline TOML captures today's count:
```
pytest tests/backend/pytest/architecture/test_w12_*_red.py -q
```
All 4 tests pass.

**Lock/TOML/Contract Updates (same commit)**:
- `tests/backend/pytest/architecture/_auth_idiom_baseline.toml` — new file with `body_call_require = N` and `inline_403 = M` reflecting today's counts.
- Existing lock at `tests/backend/pytest/architecture/test_w5_endpoint_commit_ratchet_red.py::test_auth_commit_allowlist_entries_are_complete_and_unexpired` — no edit needed; the existing date check fires on `2026-09-01` once #76 removes the entries.

**README/Doc Updates (same commit)**:
- `docs/adr/README.md` (if present) — append ADR-011 row to the index.
- `AGENTS.md` — cross-reference ADR-011 next to ADR-002 in the auth-flow section.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_w12_auth_idiom_ratchet_red.py -q` — must pass.
2. `pytest tests/backend/pytest/architecture/test_w12_get_current_user_isolation_red.py -q` — must pass.
3. `pytest tests/backend/pytest/architecture/test_w12_mock_auth_guard_red.py -q` — must pass.
4. `pytest tests/backend/pytest/architecture/test_w12_sso_token_exchange_boundary_red.py -q` — must pass.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
7. `ruff check tests/backend/pytest/architecture/test_w12_*_red.py` — clean.
8. `mypy tests/backend/pytest/architecture/test_w12_*_red.py` — clean.

**Commit Boundary**: single commit.
**Title**: `docs(adr): land ADR-011 auth scheme and session model with 4 invariant locks`.

**Rollback** (class: DOC-ONLY + LOCK-RATCHET):
1. `git revert <SHA>` to remove ADR-011, the 4 lock tests, and the baseline TOML.
2. No production code change to revert (none was made).
3. Re-run `make -f scripts/Makefile test-architecture-locks` — must pass without the new locks.
4. Estimated revert time: 10 min.

**Risk Notes**: LOW — doc + lock only; no runtime code touched. Mitigation: baseline TOML captures today's counts so the lock ratchet is empirically grounded. #76 (Wave 2) drives the counts to 0 inside the auth/ subtree.

---

### Item #2 — #73 — ADR-012: KRI Time-Series Period Algebra

**Sequence**: Wave 1, slot 2. **Effort**: M (6-8h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 2 (`final-section-2-sequence.md:35`).
- [ ] Read latest state of `backend/app/services/_kri_history/periods.py:21,50,59,87,109`.
- [ ] Read `backend/app/services/_kri_history/constants.py:2` (canonical `REPORTING_GRACE_DAYS = 15`).
- [ ] Read `backend/app/services/_config/lookup.py:26` (the duplicate `REPORTING_GRACE_DAYS`).
- [ ] Read `backend/app/services/kri_deadline_service.py:64,77,78` (call sites that #71 will eventually collapse).
- [ ] No concurrent feature work touches `_kri_history/` or `kri_deadline_service.py`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_kri_period_algebra_ssot_red.py`

```python
from __future__ import annotations
import ast
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
PERIODS = REPO_ROOT / "backend/app/services/_kri_history/periods.py"

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
    assert offenders == [], f"ADR-012 forbids duplicate definitions: {offenders}"

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
    assert offenders == [], f"ADR-012 forbids duplicate REPORTING_GRACE_DAYS: {offenders}"
```

Expected: RED today (the duplicate at `_config/lookup.py:26` triggers the second assertion).

The lock test for #73 uses **Option B** (deferred): the test file is created in #71 (Section 6) when the duplicate is actually removed. For Wave 1, ship ADR-012 as **doc-only** so the test never enters an intermediate RED state. (Option A — landing the test xfail-tagged in #73 — is documented in `recipe-08-crosscut-adrs.md` but rejected for cleaner wave separation.)

Run baseline:
```
pytest tests/backend/pytest -q -k "kri" --collect-only > /tmp/kri-pre.txt
```

**TDD Step 2 — Implement Change**

Files to create:
- `docs/adr/ADR-012-kri-time-series.md` — full ADR text per `plan-loop-3-06-adr-drafts.md:94-158`. Decision pins `_kri_history/periods.py` as canonical, `_kri_history/constants.py:2` as the SSOT for `REPORTING_GRACE_DAYS = 15`, and the 5-state vocabulary (`new`, `not_submitted`, `breach`, `warning`, `optimal`). Cross-refs ADR-007 (bounded contexts), ADR-008 (SSOT pattern), ADR-009 (alias deprecation window).

Files to edit:
- None for #73. The implementation work (collapsing `kri_deadline_service.py:64,77,78` and removing `_config/lookup.py:26 ConfigDefaults.REPORTING_GRACE_DAYS`) lands in #71's recipe in Section 6.

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

ADR-012 establishes the rule. Wave 1 ships doc-only:
```
pytest tests/backend/pytest -q -k "kri" --collect-only > /tmp/kri-post.txt
diff /tmp/kri-pre.txt /tmp/kri-post.txt   # no test surface change
```

**Lock/TOML/Contract Updates (same commit)**:
- None for #73 in Wave 1 (Option B). The SSOT lock + collapse ships in #71 (Section 6).

**README/Doc Updates (same commit)**:
- `docs/adr/README.md` (if present) — append ADR-012 row to the index.
- `docs/BUSINESS_LOGIC.md:758` — cross-reference ADR-012 if §2.3 (KRI state vocabulary) is cited there.

**Verification Commands** (in order):
1. `make -f scripts/Makefile test-architecture-locks` — locks green (no new lock added per Option B).
2. `pytest tests/backend/pytest -q -k "kri"` — broad KRI suite green.
3. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
4. `ruff check docs/adr/ADR-012-kri-time-series.md` — N/A for ADR Markdown.

**Commit Boundary**: single commit.
**Title**: `docs(adr): land ADR-012 KRI time-series period algebra and deadline classification`.

**Rollback** (class: DOC-ONLY):
1. `git revert <SHA>` to remove ADR-012.
2. No production code change to revert.
3. Estimated revert time: 5 min.

**Risk Notes**: LOW — doc only; no runtime code touched in Wave 1. Mitigation: lock test deferred to #71 (Section 6) where the duplicate is actually removed, avoiding intermediate RED state.

---

### Item #3 — #74a — ADR-007 amendment: 31-package census + 5-TOML classification

**Sequence**: Wave 1, slot 3. **Effort**: XL (26-30h). **Priority**: P3. **Atomic with**: none (paired with #74b in Wave 5). **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 3 (`final-section-2-sequence.md:36`).
- [ ] Run `ls -d backend/app/services/_*/ | grep -v __pycache__ | wc -l` — must return 31 (Phase 6 #74a counts confirmed: 31 packages today, 32 after #61 lands).
- [ ] Read each of the 31 package `__init__.py` files to verify primary classification.
- [ ] Read `docs/adr/ADR-007-bounded-context-taxonomy.md` (current ADR base).
- [ ] No concurrent feature work touches `backend/app/services/`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py`

```python
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
    assert unclassified == set(), f"ADR-007 amendment: unclassified packages: {unclassified}"

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
    """Phase 6: 31 today, 32 after #61 lands; lock asserts >= 31."""
    pkgs = _underscored_packages()
    assert len(pkgs) >= 31, (
        f"expected >= 31 underscored packages today; 32 after #61 lands; got {len(pkgs)}"
    )
```

Expected: RED. The 5 TOMLs do not yet exist; lock fires on missing files.

**TDD Step 2 — Implement Change**

Files to create (5 new TOMLs):
- `tests/backend/pytest/architecture/_bounded_context_write_side.toml` — 7 canonical write-side contexts.
- `tests/backend/pytest/architecture/_bounded_context_read_shape.toml` — 6 read-shape (incl. `_register_listings` dual + `_monitoring_response.py` file entry).
- `tests/backend/pytest/architecture/_bounded_context_workflow_pairs.toml` — 11 pairs (Phase 6 correction: `_orphaned_items` and `_notification_inbox` pair with `_identity_access_lifecycle`).
- `tests/backend/pytest/architecture/_bounded_context_adapters.toml` — 6 adapters (`_directory_identity`, `_directory_sync`, `_graph_directory` (planned-package, post-#61 comment), `_admin_telemetry`, `_activity_log_query`, `_auth_session`).
- `tests/backend/pytest/architecture/_bounded_context_cross_cutting.toml` — 2 cross-cutting (`_authorization_capabilities`, `_config`). Phase 6 correction: filename uses `cross_cutting` (NOT `core`).

Sample for write-side:
```toml
# _bounded_context_write_side.toml
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

Sample for adapters (Phase 6 #74a wording):
```toml
# _bounded_context_adapters.toml
packages = [
    "_directory_identity",
    "_directory_sync",
    "_graph_directory",  # planned-package; created by #61 (Wave 4 Seq 44).
    "_admin_telemetry",
    "_activity_log_query",
    "_auth_session",
]
```

Sample for workflow-pairs (Phase 6 correction):
```toml
# _bounded_context_workflow_pairs.toml
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
right = "_identity_access_lifecycle"  # Phase 6 correction.

[[pairs]]
left = "_notification_inbox"
right = "_identity_access_lifecycle"  # Phase 6 correction.
```

Files to also create (4 architecture lock tests):
- `tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py` (above).
- `tests/backend/pytest/architecture/test_w13_read_shape_no_commit_red.py` — asserts read-shape packages do not call `await db.commit()`.
- `tests/backend/pytest/architecture/test_w13_adapter_exception_translation_red.py` — asserts adapter packages translate external errors to `DomainError`.
- `tests/backend/pytest/architecture/test_w13_cross_cutting_ssot_red.py` — asserts cross-cutting packages bind to ADR-001 / ADR-008 SSOT chains.

Files to edit:
- None.

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py tests/backend/pytest/architecture/test_w13_*_red.py -q
```
All 4 tests pass once TOMLs are populated.

**Lock/TOML/Contract Updates (same commit)**:
- 5 new TOMLs (above) plus 4 new architecture lock tests.
- `_graph_directory` is pre-listed in `_bounded_context_adapters.toml` with a "post-#61" comment per Phase 6 #74a wording — the disjointness lock allows this because it accepts the package once it exists; the `_at_least_31` test enforces "≥ 31 today; 32 after #61 lands".

**README/Doc Updates (same commit)**:
- `tests/backend/pytest/architecture/README.md` (if present) — index the 5 new TOMLs.
- `AGENTS.md:170-180` (Architecture Locks section) — cross-reference the disjointness lock.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_w7_bounded_context_disjointness.py -q` — must pass.
2. `pytest tests/backend/pytest/architecture/test_w13_*_red.py -q` — must pass.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `ruff check tests/backend/pytest/architecture/` — clean.
6. `mypy tests/backend/pytest/architecture/` — clean.

**Commit Boundary**: single commit.
**Title**: `feat(architecture): classify 31 underscore packages into 5 bounded-context allowlists (ADR-007 census)`.

**Rollback** (class: CROSS-DOMAIN; lock-ratchet + 5 TOMLs + 4 tests):
1. `git revert <SHA>` to remove the 5 TOMLs and 4 tests.
2. Re-run `make -f scripts/Makefile test-architecture-locks` — confirm legacy state.
3. Estimated revert time: 15 min.

**Risk Notes**: MEDIUM — broad surface; misclassification could cascade. Mitigations: read each `__init__.py` before classifying; ADR-007 amendment text (#74b, Wave 5) cross-references the table; disjointness lock catches drift. Phase 6 correction confirmed `_orphaned_items`/`_notification_inbox` pair with `_identity_access_lifecycle` (NOT `_admin_telemetry`).

---

### Item #4 — #10 — KEEP `riskhub_questionnaires.py` with presence-lock (Reject; doc-only)

**Sequence**: Wave 1, slot 4. **Effort**: S (≤2h). **Priority**: P1. **Atomic with**: none (presence-lock gates #38 in Wave 5). **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 4 (`final-section-2-sequence.md:37`).
- [ ] Read latest state of `backend/app/api/v1/endpoints/riskhub_questionnaires.py:37` (`@router.post("/batch-send", ...)`).
- [ ] Phase 6 path correction: confirm `frontend/src/services/riskHubApi.ts:308-310` (NOT `services/api/riskHubApi.ts`) — call site for the live route.
- [ ] Read `frontend/src/components/risks/RiskQuestionnairesPanel.tsx:257` (Send button → `riskHubApi.ts:308-310` → `riskhub_questionnaires.py:37`).
- [ ] No concurrent feature work touches `riskhub_questionnaires.py`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py`

```python
"""Lock that riskhub_questionnaires.py exists and exposes its router."""
from __future__ import annotations
import importlib
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
MODULE_PATH = REPO_ROOT / "backend/app/api/v1/endpoints/riskhub_questionnaires.py"

def test_module_file_exists() -> None:
    assert MODULE_PATH.is_file(), "Audit #10 REJECT: module is load-bearing; do not delete"

def test_module_exposes_router_with_batch_send_route() -> None:
    mod = importlib.import_module("app.api.v1.endpoints.riskhub_questionnaires")
    assert hasattr(mod, "router")
    paths = {getattr(r, "path", "") for r in mod.router.routes}
    assert any("batch-send" in p for p in paths), "live route lost"
```

Expected: GREEN today (the contract is already satisfied — the test is a forward-facing ratchet). Run:
```
pytest tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py -q
```

**TDD Step 2 — Implement Change**

Files to create:
- `tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py` (above).

Files to edit:
- `docs/agent/ENDPOINT_INVARIANTS.md` — add a stanza pinning the module + the FE caller chain (`RiskQuestionnairesPanel.tsx:257` → `riskHubApi.ts:308-310` → `riskhub_questionnaires.py:37`). Phase 6 path drift correction baked in.
- `.planning/audits/_context/02-backend-endpoints.md` — add note: `riskhub_questionnaires.py` rejection rationale + presence-lock cross-ref.

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py -q
```
Both assertions already pass; the lock pins the contract.

**Lock/TOML/Contract Updates (same commit)**:
- New presence-lock test IS the contract.
- No TOML allowlist edit required.

**README/Doc Updates (same commit)**:
- `docs/agent/ENDPOINT_INVARIANTS.md` — invariant stanza added with verification date `2026-05-09`.
- `.planning/audits/_context/02-backend-endpoints.md` — note row appended.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py -q` — must pass.
2. `pytest tests/backend/pytest -q -k "questionnaire"` — sanity (existing tests green).
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check tests/backend/pytest/architecture/test_riskhub_questionnaires_module_present_red.py` — clean.

**Commit Boundary**: single commit.
**Title**: `docs(endpoints): lock riskhub_questionnaires presence (audit #10 REJECT, doc-only)`.

**Rollback** (class: DOC-ONLY):
1. Delete the test file; revert doc edits.
2. No source code touched.
3. Estimated revert time: 5 min.

**Risk Notes**: VERY LOW — DOC-ONLY ratchet; pure forward-facing pin. Phase 6 path correction guards against a future refactor that breaks the FE call chain. Presence-lock gates #38 in Wave 5: when #38 moves the inline Pydantic models, the lock guarantees the route survives.

---

## Wave 2 — P1 Quick Wins + #76 Auth Migration (Slots 5-14)

### Item #5 — #57 — KEEP `quarterly_comparison_service.py` facade (Reject; doc-only)

**Sequence**: Wave 2, slot 5. **Effort**: S (≤2h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 5 (`final-section-2-sequence.md:38`).
- [ ] Read latest state of `backend/app/services/quarterly_comparison_service.py:1-12`.
- [ ] Read `backend/app/services/_quarterly_comparison/__init__.py` (the canonical implementation home — facade re-exports from here).
- [ ] No concurrent feature work touches the facade module.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_quarterly_comparison_facade_present_red.py`

```python
"""Lock the quarterly comparison facade re-export contract."""
from __future__ import annotations
import importlib
import pytest

pytestmark = pytest.mark.contract

def test_facade_module_present_and_re_exports_canonical() -> None:
    facade = importlib.import_module("app.services.quarterly_comparison_service")
    canonical = importlib.import_module("app.services._quarterly_comparison")
    # Facade must re-export the public surface verbatim.
    for name in getattr(canonical, "__all__", ()):
        assert hasattr(facade, name), f"facade missing canonical re-export: {name}"
```

Expected: GREEN today (already satisfied). The test is a forward-facing ratchet preventing accidental deletion.

**TDD Step 2 — Implement Change**

Files to create:
- `tests/backend/pytest/architecture/test_quarterly_comparison_facade_present_red.py` (above).

Files to edit:
- `backend/app/services/quarterly_comparison_service.py` — add a docstring header citing audit #57 verdict (Reject — facade is load-bearing for backwards compat with existing call sites).
- `.planning/audits/_context/01-backend-services.md` — add note: facade is intentionally kept for compat; lock test pins the contract.

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_quarterly_comparison_facade_present_red.py -q
```
Both assertions already pass.

**Lock/TOML/Contract Updates (same commit)**:
- New presence-lock test IS the contract.

**README/Doc Updates (same commit)**:
- `backend/app/services/quarterly_comparison_service.py` — docstring stating "Re-export facade per audit #57 (Reject)".
- `.planning/audits/_context/01-backend-services.md` — note row.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_quarterly_comparison_facade_present_red.py -q` — must pass.
2. `pytest tests/backend/pytest -q -k "quarterly"` — sanity.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/services/quarterly_comparison_service.py` — clean.

**Commit Boundary**: single commit.
**Title**: `docs(services): lock quarterly_comparison_service facade (audit #57 REJECT)`.

**Rollback** (class: DOC-ONLY):
1. Delete test; revert docstring + note.
2. Estimated revert time: 5 min.

**Risk Notes**: VERY LOW — DOC-ONLY ratchet. Mitigations: facade is a 1-line re-export; lock test enforces continued re-export.

---

### Item #6 — #37 — Replace `_can_view_governance` mirror with canonical `build_me_capabilities`

**Sequence**: Wave 2, slot 6. **Effort**: S (3-4h). **Priority**: P1. **Atomic with**: none (soft sequencing pair `#37 → #12 → #34`). **Validator**: yes.

**Dependencies (must be complete first)**: none (soft: lands ahead of #12 to honor Correction A `#37 → #12 → #34`)

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 6 (`final-section-2-sequence.md:39`).
- [ ] Read latest state of `backend/app/api/v1/endpoints/users/summary.py:24-26,45-50` (the FE-mirroring `_can_view_governance` helper).
- [ ] Read `backend/app/services/_authorization_capabilities/__init__.py` (canonical `build_me_capabilities` location).
- [ ] Read `frontend/src/auth/useAuthz.ts` (FE consumer to confirm contract shape).
- [ ] No concurrent feature work touches `users/summary.py` or `_authorization_capabilities/`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_users_summary_uses_canonical_capabilities_red.py`

```python
"""S7.10: users/summary delegates to build_me_capabilities, not local mirror."""
from __future__ import annotations
import inspect
import pytest

pytestmark = pytest.mark.contract

def test_users_summary_imports_canonical_builder() -> None:
    from app.api.v1.endpoints.users import summary
    src = inspect.getsource(summary)
    assert "build_me_capabilities" in src, "must consume canonical builder"
    assert "_can_view_governance" not in src, "FE-mirror must be deleted"

def test_no_residual_can_view_governance_definition() -> None:
    from app.api.v1.endpoints.users import summary
    assert not hasattr(summary, "_can_view_governance")
```

Expected: RED. `_can_view_governance` exists today.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/api/v1/endpoints/users/summary.py:24-26` — delete the `_can_view_governance` helper definition.
- `backend/app/api/v1/endpoints/users/summary.py:45-50` — replace inline call site with `await build_me_capabilities(db, current_user)` from `app.services._authorization_capabilities`.
- `backend/app/api/v1/endpoints/users/summary.py:1-10` — drop now-unused imports; add `from app.services._authorization_capabilities import build_me_capabilities`.
- `docs/security/authorization-capability-contract.md` — note that `users/summary` consumes the canonical builder (one-line addition under the AUTHZ-USERS row).
- `docs/security/authorization-capability-contract.json` — sync the corresponding JSON entry.

Files to create:
- `tests/backend/pytest/architecture/test_users_summary_uses_canonical_capabilities_red.py` (above).

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_users_summary_uses_canonical_capabilities_red.py -q
pytest tests/backend/pytest/api/v1/test_users_summary.py -q
```
Both pass.

**Lock/TOML/Contract Updates (same commit)**:
- `docs/security/authorization-capability-contract.{md,json}` — AUTHZ-USERS row updated.
- `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml` — no allowlist change required (canonical builder already covered).

**README/Doc Updates (same commit)**:
- `docs/security/authorization-capability-contract.md` — add line under AUTHZ-USERS noting `users/summary` delegates to `_authorization_capabilities/__init__.py::build_me_capabilities`.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_users_summary_uses_canonical_capabilities_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_users_summary.py -q` — must pass.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `ruff check backend/app/api/v1/endpoints/users/summary.py` — clean.
6. `mypy backend/app/api/v1/endpoints/users/summary.py` — clean.
7. `npx tsc --noEmit` — FE green (no FE consumer change).

**Commit Boundary**: single commit.
**Title**: `refactor(users): replace _can_view_governance mirror with canonical build_me_capabilities`.

**Rollback** (class: CROSS-DOMAIN with capability-contract edit):
1. `git revert <SHA>` to restore the `_can_view_governance` helper and the contract JSON/MD entries.
2. Re-run `python3 scripts/security/validate_authz_capability_contract.py` — exit 0 (legacy state).
3. Estimated revert time: 15 min.

**Risk Notes**: LOW — internal refactor; no API surface change. Mitigation: lock test forbids reintroduction; capability-contract validator runs in commit gate. Soft pair-with #12: #12 narrows blanket-except in the same file (`users/summary.py:48,62`) immediately after #37 lands.

---

### Item #7 — #12 — Narrow blanket-except in `users/summary.py`

**Sequence**: Wave 2, slot 7. **Effort**: S (≤2h). **Priority**: P1. **Atomic with**: none (soft sequencing — lands AFTER #37). **Validator**: no.

**Dependencies (must be complete first)**: #37 (soft; same-file)

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 7 (`final-section-2-sequence.md:40`).
- [ ] Read latest state of `backend/app/api/v1/endpoints/users/summary.py:48,62` (two `except Exception:` blocks).
- [ ] Confirm #37 has landed (`_can_view_governance` is gone; FE-mirror is replaced with canonical builder).
- [ ] No concurrent feature work touches `users/summary.py`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_users_summary_no_blanket_except_red.py`

```python
"""D-N3: users/summary blanket-except blocks must specify concrete exception types."""
from __future__ import annotations
import ast
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SUMMARY = REPO_ROOT / "backend/app/api/v1/endpoints/users/summary.py"

def test_no_blanket_except_in_users_summary() -> None:
    tree = ast.parse(SUMMARY.read_text())
    offenders: list[int] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ExceptHandler) and node.type is None:
            offenders.append(node.lineno)
    assert offenders == [], f"blanket-except at line(s) {offenders}; must specify type"
```

Expected: RED. Two blanket-except blocks at `:48` and `:62`.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/api/v1/endpoints/users/summary.py:48` — narrow `except Exception:` to `except (HTTPException, SQLAlchemyError):` (or the concrete types thrown by the protected block; verify pre-edit).
- `backend/app/api/v1/endpoints/users/summary.py:62` — same narrow.

Files to create:
- `tests/backend/pytest/architecture/test_users_summary_no_blanket_except_red.py` (above).

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_users_summary_no_blanket_except_red.py -q
pytest tests/backend/pytest/api/v1/test_users_summary.py -q
```
Both pass.

**Lock/TOML/Contract Updates (same commit)**:
- New architecture lock IS the contract.

**README/Doc Updates (same commit)**:
- None required (internal exception narrowing).

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_users_summary_no_blanket_except_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_users_summary.py -q` — must pass.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/api/v1/endpoints/users/summary.py` — clean.
5. `mypy backend/app/api/v1/endpoints/users/summary.py` — clean.

**Commit Boundary**: single commit.
**Title**: `D-N3: narrow blanket-except in users/summary.py`.

**Rollback** (class: TRIVIAL):
1. `git revert <SHA>` to restore the blanket-except blocks.
2. Estimated revert time: 5 min.

**Risk Notes**: LOW — exception narrowing only. Mitigation: existing tests cover error paths; lock test forbids regression.

---

### Item #8 — #13 — Delete `vendor_link_helpers.py` shim + sync capability contract

**Sequence**: Wave 2, slot 8. **Effort**: S (≤3h). **Priority**: P1. **Atomic with**: none. **Validator**: yes.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 8 (`final-section-2-sequence.md:41`).
- [ ] Read latest state of `backend/app/api/v1/endpoints/vendors/_shared/vendor_link_helpers.py:1-30` (the shim).
- [ ] Read `backend/app/services/_vendor_links/__init__.py` (canonical home).
- [ ] Run `grep -rn "from app.api.v1.endpoints.vendors._shared.vendor_link_helpers" backend/ tests/` — confirm 0 production callers (Phase 4 verified).
- [ ] No concurrent feature work touches vendor link surfaces.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_vendor_link_helpers_shim_deleted_red.py`

```python
"""S5.1/C-N2: vendor_link_helpers shim must be deleted; canonical lives in services."""
from __future__ import annotations
import importlib
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SHIM = REPO_ROOT / "backend/app/api/v1/endpoints/vendors/_shared/vendor_link_helpers.py"

def test_shim_file_removed() -> None:
    assert not SHIM.exists(), "vendor_link_helpers shim must be deleted"

def test_canonical_module_intact() -> None:
    mod = importlib.import_module("app.services._vendor_links")
    assert hasattr(mod, "load_vendor_link") or hasattr(mod, "list_vendor_links")
```

Expected: RED. The shim file still exists.

**TDD Step 2 — Implement Change**

Files to delete:
- `backend/app/api/v1/endpoints/vendors/_shared/vendor_link_helpers.py` (entire file).

Files to edit:
- Any caller that still imports from the shim path (Phase 4 verified 0 production callers; the file is purely dead). If `vendors/_shared/__init__.py` re-exports, drop those entries.
- `docs/security/authorization-capability-contract.md` — drop the `vendor_link_helpers` row from AUTHZ-VENDORS section.
- `docs/security/authorization-capability-contract.json` — sync the corresponding JSON entry.

Files to create:
- `tests/backend/pytest/architecture/test_vendor_link_helpers_shim_deleted_red.py` (above).

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_vendor_link_helpers_shim_deleted_red.py -q
pytest tests/backend/pytest -q -k "vendor_link"
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- `docs/security/authorization-capability-contract.{md,json}` — AUTHZ-VENDORS row updated (shim entry dropped).
- `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml` — drop any reference to the shim path.

**README/Doc Updates (same commit)**:
- `backend/app/api/v1/endpoints/vendors/README.md` (if present) — drop reference to `vendor_link_helpers`.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_vendor_link_helpers_shim_deleted_red.py -q` — must pass.
2. `pytest tests/backend/pytest -q -k "vendor"` — broad vendor suite green.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
5. `ruff check backend/app/api/v1/endpoints/vendors/_shared/` — clean.
6. `mypy backend/app/api/v1/endpoints/vendors/_shared/` — clean.

**Commit Boundary**: single commit.
**Title**: `S5.1/C-N2: delete vendor_link_helpers shim + sync capability contract`.

**Rollback** (class: CROSS-DOMAIN with capability-contract edit):
1. `git revert <SHA>` to restore the shim and the contract entries.
2. Re-run `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
3. Estimated revert time: 10 min.

**Risk Notes**: LOW — file is purely dead (0 production callers per Phase 4). Mitigation: lock test forbids reintroduction; validator runs in commit gate.

---

### Item #9 — #1 — Drop `validate_risk_type` re-export from risks/crud `__all__`

**Sequence**: Wave 2, slot 9. **Effort**: S (≤2h). **Priority**: P2. **Atomic with**: none (sequencing soft-prereq for #19). **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 9 (`final-section-2-sequence.md:42`).
- [ ] Read latest state of `backend/app/api/v1/endpoints/risks/crud/__init__.py` (the re-export shim).
- [ ] Read `backend/app/services/_risk_governance/risk_validation.py` (canonical home of `validate_risk_type`).
- [ ] Run `grep -rn "from app.api.v1.endpoints.risks.crud import validate_risk_type" backend/ tests/` — confirm 0 production callers.
- [ ] No concurrent feature work touches risks/crud surfaces.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_risks_crud_no_validate_risk_type_re_export_red.py`

```python
"""A-N1: risks/crud package no longer re-exports validate_risk_type."""
from __future__ import annotations
import importlib
import pytest

pytestmark = pytest.mark.contract

def test_validate_risk_type_not_in_crud_all() -> None:
    crud = importlib.import_module("app.api.v1.endpoints.risks.crud")
    assert "validate_risk_type" not in getattr(crud, "__all__", ())
    assert not hasattr(crud, "validate_risk_type"), "must not be available via crud"
```

Expected: RED. The name is currently in `__all__`.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/api/v1/endpoints/risks/crud/__init__.py` — drop `validate_risk_type` from `__all__`; remove the re-export line if present.
- `.planning/audits/_context/02-backend-endpoints.md` — note the migration (callers consume canonical via `app.services._risk_governance`).

Files to create:
- `tests/backend/pytest/architecture/test_risks_crud_no_validate_risk_type_re_export_red.py` (above).

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_risks_crud_no_validate_risk_type_re_export_red.py -q
pytest tests/backend/pytest -q -k "risk_type"
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New architecture lock IS the contract.

**README/Doc Updates (same commit)**:
- `.planning/audits/_context/02-backend-endpoints.md` — add note row.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_risks_crud_no_validate_risk_type_re_export_red.py -q` — must pass.
2. `pytest tests/backend/pytest -q -k "risk"` — broad risk suite green.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/api/v1/endpoints/risks/crud/` — clean.
5. `mypy backend/app/api/v1/endpoints/risks/crud/` — clean.

**Commit Boundary**: single commit.
**Title**: `A-N1: drop validate_risk_type re-export from risks/crud package`.

**Rollback** (class: TRIVIAL):
1. `git revert <SHA>` to restore the re-export.
2. Estimated revert time: 5 min.

**Risk Notes**: LOW — re-export drop only. Mitigations: lock test forbids regression; soft-prereq for #19 (the validation consolidation).

---

### Item #10 — #19 — Consolidate risk-type validation onto service policy

**Sequence**: Wave 2, slot 10. **Effort**: S (≤3h). **Priority**: P1. **Atomic with**: none (depends on #1). **Validator**: no.

**Dependencies (must be complete first)**: #1 (the `__all__` cleanup must land first; #19 then migrates the residual callers).

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 10 (`final-section-2-sequence.md:43`).
- [ ] Read latest state of `backend/app/api/v1/endpoints/risks/crud/create.py` (caller of `validate_risk_type`).
- [ ] Read `backend/app/services/_risk_governance/risk_validation.py:18` (canonical helper).
- [ ] Run `grep -rn "validate_risk_type" backend/ tests/` and enumerate remaining callers.
- [ ] Confirm #1 has landed (re-export removed).
- [ ] No concurrent feature work touches risks/crud or `_risk_governance`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_risk_type_validation_canonical_red.py`

```python
"""S1.4: validate_risk_type lives in services/_risk_governance only; endpoints delegate."""
from __future__ import annotations
import ast
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ENDPOINTS = REPO_ROOT / "backend/app/api/v1/endpoints/risks"

def test_no_local_validate_risk_type_in_endpoints() -> None:
    offenders: list[str] = []
    for path in ENDPOINTS.rglob("*.py"):
        try:
            tree = ast.parse(path.read_text())
        except SyntaxError:
            continue
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if node.name == "validate_risk_type":
                    offenders.append(f"{path}:{node.lineno}")
    assert offenders == [], f"S1.4: must delegate to service policy: {offenders}"

def test_endpoints_import_canonical_path() -> None:
    create = (ENDPOINTS / "crud/create.py").read_text()
    assert "from app.services._risk_governance" in create
    assert "validate_risk_type" in create
```

Expected: RED. The current call site does not import the canonical path.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/api/v1/endpoints/risks/crud/create.py:19` — replace local import with `from app.services._risk_governance.risk_validation import validate_risk_type`. Update call sites accordingly.
- Other risks-domain callers (per Phase 4 enumeration) — same migration.
- `.planning/audits/_context/02-backend-endpoints.md` — note migration.

Files to create:
- `tests/backend/pytest/architecture/test_risk_type_validation_canonical_red.py` (above).

Files to delete:
- None (the canonical helper already exists; this is a caller migration).

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_risk_type_validation_canonical_red.py -q
pytest tests/backend/pytest -q -k "risk"
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New architecture lock IS the contract.

**README/Doc Updates (same commit)**:
- `.planning/audits/_context/02-backend-endpoints.md` — note row appended.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_risk_type_validation_canonical_red.py -q` — must pass.
2. `pytest tests/backend/pytest/api/v1/test_risks.py tests/backend/pytest/test_risks.py -q` — must pass.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/api/v1/endpoints/risks/` — clean.
5. `mypy backend/app/api/v1/endpoints/risks/` — clean.

**Commit Boundary**: single commit.
**Title**: `S1.4: consolidate risk-type validation onto service policy`.

**Rollback** (class: TRIVIAL):
1. `git revert <SHA>` to restore the local definition.
2. Estimated revert time: 10 min.

**Risk Notes**: LOW — caller migration; canonical helper unchanged. Mitigations: lock test forbids regression. Soft sequence: #1 → #19 → #11.

---

### Item #11 — #11 — Control execution `risk.process` → `risk.name` truth-in-naming fix

**Sequence**: Wave 2, slot 11. **Effort**: S (≤2h). **Priority**: P1. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: #19 (soft sequencing — same risks domain)

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 11 (`final-section-2-sequence.md:44`).
- [ ] Read latest state of `backend/app/services/_control_execution/...` for `risk.process` references (audit S2.7).
- [ ] Read the `Risk` model definition to confirm `Risk.name` is canonical (`Risk.process` is misnamed/legacy).
- [ ] No concurrent feature work touches `_control_execution/`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_control_execution_uses_risk_name_red.py`

```python
"""S2.7: control execution must reference Risk.name, not Risk.process (truth-in-naming)."""
from __future__ import annotations
import ast
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
TARGET = REPO_ROOT / "backend/app/services/_control_execution"

def test_no_risk_process_attribute_access_in_control_execution() -> None:
    offenders: list[str] = []
    for path in TARGET.rglob("*.py"):
        try:
            tree = ast.parse(path.read_text())
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Attribute) and node.attr == "process":
                if isinstance(node.value, ast.Name) and node.value.id == "risk":
                    offenders.append(f"{path}:{node.lineno}")
    assert offenders == [], f"S2.7: must use risk.name not risk.process: {offenders}"
```

Expected: RED. `risk.process` references exist today.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/services/_control_execution/*.py` — replace `risk.process` with `risk.name` everywhere. Verify no Pydantic schema or ORM mapping anchors `process`; if it does, add a one-line `name = process` alias temporarily.

Files to create:
- `tests/backend/pytest/architecture/test_control_execution_uses_risk_name_red.py` (above).

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_control_execution_uses_risk_name_red.py -q
pytest tests/backend/pytest -q -k "control_execution"
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New architecture lock IS the contract.

**README/Doc Updates (same commit)**:
- `backend/app/services/_control_execution/README.md` (if present) — note rename.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_control_execution_uses_risk_name_red.py -q` — must pass.
2. `pytest tests/backend/pytest -q -k "control"` — broad control suite green.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/services/_control_execution/` — clean.
5. `mypy backend/app/services/_control_execution/` — clean.

**Commit Boundary**: single commit.
**Title**: `S2.7: rename risk.process to risk.name in _control_execution (truth-in-naming)`.

**Rollback** (class: TRIVIAL):
1. `git revert <SHA>` to restore `risk.process`.
2. Estimated revert time: 5 min.

**Risk Notes**: LOW — attribute rename only; the underlying field name is `name` and `process` is a legacy alias. Mitigation: existing tests cover the surface; lock test forbids regression.

---

### Item #12 — #14 — Issues outbox-only notification cleanup

**Sequence**: Wave 2, slot 12. **Effort**: M (4-6h). **Priority**: P1. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 12 (`final-section-2-sequence.md:45`).
- [ ] Read latest state of `backend/app/services/_issue_workflow/notifications.py` and any in-process notification emit sites (audit S4.4).
- [ ] Read `backend/app/services/outbox/dispatcher.py` (the canonical outbox path).
- [ ] Confirm the issue-workflow domain currently emits via TWO paths (in-process + outbox) per audit S4.4.
- [ ] No concurrent feature work touches issues notifications.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_issues_outbox_only_emit_red.py`

```python
"""S4.4: issue notifications emit ONLY through outbox; no in-process side-effect calls."""
from __future__ import annotations
import ast
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ISSUES_WORKFLOW = REPO_ROOT / "backend/app/services/_issue_workflow"
BANNED_FUNCTIONS = {"send_email_now", "publish_in_process_notification"}

def test_no_inprocess_notification_emit_from_issues() -> None:
    offenders: list[str] = []
    for path in ISSUES_WORKFLOW.rglob("*.py"):
        try:
            tree = ast.parse(path.read_text())
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                fn = node.func
                name = (fn.id if isinstance(fn, ast.Name)
                        else fn.attr if isinstance(fn, ast.Attribute) else None)
                if name in BANNED_FUNCTIONS:
                    offenders.append(f"{path}:{node.lineno}::{name}")
    assert offenders == [], f"S4.4: must use outbox: {offenders}"
```

Expected: RED. Audit S4.4 enumerates the in-process emit sites that must be replaced.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/services/_issue_workflow/notifications.py` — replace in-process emit calls with `OutboxService.enqueue(...)` (provide the keyword args required by the outbox lock at `tests/backend/pytest/architecture/test_w12_outbox_enqueue_idempotency_key_present_red.py`). For each emit, define a Pydantic payload (or reuse one) on `backend/app/services/outbox/payloads.py`.
- `backend/app/services/_issue_workflow/__init__.py` — drop now-unused imports.

Files to create:
- `tests/backend/pytest/architecture/test_issues_outbox_only_emit_red.py` (above).

Files to delete:
- Any orphaned in-process helper that solely served the in-process path.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_issues_outbox_only_emit_red.py -q
pytest tests/backend/pytest/test_issue_workflow.py tests/backend/pytest/test_outbox_idempotency.py -q
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New architecture lock IS the contract.
- Existing outbox idempotency lock at `tests/backend/pytest/architecture/test_w12_outbox_enqueue_idempotency_key_present_red.py:34-49` — no edit; the new emit sites must satisfy the same keyword-arg contract.

**README/Doc Updates (same commit)**:
- `backend/app/services/_issue_workflow/README.md` (if present) — note "outbox-only emit".

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_issues_outbox_only_emit_red.py -q` — must pass.
2. `pytest tests/backend/pytest/test_issue_workflow.py -q` — must pass.
3. `pytest tests/backend/pytest/test_outbox_idempotency.py -q` — must pass.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.
5. `ruff check backend/app/services/_issue_workflow/` — clean.
6. `mypy backend/app/services/_issue_workflow/` — clean.

**Commit Boundary**: single commit.
**Title**: `S4.4: enforce outbox-only emit in issues notifications`.

**Rollback** (class: CROSS-DOMAIN — touches outbox payloads):
1. `git revert <SHA>` to restore in-process emit paths.
2. Re-run `pytest tests/backend/pytest/test_outbox_idempotency.py -q` — confirm legacy state.
3. Estimated revert time: 20 min.

**Risk Notes**: MEDIUM — emission semantics change (synchronous → async). Mitigations: integration tests confirm outbox dispatch; lock test forbids regression; outbox idempotency lock catches missing keyword args.

---

### Item #13 — #15 — Add `access_user` capability surface to catalog

**Sequence**: Wave 2, slot 13. **Effort**: M (4-6h). **Priority**: P1. **Atomic with**: none. **Validator**: yes.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 13 (`final-section-2-sequence.md:46`).
- [ ] Read latest state of `docs/security/capability-catalog.json` (today carries 7 surfaces: `RISK`, `CONTROL`, `VENDOR`, `ISSUE`, `KRI`, `APPROVAL`, `USER`).
- [ ] Read `docs/security/authorization-capability-contract.md` and `.json` (the contract).
- [ ] Read `frontend/src/types/access.ts` (FE consumer; today has `capabilities?` optional — Phase 6 #15 note: new Zod schema tightens this drift).
- [ ] No concurrent feature work touches the contract files.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_capability_catalog_includes_access_user_red.py`

```python
"""D-N2: capability-catalog.json must list 'access_user' as the 8th surface."""
from __future__ import annotations
import json
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
CATALOG = REPO_ROOT / "docs/security/capability-catalog.json"

def test_access_user_surface_present() -> None:
    data = json.loads(CATALOG.read_text())
    surfaces = {entry["surface"] for entry in data.get("surfaces", [])}
    assert "ACCESS_USER" in surfaces or "access_user" in surfaces

def test_access_user_carries_required_actions() -> None:
    data = json.loads(CATALOG.read_text())
    for entry in data.get("surfaces", []):
        if entry["surface"].lower() == "access_user":
            actions = set(entry.get("actions", []))
            assert {"read", "write"}.issubset(actions)
            return
    raise AssertionError("access_user surface missing")
```

Expected: RED. The 8th surface is not yet listed.

**TDD Step 2 — Implement Change**

Files to edit:
- `docs/security/capability-catalog.json` — add `access_user` entry with the actions enumerated by the FE (`read`, `write`, etc.).
- `docs/security/authorization-capability-contract.md` — add the AUTHZ-ACCESS-USER section row.
- `docs/security/authorization-capability-contract.json` — sync the JSON.
- `frontend/src/auth/useAuthz.ts` — add `access_user` to the union type (FE today has `capabilities?` optional; Phase 6 #15 note: the new Zod schema tightens this drift).
- `frontend/src/auth/authzSchemas.ts` (or equivalent FE Zod home) — add `accessUserCapabilitiesSchema = z.object({...})` MARKING THE FIELD REQUIRED. This closes the existing FE TS-optional drift.
- `tests/frontend/unit/src/authz/useAuthz.invariant.test.ts` — extend to assert `access_user` is part of the required surfaces.

Files to create:
- `tests/backend/pytest/architecture/test_capability_catalog_includes_access_user_red.py` (above).

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_capability_catalog_includes_access_user_red.py -q
python3 scripts/security/validate_authz_capability_contract.py
cd frontend && npm run test:run -- tests/frontend/unit/src/authz/useAuthz.invariant.test.ts
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- `docs/security/capability-catalog.json` — 8th surface added.
- `docs/security/authorization-capability-contract.{md,json}` — AUTHZ-ACCESS-USER row added.
- `tests/backend/pytest/architecture/_capabilities_all_allowlist.toml` — add the new surface to the allowlist if the lock requires it.

**README/Doc Updates (same commit)**:
- `docs/security/authorization-capability-contract.md` — surface table updated to 8 surfaces.
- `frontend/src/auth/README.md` (if present) — note Zod schema tightens optional drift.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_capability_catalog_includes_access_user_red.py -q` — must pass.
2. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `npx tsc --noEmit` (in frontend) — clean.
5. `npm run test:run -- tests/frontend/unit/src/authz/useAuthz.invariant.test.ts` (in frontend) — pass.
6. `ruff check tests/backend/pytest/architecture/test_capability_catalog_includes_access_user_red.py` — clean.

**Commit Boundary**: single commit.
**Title**: `D-N2: add access_user as 8th capability surface (catalog + contract + Zod tighten)`.

**Rollback** (class: CROSS-DOMAIN with capability-contract edit + FE Zod):
1. `git revert <SHA>` to restore the 7-surface catalog and the FE TS-optional shape.
2. Re-run `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
3. Re-run `cd frontend && npx tsc --noEmit` — clean.
4. Estimated revert time: 20 min.

**Risk Notes**: MEDIUM — touches contract + FE schema. Phase 6 #15 note: the new Zod schema tightens existing TS-optional drift; some downstream FE code may rely on `capabilities?` being optional. Mitigations: invariant test enforces the new shape; validator gate runs in commit; FE TS compile catches widening regressions.

---

### Item #14 — #76 — Migrate 8 auth-flow `db.commit` sites to service-owned transactions

**Sequence**: Wave 2, slot 14. **Effort**: L (12-16h). **Priority**: P1 (promoted from P3 per Q-E; deadline 2026-09-01). **Atomic with**: none. **Validator**: no (touches `_endpoint_commit_allowlist.toml`, not the capability contract).

**Dependencies (must be complete first)**: #72 (ADR-011 — must ratify the canonical pattern first).

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 14 (`final-section-2-sequence.md:47`).
- [ ] Confirm #72 (ADR-011) has landed.
- [ ] Read each of the 8 commit sites (Phase 6 confirmed at exact lines):
  - `backend/app/api/v1/endpoints/auth/sso.py:170`
  - `backend/app/api/v1/endpoints/auth/refresh.py:177`
  - `backend/app/api/v1/endpoints/auth/logout.py:101`
  - `backend/app/api/v1/endpoints/auth/logout.py:132`
  - `backend/app/api/v1/endpoints/auth/_sso_helpers.py:48`
  - `backend/app/api/v1/endpoints/auth/password.py:128`
  - `backend/app/api/v1/endpoints/auth/password.py:161`
  - `backend/app/api/v1/endpoints/auth/demo.py:67`
- [ ] Read `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` — 8 entries, all `expires_at = "2026-09-01"`.
- [ ] No concurrent feature work touches `backend/app/api/v1/endpoints/auth/`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_auth_flow_no_endpoint_commit_red.py`

```python
"""S7.9: auth/ endpoints have ZERO db.commit() calls; service layer owns transactions."""
from __future__ import annotations
import ast
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
AUTH_DIR = REPO_ROOT / "backend/app/api/v1/endpoints/auth"

def _has_commit(tree: ast.AST) -> bool:
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            fn = node.func
            if isinstance(fn, ast.Attribute) and fn.attr == "commit":
                return True
    return False

def test_no_db_commit_in_auth_endpoints() -> None:
    offenders: list[str] = []
    for path in AUTH_DIR.rglob("*.py"):
        try:
            tree = ast.parse(path.read_text())
        except SyntaxError:
            continue
        if _has_commit(tree):
            offenders.append(str(path.relative_to(REPO_ROOT)))
    assert offenders == [], (
        f"#76: auth/ endpoints must own zero commits; offenders: {offenders}"
    )
```

Expected: RED. 6 distinct files (2 each in `logout.py` and `password.py`) carry `db.commit()`; all 8 sites must move to a service.

**TDD Step 2 — Implement Change**

Files to create:
- `backend/app/services/_auth_session_workflow/__init__.py` — new service module owning the transactional contexts.
- `backend/app/services/_auth_session_workflow/sso.py` — moves the SSO commit (paired transactional context per Q-D).
- `backend/app/services/_auth_session_workflow/refresh.py` — refresh commit.
- `backend/app/services/_auth_session_workflow/logout.py` — 2 logout commits.
- `backend/app/services/_auth_session_workflow/password.py` — 2 password commits.
- `backend/app/services/_auth_session_workflow/demo.py` — demo commit.
- `tests/backend/pytest/architecture/test_auth_flow_no_endpoint_commit_red.py` (above).
- `tests/backend/pytest/integration/test_auth_session_workflow.py` — integration scaffold per Q-D effort upgrade (M → L) covering happy path + rollback for each migrated site.

Files to edit:
- Each of the 8 endpoint files — replace `await db.commit()` with a call to the new service function.
- `backend/app/api/v1/endpoints/auth/_sso_helpers.py:48` — same pattern.
- `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` — DELETE all 8 entries (they reach `expires_at = "2026-09-01"` now obsolete).

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_auth_flow_no_endpoint_commit_red.py -q
pytest tests/backend/pytest/integration/test_auth_session_workflow.py -q
pytest tests/backend/pytest/architecture/test_w5_endpoint_commit_ratchet_red.py -q
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- `tests/backend/pytest/architecture/_endpoint_commit_allowlist.toml` — 8 auth entries removed (now empty for auth/, or schema retains zero rows).
- New architecture lock IS the contract.

**README/Doc Updates (same commit)**:
- `backend/app/api/v1/endpoints/auth/README.md` — note "service-owned transactions per ADR-011".
- `AGENTS.md` — cross-reference ADR-011 + #76 commit site list.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_auth_flow_no_endpoint_commit_red.py -q` — must pass.
2. `pytest tests/backend/pytest/integration/test_auth_session_workflow.py -q` — must pass (8-site integration scaffold green).
3. `pytest tests/backend/pytest/architecture/test_w5_endpoint_commit_ratchet_red.py -q` — must pass (allowlist count is 0).
4. `pytest tests/backend/pytest -q -k "auth"` — broad auth suite green.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `python3 scripts/security/validate_authz_capability_contract.py` — exit 0.
7. `ruff check backend/app/services/_auth_session_workflow/ backend/app/api/v1/endpoints/auth/` — clean.
8. `mypy backend/app/services/_auth_session_workflow/ backend/app/api/v1/endpoints/auth/` — clean.

**Commit Boundary**: 8 atomic commits acceptable (one per site/file), OR a single commit covering all 8 sites + service module. Recommended: 1 commit for the new service module + 8 small commits per migrated site (better blame trail; matches Q-D rationale of "8 auth/ commit sites with paired transactional contexts").
**Title (single-commit)**: `S7.9/#76: migrate 8 auth/ commit sites to _auth_session_workflow service`.

**Rollback** (class: CROSS-DOMAIN with allowlist + new service module):
1. `git revert <SHA>` (or revert each of the 8+1 commits in reverse order).
2. Restore `_endpoint_commit_allowlist.toml` 8 auth entries.
3. Re-run `pytest tests/backend/pytest/architecture/ -q` — confirm legacy state.
4. Estimated revert time: 60 min (multi-file).

**Risk Notes**: MEDIUM — 8 sites across 6 files; transactional semantics change. Mitigations: ADR-011 ratifies the pattern; integration scaffold covers happy + rollback paths; allowlist deletion is the gate; deadline buffer ≥6 weeks before 2026-09-01.

---

## Wave 3 — P2 Dead-code A (Slots 15-28)

### Item #15 — #2 — Drop 4 underscore aliases in `_issue_workflow/source_validation.py`

**Sequence**: Wave 3, slot 15. **Effort**: S (≤2h). **Priority**: P2. **Atomic with**: none (sequencing soft-prereq for #8 in Wave 5). **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 15 (`final-section-2-sequence.md:48`).
- [ ] Read latest state of `backend/app/services/_issue_workflow/source_validation.py:18,19,20,21` (the 4 underscore aliases).
- [ ] Read `backend/app/services/_issue_register/source_validation.py` (canonical home).
- [ ] No concurrent feature work touches issue source-validation.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_issue_workflow_source_validation_no_aliases_red.py`

```python
"""B-N1: workflow/source_validation drops 4 underscore-self aliases."""
from __future__ import annotations
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
TARGET = REPO_ROOT / "backend/app/services/_issue_workflow/source_validation.py"

BANNED = (
    "_validate_issue_source_payload = validate_issue_source_payload",
    "_validate_link_target = validate_link_target",
    "_resolve_link_targets = resolve_link_targets",
    "_normalize_link_targets = normalize_link_targets",
)

def test_no_self_aliases() -> None:
    text = TARGET.read_text()
    for line in BANNED:
        assert line not in text, f"B-N1: alias must be deleted: {line!r}"
```

Expected: RED. The 4 aliases exist today.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/services/_issue_workflow/source_validation.py:18-21` — delete the 4 self-alias lines.
- Any caller still importing the underscore form — repoint to the canonical name.

Files to create:
- `tests/backend/pytest/architecture/test_issue_workflow_source_validation_no_aliases_red.py` (above).

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_issue_workflow_source_validation_no_aliases_red.py -q
pytest tests/backend/pytest -q -k "source_validation"
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New architecture lock IS the contract.

**README/Doc Updates (same commit)**:
- None required (internal alias drop).

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_issue_workflow_source_validation_no_aliases_red.py -q` — must pass.
2. `pytest tests/backend/pytest/test_issue_workflow.py -q` — must pass.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/services/_issue_workflow/source_validation.py` — clean.
5. `mypy backend/app/services/_issue_workflow/source_validation.py` — clean.

**Commit Boundary**: single commit.
**Title**: `B-N1: drop 4 underscore aliases in _issue_workflow/source_validation`.

**Rollback** (class: TRIVIAL):
1. `git revert <SHA>` to restore the aliases.
2. Estimated revert time: 5 min.

**Risk Notes**: LOW — aliases were dead. Mitigation: lock test forbids regression.

---

### Item #16 — #3 — Delete `kriFormWorkflow.ts` + tautological test

**Sequence**: Wave 3, slot 16. **Effort**: S (≤2h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 16 (`final-section-2-sequence.md:49`).
- [ ] Read latest state of `frontend/src/components/kri-form/kriFormWorkflow.ts` (the file slated for deletion).
- [ ] Read `tests/frontend/unit/src/components/kri-form/kriFormWorkflow.spec.ts` (the tautological test).
- [ ] Run `grep -rn "kriFormWorkflow" frontend/src/` — confirm 0 prod consumers.
- [ ] No concurrent feature work touches kri-form.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/frontend/unit/src/components/kri-form/kriFormWorkflow.absent.spec.ts`

```typescript
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("S3.11: kriFormWorkflow.ts removal", () => {
  it("source file is deleted", () => {
    const path = resolve(__dirname, "../../../../../frontend/src/components/kri-form/kriFormWorkflow.ts");
    expect(existsSync(path)).toBe(false);
  });
});
```

Expected: RED. The file still exists.

**TDD Step 2 — Implement Change**

Files to delete:
- `frontend/src/components/kri-form/kriFormWorkflow.ts`.
- `tests/frontend/unit/src/components/kri-form/kriFormWorkflow.spec.ts` (tautological — it asserted the module exists).

Files to edit:
- Any FE consumer that re-exports `kriFormWorkflow` — drop the re-export line. Phase 4 verified 0 prod consumers; only the tautological test imported the module.

Files to create:
- `tests/frontend/unit/src/components/kri-form/kriFormWorkflow.absent.spec.ts` (above).

**TDD Step 3 — Confirm GREEN**

```
cd frontend && npm run test:run -- tests/frontend/unit/src/components/kri-form
cd frontend && npx tsc --noEmit
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New FE absence test IS the contract.
- `tests/backend/pytest/architecture/_naming_allowlist.toml` — no entry expected.

**README/Doc Updates (same commit)**:
- `frontend/src/components/kri-form/README.md` (if present) — drop reference.

**Verification Commands** (in order):
1. `cd frontend && npm run test:run -- tests/frontend/unit/src/components/kri-form` — must pass.
2. `cd frontend && npx tsc --noEmit` — clean.
3. `cd frontend && npm run lint` — clean.

**Commit Boundary**: single commit.
**Title**: `S3.11: delete kriFormWorkflow.ts + tautological test`.

**Rollback** (class: TEST-ONLY + DOC-ONLY):
1. `git revert <SHA>` to restore both files.
2. Estimated revert time: 5 min.

**Risk Notes**: LOW — pure deletion; no prod consumers. Mitigation: absence-lock prevents reintroduction.

---

### Item #17 — #4 — Delete `controlFormWorkflow.ts` (3-line, 0 prod)

**Sequence**: Wave 3, slot 17. **Effort**: S (≤1h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 17 (`final-section-2-sequence.md:50`).
- [ ] Read latest state of `frontend/src/components/control-form/controlFormWorkflow.ts` (3-line module).
- [ ] Run `grep -rn "controlFormWorkflow" frontend/src/` — confirm 0 prod consumers (Phase 4 verified).
- [ ] No concurrent feature work touches control-form.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/frontend/unit/src/components/control-form/controlFormWorkflow.absent.spec.ts`

```typescript
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("FE-deadcode-1: controlFormWorkflow.ts removal", () => {
  it("source file is deleted", () => {
    const path = resolve(__dirname, "../../../../../frontend/src/components/control-form/controlFormWorkflow.ts");
    expect(existsSync(path)).toBe(false);
  });
});
```

Expected: RED.

**TDD Step 2 — Implement Change**

Files to delete:
- `frontend/src/components/control-form/controlFormWorkflow.ts`.

Files to edit:
- Drop any re-export entry from `frontend/src/components/control-form/index.ts` if it cites the removed module.

Files to create:
- `tests/frontend/unit/src/components/control-form/controlFormWorkflow.absent.spec.ts` (above).

**TDD Step 3 — Confirm GREEN**

```
cd frontend && npm run test:run -- tests/frontend/unit/src/components/control-form
cd frontend && npx tsc --noEmit
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New FE absence test IS the contract.

**README/Doc Updates (same commit)**:
- `frontend/src/components/control-form/README.md` (if present) — drop reference.

**Verification Commands** (in order):
1. `cd frontend && npm run test:run -- tests/frontend/unit/src/components/control-form` — must pass.
2. `cd frontend && npx tsc --noEmit` — clean.
3. `cd frontend && npm run lint` — clean.

**Commit Boundary**: single commit.
**Title**: `FE-deadcode-1: delete controlFormWorkflow.ts (3-line, 0 prod)`.

**Rollback** (class: TRIVIAL):
1. `git revert <SHA>`.
2. Estimated revert time: 3 min.

**Risk Notes**: VERY LOW — 3-line dead module. Mitigation: absence-lock prevents reintroduction.

---

### Item #18 — #5 — Delete `orphanResolutionPresentation.ts` (1-line re-export)

**Sequence**: Wave 3, slot 18. **Effort**: S (≤1h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 18 (`final-section-2-sequence.md:51`).
- [ ] Read latest state of `frontend/src/...orphanResolutionPresentation.ts` (1-line re-export).
- [ ] Run `grep -rn "orphanResolutionPresentation" frontend/src/` — confirm 0 prod consumers.
- [ ] No concurrent feature work touches orphan-resolution surfaces.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/frontend/unit/src/...orphanResolutionPresentation.absent.spec.ts`

```typescript
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("FE-deadcode-2: orphanResolutionPresentation.ts removal", () => {
  it("re-export file is deleted", () => {
    const path = resolve(__dirname, "../../../../../frontend/src/path/to/orphanResolutionPresentation.ts");
    expect(existsSync(path)).toBe(false);
  });
});
```

(Resolve the exact path against HEAD before writing the test; the audit cited the file but the relative path may live under `components/orphan-resolution/` or `services/`.)

**TDD Step 2 — Implement Change**

Files to delete:
- The 1-line re-export module (path resolved during pre-flight).

Files to edit:
- Repoint any re-export consumer to the canonical home.

Files to create:
- The FE absence test above.

**TDD Step 3 — Confirm GREEN**

```
cd frontend && npm run test:run
cd frontend && npx tsc --noEmit
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New FE absence test IS the contract.

**README/Doc Updates (same commit)**:
- None required.

**Verification Commands** (in order):
1. `cd frontend && npm run test:run` — must pass.
2. `cd frontend && npx tsc --noEmit` — clean.
3. `cd frontend && npm run lint` — clean.

**Commit Boundary**: single commit.
**Title**: `FE-deadcode-2: delete orphanResolutionPresentation.ts (1-line re-export)`.

**Rollback** (class: TRIVIAL):
1. `git revert <SHA>`.
2. Estimated revert time: 3 min.

**Risk Notes**: VERY LOW — 1-line re-export.

---

### Item #19 — #6 — Delete `notifications/resourcePath.ts` (5-line re-export)

**Sequence**: Wave 3, slot 19. **Effort**: S (≤1h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 19 (`final-section-2-sequence.md:52`).
- [ ] Read latest state of `frontend/src/.../notifications/resourcePath.ts` (5-line re-export).
- [ ] Run `grep -rn "notifications/resourcePath" frontend/src/` — confirm 0 prod consumers.
- [ ] No concurrent feature work touches notifications.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/frontend/unit/src/.../resourcePath.absent.spec.ts`

```typescript
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("FE-deadcode-3: notifications/resourcePath.ts removal", () => {
  it("re-export file is deleted", () => {
    const path = resolve(__dirname, "../../../../../frontend/src/notifications/resourcePath.ts");
    expect(existsSync(path)).toBe(false);
  });
});
```

(Resolve exact path during pre-flight.)

**TDD Step 2 — Implement Change**

Files to delete:
- `frontend/src/notifications/resourcePath.ts` (5-line re-export).

Files to edit:
- Drop the re-export entry from `frontend/src/notifications/index.ts` if present.
- Repoint any consumer to the canonical home (per Phase 4 enumeration).

Files to create:
- The absence-test file above.

**TDD Step 3 — Confirm GREEN**

```
cd frontend && npm run test:run
cd frontend && npx tsc --noEmit
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New FE absence test IS the contract.

**README/Doc Updates (same commit)**:
- None required.

**Verification Commands** (in order):
1. `cd frontend && npm run test:run` — must pass.
2. `cd frontend && npx tsc --noEmit` — clean.
3. `cd frontend && npm run lint` — clean.

**Commit Boundary**: single commit.
**Title**: `FE-deadcode-3: delete notifications/resourcePath.ts (5-line re-export)`.

**Rollback** (class: TRIVIAL):
1. `git revert <SHA>`.
2. Estimated revert time: 3 min.

**Risk Notes**: VERY LOW — 5-line re-export.

---

### Item #20 — #7 — Delete `_get_approval_department_id` endpoint shim

**Sequence**: Wave 3, slot 20. **Effort**: S (≤2h). **Priority**: P2. **Atomic with**: none (co-touches `_shared.py` with #18 — keep separate commits). **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 20 (`final-section-2-sequence.md:53`).
- [ ] Read latest state of `backend/app/api/v1/endpoints/approvals/_shared.py:17-31` (the shim).
- [ ] Confirm 0 production callers of `_get_approval_department_id`. Phase 6: `grep` returned only the shim definition + 4 callers of canonical `get_approval_department_id`.
- [ ] Read `backend/app/services/_approval_execution/loading.py:31` (canonical home).
- [ ] No concurrent feature work touches `approvals/_shared.py`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_get_approval_department_id_shim_deleted_red.py`

```python
"""C-N1: endpoint shim _get_approval_department_id must be deleted."""
from __future__ import annotations
import importlib
import pytest

pytestmark = pytest.mark.contract

def test_endpoint_shim_absent() -> None:
    shared = importlib.import_module("app.api.v1.endpoints.approvals._shared")
    assert not hasattr(shared, "_get_approval_department_id"), (
        "C-N1: endpoint shim must be deleted; canonical lives in _approval_execution/loading.py"
    )

def test_canonical_intact() -> None:
    loading = importlib.import_module("app.services._approval_execution.loading")
    assert hasattr(loading, "get_approval_department_id")
```

Expected: RED. The shim still exists at `_shared.py:17-31`.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/api/v1/endpoints/approvals/_shared.py` — delete the entire `_get_approval_department_id` body at lines 17-31. Drop now-orphaned imports (`AsyncSession`, `ApprovalRequest` if only used by the shim).
- `.planning/audits/_context/03-frontend-architecture.md` — note removal (per Phase 4 disposition).

Files to create:
- `tests/backend/pytest/architecture/test_get_approval_department_id_shim_deleted_red.py` (above).

Files to delete:
- None (the shim is removed by editing `_shared.py`, not by deleting the file).

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_get_approval_department_id_shim_deleted_red.py -q
pytest tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approval_resolution.py -q
make -f scripts/Makefile test-architecture-locks
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New architecture lock IS the contract.

**README/Doc Updates (same commit)**:
- None required.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_get_approval_department_id_shim_deleted_red.py -q` — must pass.
2. `pytest tests/backend/pytest -q -k "approval"` — broad approval suite green.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/api/v1/endpoints/approvals/_shared.py` — clean.
5. `mypy backend/app/api/v1/endpoints/approvals/_shared.py` — clean.

**Commit Boundary**: single commit.
**Title**: `C-N1: delete _get_approval_department_id endpoint shim (0 prod callers)`.

**Rollback** (class: TRIVIAL):
1. `git revert <SHA>` to restore the 14-line shim.
2. Estimated revert time: 5 min.

**Risk Notes**: VERY LOW — 0 production callers. Mitigation: lock test forbids regression.

---

### Item #21 — #41 — Drop bidirectional underscore aliases in `_issue_workflow/serialization.py`

**Sequence**: Wave 3, slot 21. **Effort**: S (2h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none — soft pair-with #2 (same anti-pattern).

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 21 (`final-section-2-sequence.md:54`).
- [ ] Read latest state of `backend/app/services/_issue_workflow/serialization.py:18,41` (the bidirectional aliases).
- [ ] Read `backend/app/services/_issue_register/serialization.py:47,246` (canonical homes).
- [ ] **Phase 6 V1 critical**: read `backend/app/api/v1/endpoints/issues/_shared/serialization.py:18,30` (the endpoint barrel that imports `_active_exception` and re-exports it via `_shared/__init__.py:19,51`).
- [ ] No concurrent feature work touches `_issue_workflow/serialization.py`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_issue_workflow_serialization_no_self_aliases_red.py`

```python
"""B-N3: workflow/serialization drops self-aliases; endpoint barrel repointed."""
from __future__ import annotations
import importlib
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
WORKFLOW_SER = REPO_ROOT / "backend/app/services/_issue_workflow/serialization.py"
SHARED_SER = REPO_ROOT / "backend/app/api/v1/endpoints/issues/_shared/serialization.py"

def test_no_self_aliases_in_workflow_serialization() -> None:
    text = WORKFLOW_SER.read_text()
    assert "active_exception = _active_exception" not in text
    assert "_serialize_exception_with_user_names = serialize_exception_with_user_names" not in text

def test_endpoint_barrel_imports_public_active_exception() -> None:
    """Phase 6 V1: endpoint barrel must rename _active_exception → active_exception."""
    text = SHARED_SER.read_text()
    assert "import _active_exception" not in text, "endpoint barrel must use public name"
    assert "import active_exception" in text or "from app.services._issue_register.serialization import active_exception" in text
```

Expected: RED. Both alias lines exist; endpoint barrel imports `_active_exception`.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/services/_issue_register/serialization.py:47` — promote underscored `_active_exception` to public `active_exception` (rename the function definition).
- `backend/app/services/_issue_workflow/serialization.py:9-11` — change `from app.services._issue_register.serialization import (_active_exception,)` to `from app.services._issue_register.serialization import active_exception`. Drop the `:18 active_exception = _active_exception` line.
- `backend/app/services/_issue_workflow/serialization.py:41` — delete `_serialize_exception_with_user_names = serialize_exception_with_user_names`.
- **Phase 6 V1 critical**: `backend/app/api/v1/endpoints/issues/_shared/serialization.py:18` — rename import from `_active_exception` to `active_exception`. The endpoint barrel re-export must point to the new public name.
- **Phase 6 V1 critical**: `backend/app/api/v1/endpoints/issues/_shared/serialization.py:30` — update `__all__` entry from `_active_exception` to `active_exception` (or drop entirely if the public name is already exported via the workflow-serialization re-export — verify pre-edit).
- `backend/app/api/v1/endpoints/issues/_shared/__init__.py:19,51` — same rename if these lines re-export the underscored name.

Files to create:
- `tests/backend/pytest/architecture/test_issue_workflow_serialization_no_self_aliases_red.py` (above).

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_issue_workflow_serialization_no_self_aliases_red.py -q
pytest tests/backend/pytest -q -k "serialization"
pytest tests/backend/pytest/test_issue_workflow.py -q
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New architecture lock IS the contract.

**README/Doc Updates (same commit)**:
- None required.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_issue_workflow_serialization_no_self_aliases_red.py -q` — must pass.
2. `pytest tests/backend/pytest/test_issue_workflow.py -q` — must pass.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/services/_issue_workflow backend/app/services/_issue_register backend/app/api/v1/endpoints/issues/_shared` — clean.
5. `mypy backend/app/services/_issue_workflow backend/app/services/_issue_register backend/app/api/v1/endpoints/issues/_shared` — clean.

**Commit Boundary**: single commit (alias drop + rename + endpoint barrel rename in same commit per Phase 6 V1 — without the `_shared/serialization.py` edit, the endpoint barrel breaks between Seq 21 and Seq 53/54).
**Title**: `B-N3: drop bidirectional underscore aliases in _issue_workflow/serialization (incl. endpoint barrel)`.

**Rollback** (class: LOCK-RATCHET, multi-file):
1. `git revert <SHA>` — restores all alias lines and rename.
2. Estimated revert time: 10 min.

**Risk Notes**: LOW (after Phase 6 V1 correction). Without the `_shared/serialization.py:18,30` edit, the endpoint barrel would point at a non-existent name between Seq 21 and Seq 54 (#30). Mitigations: lock test pins absence; Phase 6 critical correction caught the hidden consumer.

---

### Item #22 — #50 — Delete `_kri_history/submission.py` wrapper

**Sequence**: Wave 3, slot 22. **Effort**: S (≤2h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 22 (`final-section-2-sequence.md:55`).
- [ ] Read latest state of `backend/app/services/_kri_history/submission.py` (wrapper module).
- [ ] Read `backend/app/services/_kri_history/__init__.py` (canonical surface).
- [ ] Run `grep -rn "from app.services._kri_history.submission" backend/ tests/` — confirm 0 prod callers (Phase 4 verified).
- [ ] No concurrent feature work touches `_kri_history/`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_kri_history_submission_wrapper_deleted_red.py`

```python
"""S3.2: _kri_history/submission.py wrapper must be deleted."""
from __future__ import annotations
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
WRAPPER = REPO_ROOT / "backend/app/services/_kri_history/submission.py"

def test_wrapper_deleted() -> None:
    assert not WRAPPER.exists(), "S3.2: wrapper must be deleted"
```

Expected: RED. The wrapper still exists.

**TDD Step 2 — Implement Change**

Files to delete:
- `backend/app/services/_kri_history/submission.py` (entire file).

Files to edit:
- Drop the wrapper export from `backend/app/services/_kri_history/__init__.py` if present.
- Repoint any caller (per Phase 4 enumeration) to the canonical `_kri_history` surface.
- `tests/backend/pytest/architecture/_archive_allowlist.toml` — drop any entry pinning the wrapper.

Files to create:
- `tests/backend/pytest/architecture/test_kri_history_submission_wrapper_deleted_red.py` (above).

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_kri_history_submission_wrapper_deleted_red.py -q
pytest tests/backend/pytest -q -k "kri_history"
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- `_archive_allowlist.toml` — drop any entry referencing the deleted wrapper.

**README/Doc Updates (same commit)**:
- `backend/app/services/_kri_history/README.md` (if present) — drop wrapper reference.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_kri_history_submission_wrapper_deleted_red.py -q` — must pass.
2. `pytest tests/backend/pytest -q -k "kri"` — broad KRI suite green.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/services/_kri_history/` — clean.
5. `mypy backend/app/services/_kri_history/` — clean.

**Commit Boundary**: single commit.
**Title**: `S3.2: delete _kri_history/submission.py wrapper`.

**Rollback** (class: TRIVIAL):
1. `git revert <SHA>` to restore wrapper.
2. Estimated revert time: 5 min.

**Risk Notes**: LOW — wrapper is dead. Mitigation: lock test forbids regression.

---

### Item #23 — #52 — Delete `_kri_history/correction_plans.py`

**Sequence**: Wave 3, slot 23. **Effort**: S (≤2h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 23 (`final-section-2-sequence.md:56`).
- [ ] Read latest state of `backend/app/services/_kri_history/correction_plans.py` (the wrapper).
- [ ] Run `grep -rn "from app.services._kri_history.correction_plans" backend/ tests/` — confirm 0 prod callers.
- [ ] No concurrent feature work touches `_kri_history/`.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_kri_history_correction_plans_deleted_red.py`

```python
"""S3.5: _kri_history/correction_plans.py must be deleted."""
from __future__ import annotations
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
WRAPPER = REPO_ROOT / "backend/app/services/_kri_history/correction_plans.py"

def test_wrapper_deleted() -> None:
    assert not WRAPPER.exists(), "S3.5: wrapper must be deleted"
```

Expected: RED.

**TDD Step 2 — Implement Change**

Files to delete:
- `backend/app/services/_kri_history/correction_plans.py`.

Files to edit:
- `backend/app/services/_kri_history/__init__.py` — drop the wrapper re-export if present.
- Repoint any caller to the canonical surface.
- `tests/backend/pytest/architecture/_archive_allowlist.toml` — drop any entry referencing the deleted file.

Files to create:
- `tests/backend/pytest/architecture/test_kri_history_correction_plans_deleted_red.py` (above).

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_kri_history_correction_plans_deleted_red.py -q
pytest tests/backend/pytest -q -k "kri_history"
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- `_archive_allowlist.toml` — drop any wrapper entry.

**README/Doc Updates (same commit)**:
- None required.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_kri_history_correction_plans_deleted_red.py -q` — must pass.
2. `pytest tests/backend/pytest -q -k "kri"` — broad KRI suite green.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/services/_kri_history/` — clean.
5. `mypy backend/app/services/_kri_history/` — clean.

**Commit Boundary**: single commit.
**Title**: `S3.5: delete _kri_history/correction_plans.py`.

**Rollback** (class: TRIVIAL):
1. `git revert <SHA>`.
2. Estimated revert time: 5 min.

**Risk Notes**: LOW.

---

### Item #24 — #53 — Drop `IssueWorkflowService` facade (issue workflow service collapse)

**Sequence**: Wave 3, slot 24. **Effort**: S (3-4h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 24 (`final-section-2-sequence.md:57`).
- [ ] Read latest state of `backend/app/services/issue_workflow_service.py` (the static-method facade).
- [ ] Read `backend/app/services/_issue_workflow/__init__.py` (canonical surface).
- [ ] Enumerate all callers of `IssueWorkflowService.<verb>(...)` (Phase 4 verified ~7 lifecycle verbs).
- [ ] No concurrent feature work touches issues domain.

**TDD Step 1 — Write Failing Test (RED)**

File: `tests/backend/pytest/architecture/test_issue_workflow_service_facade_collapsed_red.py`

```python
"""S4.1: IssueWorkflowService static-method facade must be dropped."""
from __future__ import annotations
import importlib
import pytest

pytestmark = pytest.mark.contract

def test_facade_class_absent() -> None:
    try:
        mod = importlib.import_module("app.services.issue_workflow_service")
    except ModuleNotFoundError:
        return  # facade module deleted entirely — accepted form
    assert not hasattr(mod, "IssueWorkflowService"), (
        "S4.1: static-method facade must be dropped; consume _issue_workflow directly"
    )
```

Expected: RED.

**TDD Step 2 — Implement Change**

Files to edit (or delete the facade module entirely):
- `backend/app/services/issue_workflow_service.py` — delete the `IssueWorkflowService` class. Optionally delete the file if it's now empty.
- For each caller of `IssueWorkflowService.<verb>(...)`, replace with the canonical free-function from `app.services._issue_workflow` (per Phase 4 enumeration of ~7 lifecycle verbs).

Files to create:
- `tests/backend/pytest/architecture/test_issue_workflow_service_facade_collapsed_red.py` (above).

Files to delete:
- `backend/app/services/issue_workflow_service.py` (if empty after class drop).

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_issue_workflow_service_facade_collapsed_red.py -q
pytest tests/backend/pytest/test_issue_workflow.py -q
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New architecture lock IS the contract.

**README/Doc Updates (same commit)**:
- `backend/app/services/_issue_workflow/README.md` (if present) — note canonical entry points.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_issue_workflow_service_facade_collapsed_red.py -q` — must pass.
2. `pytest tests/backend/pytest/test_issue_workflow.py -q` — must pass (covers all 7 lifecycle verbs).
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/services/_issue_workflow backend/app/services/issue_workflow_service.py` — clean (or skip the latter if deleted).
5. `mypy backend/app/services/_issue_workflow` — clean.

**Commit Boundary**: single commit.
**Title**: `S4.1: drop IssueWorkflowService static-method facade`.

**Rollback** (class: CROSS-DOMAIN — touches multiple callers):
1. `git revert <SHA>` to restore facade and caller call-sites.
2. Estimated revert time: 35 min.

**Risk Notes**: LOW — static-method binds are pure passthroughs. Mitigation: existing `test_issue_workflow.py` covers all 7 lifecycle verbs; lock test forbids regression.

---

### Item #25 — #54 — Inline `_approval_queue/lifecycle.py` aggregator

**Sequence**: Wave 3, slot 25. **Effort**: S (≤2h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none — independent of #18 (different surfaces); independent of #34/#60 (#54 is a soft, non-blocking prerequisite for clean package boundary).

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 25 (`final-section-2-sequence.md:58`).
- [ ] Read latest state of `backend/app/services/_approval_queue/lifecycle.py:1-17` (17-line pure re-export module per Phase 6).
- [ ] Read `backend/app/services/_approval_queue/__init__.py` (the package init that imports from `lifecycle`).
- [ ] Read existing deepening contract tests at `tests/backend/pytest/test_architecture_deepening_contracts.py:1005,1025,1041` (these will be rewritten in the same commit).
- [ ] No concurrent feature work touches `_approval_queue/`.

**TDD Step 1 — Write Failing Test (RED)**

The test contract is captured by **rewriting** the 3 existing deepening tests at `test_architecture_deepening_contracts.py:1005, :1025, :1041` (per Phase 5 recipe `recipe-03-approvals.md:499-547`).

```python
# tests/backend/pytest/test_architecture_deepening_contracts.py:1005 (rewrite)
def test_approval_queue_routes_use_queue_lifecycle_module() -> None:
    """S6.3: routes consume the package directly; no `lifecycle` indirection."""
    import inspect
    from app.api.v1.endpoints.approvals import queue, resolve
    from app.services import _approval_queue as queue_pkg
    assert hasattr(queue_pkg, "ApprovalQueuePage")
    assert hasattr(queue_pkg, "ApprovalQueueProjection")
    assert hasattr(queue_pkg, "ApprovalRequestIntakePlan")
    route_source = inspect.getsource(queue) + inspect.getsource(resolve)
    assert "from app.services._approval_queue" in route_source
    assert "from app.services._approval_queue.lifecycle" not in route_source
```

```python
# :1025 (rewrite)
def test_approval_queue_lifecycle_uses_service_owned_helpers() -> None:
    """S6.3: package __init__ imports leaf submodules; no lifecycle aggregator."""
    import inspect
    from app.services import _approval_queue as queue_pkg
    package_source = inspect.getsource(queue_pkg)
    assert "from .contracts import" in package_source
    assert "from .counts import" in package_source
    assert "from .execution import" in package_source
    assert "from .queries import" in package_source
    assert "from .lifecycle" not in package_source
```

```python
# :1041 (rewrite)
def test_approval_queue_lifecycle_delegates_intake_query_projection() -> None:
    """S6.3: __init__ never inlines write-side logic; banned strings stay banned."""
    from pathlib import Path
    REPO = Path(__file__).resolve().parents[3]
    src = (REPO / "backend/app/services/_approval_queue/__init__.py").read_text()
    BANNED = ("create_approval_request_with_audit", "select(ApprovalRequest)",
              "def _build_delete_intake_plan", "def _approval_queue_page")
    for token in BANNED:
        assert token not in src, f"S6.3: banned token {token!r} found in package init"
```

Expected: RED at HEAD against the deletion (because `lifecycle.py` still exists and `__init__.py` re-imports from it). GREEN once `lifecycle.py` is gone and `__init__.py` carries the leaf imports.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/services/_approval_queue/__init__.py` — replace the current `from .lifecycle import (...)` block with the 4 leaf imports verbatim from `lifecycle.py:3-6`:
  ```python
  from .contracts import ApprovalQueuePage, ApprovalQueueProjection, ApprovalRequestIntakePlan
  from .counts import count_pending_approval_queue
  from .execution import create_delete_approval_request
  from .queries import list_approval_queue_page, list_my_approval_queue_page
  ```
  Keep the existing `__all__` list (already correct and identical).
- `tests/backend/pytest/test_architecture_deepening_contracts.py` — rewrite the 3 tests at `:1005, :1025, :1041` per the snippets above.

Files to delete:
- `backend/app/services/_approval_queue/lifecycle.py`.

Files to create:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/test_architecture_deepening_contracts.py -k approval_queue -x -q
pytest tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approval_resolution.py -x -q
make -f scripts/Makefile test-architecture-locks
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- 3 deepening tests rewritten as above.
- No TOML allowlist anchors `lifecycle.py`.

**README/Doc Updates (same commit)**:
- `backend/app/services/_approval_queue/README.md` — drop any reference to `lifecycle.py`.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -k approval_queue -q` — must pass.
2. `pytest tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approval_resolution.py -q` — must pass.
3. `make -f scripts/Makefile test-architecture-locks` — locks green.
4. `ruff check backend/app/services/_approval_queue/` — clean.
5. `mypy backend/app/services/_approval_queue/` — clean.

**Commit Boundary**: single commit (test rewrites + import migration + file deletion in same commit).
**Title**: `refactor(approvals): inline _approval_queue/lifecycle into package __init__`.

**Rollback** (class: LOCK-RATCHET — restores `lifecycle.py`, original `__init__.py` indirection, and original deepening test bodies):
1. `git revert <SHA>`.
2. Estimated revert time: 10 min.

**Risk Notes**: LOW — pure re-export deletion; identical surface. Mitigation: rewritten deepening tests pin the new structure (no lifecycle indirection); no change in runtime semantics.

---

### Item #26 — #75 — Delete-and-consolidate `_auto_reject_kri_approval`

**Sequence**: Wave 3, slot 26. **Effort**: S (≤2h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none — independent of #7/#9/#18/#33/#34/#54/#60.

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 26 (`final-section-2-sequence.md:59`).
- [ ] Read latest state of:
  - `backend/app/services/_approval_execution/kri_history_correction.py:23-24` (the duplicate).
  - `backend/app/services/_approval_execution/kri_value_submission.py:23-24` (byte-identical duplicate).
- [ ] Confirm 6 caller sites (Phase 6 verified at exact lines):
  - `kri_history_correction.py:50, 56, 67, 78, 119` (5 callers).
  - `kri_value_submission.py:97` (1 caller).
- [ ] Read `backend/app/services/_approval_execution/results.py` (recommended host — `SideEffectResult.auto_rejected` already lives here).
- [ ] No concurrent feature work touches `_approval_execution/`.

**TDD Step 1 — Write Failing Test (RED)**

Append to `tests/backend/pytest/test_architecture_deepening_contracts.py`:

```python
def test_auto_reject_kri_approval_consolidated() -> None:
    """Bonus #75: byte-identical duplicates removed; canonical lives in results."""
    import importlib
    history = importlib.import_module("app.services._approval_execution.kri_history_correction")
    submission = importlib.import_module("app.services._approval_execution.kri_value_submission")
    results = importlib.import_module("app.services._approval_execution.results")
    assert not hasattr(history, "_auto_reject_kri_approval"), (
        "Bonus #75: duplicate must be deleted from kri_history_correction"
    )
    assert not hasattr(submission, "_auto_reject_kri_approval"), (
        "Bonus #75: duplicate must be deleted from kri_value_submission"
    )
    assert hasattr(results, "auto_reject_kri_approval"), (
        "Bonus #75: canonical helper must live in _approval_execution.results"
    )
```

Expected: RED at HEAD — both duplicates exist; canonical does not.

Behavioral parity test extension to `tests/backend/pytest/test_approval_side_effect_dispatch.py` — add parametrized cases that exercise both auto-reject paths (history correction stale + value submission stale) and assert `SideEffectResult.outcome == SideEffectOutcome.AUTO_REJECTED` and `.reason` propagates through `apply_auto_rejection`. Use `client_factory` for any HTTP integration.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/services/_approval_execution/results.py` — append:
  ```python
  def auto_reject_kri_approval(approval: ApprovalRequest, reason: str) -> SideEffectResult:
      return SideEffectResult.auto_rejected(reason)
  ```
  (`ApprovalRequest` already imported at top of file; verify.)
- `backend/app/services/_approval_execution/kri_history_correction.py` — delete lines 23-24 (`def _auto_reject_kri_approval(...)`); replace 5 call sites at lines 50, 56, 67, 78, 119 with `auto_reject_kri_approval(...)`; merge the new symbol into the existing `from .results import SideEffectResult` import at line :18 → `from .results import SideEffectResult, auto_reject_kri_approval`.
- `backend/app/services/_approval_execution/kri_value_submission.py` — same: delete lines 23-24; replace caller at line 97; merge import at line :18.
- `tests/backend/pytest/test_architecture_deepening_contracts.py` — append the new structural assertion (above).
- `tests/backend/pytest/test_approval_side_effect_dispatch.py` — extend with parametrized auto-reject parity cases.

Files to create:
- None.

Files to delete:
- None (the duplicates are removed by editing, not by file deletion).

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/test_approval_side_effect_dispatch.py tests/backend/pytest/test_approval_edit_apply.py tests/backend/pytest/test_pending_kri_approval_preflight.py -x -q
pytest tests/backend/pytest/test_architecture_deepening_contracts.py -k auto_reject -q
make -f scripts/Makefile test-architecture-locks
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New structural assertion above.
- No TOML allowlist anchors.

**README/Doc Updates (same commit)**:
- `backend/app/services/_approval_execution/README.md` (if present) — list `auto_reject_kri_approval` under canonical helpers.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/test_approval_side_effect_dispatch.py -q` — must pass.
2. `pytest tests/backend/pytest/test_approval_edit_apply.py -q` — must pass.
3. `pytest tests/backend/pytest/test_pending_kri_approval_preflight.py -q` — must pass.
4. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -k auto_reject -q` — must pass.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `ruff check backend/app/services/_approval_execution/` — clean.
7. `mypy backend/app/services/_approval_execution/` — clean.

**Commit Boundary**: single commit.
**Title**: `refactor(approvals): consolidate auto_reject_kri_approval in _approval_execution.results`.

**Rollback** (class: TRIVIAL — restores both duplicates; outcome semantics unchanged):
1. `git revert <SHA>`.
2. Estimated revert time: 10 min.

**Risk Notes**: LOW — byte-identical duplicates; outcome semantics preserved. Mitigation: behavioral parametric parity test catches any drift; canonical co-locates with `SideEffectResult.auto_rejected`.

---

### Item #27 — #18 — Repoint-and-delete endpoint `_build_approval_read`

**Sequence**: Wave 3, slot 27. **Effort**: S (≤2h). **Priority**: P2. **Atomic with**: none — co-touches `_shared.py` with #7; keep separate commits. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 27 (`final-section-2-sequence.md:60`).
- [ ] Read latest state of:
  - `backend/app/api/v1/endpoints/approvals/_shared.py:34-61` (the endpoint copy).
  - `backend/app/services/_approval_queue/projection.py:13-39` (canonical, 19-field-for-field identical per Phase 6).
- [ ] Read 4 callers: `resolve.py:18,61,85,102` and `detail.py:15,56`.
- [ ] No concurrent feature work touches `approvals/_shared.py` (#7 in Wave 3 slot 20 also touches this file — keep in separate commit).

**TDD Step 1 — Write Failing Test (RED)**

Append to `tests/backend/pytest/test_architecture_deepening_contracts.py`:

```python
def test_endpoint_shim_build_approval_read_repointed() -> None:
    """S6.2: endpoint copy deleted; resolve+detail consume queue projection."""
    import importlib, inspect
    shared = importlib.import_module("app.api.v1.endpoints.approvals._shared")
    resolve = importlib.import_module("app.api.v1.endpoints.approvals.resolve")
    detail = importlib.import_module("app.api.v1.endpoints.approvals.detail")
    projection = importlib.import_module("app.services._approval_queue.projection")
    assert not hasattr(shared, "_build_approval_read"), (
        "S6.2: endpoint copy of _build_approval_read must be deleted"
    )
    assert hasattr(projection, "build_approval_read"), "canonical must remain"
    src = inspect.getsource(resolve) + inspect.getsource(detail)
    assert "build_approval_read" in src, "endpoints must consume canonical helper"
    assert "_build_approval_read" not in src, "endpoints must not call deleted shim"
```

Plus a 19-key response-shape parity regression in `tests/backend/pytest/test_approval_response_parity.py` (new file with `pytestmark = pytest.mark.contract`) using `client_factory`. Asserts that POST `/approvals/{id}/approve`, `/reject`, `/cancel`, and GET `/approvals/{id}` return the same 19 keys for a single approval row.

**TDD Step 2 — Implement Change**

Files to edit:
- `backend/app/api/v1/endpoints/approvals/resolve.py:18` — replace `from ._shared import _build_approval_read, logger` with `from ._shared import logger` and add `from app.services._approval_queue.projection import build_approval_read`.
- `backend/app/api/v1/endpoints/approvals/resolve.py:61, 85, 102` — replace `_build_approval_read(...)` with `build_approval_read(...)` (3 sites).
- `backend/app/api/v1/endpoints/approvals/detail.py:15` — replace `from ._shared import _build_approval_read` with `from app.services._approval_queue.projection import build_approval_read`.
- `backend/app/api/v1/endpoints/approvals/detail.py:56` — replace `_build_approval_read(...)` with `build_approval_read(...)`.
- `backend/app/api/v1/endpoints/approvals/_shared.py:34-61` — delete the entire `_build_approval_read` body. Drop now-orphaned imports (`approval_resource_label`, `ApprovalRequestRead`, `approval_capabilities`, `User`, `ApprovalRequest`). Keep `logger` symbol — `resolve.py` still imports it.
- `tests/backend/pytest/test_architecture_deepening_contracts.py` — append the new structural assertion.

Files to create:
- `tests/backend/pytest/test_approval_response_parity.py` (the 19-key response-shape parity regression).

Files to delete:
- None.

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/test_approval_workflow.py tests/backend/pytest/test_approval_resolution.py tests/backend/pytest/test_approvals.py -x -q
pytest tests/backend/pytest/test_approval_response_parity.py -q
pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q
make -f scripts/Makefile test-architecture-locks
```
All pass.

**Lock/TOML/Contract Updates (same commit)**:
- New structural assertion above.
- `_endpoint_commit_allowlist.toml`: no change (no new commits introduced).
- Existing positive anchor at `test_architecture_deepening_contracts.py:1029` (`assert hasattr(projection, "build_approval_read")`) reinforced — no change needed.

**README/Doc Updates (same commit)**:
- None. AUTHZ-APPROVALS row at `docs/security/authorization-capability-contract.md:119` already names `services/_approval_queue/projection.py`.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/test_approval_workflow.py -q` — must pass.
2. `pytest tests/backend/pytest/test_approval_resolution.py -q` — must pass.
3. `pytest tests/backend/pytest/test_approval_response_parity.py -q` — must pass.
4. `pytest tests/backend/pytest/test_architecture_deepening_contracts.py -q` — must pass.
5. `make -f scripts/Makefile test-architecture-locks` — locks green.
6. `ruff check backend/app/api/v1/endpoints/approvals/` — clean.
7. `mypy backend/app/api/v1/endpoints/approvals/` — clean.

**Commit Boundary**: single commit (RED test + 4 call-site repoints + deletion in same commit).
**Title**: `refactor(approvals): repoint _build_approval_read to approval_queue.projection`.

**Rollback** (class: TRIVIAL — restores endpoint copy; response shape unchanged either way):
1. `git revert <SHA>`.
2. Estimated revert time: 10 min.

**Risk Notes**: LOW — bodies are 19-field-for-field identical (Phase 6 verified). Mitigation: response-shape parity regression catches any drift; endpoint shim deletion is mechanical.

---

### Item #28 — #20 — Risk ID generation co-location (DOC-ONLY w/ stable re-export)

**Sequence**: Wave 3, slot 28. **Effort**: S (≤2h). **Priority**: P2. **Atomic with**: none. **Validator**: no.

**Dependencies (must be complete first)**: none

**Pre-flight checks**:
- [ ] Confirm slot in master sequence: v2 Seq 28 (`final-section-2-sequence.md:61`).
- [ ] Read latest state of `backend/app/api/v1/endpoints/risks/id_generation.py:7` (`async def generate_risk_id_code(db, process)`).
- [ ] Read `backend/app/api/v1/endpoints/risks/__init__.py:3,8` (the load-bearing re-export).
- [ ] Read `backend/app/api/v1/endpoints/risks/crud/create.py:19` (caller via package facade).
- [ ] Read `backend/scripts/migrate_risks.py:16` (caller via package facade).
- [ ] Read tests at `tests/backend/pytest/test_risks.py:556`, `tests/backend/pytest/test_risk_id_generation.py:13`.
- [ ] Read `docs/agent/ENDPOINT_INVARIANTS.md:11-14, 21-22`.
- [ ] No concurrent feature work touches risks endpoint surface.

**TDD Step 1 — Write Failing Test (RED — actually a forward-facing ratchet)**

File: `tests/backend/pytest/architecture/test_risks_required_reexports_red.py`

```python
"""S1.6: lock the load-bearing risks package re-export of generate_risk_id_code."""
from __future__ import annotations
import importlib
import re
from pathlib import Path
import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]

def test_generate_risk_id_code_is_re_exported_from_risks_package() -> None:
    pkg = importlib.import_module("app.api.v1.endpoints.risks")
    deep = importlib.import_module("app.api.v1.endpoints.risks.id_generation")
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
    invariants = (REPO_ROOT / "docs/agent/ENDPOINT_INVARIANTS.md").read_text(encoding="utf-8")
    assert "app.api.v1.endpoints.risks.generate_risk_id_code" in invariants
```

Expected: PASS today — the contract is already satisfied. The test is a forward-facing ratchet to prevent a future cleanup from removing the re-export.

**TDD Step 2 — Implement Change (DOC-ONLY)**

Files to create:
- `tests/backend/pytest/architecture/test_risks_required_reexports_red.py` (above).

Files to edit:
- `docs/agent/ENDPOINT_INVARIANTS.md:21-22` — bump verification date stanza from `2026-02-16` to `2026-05-09`. Add a stanza pinning `app.api.v1.endpoints.risks.generate_risk_id_code` re-export.
- `.planning/audits/_context/02-backend-endpoints.md` — add note: risks package facade re-export is load-bearing for `test_risks.py:556` and `test_risk_id_generation.py:13`. Future cleanup removing the re-export must first migrate both tests.
- `.planning/audits/_context/06-test-surface.md` — add one-line pointer to the two tests that depend on the package facade.

Files to delete:
- None (DOC-ONLY).

**TDD Step 3 — Confirm GREEN**

```
pytest tests/backend/pytest/architecture/test_risks_required_reexports_red.py -q
```
Already green; ratchet locks the contract.

**Lock/TOML/Contract Updates (same commit)**:
- New architecture lock IS the contract.
- No TOML allowlist edits required.

**README/Doc Updates (same commit)**:
- `docs/agent/ENDPOINT_INVARIANTS.md:21-22` — date bump and re-export pin.
- `.planning/audits/_context/02-backend-endpoints.md` — note row.
- `.planning/audits/_context/06-test-surface.md` — pointer.

**Verification Commands** (in order):
1. `pytest tests/backend/pytest/architecture/test_risks_required_reexports_red.py -q` — must be green.
2. `pytest tests/backend/pytest/test_risks.py -q` — sanity.
3. `pytest tests/backend/pytest/test_risk_id_generation.py -q` — sanity.
4. `make -f scripts/Makefile test-architecture-locks` — locks green.

**Commit Boundary**: single commit.
**Title**: `docs(risks): lock generate_risk_id_code package re-export contract`.

**Rollback** (class: DOC-ONLY):
1. Delete the test file; revert doc edits.
2. No source code touched.
3. Estimated revert time: 5 min.

**Risk Notes**: VERY LOW — DOC-ONLY ratchet; pure forward-facing pin. Mitigation: 4-assertion test catches any future cleanup that removes the re-export.

---

## End of Section 3 — Wave 1-3 Recipes (28 Items)

This section delivered the per-item recipes for sequence slots 1-28
covering Wave 1 (ADR ratification), Wave 2 (P1 quick wins + #76 auth
migration), and Wave 3 (P2 dead-code A). Section 4 picks up at slot 29
(Wave 4) for the doc-contract wave + remaining P2 dead-code.

