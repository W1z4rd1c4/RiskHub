from __future__ import annotations

import sys
from importlib import util
from pathlib import Path
from types import ModuleType

import pytest

pytestmark = [pytest.mark.contract, pytest.mark.postgres]

MIGRATION = (
    Path(__file__).parents[4] / "backend" / "alembic" / "versions" / "i4j5k6l7m8n9_approver_roles_to_jsonb.py"
)


def _load_migration() -> ModuleType:
    spec = util.spec_from_file_location("riskhub_i4j5k6l7m8n9_approver_roles_to_jsonb", MIGRATION)
    assert spec is not None and spec.loader is not None
    module = util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeContext:
    class Dialect:
        name = "postgresql"

    dialect = Dialect()


class FakeResult:
    def __init__(self, rows) -> None:
        self.rows = rows

    def all(self):
        return self.rows


class FakeBind:
    def __init__(self) -> None:
        self.statements: list[str] = []

    def execute(self, statement):
        sql = str(statement)
        self.statements.append(sql)
        if "NOT (approver_roles ~" in sql:
            return FakeResult([])
        return FakeResult([(7, '["cro",]'), (8, "not-json"), (9, '["risk_manager"]')])


class FakeOp:
    def __init__(self) -> None:
        self.bind = FakeBind()
        self.alter_column_called = False

    def get_context(self) -> FakeContext:
        return FakeContext()

    def get_bind(self) -> FakeBind:
        return self.bind

    def alter_column(self, *args, **kwargs) -> None:
        self.alter_column_called = True


def test_approver_roles_jsonb_preflight_parses_full_json_before_cast(monkeypatch) -> None:
    migration = _load_migration()
    fake_op = FakeOp()
    monkeypatch.setattr(migration, "op", fake_op)

    with pytest.raises(RuntimeError, match=r"Malformed approver_roles JSON rows before JSONB migration: \[7, 8\]"):
        migration.upgrade()

    assert not fake_op.alter_column_called
    assert any("SELECT id, approver_roles FROM approval_scenarios" in sql for sql in fake_op.bind.statements)
