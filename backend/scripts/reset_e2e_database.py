"""Destructively reset only an explicitly marked PostgreSQL E2E test database."""

from __future__ import annotations

import asyncio
import os

from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine


def validate_test_database(database_url: str, *, explicitly_marked: bool) -> str:
    if not explicitly_marked:
        raise ValueError("E2E database reset requires an explicitly marked test database")
    database_name = make_url(database_url).database or ""
    if not database_name.endswith("_test"):
        raise ValueError("E2E database reset requires a database name ending in _test")
    return database_name


async def reset_database(database_url: str) -> None:
    engine = create_async_engine(database_url, isolation_level="AUTOCOMMIT")
    try:
        async with engine.connect() as connection:
            await connection.execute(
                text(
                    "SELECT pg_terminate_backend(pid) "
                    "FROM pg_stat_activity "
                    "WHERE datname = current_database() AND pid <> pg_backend_pid()"
                )
            )
            await connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
            await connection.execute(text("CREATE SCHEMA public"))
    finally:
        await engine.dispose()


def main() -> None:
    database_url = os.environ.get("DATABASE_URL", "")
    validate_test_database(
        database_url,
        explicitly_marked=os.environ.get("RISKHUB_E2E_TEST_DATABASE") == "1",
    )
    asyncio.run(reset_database(database_url))


if __name__ == "__main__":
    main()
