"""Seed canonical departments without demo users or business data."""

import asyncio

from app.core.config import get_settings
from app.db.production_seed import seed_departments_in_session
from app.db.session import session_context


async def seed_departments() -> None:
    async with session_context(get_settings()) as db:
        await seed_departments_in_session(db)
        await db.commit()
    print("Canonical departments seeded")


if __name__ == "__main__":
    asyncio.run(seed_departments())
