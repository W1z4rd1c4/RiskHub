"""Seed canonical roles permissions without demo users or business data."""

import asyncio

from app.core.config import get_settings
from app.db.production_seed import seed_roles_permissions_in_session
from app.db.session import session_context


async def seed_roles_permissions() -> None:
    async with session_context(get_settings()) as db:
        await seed_roles_permissions_in_session(db)
        await db.commit()
    print("Canonical roles permissions seeded")


if __name__ == "__main__":
    asyncio.run(seed_roles_permissions())
