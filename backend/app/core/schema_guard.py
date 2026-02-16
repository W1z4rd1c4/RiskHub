from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine

from alembic.config import Config
from alembic.script import ScriptDirectory

MIGRATION_COMMAND = "./venv/bin/alembic upgrade head"


def _is_sqlite_url(database_url: str) -> bool:
    try:
        return make_url(database_url).get_backend_name() == "sqlite"
    except Exception:
        return database_url.startswith("sqlite")


def _backend_root() -> Path:
    return Path(__file__).resolve().parents[2]


def resolve_alembic_heads() -> set[str]:
    alembic_ini_path = _backend_root() / "alembic.ini"
    alembic_cfg = Config(str(alembic_ini_path))
    script = ScriptDirectory.from_config(alembic_cfg)
    return {head for head in script.get_heads() if head}


def _normalize_revisions(values: Iterable[str]) -> list[str]:
    return sorted({value for value in values if value})


def validate_schema_revisions(*, database_url: str, current_revisions: set[str], expected_heads: set[str]) -> None:
    if _is_sqlite_url(database_url):
        return

    normalized_current = _normalize_revisions(current_revisions)
    normalized_expected = _normalize_revisions(expected_heads)

    if not normalized_expected:
        raise RuntimeError(
            "Schema drift check failed: no Alembic heads could be resolved. "
            f"Run `{MIGRATION_COMMAND}`."
        )

    if not normalized_current:
        raise RuntimeError(
            "Schema drift detected: alembic_version is empty or missing for the connected database. "
            f"Run `{MIGRATION_COMMAND}`."
        )

    if normalized_current != normalized_expected:
        raise RuntimeError(
            "Schema drift detected: database revision does not match application head. "
            f"Current={normalized_current}, Expected={normalized_expected}. "
            f"Run `{MIGRATION_COMMAND}`."
        )


async def _get_current_db_revisions(engine: AsyncEngine) -> set[str]:
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT version_num FROM alembic_version"))
        return {str(row[0]) for row in result if row[0]}


async def enforce_schema_head(*, engine: AsyncEngine, database_url: str) -> None:
    if _is_sqlite_url(database_url):
        return

    expected_heads = resolve_alembic_heads()
    try:
        current_revisions = await _get_current_db_revisions(engine)
    except SQLAlchemyError as exc:
        raise RuntimeError(
            "Schema drift check failed while reading alembic_version from the connected database. "
            f"Run `{MIGRATION_COMMAND}`."
        ) from exc

    validate_schema_revisions(
        database_url=database_url,
        current_revisions=current_revisions,
        expected_heads=expected_heads,
    )
