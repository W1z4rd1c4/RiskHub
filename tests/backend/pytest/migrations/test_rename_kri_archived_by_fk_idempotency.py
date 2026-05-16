from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = [pytest.mark.contract, pytest.mark.postgres]

MIGRATION = (
    Path(__file__).parents[4]
    / "backend"
    / "alembic"
    / "versions"
    / "j5k6l7m8n9o0_rename_kri_archived_by_fk.py"
)


def _source() -> str:
    return MIGRATION.read_text()


def test_rename_kri_archived_by_fk_idempotency_guard_branches() -> None:
    source = _source()

    assert 'name == "fk_key_risk_indicators_archived_by_id"' in source
    assert 'name == "fk_key_risk_indicators_archived_by_id_users"' in source
    assert "name is None" in source


def test_rename_kri_archived_by_fk_rejects_unexpected_name() -> None:
    source = _source()

    assert "unexpected FK name on key_risk_indicators.archived_by_id" in source
    assert "raise RuntimeError" in source


def test_rename_kri_archived_by_fk_uses_literal_old_fk_drop() -> None:
    source = _source()

    assert 'op.drop_constraint("fk_key_risk_indicators_archived_by_id"' in source
