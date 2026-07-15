"""ADR-010 contract for canonical Asset ownership migration."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[4]
MIGRATION_PATH = (
    REPO_ROOT
    / "backend/alembic/versions/g8b9c0d1e2f3_replace_asset_responsibility_text.py"
)


def _load_migration():
    spec = importlib.util.spec_from_file_location(
        "asset_ownership_migration", MIGRATION_PATH
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_asset_ownership_migration_is_linear_and_forward_only() -> None:
    migration = _load_migration()

    assert migration.revision == "g8b9c0d1e2f3"
    assert migration.down_revision == "f7a8b9c0d1e2"
    with pytest.raises(NotImplementedError, match="ADR-010"):
        migration.downgrade()


def test_asset_ownership_migration_drops_legacy_text_without_reconciliation() -> None:
    source = MIGRATION_PATH.read_text()

    for column in ("business_owner", "ict_owner", "owner_department"):
        assert f'op.drop_column("assets", "{column}")' in source
    for column in (
        "business_owner_user_id",
        "ict_owner_user_id",
        "owning_department_id",
    ):
        assert column in source
    assert source.count('ondelete="RESTRICT"') == 3
    assert "owner-string reconciliation" in source
    assert "UPDATE assets SET business_owner" not in source


def test_asset_ownership_migration_canonicalizes_every_controlled_field() -> None:
    migration = _load_migration()

    assert set(migration._CANONICAL_VALUE_UPDATES) == {
        "asset_type",
        "asset_level",
        "deployment_model",
        "gdpr_relevance",
        "ai_relevance",
        "data_classification",
        "internet_exposed",
        "preliminary_criticality",
        "lifecycle_state",
        "review_state",
    }
    assert (
        dict(migration._CANONICAL_VALUE_UPDATES["asset_type"])["Cloud služba"]
        == "cloud_service"
    )
    assert (
        dict(migration._CANONICAL_VALUE_UPDATES["data_classification"])[
            "Vysoce důvěrná / regulovaná data"
        ]
        == "highly_confidential_regulated"
    )


def test_asset_orphan_migration_adds_role_specific_pending_identity() -> None:
    source = MIGRATION_PATH.read_text()

    assert (
        'sa.Column("responsibility_role", sa.String(length=30), nullable=True)'
        in source
    )
    assert "ck_orphaned_items_responsibility_role" in source
    assert "uq_orphaned_items_pending_item_role" in source
    assert '["item_type", "item_id", "responsibility_role"]' in source
    assert "status = 'pending' AND responsibility_role IS NOT NULL" in source
