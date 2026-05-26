from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest
from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine, text

ROOT = Path(__file__).resolve().parents[3]
MIGRATION_PATH = ROOT / "backend/alembic/versions/h3i4j5k6l7m8_unify_archive_state.py"


def _load_migration():
    spec = importlib.util.spec_from_file_location("unify_archive_state_migration", MIGRATION_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_unify_archive_state_migration_forward_updates_legacy_rows(monkeypatch) -> None:
    migration = _load_migration()
    engine = create_engine("sqlite:///:memory:")
    try:
        with engine.begin() as connection:
            connection.execute(
                text("CREATE TABLE risks (id INTEGER PRIMARY KEY, status VARCHAR(20), is_archived BOOLEAN)")
            )
            connection.execute(
                text("CREATE TABLE controls (id INTEGER PRIMARY KEY, status VARCHAR(20), is_archived BOOLEAN)")
            )
            connection.execute(
                text("CREATE TABLE vendors (id INTEGER PRIMARY KEY, status VARCHAR(20), is_archived BOOLEAN)")
            )
            connection.execute(text("INSERT INTO risks (id, status, is_archived) VALUES (1, 'archived', 0)"))
            connection.execute(text("INSERT INTO controls (id, status, is_archived) VALUES (1, 'archived', 0)"))
            connection.execute(text("INSERT INTO vendors (id, status, is_archived) VALUES (1, 'inactive', 0)"))

            context = MigrationContext.configure(connection)
            monkeypatch.setattr(migration, "op", Operations(context))
            migration.upgrade()

            assert connection.execute(text("SELECT status, is_archived FROM risks WHERE id = 1")).one() == (
                "active",
                1,
            )
            assert connection.execute(text("SELECT status, is_archived FROM controls WHERE id = 1")).one() == (
                "active",
                1,
            )
            assert connection.execute(text("SELECT status, is_archived FROM vendors WHERE id = 1")).one() == (
                "active",
                1,
            )
    finally:
        engine.dispose()


def test_unify_archive_state_migration_is_forward_only() -> None:
    migration = _load_migration()
    with pytest.raises(NotImplementedError, match="ADR-010"):
        migration.downgrade()
