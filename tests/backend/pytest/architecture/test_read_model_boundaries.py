"""Reviewed read-model roots reject private reach-through before policy-preserving moves."""

from __future__ import annotations

from importlib import import_module
from pathlib import Path

import pytest

from tests.backend.pytest.architecture._private_api_boundary import (
    load_surfaces,
    violations,
)

pytestmark = pytest.mark.contract
ROOT = Path(__file__).resolve().parents[4]


@pytest.mark.parametrize(
    "source,caller",
    [
        (
            "from app.services._dashboard_metrics.risks import load_risks_by_cell",
            "app.api.new",
        ),
        ("from app.services._dashboard_metrics import issues", "app.api.new"),
        (
            "from app.services._monitoring_status.export_rows import apply_kri_monitoring_rows",
            "app.services.other",
        ),
        (
            "from app.services._monitoring_status import apply_kri_monitoring_rows",
            "app.api.new",
        ),
        (
            "from app.services._monitoring_status import export_rows",
            "app.services.other",
        ),
        (
            "from app.services._quarterly_comparison.composition import build_quarterly_comparison",
            "app.services.other",
        ),
        (
            "from app.services._quarterly_comparison import build_quarterly_comparison",
            "app.api.new",
        ),
    ],
)
def test_new_read_model_boundaries_reject_leaf_and_role_bypasses(source, caller):
    assert violations(source, caller, load_surfaces(ROOT))


@pytest.mark.parametrize(
    "package", ["_dashboard_metrics", "_monitoring_status", "_quarterly_comparison"]
)
def test_new_root_declarations_resolve_without_module_escape_hatches(package):
    root = import_module("app.services." + package)
    assert root.__all__ == list(root.CALLER_EXPORTS)
    for name in root.__all__:
        exported = getattr(root, name)
        assert exported is not None
        assert not hasattr(exported, "__path__")
        assert type(exported).__name__ != "module"
    with pytest.raises(AttributeError):
        getattr(root, "undeclared_read_model_name")


@pytest.mark.parametrize(
    "package,name,lock",
    [
        (
            "_dashboard_metrics",
            "build_dashboard_summary_metrics",
            "test_dashboard_routes_use_metric_composition_module",
        ),
        (
            "_dashboard_metrics",
            "build_issue_summary_metrics",
            "test_dashboard_issue_metric_routes_delegate_to_metric_module",
        ),
        (
            "_monitoring_status",
            "apply_kri_monitoring_rows",
            "test_monitoring_export_rows_are_owned_by_monitoring_status_module",
        ),
        (
            "_quarterly_comparison",
            "build_quarterly_comparison",
            "test_quarterly_comparison_service_is_composition_facade",
        ),
        (
            "_dashboard_metrics",
            "load_risk_distribution",
            "test_dashboard_cell_filter_reuses_configured_range_owner",
        ),
        (
            "_dashboard_metrics",
            "load_risks_by_cell",
            "test_dashboard_cell_filter_reuses_configured_range_owner",
        ),
    ],
)
def test_root_wrapper_mutants_do_not_replace_canonical_implementation(
    monkeypatch, package, name, lock
):
    from tests.backend.pytest import test_architecture_deepening_contracts as locks

    root = import_module("app.services." + package)
    original = getattr(root, name)

    def forwarder(*args, **kwargs):
        return original(*args, **kwargs)

    monkeypatch.setattr(root, name, forwarder)
    with pytest.raises(AssertionError):
        getattr(locks, lock)()


def test_monitoring_classifier_reexport_keeps_its_existing_population_owner():
    from app.services import _monitoring_status, kri_populations

    assert _monitoring_status.classify_kri_breach is kri_populations.classify_kri_breach
    for projection, derive in [
        ("apply_control_monitoring_rows", "derive_control_monitoring_snapshot"),
        ("apply_kri_monitoring_rows", "derive_kri_monitoring_snapshot"),
    ]:
        assert getattr(_monitoring_status, projection).__globals__[derive] is getattr(
            _monitoring_status, derive
        )


