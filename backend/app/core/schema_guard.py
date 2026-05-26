from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine

MIGRATION_COMMAND = "./venv/bin/alembic upgrade head"


@dataclass(frozen=True)
class SchemaRevisionStatus:
    database_url: str
    current_revisions: list[str]
    expected_heads: list[str]
    error_message: str | None

    @property
    def is_ok(self) -> bool:
        return self.error_message is None


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


def inspect_schema_revisions(
    *, database_url: str, current_revisions: set[str], expected_heads: set[str]
) -> SchemaRevisionStatus:
    if _is_sqlite_url(database_url):
        return SchemaRevisionStatus(
            database_url=database_url,
            current_revisions=_normalize_revisions(current_revisions),
            expected_heads=_normalize_revisions(expected_heads),
            error_message=None,
        )

    normalized_current = _normalize_revisions(current_revisions)
    normalized_expected = _normalize_revisions(expected_heads)

    if not normalized_expected:
        return SchemaRevisionStatus(
            database_url=database_url,
            current_revisions=normalized_current,
            expected_heads=normalized_expected,
            error_message=(
                "Schema drift check failed: no Alembic heads could be resolved. " f"Run `{MIGRATION_COMMAND}`."
            ),
        )

    if not normalized_current:
        return SchemaRevisionStatus(
            database_url=database_url,
            current_revisions=normalized_current,
            expected_heads=normalized_expected,
            error_message=(
                "Schema drift detected: alembic_version is empty or missing for the connected database. "
                f"Run `{MIGRATION_COMMAND}`."
            ),
        )

    if normalized_current != normalized_expected:
        return SchemaRevisionStatus(
            database_url=database_url,
            current_revisions=normalized_current,
            expected_heads=normalized_expected,
            error_message=(
                "Schema drift detected: database revision does not match application head. "
                f"Current={normalized_current}, Expected={normalized_expected}. "
                f"Run `{MIGRATION_COMMAND}`."
            ),
        )

    return SchemaRevisionStatus(
        database_url=database_url,
        current_revisions=normalized_current,
        expected_heads=normalized_expected,
        error_message=None,
    )


def validate_schema_revisions(*, database_url: str, current_revisions: set[str], expected_heads: set[str]) -> None:
    status = inspect_schema_revisions(
        database_url=database_url,
        current_revisions=current_revisions,
        expected_heads=expected_heads,
    )
    if status.error_message:
        raise RuntimeError(status.error_message)


async def _get_current_db_revisions(engine: AsyncEngine) -> set[str]:
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT version_num FROM alembic_version"))
        return {str(row[0]) for row in result if row[0]}


async def inspect_schema_head(*, engine: AsyncEngine, database_url: str) -> SchemaRevisionStatus:
    if _is_sqlite_url(database_url):
        return inspect_schema_revisions(
            database_url=database_url,
            current_revisions=set(),
            expected_heads=set(),
        )

    expected_heads = resolve_alembic_heads()
    try:
        current_revisions = await _get_current_db_revisions(engine)
    except SQLAlchemyError:
        return SchemaRevisionStatus(
            database_url=database_url,
            current_revisions=[],
            expected_heads=_normalize_revisions(expected_heads),
            error_message=(
                "Schema drift check failed while reading alembic_version from the connected database. "
                f"Run `{MIGRATION_COMMAND}`."
            ),
        )

    return inspect_schema_revisions(
        database_url=database_url,
        current_revisions=current_revisions,
        expected_heads=expected_heads,
    )


async def enforce_schema_head(*, engine: AsyncEngine, database_url: str) -> None:
    status = await inspect_schema_head(engine=engine, database_url=database_url)
    if status.error_message:
        raise RuntimeError(status.error_message)
