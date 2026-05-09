from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
TRIO = (
    REPO_ROOT / "backend/app/services/_issue_register/source_mutation.py",
    REPO_ROOT / "backend/app/services/_issue_workflow/update_plans.py",
    REPO_ROOT / "backend/app/services/_issue_register/linked_context.py",
)


def test_source_type_value_canonical_home_exists() -> None:
    from app.services._issue_register import constants

    assert hasattr(constants, "source_type_value")


def test_source_type_value_defined_only_in_constants() -> None:
    defs = 0
    for path in TRIO:
        text = path.read_text()
        if "def source_type_value" in text or "def _source_type_value" in text:
            defs += 1
    assert defs == 0, "duplicate source_type_value definitions remain in trio"
