"""Shared handler helpers."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import DBAPIError, IntegrityError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.user_query_options import user_selectinload_options
from app.models import User
from app.services.outbox.errors import OutboxDependencyError

OutboxHandler = Callable[[AsyncSession, Any], Awaitable[None]]


async def get_active_user_with_permissions(db: AsyncSession, user_id: int) -> User | None:
    result = await db.execute(
        select(User)
        .options(*user_selectinload_options(include_permissions=True))
        .where(User.id == user_id, User.is_active.is_(True))
    )
    return result.scalar_one_or_none()


async def run_notification_operation(awaitable: Awaitable[Any]) -> Any:
    try:
        return await awaitable
    except OutboxDependencyError:
        raise
    except IntegrityError:
        raise
    except OperationalError as exc:
        raise OutboxDependencyError(str(exc)) from exc
    except DBAPIError as exc:
        if exc.connection_invalidated:
            raise OutboxDependencyError(str(exc)) from exc
        raise
    except (ConnectionError, TimeoutError, OSError) as exc:
        raise OutboxDependencyError(str(exc)) from exc
