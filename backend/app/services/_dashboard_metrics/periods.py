from typing import Any

from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession


def month_period_expr(db: AsyncSession, column: Any) -> Any:
    dialect_name = getattr(getattr(getattr(db, "bind", None), "dialect", None), "name", None)
    if dialect_name == "sqlite":
        return func.strftime("%Y-%m", column)
    return func.to_char(column, "YYYY-MM")


def week_period_expr(db: AsyncSession, column: Any) -> Any:
    dialect_name = getattr(getattr(getattr(db, "bind", None), "dialect", None), "name", None)
    if dialect_name == "sqlite":
        return func.strftime("%Y-W%W", column)
    return func.to_char(column, 'IYYY-"W"IW')
