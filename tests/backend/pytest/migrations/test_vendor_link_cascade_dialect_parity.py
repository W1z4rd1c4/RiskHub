from __future__ import annotations

from contextlib import nullcontext
from types import SimpleNamespace

from tests.backend.pytest.migrations.conftest import load_vendor_migration


def test_vendor_link_cascade_dialect_parity(monkeypatch) -> None:
    migration = load_vendor_migration()
    calls: list[str] = []

    class FakeOp:
        def __init__(self, dialect_name: str) -> None:
            self._dialect_name = dialect_name

        def get_context(self):
            return SimpleNamespace(dialect=SimpleNamespace(name=self._dialect_name))

        def get_bind(self):
            return SimpleNamespace(dialect=SimpleNamespace(name=self._dialect_name))

        def drop_index(self, *args, **kwargs) -> None:
            return None

        def batch_alter_table(self, *args, **kwargs):
            return nullcontext(SimpleNamespace(drop_column=lambda *a, **k: None))

        def create_foreign_key(self, *args, **kwargs) -> None:
            return None

        def drop_column(self, *args, **kwargs) -> None:
            return None

    monkeypatch.setattr(migration, "_drop_fk_for_column", lambda *args, **kwargs: None)
    monkeypatch.setattr(migration, "check_no_link_orphans", lambda bind: calls.append(bind.dialect.name))

    monkeypatch.setattr(migration, "op", FakeOp("sqlite"))
    migration.upgrade()

    monkeypatch.setattr(migration, "op", FakeOp("postgresql"))
    migration.upgrade()

    assert calls == ["sqlite", "postgresql"]
