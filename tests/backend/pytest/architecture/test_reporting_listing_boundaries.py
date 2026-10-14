"""Declared reporting/listing interfaces, real internal moves and seeded negatives."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
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
            "from app.services._register_listings.issues import plan_issue_listing",
            "app.api.new",
        ),
        (
            "from app.services._register_listings import plan_control_listing",
            "app.api.new",
        ),
        ("from app.services._register_listings import plan_kri_listing", "app.api.new"),
        (
            "from app.services._register_listings import plan_vendor_listing",
            "app.api.new",
        ),
        (
            "from app.services._reporting.exports.rows import _issue_to_row",
            "app.services.other",
        ),
        ("from app.services._reporting import missing", "app.api.new"),
        (
            "import app.services._reporting as api\ngetattr(api, 'build_issue_export_rows')",
            "app.api.new",
        ),
    ],
)
def test_reachthrough_and_undeclared_planners_are_rejected(source, caller):
    assert violations(source, caller, load_surfaces(ROOT))


@pytest.mark.parametrize("package", ["_register_listings", "_reporting"])
def test_declared_root_exports_resolve_and_unknown_attribute_refuses(package):
    from importlib import import_module

    module = import_module("app.services." + package)
    assert module.__all__ == list(module.CALLER_EXPORTS)
    for name in module.__all__:
        assert getattr(module, name) is not None
    with pytest.raises(AttributeError):
        getattr(module, "definitely_undeclared")


@pytest.mark.parametrize(
    "first",
    [
        "app.services.risk_row_criteria",
        "app.services.approval_intake",
        "app.core.approval_helpers",
        "app.services._register_listings",
        "app.services._reporting",
        "app.services._dashboard_metrics",
        "app.services._monitoring_status",
        "app.services._quarterly_comparison",
    ],
)
def test_cold_import_order_and_mounted_endpoints(first):
    script = (
        f"import importlib; importlib.import_module({first!r}); "
        "from app.main import app; paths=app.openapi()['paths']; "
        "assert '/api/v1/issues/export' in paths; assert '/api/v1/kris/export' in paths; "
        "from app.schemas.control import ControlRead; from app.schemas.kri import KRIResponse; "
        "from app.schemas.risk import RiskRead; "
        "assert all(model.model_json_schema() for model in (ControlRead, KRIResponse, RiskRead))"
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=ROOT / "backend",
        capture_output=True,
        text=True,
        timeout=45,
    )
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.parametrize(
    "package,old,new",
    [
        ("_register_listings", "issues", "relocated_issue_planner"),
        ("_reporting", "current_register", "relocated_kri_projection"),
    ],
)
def test_real_internal_move_preserves_unchanged_public_csv_and_denial(
    tmp_path, package, old, new
):
    sandbox = tmp_path / "repo"
    shutil.copytree(
        ROOT / "backend/app",
        sandbox / "backend/app",
        ignore=shutil.ignore_patterns("__pycache__"),
    )
    shutil.copytree(
        ROOT / "tests",
        sandbox / "tests",
        ignore=shutil.ignore_patterns("__pycache__", "results", "node_modules"),
    )
    shutil.copy2(ROOT / "backend/pytest.ini", sandbox / "backend/pytest.ini")
    owner = sandbox / "backend/app/services" / package
    original = owner / (old + ".py")
    content = original.read_bytes()
    moved = owner / (new + ".py")
    original.rename(moved)
    wiring = owner / "__init__.py"
    old_path = "app.services." + package + "." + old
    wiring.write_text(
        wiring.read_text().replace(old_path, "app.services." + package + "." + new)
    )
    assert moved.read_bytes() == content and not original.exists()
    assert load_surfaces(sandbox) == load_surfaces(ROOT)
    journey = "tests/backend/pytest/test_reporting_boundary_http.py"
    assert (sandbox / journey).read_bytes() == (ROOT / journey).read_bytes()
    environment = dict(
        os.environ,
        PYTHONPATH=str(sandbox / "backend") + os.pathsep + str(sandbox),
        TEST_DATABASE_URL="sqlite+aiosqlite:///:memory:",
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
    )
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "--no-cov",
            "-q",
            "../" + journey,
            "-k",
            "csv_public_journey or export_denied_without_domain_authority",
        ],
        cwd=sandbox / "backend",
        env=environment,
        capture_output=True,
        text=True,
        timeout=90,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "3 passed" in result.stdout


@pytest.mark.parametrize("entity", ["risk", "control", "kri", "issue", "vendor"])
def test_declared_planner_wrapper_cannot_evade_implementation_ownership(
    monkeypatch, entity
):
    from app.services import _register_listings
    from tests.backend.pytest import test_architecture_deepening_contracts as locks

    name = "plan_" + entity + "_listing"
    original = getattr(_register_listings, name)

    def forwarder(*args, **kwargs):
        return original(*args, **kwargs)

    monkeypatch.setattr(_register_listings, name, forwarder)
    with pytest.raises(AssertionError):
        locks.test_register_listing_entity_modules_own_planners()
