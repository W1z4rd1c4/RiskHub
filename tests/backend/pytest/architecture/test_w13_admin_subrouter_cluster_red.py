"""Admin sub-router 4-cluster split (#40)."""

from __future__ import annotations

import importlib
import pathlib

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]
ADMIN = REPO_ROOT / "backend/app/api/v1/endpoints/admin"


def _route_paths(module_name: str) -> set[str]:
    mod = importlib.import_module(f"app.api.v1.endpoints.admin.{module_name}")
    return {route.path for route in mod.router.routes}


def test_empty_console_compatibility_module_removed_after_split() -> None:
    assert not (ADMIN / "console.py").exists()


def test_system_status_cluster() -> None:
    paths = _route_paths("system_status")
    assert {"/health", "/jobs/status", "/outbox/status", "/stats"} <= paths


def test_operational_logs_cluster() -> None:
    paths = _route_paths("operational_logs")
    assert "/logs" in paths


def test_sessions_cluster() -> None:
    paths = _route_paths("sessions")
    assert "/sessions" in paths
    assert any(path.endswith("/revoke") for path in paths)


def test_admin_init_exports_clusters() -> None:
    src = (ADMIN / "__init__.py").read_text()
    for name in ("system_status", "operational_logs", "sessions"):
        assert name in src
