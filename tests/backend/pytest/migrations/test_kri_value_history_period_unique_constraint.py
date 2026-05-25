"""KRI value-history period uniqueness migration contract."""

from pathlib import Path
from types import ModuleType

import pytest
from sqlalchemy import text

from alembic.migration import MigrationContext
from alembic.operations import Operations

CONSTRAINT_NAME = "uq_kri_value_history_kri_period_end"
MIGRATION_GLOB = "*_add_kri_value_history_period_unique_constraint.py"


def _migration_source() -> str:
    versions_dir = Path(__file__).parents[4] / "backend" / "alembic" / "versions"
    matches = sorted(versions_dir.glob(MIGRATION_GLOB))
    assert len(matches) == 1, f"expected exactly one migration matching {MIGRATION_GLOB}, found {matches}"
    return matches[0].read_text()


def _load_migration() -> ModuleType:
    import importlib.util
    import sys

    versions_dir = Path(__file__).parents[4] / "backend" / "alembic" / "versions"
    matches = sorted(versions_dir.glob(MIGRATION_GLOB))
    assert len(matches) == 1, f"expected exactly one migration matching {MIGRATION_GLOB}, found {matches}"
    spec = importlib.util.spec_from_file_location("riskhub_kri_value_history_period_unique_constraint", matches[0])
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["riskhub_kri_value_history_period_unique_constraint"] = module
    spec.loader.exec_module(module)
    return module


def _run_migration_upgrade(sync_connection) -> None:
    context = MigrationContext.configure(sync_connection)
    with Operations.context(context):
        _load_migration().upgrade()


def test_kri_value_history_period_unique_constraint_migration_names_constraint() -> None:
    source = _migration_source()

    assert CONSTRAINT_NAME in source
    assert "kri_value_history" in source
    assert '"kri_id"' in source
    assert '"period_end"' in source
    assert "create_unique_constraint" in source


def test_kri_value_history_period_unique_constraint_migration_preflights_duplicates() -> None:
    source = _migration_source()

    assert "GROUP BY kri_id, period_end" in source
    assert "HAVING COUNT(*) > 1" in source
    assert "Duplicate KRI value history rows" in source
    assert "period_end" in source
    assert "RuntimeError" in source


def test_kri_value_history_period_unique_constraint_preflight_reports_duplicate_groups(monkeypatch) -> None:
    migration = _load_migration()

    class FakeResult:
        def mappings(self):
            return self

        def all(self):
            return [{"kri_id": 7, "period_end": "2026-03-31", "duplicate_count": 2}]

    class FakeBind:
        def execute(self, statement):
            return FakeResult()

    monkeypatch.setattr(migration.op, "get_bind", lambda: FakeBind())

    with pytest.raises(
        RuntimeError,
        match=r"Duplicate KRI value history rows.*kri_id=7 period_end=2026-03-31 count=2",
    ):
        migration._preflight_duplicate_periods()


def test_kri_value_history_period_unique_constraint_is_in_model_metadata() -> None:
    from app.models.kri_history import KRIValueHistory

    constraints = {
        constraint.name: tuple(column.name for column in constraint.columns)
        for constraint in KRIValueHistory.__table__.constraints
    }

    assert constraints[CONSTRAINT_NAME] == ("kri_id", "period_end")


@pytest.mark.postgres
async def test_kri_value_history_period_unique_constraint_present_in_postgres(postgres_engine_pre_migration) -> None:
    async with postgres_engine_pre_migration.begin() as conn:
        await conn.run_sync(_run_migration_upgrade)
        result = await conn.execute(
            text(
                """
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'kri_value_history'::regclass
              AND conname = :constraint_name
            """,
            ),
            {"constraint_name": CONSTRAINT_NAME},
        )

    assert result.scalar_one_or_none() == CONSTRAINT_NAME
