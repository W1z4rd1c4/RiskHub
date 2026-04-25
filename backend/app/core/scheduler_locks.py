from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

SCHEDULER_LOCK_CLASS_ID = 424242
SCHEDULER_LOCK_OBJECT_ID = 1


class SchedulerLockProvider:
    """Scheduler ownership abstraction."""

    provider_name = "noop"

    def __init__(self) -> None:
        self.lock_acquired = False

    async def acquire(self) -> bool:
        self.lock_acquired = True
        return True

    async def release(self) -> None:
        self.lock_acquired = False


class PostgresAdvisoryLockProvider(SchedulerLockProvider):
    """Holds a Postgres advisory lock on a dedicated connection for scheduler ownership."""

    provider_name = "postgres_advisory_lock"

    def __init__(self, engine: AsyncEngine) -> None:
        super().__init__()
        self._engine = engine
        self._connection: AsyncConnection | None = None

    async def acquire(self) -> bool:
        if self._connection is not None:
            return self.lock_acquired

        connection = await self._engine.connect()
        acquired = bool(
            (
                await connection.execute(
                    text("SELECT pg_try_advisory_lock(:class_id, :object_id)"),
                    {"class_id": SCHEDULER_LOCK_CLASS_ID, "object_id": SCHEDULER_LOCK_OBJECT_ID},
                )
            ).scalar()
        )
        if acquired:
            self._connection = connection
            self.lock_acquired = True
            return True

        await connection.close()
        self.lock_acquired = False
        return False

    async def release(self) -> None:
        if self._connection is None:
            self.lock_acquired = False
            return

        try:
            await self._connection.execute(
                text("SELECT pg_advisory_unlock(:class_id, :object_id)"),
                {"class_id": SCHEDULER_LOCK_CLASS_ID, "object_id": SCHEDULER_LOCK_OBJECT_ID},
            )
        finally:
            await self._connection.close()
            self._connection = None
            self.lock_acquired = False
