"""Service for managing orphaned items (risks/controls without owners)."""

from app.services._orphaned_items.service import OrphanedItemService

__all__ = [
    "OrphanedItemService",
]
