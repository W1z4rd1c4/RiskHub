"""ADR-010 contract for canonical Process ownership migration."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[4]
MIGRATION_PATH = (
    REPO_ROOT
    / "backend/alembic/versions/f7a8b9c0d1e2_replace_process_owner_text.py"
)


def _load_migration():
    spec = importlib.util.spec_from_file_location("process_ownership_migration", MIGRATION_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_process_ownership_migration_is_linear_and_forward_only() -> None:
    migration = _load_migration()

    assert migration.revision == "f7a8b9c0d1e2"
    assert migration.down_revision == "e6f7a8b9c0d1"
    with pytest.raises(NotImplementedError, match="ADR-010"):
        migration.downgrade()


def test_process_ownership_migration_drops_legacy_text_without_reconciliation() -> None:
    source = MIGRATION_PATH.read_text()

    assert 'op.drop_column("processes", "owner")' in source
    assert 'op.drop_column("processes", "owner_department")' in source
    assert "process_owner_user_id" in source
    assert "owning_department_id" in source
    assert "ondelete=\"RESTRICT\"" in source
    assert "owner-string reconciliation" in source
    assert "UPDATE processes SET owner" not in source


def test_process_ownership_migration_canonicalizes_every_controlled_field() -> None:
    migration = _load_migration()

    assert set(migration._CANONICAL_VALUE_UPDATES) == {
        "preliminary_criticality",
        "cif_override",
        "licensed_activity",
        "bcm_link",
        "dr_test_result",
        "interruption_impact",
    }
    assert dict(migration._CANONICAL_VALUE_UPDATES["preliminary_criticality"])["Kritická"] == "critical"
    assert dict(migration._CANONICAL_VALUE_UPDATES["bcm_link"])["Nerelevantní"] == "not_applicable"
