"""Resource budgets for synchronous report exports."""

from typing import TypeVar

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.core.exceptions import DomainError

MAX_SYNC_EXPORT_ROWS = 1_000
MAX_SYNC_EXPORT_RELATED_ROWS = 10_000
MAX_SYNC_EXPORT_BYTES = 8 * 1024 * 1024
EXPORT_LIMIT_ERROR_CODE = "synchronous_export_limit_exceeded"

_ExportModel = TypeVar("_ExportModel")


def _export_limit_error(detail: str) -> DomainError:
    return DomainError(
        detail,
        code=EXPORT_LIMIT_ERROR_CODE,
        status_code=413,
    )


def enforce_sync_export_row_limit(row_count: int, *, maximum: int = MAX_SYNC_EXPORT_ROWS) -> None:
    if row_count > maximum:
        raise _export_limit_error(
            f"Synchronous export exceeds the {maximum:,}-row processing limit; "
            "narrow the report filters and retry."
        )


def enforce_sync_export_byte_limit(byte_count: int, *, maximum: int = MAX_SYNC_EXPORT_BYTES) -> None:
    if byte_count > maximum:
        raise _export_limit_error(
            f"Synchronous export exceeds the {maximum // (1024 * 1024)} MiB output limit; "
            "narrow the report filters and retry."
        )


async def preflight_export_query(
    db: AsyncSession,
    query: Select[tuple[int]],
    *,
    maximum: int = MAX_SYNC_EXPORT_ROWS,
) -> list[int]:
    result = await db.execute(query.limit(maximum + 1))
    ids = list(result.scalars().all())
    enforce_sync_export_row_limit(len(ids), maximum=maximum)
    return ids


async def execute_bounded_export_query(
    db: AsyncSession,
    query: Select[tuple[_ExportModel]],
    *,
    maximum: int = MAX_SYNC_EXPORT_ROWS,
) -> list[_ExportModel]:
    result = await db.execute(query.limit(maximum + 1))
    models = list(result.scalars().all())
    enforce_sync_export_row_limit(len(models), maximum=maximum)
    return models
