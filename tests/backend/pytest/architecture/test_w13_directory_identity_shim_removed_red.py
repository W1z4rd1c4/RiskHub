from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SHIM = REPO_ROOT / "backend/app/services/directory_identity_service.py"


def test_directory_identity_shim_deleted() -> None:
    assert not SHIM.exists(), "S7.6: directory_identity_service.py shim must be deleted"


def test_no_production_imports_shim() -> None:
    offenders: list[str] = []
    for root in (REPO_ROOT / "backend/app", REPO_ROOT / "backend/scripts"):
        for path in root.rglob("*.py"):
            text = path.read_text(encoding="utf-8")
            if "from app.services.directory_identity_service" in text:
                offenders.append(str(path.relative_to(REPO_ROOT)))
    assert offenders == []
