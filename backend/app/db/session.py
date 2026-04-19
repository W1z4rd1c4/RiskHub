from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from starlette.requests import Request

from app.core.config import Settings


def create_engine(settings: Settings) -> AsyncEngine:
    return create_async_engine(
        settings.database_url,
        echo=settings.debug,
        future=True,
        pool_pre_ping=True,
        pool_recycle=1800,
    )


def create_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )


def init_app_db(app: FastAPI, settings: Settings) -> None:
    engine = create_engine(settings)
    sessionmaker = create_sessionmaker(engine)
    app.state.db_engine = engine
    app.state.db_sessionmaker = sessionmaker


@asynccontextmanager
async def session_context(settings: Settings) -> AsyncGenerator[AsyncSession, None]:
    engine = create_engine(settings)
    sessionmaker = create_sessionmaker(engine)
    try:
        async with sessionmaker() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise
    finally:
        await engine.dispose()


async def get_db(request: Request) -> AsyncGenerator[AsyncSession, None]:
    """Dependency for getting async database session."""
    sessionmaker = getattr(request.app.state, "db_sessionmaker", None)
    if sessionmaker is None:
        raise RuntimeError("Database not initialized; call init_app_db() during app creation.")

    async with sessionmaker() as session:
        try:
            yield session
            # Note: No auto-commit here. Endpoints must explicitly commit changes.
        except Exception:
            await session.rollback()
            raise
