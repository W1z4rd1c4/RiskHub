"""S3.5: _kri_history/correction_plans.py must be deleted."""
from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
WRAPPER = REPO_ROOT / "backend/app/services/_kri_history/correction_plans.py"


def test_wrapper_deleted() -> None:
    assert not WRAPPER.exists(), "S3.5: wrapper must be deleted"
