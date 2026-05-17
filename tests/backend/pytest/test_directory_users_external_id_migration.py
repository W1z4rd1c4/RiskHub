from __future__ import annotations

import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
MIGRATION_PATH = (
    REPO_ROOT
    / "backend"
    / "alembic"
    / "versions"
    / "514f30f4b0c9_add_orphaned_items_table.py"
)


def _load_migration_module():
    spec = importlib.util.spec_from_file_location("orphaned_items_migration", MIGRATION_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize(
    "constraint_name",
    ["uq_directory_users_external_id", "directory_users_external_id_key"],
)
def test_directory_user_external_id_migration_drops_existing_unique_constraint(
    monkeypatch: pytest.MonkeyPatch,
    constraint_name: str,
) -> None:
    migration = _load_migration_module()
    dropped_constraints: list[tuple[str, str, str]] = []

    class FakeInspector:
        def get_unique_constraints(self, table_name: str):
            assert table_name == "directory_users"
            return [{"name": constraint_name, "column_names": ["external_id"]}]

    class FakeOp:
        def get_bind(self):
            return SimpleNamespace()

        def drop_constraint(self, name: str, table_name: str, type_: str) -> None:
            dropped_constraints.append((name, table_name, type_))

    monkeypatch.setattr(migration, "op", FakeOp())
    monkeypatch.setattr(migration.sa, "inspect", lambda bind: FakeInspector())

    migration._drop_directory_users_external_id_unique_constraint()

    assert dropped_constraints == [(constraint_name, "directory_users", "unique")]


def test_directory_user_external_id_migration_tolerates_missing_unique_constraint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    migration = _load_migration_module()
    dropped_constraints: list[str] = []

    class FakeInspector:
        def get_unique_constraints(self, table_name: str):
            assert table_name == "directory_users"
            return []

    class FakeOp:
        def get_bind(self):
            return SimpleNamespace()

        def drop_constraint(self, name: str, table_name: str, type_: str) -> None:
            dropped_constraints.append(name)

    monkeypatch.setattr(migration, "op", FakeOp())
    monkeypatch.setattr(migration.sa, "inspect", lambda bind: FakeInspector())

    migration._drop_directory_users_external_id_unique_constraint()

    assert dropped_constraints == []
