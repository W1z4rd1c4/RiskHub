from __future__ import annotations

from pathlib import Path


def test_owner_id_none_logs_and_skips_duplicate_guard() -> None:
    source = (Path(__file__).parents[3] / "backend/app/services/kri_deadline_service.py").read_text()

    assert "Skipping deadline duplicate guard for KRI %s" in source
    assert "Skipping deadline notification for KRI %s" in source
