from __future__ import annotations

import importlib.util
import json
import re
from pathlib import Path

import sqlalchemy as sa

REPO_ROOT = Path(__file__).resolve().parents[3]
SEED_MIGRATION = REPO_ROOT / "backend/alembic/versions/74f4ad1b68cb_add_risk_hub_tables.py"
FORWARD_MIGRATION = (
    REPO_ROOT / "backend/alembic/versions/e0f1a2b4c5d6_add_risk_owner_to_risk_edit_priority.py"
)


def _risk_edit_priority_roles_from_seed() -> list[str]:
    seed_sql = SEED_MIGRATION.read_text()
    match = re.search(r"\('risk_edit_priority'.*?'(\[[^']+\])'\)", seed_sql)
    assert match is not None
    return json.loads(match.group(1))


def _load_forward_migration():
    spec = importlib.util.spec_from_file_location("risk_edit_priority_seed_migration", FORWARD_MIGRATION)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_risk_edit_priority_historical_seed_remains_original_default() -> None:
    """The historical seed stays unchanged; the forward migration owns the role patch."""
    assert _risk_edit_priority_roles_from_seed() == ["risk_manager", "cro"]


def test_risk_edit_priority_forward_migration_updates_only_default_rows() -> None:
    migration = _load_forward_migration()
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                """
                CREATE TABLE approval_scenarios (
                    key TEXT PRIMARY KEY,
                    approver_roles TEXT NOT NULL
                )
                """
            )
        )
        conn.execute(
            sa.text("INSERT INTO approval_scenarios (key, approver_roles) VALUES (:key, :roles)"),
            [
                {"key": "risk_edit_priority", "roles": '["risk_manager", "cro"]'},
                {"key": "risk_delete", "roles": '["risk_manager", "cro"]'},
            ],
        )

        migration.upgrade_risk_edit_priority_roles(conn)
        migration.upgrade_risk_edit_priority_roles(conn)

        rows = dict(conn.execute(sa.text("SELECT key, approver_roles FROM approval_scenarios")).all())

    assert json.loads(rows["risk_edit_priority"]) == ["risk_owner", "risk_manager", "cro"]
    assert json.loads(rows["risk_delete"]) == ["risk_manager", "cro"]


def test_risk_edit_priority_forward_migration_preserves_custom_rows() -> None:
    migration = _load_forward_migration()
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                """
                CREATE TABLE approval_scenarios (
                    key TEXT PRIMARY KEY,
                    approver_roles TEXT NOT NULL
                )
                """
            )
        )
        conn.execute(
            sa.text("INSERT INTO approval_scenarios (key, approver_roles) VALUES (:key, :roles)"),
            {"key": "risk_edit_priority", "roles": '["custom_role"]'},
        )

        migration.upgrade_risk_edit_priority_roles(conn)
        roles = conn.scalar(sa.text("SELECT approver_roles FROM approval_scenarios WHERE key = 'risk_edit_priority'"))

    assert json.loads(roles) == ["custom_role"]
