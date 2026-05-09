"""Transitional transaction boundary helpers for endpoint-to-service migration."""

from sqlalchemy.ext.asyncio import AsyncSession


async def commit_service_transaction(db: AsyncSession) -> None:
    """Commit a mutation from service-owned code while endpoint commits are retired."""
    await db.commit()
