from __future__ import annotations

import logging
import sys
from importlib import util
from pathlib import Path
from types import ModuleType

MIGRATION_PATH = (
    Path(__file__).parents[4] / "backend" / "alembic" / "versions" / "h3i4j5k6l7m8_unify_archive_state.py"
)


def _load_migration() -> ModuleType:
    spec = util.spec_from_file_location("riskhub_h3i4j5k6l7m8_unify_archive_state", MIGRATION_PATH)
    assert spec is not None and spec.loader is not None
    module = util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_unify_archive_state_logs_idempotent_marker(monkeypatch, caplog) -> None:
    migration = _load_migration()
    executed: list[str] = []

    class FakeResult:
        def scalar_one(self) -> int:
            return 1

    class FakeBind:
        def execute(self, statement):
            sql = str(statement)
            executed.append(sql)
            if "SELECT COUNT(*) FROM risks WHERE is_archived = true" in sql:
                return FakeResult()
            return None

    class FakeOp:
        def __init__(self) -> None:
            self.bind = FakeBind()

        def get_bind(self):
            return self.bind

        def execute(self, statement) -> None:
            self.bind.execute(statement)

    monkeypatch.setattr(migration, "op", FakeOp())

    with caplog.at_level(logging.INFO):
        migration.upgrade()

    assert "h3i4j5k6l7m8: already-partially-applied" in caplog.text
    assert any("UPDATE risks SET is_archived = true" in sql for sql in executed)
    assert any("UPDATE vendors SET status = 'active'" in sql for sql in executed)
