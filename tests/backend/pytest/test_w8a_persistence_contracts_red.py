from __future__ import annotations

import tomllib
from pathlib import Path

import pytest
from sqlalchemy import UniqueConstraint, text

from app.db.base import Base
from app.models.risk import ControlRiskLink

ROOT = Path(__file__).resolve().parents[3]
NAMING_ALLOWLIST = ROOT / "tests/backend/pytest/architecture/_naming_allowlist.toml"


def test_persistence_naming_allowlist_registry_exists() -> None:
    data = tomllib.loads(NAMING_ALLOWLIST.read_text())
    assert data.get("paths", []) == []


def test_naming_allowlist_registry_is_present_and_parseable() -> None:
    """Lock the naming-allowlist registry shape so future entries land deliberately.

    The file must exist, parse as TOML, and expose a top-level ``paths`` array.
    Every entry (if any) must be a string referring to an existing path under the
    repository root, so an exception cannot silently drift away from real code.
    """

    assert NAMING_ALLOWLIST.exists(), (
        f"naming allowlist registry missing: {NAMING_ALLOWLIST}"
    )

    data = tomllib.loads(NAMING_ALLOWLIST.read_text())

    assert "paths" in data, "naming allowlist must declare a top-level 'paths' array"
    assert isinstance(data["paths"], list), "naming allowlist 'paths' must be an array"

    for entry in data["paths"]:
        assert isinstance(entry, str), (
            f"naming allowlist entries must be strings; got {type(entry).__name__}: {entry!r}"
        )
        resolved = (ROOT / entry).resolve()
        assert resolved.exists(), (
            f"naming allowlist entry refers to a missing path: {entry!r}"
        )
        assert ROOT in resolved.parents or resolved == ROOT, (
            f"naming allowlist entry must stay under repo root: {entry!r}"
        )


def test_control_risk_link_declares_database_unique_constraint() -> None:
    constraints = {
        constraint.name: tuple(column.name for column in constraint.columns)
        for constraint in ControlRiskLink.__table__.constraints
        if isinstance(constraint, UniqueConstraint)
    }

    assert constraints["ux_control_risk_links_control_risk"] == ("control_id", "risk_id")


def test_base_metadata_uses_explicit_naming_convention() -> None:
    convention = Base.metadata.naming_convention

    assert convention["ix"] == "ix_%(table_name)s_%(column_0_name)s"
    assert convention["uq"] == "uq_%(table_name)s_%(column_0_name)s"
    assert convention["fk"] == "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"
    assert convention["ck"] == "ck_%(table_name)s_%(column_0_name)s"


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_issue_link_polymorphic_foreign_keys_are_indexed(db_session) -> None:  # type: ignore[no-untyped-def]
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL schema introspection")

    expected = {
        "ix_issue_links_risk_id": "(risk_id)",
        "ix_issue_links_control_id": "(control_id)",
        "ix_issue_links_execution_id": "(execution_id)",
        "ix_issue_links_kri_id": "(kri_id)",
    }
    result = await db_session.execute(
        text(
            """
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = current_schema()
              AND tablename = 'issue_links'
              AND indexname = ANY(:index_names)
            """
        ),
        {"index_names": list(expected)},
    )
    actual = {row.indexname: row.indexdef.lower() for row in result.fetchall()}

    assert set(actual) == set(expected)
    for index_name, column_fragment in expected.items():
        assert column_fragment in actual[index_name]


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_issue_link_target_lookup_can_use_risk_index(db_session) -> None:  # type: ignore[no-untyped-def]
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL EXPLAIN output")

    await db_session.execute(text("SET LOCAL enable_seqscan = off"))
    result = await db_session.execute(
        text("EXPLAIN (FORMAT TEXT) SELECT id FROM issue_links WHERE risk_id = 2147483647")
    )
    plan = "\n".join(row[0] for row in result.fetchall())

    assert "ix_issue_links_risk_id" in plan
