from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from app.core.exceptions import DomainError
from app.models import Risk
from app.services._reporting import tabular
from app.services._reporting.exports.pipeline import apply_export_stages
from app.services.report_export_limits import (
    MAX_SYNC_EXPORT_RELATED_ROWS,
    MAX_SYNC_EXPORT_ROWS,
    execute_bounded_export_query,
    preflight_export_query,
)


class _ScalarResult:
    def __init__(self, values: list[int]) -> None:
        self._values = values

    def scalars(self) -> _ScalarResult:
        return self

    def all(self) -> list[int]:
        return self._values


@pytest.mark.asyncio
async def test_export_preflight_limits_query_and_rejects_oversized_population() -> None:
    db = AsyncMock()
    db.execute.return_value = _ScalarResult(list(range(MAX_SYNC_EXPORT_ROWS + 1)))

    with pytest.raises(DomainError) as exc_info:
        await preflight_export_query(db, select(Risk.id))

    statement = db.execute.await_args.args[0]
    assert statement._limit_clause.value == MAX_SYNC_EXPORT_ROWS + 1
    assert exc_info.value.status_code == 413
    assert exc_info.value.code == "synchronous_export_limit_exceeded"


@pytest.mark.asyncio
async def test_export_preflight_returns_ids_within_budget() -> None:
    db = AsyncMock()
    db.execute.return_value = _ScalarResult([3, 7])

    ids = await preflight_export_query(db, select(Risk.id))

    assert ids == [3, 7]


@pytest.mark.asyncio
async def test_related_preflight_uses_separate_fixed_budget() -> None:
    db = AsyncMock()
    db.execute.return_value = _ScalarResult([3, 7])

    await preflight_export_query(
        db,
        select(Risk.id),
        maximum=MAX_SYNC_EXPORT_RELATED_ROWS,
    )

    statement = db.execute.await_args.args[0]
    assert statement._limit_clause.value == MAX_SYNC_EXPORT_RELATED_ROWS + 1


@pytest.mark.asyncio
async def test_bounded_fetch_rechecks_population_before_projection() -> None:
    db = AsyncMock()
    db.execute.return_value = _ScalarResult(list(range(MAX_SYNC_EXPORT_ROWS + 1)))

    with pytest.raises(DomainError) as exc_info:
        await execute_bounded_export_query(db, select(Risk))

    statement = db.execute.await_args.args[0]
    assert statement._limit_clause.value == MAX_SYNC_EXPORT_ROWS + 1
    assert exc_info.value.status_code == 413


@pytest.mark.asyncio
async def test_bounded_fetch_accepts_explicit_related_budget() -> None:
    db = AsyncMock()
    db.execute.return_value = _ScalarResult([3, 7])

    await execute_bounded_export_query(
        db,
        select(Risk),
        maximum=MAX_SYNC_EXPORT_RELATED_ROWS,
    )

    statement = db.execute.await_args.args[0]
    assert statement._limit_clause.value == MAX_SYNC_EXPORT_RELATED_ROWS + 1


@pytest.mark.asyncio
async def test_export_pipeline_rejects_expanding_stage_before_projection() -> None:
    rows = [{"id": 1}]

    with pytest.raises(DomainError) as exc_info:
        await apply_export_stages(rows, [lambda _rows: [{}] * (MAX_SYNC_EXPORT_ROWS + 1)])

    assert exc_info.value.status_code == 413


def test_csv_renderer_preserves_small_exports_and_formula_sanitization() -> None:
    content = tabular.generate_tabular_csv(["Name", "Value"], [["Normal", "=1+1"]])

    assert content == b"Name,Value\r\nNormal,'=1+1\r\n"


def test_csv_renderer_rejects_output_over_byte_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tabular, "MAX_SYNC_EXPORT_BYTES", 24)

    with pytest.raises(DomainError) as exc_info:
        tabular.generate_tabular_csv(["Name"], [["x" * 32]])

    assert exc_info.value.status_code == 413
    assert exc_info.value.code == "synchronous_export_limit_exceeded"
