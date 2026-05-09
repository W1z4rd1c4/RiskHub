from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
PKG_INIT = REPO_ROOT / "backend/app/services/_graph_directory/__init__.py"
LEGACY_FILES = (
    REPO_ROOT / "backend/app/services/graph_directory_auth.py",
    REPO_ROOT / "backend/app/services/graph_directory_errors.py",
    REPO_ROOT / "backend/app/services/graph_directory_service.py",
    REPO_ROOT / "backend/app/services/graph_directory_transport.py",
)


def test_graph_directory_package_exists() -> None:
    assert PKG_INIT.is_file(), "S7.7: _graph_directory/__init__.py must exist"


def test_legacy_graph_directory_files_removed() -> None:
    for path in LEGACY_FILES:
        assert not path.exists(), f"S7.7: legacy file {path.name} must be moved into the package"


def test_no_production_imports_legacy_modules() -> None:
    offenders: list[str] = []
    for path in (REPO_ROOT / "backend/app").rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        for stem in ("graph_directory_auth", "graph_directory_errors", "graph_directory_service", "graph_directory_transport"):
            if f"from app.services.{stem}" in text:
                offenders.append(f"{path.relative_to(REPO_ROOT)}:{stem}")
    assert offenders == []
