from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
FACADE = REPO_ROOT / "backend/app/services/access_user_service.py"


def test_access_user_service_facade_deleted() -> None:
    assert not FACADE.exists(), "S7.5: access_user_service.py facade must be deleted"


def test_no_production_module_imports_facade() -> None:
    offenders: list[str] = []
    for path in (REPO_ROOT / "backend/app").rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if "from app.services.access_user_service" in text or "import app.services.access_user_service" in text:
            offenders.append(str(path.relative_to(REPO_ROOT)))
    assert offenders == []
