import asyncio
import logging

from app.core.config import get_settings
from app.db.session import session_context
from app.services.orphaned_item_service import OrphanedItemService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def verify_governance_updates():
    async with session_context(get_settings()) as db:
        logger.info("Triggering Orphan Scan (Risks, Controls, KRIs)...")
        new_count = await OrphanedItemService.scan_uncategorised_items(db)
        logger.info(f"Newly flagged items: {new_count}")

        logger.info("Fetching Stats...")
        stats = await OrphanedItemService.get_orphan_stats(db)
        logger.info(f"Stats: {stats}")

        # Verify Pending Orphans with details
        logger.info("Fetching Pending Orphans with Details...")
        orphans = await OrphanedItemService.get_pending_orphans_with_details(db)
        logger.info(f"Total Pending with Details: {len(orphans)}")

        for o in orphans[:5]:  # Show first 5
            logger.info(
                f"Orphan: id={o['id']}, type={o['item_type']}, name={o['item_name']}, identifier={o['item_identifier']}"
            )


if __name__ == "__main__":
    asyncio.run(verify_governance_updates())
