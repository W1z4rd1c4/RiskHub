from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

ROOT = Path(__file__).resolve().parents[4]
MIGRATION_PATH = ROOT / "backend/alembic/versions/e6f7a8b9c0d1_add_ciso_threat_stewardship.py"


def _load_migration():
    spec = importlib.util.spec_from_file_location("ciso_stewardship_migration", MIGRATION_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _DataMigrationOps:
    """Exercise the upgrade data transform without SQLite ALTER limitations."""

    def __init__(self, connection) -> None:
        self._connection = connection

    def get_bind(self):
        return self._connection

    def add_column(self, *args, **kwargs) -> None:
        pass

    def create_index(self, *args, **kwargs) -> None:
        pass

    def create_foreign_key(self, *args, **kwargs) -> None:
        pass


def test_upgrade_canonicalizes_existing_custom_ciso_to_exact_least_privilege() -> None:
    migration = _load_migration()
    engine = create_engine("sqlite:///:memory:")
    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "CREATE TABLE threats ("
                    "id INTEGER PRIMARY KEY, category VARCHAR(100) NOT NULL)"
                )
            )
            connection.execute(
                text(
                    "CREATE TABLE roles ("
                    "id INTEGER PRIMARY KEY, name VARCHAR(50) UNIQUE NOT NULL, "
                    "display_name VARCHAR(100) NOT NULL, description VARCHAR(255), "
                    "is_system BOOLEAN NOT NULL, is_active BOOLEAN NOT NULL)"
                )
            )
            connection.execute(
                text(
                    "CREATE TABLE permissions ("
                    "id INTEGER PRIMARY KEY, resource VARCHAR(50) NOT NULL, "
                    "action VARCHAR(50) NOT NULL, description VARCHAR(255))"
                )
            )
            connection.execute(
                text(
                    "CREATE TABLE role_permissions ("
                    "id INTEGER PRIMARY KEY, role_id INTEGER NOT NULL, "
                    "permission_id INTEGER NOT NULL)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO roles "
                    "(id, name, display_name, description, is_system, is_active) "
                    "VALUES (7, 'ciso', 'Custom CISO', 'User-defined role', true, false)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO permissions (id, resource, action, description) "
                    "VALUES (99, 'users', 'write', 'Excessive custom grant')"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO role_permissions (role_id, permission_id) "
                    "VALUES (7, 99)"
                )
            )
            connection.execute(text("INSERT INTO threats (id, category) VALUES (1, 'Dostupnost')"))

            migration.op = _DataMigrationOps(connection)
            migration.upgrade()

            assert connection.execute(
                text(
                    "SELECT display_name, description, is_system, is_active "
                    "FROM roles WHERE name = 'ciso'"
                )
            ).one() == (
                "Chief Information Security Officer",
                "Threat stewardship and ICT security oversight",
                0,
                1,
            )

            granted_keys = connection.execute(
                text(
                    "SELECT p.resource || ':' || p.action "
                    "FROM role_permissions rp "
                    "JOIN permissions p ON p.id = rp.permission_id "
                    "WHERE rp.role_id = 7 ORDER BY p.resource, p.action"
                )
            ).scalars().all()
            assert len(granted_keys) == len(migration.CISO_PERMISSION_KEYS) == 14
            assert set(granted_keys) == set(migration.CISO_PERMISSION_KEYS)
            assert "users:write" not in granted_keys

            assert connection.execute(text("SELECT category FROM threats WHERE id = 1")).scalar_one() == "availability"
    finally:
        engine.dispose()


def test_ciso_stewardship_migration_remains_forward_only() -> None:
    migration = _load_migration()
    with pytest.raises(NotImplementedError, match="ADR-010"):
        migration.downgrade()


def test_migration_preserves_existing_threats_as_distinct_nullable_assignment_gaps() -> None:
    source = MIGRATION_PATH.read_text(encoding="utf-8")

    assert 'sa.Column("threat_steward_user_id", sa.Integer(), nullable=True)' in source
    assert "UPDATE threats SET threat_steward_user_id" not in source
    assert "INSERT INTO orphaned_items" not in source
