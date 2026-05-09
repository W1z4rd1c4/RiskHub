"""B-N1: workflow/source_validation drops underscore self-aliases."""
from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
TARGET = REPO_ROOT / "backend/app/services/_issue_workflow/source_validation.py"

BANNED = (
    "_ensure_owner_assignable = ensure_owner_assignable",
    "_issue_link_department_ids = issue_link_department_ids",
    "_resolve_vendor_department_and_access = resolve_vendor_department_and_access",
    "_validate_user_exists = validate_user_exists",
)


def test_no_self_aliases() -> None:
    text = TARGET.read_text()
    for line in BANNED:
        assert line not in text, f"B-N1: alias must be deleted: {line!r}"
