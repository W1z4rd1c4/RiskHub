from sqlalchemy.sql.sqltypes import DateTime as SQLAlchemyDateTime

import app.models  # noqa: F401
from app.db.base import Base


def test_all_datetime_columns_are_timezone_aware() -> None:
    """Regression guard: never reintroduce timezone-naive DateTime columns."""
    for table in Base.metadata.tables.values():
        for column in table.columns:
            if isinstance(column.type, SQLAlchemyDateTime):
                assert (
                    getattr(column.type, "timezone", False) is True
                ), f"{table.name}.{column.name} is not timezone-aware"
