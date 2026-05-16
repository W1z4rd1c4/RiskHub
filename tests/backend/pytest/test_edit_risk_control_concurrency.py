from __future__ import annotations

import re
from pathlib import Path


def _compact_source(path: Path) -> str:
    return re.sub(r"\s+", "", path.read_text())


def test_concurrent_two_approval_race_blocks_with_row_lock() -> None:
    root = Path(__file__).parents[3]
    edit_source = _compact_source(root / "backend/app/services/_approval_execution/edit_risk_control.py")
    delete_source = _compact_source(root / "backend/app/services/_approval_execution/delete_side_effects.py")

    assert "select(Risk).where(Risk.id==approval.resource_id).with_for_update()" in edit_source
    assert "select(Control).where(Control.id==approval.resource_id).with_for_update()" in edit_source
    assert "select(Risk).where(Risk.id==approval.resource_id).with_for_update()" in delete_source
    assert "select(Control).where(Control.id==approval.resource_id).with_for_update()" in delete_source
    assert (
        "select(KeyRiskIndicator).options(joinedload(KeyRiskIndicator.risk))"
        ".where(KeyRiskIndicator.id==approval.resource_id).with_for_update()"
    ) in delete_source
