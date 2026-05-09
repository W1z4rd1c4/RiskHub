import pytest
from sqlalchemy import inspect as sa_inspect
from sqlalchemy import text

from app.models import Control, KeyRiskIndicator, Risk, Vendor


def test_archivable_columns_exist_on_soft_delete_models():
    for model in (Risk, Control, Vendor, KeyRiskIndicator):
        columns = {column.name for column in sa_inspect(model).columns}
        assert {"is_archived", "archived_at", "archived_by_id"} <= columns


def test_archivable_clause_targets_archived_flag():
    from app.models._archivable import archived_clause

    for model in (Risk, Control, Vendor, KeyRiskIndicator):
        assert str(archived_clause(model, archived=True).compile(compile_kwargs={"literal_binds": True}))
        assert str(archived_clause(model, archived=False).compile(compile_kwargs={"literal_binds": True}))


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_archivable_columns_exist_in_postgres_schema(db_session):  # type: ignore[no-untyped-def]
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("Requires PostgreSQL schema introspection")

    result = await db_session.execute(
        text(
            """
            SELECT table_name, column_name
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = ANY(:table_names)
              AND column_name = ANY(:column_names)
            """
        ),
        {
            "table_names": ["risks", "controls", "vendors", "key_risk_indicators"],
            "column_names": ["is_archived", "archived_at", "archived_by_id"],
        },
    )
    actual = {(row.table_name, row.column_name) for row in result.fetchall()}

    for table_name in ("risks", "controls", "vendors", "key_risk_indicators"):
        for column_name in ("is_archived", "archived_at", "archived_by_id"):
            assert (table_name, column_name) in actual
