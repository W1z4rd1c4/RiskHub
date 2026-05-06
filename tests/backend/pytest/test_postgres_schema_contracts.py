from __future__ import annotations

import pytest
from sqlalchemy import text


def _require_postgres(db_session) -> None:  # type: ignore[no-untyped-def]
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL schema introspection")


async def _schema_types(db_session, columns: list[tuple[str, str]]) -> dict[tuple[str, str], str]:  # type: ignore[no-untyped-def]
    bind_params = {f"table_{idx}": table_name for idx, (table_name, _column_name) in enumerate(columns)}
    bind_params.update({f"column_{idx}": column_name for idx, (_table_name, column_name) in enumerate(columns)})

    pair_clauses = [f"(c.relname = :table_{idx} AND a.attname = :column_{idx})" for idx in range(len(columns))]

    result = await db_session.execute(
        text(
            f"""
            SELECT
                c.relname AS table_name,
                a.attname AS column_name,
                format_type(a.atttypid, a.atttypmod) AS type_name
            FROM pg_attribute a
            JOIN pg_class c ON c.oid = a.attrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE
                c.relkind = 'r'
                AND n.nspname = current_schema()
                AND a.attnum > 0
                AND NOT a.attisdropped
                AND ({' OR '.join(pair_clauses)})
            """
        ),
        bind_params,
    )

    return {(row.table_name, row.column_name): row.type_name for row in result.fetchall()}


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_postgres_partial_approval_index_contract(db_session) -> None:  # type: ignore[no-untyped-def]
    _require_postgres(db_session)

    result = await db_session.execute(
        text(
            """
            SELECT indexdef
            FROM pg_indexes
            WHERE schemaname = current_schema()
              AND tablename = 'approval_requests'
              AND indexname = 'ux_approval_pending'
            """
        )
    )
    row = result.one_or_none()

    assert row is not None, "ux_approval_pending index must exist in Postgres"

    indexdef = row.indexdef.lower()
    assert "unique" in indexdef
    assert "pending" in indexdef
    assert "pending_privileged" in indexdef


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_postgres_department_manager_index_contract(db_session) -> None:  # type: ignore[no-untyped-def]
    _require_postgres(db_session)

    result = await db_session.execute(
        text(
            """
            SELECT indexdef
            FROM pg_indexes
            WHERE schemaname = current_schema()
              AND tablename = 'departments'
              AND indexname = 'ix_departments_manager_id'
            """
        )
    )
    row = result.one_or_none()

    assert row is not None, "ix_departments_manager_id index must exist in Postgres"
    assert "(manager_id)" in row.indexdef.lower()


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_postgres_timestamp_columns_remain_timestamptz(db_session) -> None:  # type: ignore[no-untyped-def]
    _require_postgres(db_session)

    expected = {
        ("approval_requests", "created_at"): "timestamp with time zone",
        ("app_outbox_events", "available_at"): "timestamp with time zone",
        ("control_executions", "executed_at"): "timestamp with time zone",
    }

    actual = await _schema_types(db_session, list(expected))
    assert actual == expected


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_postgres_json_contracts_do_not_drift_to_text(db_session) -> None:  # type: ignore[no-untyped-def]
    _require_postgres(db_session)

    expected = {
        ("approval_requests", "pending_changes"): "json",
        ("activity_logs", "changes"): "json",
        ("app_outbox_events", "payload"): "json",
    }

    actual = await _schema_types(db_session, list(expected))
    assert actual == expected