@pytest.mark.parametrize(
    "package,old,new",
    [
        ("_dashboard_metrics", "lifecycle", "relocated_dashboard_composition"),
        ("_monitoring_status", "export_rows", "relocated_monitoring_projection"),
        ("_quarterly_comparison", "composition", "relocated_quarterly_composition"),
    ],
)
def test_real_read_model_move_preserves_unchanged_public_journeys(
    tmp_path, package, old, new
):
    import os
    import shutil
    import subprocess
    import sys

    sandbox = tmp_path / "repo"
    for directory in ("backend/app", "tests"):
        shutil.copytree(
            ROOT / directory,
            sandbox / directory,
            ignore=shutil.ignore_patterns("__pycache__", "results", "node_modules"),
        )
    shutil.copy2(ROOT / "backend/pytest.ini", sandbox / "backend/pytest.ini")
    owner = sandbox / "backend/app/services" / package
    original = owner / (old + ".py")
    content = original.read_bytes()
    moved = owner / (new + ".py")
    original.rename(moved)
    root = owner / "__init__.py"
    root.write_text(
        root.read_text().replace(
            "app.services." + package + "." + old, "app.services." + package + "." + new
        )
    )
    assert moved.read_bytes() == content and not original.exists()
    assert load_surfaces(sandbox) == load_surfaces(ROOT)
    journeys = [
        "test_read_model_boundary_http.py",
        "test_dashboard.py",
        "test_kri_export_population_http.py",
    ]
    for file in journeys:
        relative = Path("tests/backend/pytest") / file
        assert (sandbox / relative).read_bytes() == (ROOT / relative).read_bytes()
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "--no-cov",
            "-q",
            *["../tests/backend/pytest/" + file for file in journeys],
            "-k",
            (
                "uses_canonical or historical_current_uses_stored_snapshot "
                "or empty_department_scope_marks_live_snapshot_missing "
                "or historical_overdue_uses_replayed_frequency_and_period "
                "or unavailable_historical_facts_do_not_fabricate_live_overdue_state"
            ),
        ],
        cwd=sandbox / "backend",
        env=dict(
            os.environ,
            PYTHONPATH=str(sandbox / "backend") + os.pathsep + str(sandbox),
            TEST_DATABASE_URL="sqlite+aiosqlite:///:memory:",
            DATABASE_URL="sqlite+aiosqlite:///:memory:",
        ),
        capture_output=True,
        text=True,
        timeout=100,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "19 passed" in result.stdout, result.stdout


@pytest.mark.parametrize(
    "module_name,fragment,lock_name",
    [
        ("summary", "select(func.count(Control.id))", "test_dashboard_routes_use_metric_composition_module"),
        ("quarterly", "QuarterlyMetricSnapshot", "test_dashboard_routes_use_metric_composition_module"),
        *[("issues_metrics", fragment, "test_dashboard_issue_metric_routes_delegate_to_metric_module")
          for fragment in ("select(Issue)", "get_issue_scope_clause", "issue_has_active_approved_exception",
                           "def _load_scoped_issues", "def _open_unsuppressed_issues", "def _issue_age_days")],
    ],
)
def test_endpoint_owned_policy_fragments_still_fail_with_canonical_bindings(
    monkeypatch, module_name, fragment, lock_name
):
    import inspect

    from tests.backend.pytest import test_architecture_deepening_contracts as locks

    endpoint = import_module("app.api.v1.endpoints.dashboard." + module_name)
    original = inspect.getsource
    # Keep every canonical binding intact; an additional route-owned policy must fail.
    monkeypatch.setattr(inspect, "getsource", lambda obj: original(obj) + "\n" + fragment
                        if obj is endpoint else original(obj))
    with pytest.raises(AssertionError):
        getattr(locks, lock_name)()
