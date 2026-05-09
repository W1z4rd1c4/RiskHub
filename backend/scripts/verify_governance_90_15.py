import asyncio
import logging

from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import session_context
from app.models import User
from app.services._orphaned_items import (
    get_orphan_stats,
    get_pending_orphans_with_details,
    scan_uncategorised_items,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def verify_governance_updates():
    async with session_context(get_settings()) as db:
        logger.info("Triggering Orphan Scan (Risks, Controls, KRIs)...")
        new_count = await scan_uncategorised_items(db)
        logger.info(f"Newly flagged items: {new_count}")

        user = (await db.execute(select(User).order_by(User.id.asc()).limit(1))).scalar_one_or_none()

        logger.info("Fetching Stats...")
        stats = await get_orphan_stats(db, current_user=user) if user else {}
        logger.info(f"Stats: {stats}")

        # Verify Pending Orphans with details
        logger.info("Fetching Pending Orphans with Details...")
        orphans = await get_pending_orphans_with_details(db, current_user=user)
        logger.info(f"Total Pending with Details: {len(orphans)}")

        for o in orphans[:5]:  # Show first 5
            logger.info(
                f"Orphan: id={o['id']}, type={o['item_type']}, name={o['item_name']}, identifier={o['item_identifier']}"
            )


if __name__ == "__main__":
    asyncio.run(verify_governance_updates())
