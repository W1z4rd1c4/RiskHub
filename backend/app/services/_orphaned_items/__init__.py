"""Internal implementation for orphaned item management.

Public callable surface is exposed via this package's module-level imports.
"""

from .flagging import flag_orphaned_items, flag_orphaned_threats, scan_uncategorised_items
from .reads import (
    get_orphan_detail,
    get_pending_orphans,
    get_pending_orphans_with_details,
)
from .resolution import _get_fallback_owner_id, resolve_orphan
from .stats import get_orphan_stats

__all__ = [
    "flag_orphaned_items",
    "flag_orphaned_threats",
    "get_orphan_detail",
    "get_orphan_stats",
    "get_pending_orphans",
    "get_pending_orphans_with_details",
    "resolve_orphan",
    "scan_uncategorised_items",
    "_get_fallback_owner_id",
]
