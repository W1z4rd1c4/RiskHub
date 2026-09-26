"""Bounded PostgreSQL maintenance tools using the existing operator dump format."""

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.config import Settings
from app.services._local_auth.bootstrap_files import destination

from .files import RestoreError


@asynccontextmanager
async def maintenance_database(settings: Settings):
    if settings.debug or settings.mock_auth_enabled:
        raise RestoreError("Use the stopped installation's non-debug configuration")
    engine = create_async_engine(settings.database_url)
    try:
        async with engine.connect() as connection:
            if connection.dialect.name != "postgresql":
                raise RestoreError("Identity restore requires PostgreSQL")
            if not await connection.scalar(text("SELECT pg_try_advisory_lock(728194, 207)")):
                raise RestoreError("Another identity maintenance operation holds this database")
            await connection.commit()
            try:
                async with AsyncSession(bind=connection, expire_on_commit=False) as db:
                    await require_quiet_database(db)
                    yield db
            finally:
                await connection.rollback()
                await connection.execute(text("SELECT pg_advisory_unlock(728194, 207)"))
                await connection.commit()
    finally:
        await engine.dispose()


async def require_quiet_database(db: AsyncSession) -> None:
    connected = await db.scalar(
        text(
            "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() "
            "AND pid<>pg_backend_pid() AND backend_type='client backend'"
        )
    )
    if connected:
        raise RestoreError("Stop API, scheduler, outbox and all other database clients before maintenance")


def database_environment(database_url: str) -> dict[str, str]:
    url = make_url(database_url)
    if url.get_backend_name() != "postgresql" or not url.database or url.query:
        raise RestoreError("Use a PostgreSQL URL without driver-specific query options")
    env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
    env.update(
        PGHOST=url.host or "localhost",
        PGPORT=str(url.port or 5432),
        PGDATABASE=url.database,
        PGUSER=url.username or "",
        PGPASSWORD=url.password or "",
    )
    return env


async def pg_command(command: list[str], database_url: str, *, output=None) -> None:
    # Connection credentials never enter argv or retained diagnostic output.
    process = await asyncio.create_subprocess_exec(
        *command,
        env=database_environment(database_url),
        stdout=output or asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        code = await asyncio.wait_for(process.wait(), timeout=1800)
    except (TimeoutError, asyncio.CancelledError):
        process.kill()
        await process.wait()
        raise RestoreError("PostgreSQL maintenance interrupted; keep writers stopped") from None
    if code:
        raise RestoreError("PostgreSQL maintenance failed; keep writers stopped and inspect the database privately")


async def dump_database(database_url: str, path: Path) -> None:
    with destination(str(path)) as (directory, name):
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
        with os.fdopen(fd, "wb") as output:
            await pg_command(
                ["pg_dump", "--format=custom", "--no-owner", "--no-privileges"], database_url, output=output
            )
            output.flush()
            os.fsync(output.fileno())
        os.fsync(directory)


async def restore_database(database_url: str, dump: Path, *, replace: bool) -> None:
    command = ["pg_restore", "--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges"]
    if replace:
        command.extend(["--clean", "--if-exists"])
    # --dbname has no credentials; the actual destination is supplied through PGDATABASE.
    command.extend(["--dbname", make_url(database_url).database or "", str(dump)])
    await pg_command(command, database_url)
