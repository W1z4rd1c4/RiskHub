"""
Admin endpoints for data maintenance operations.
"""

from fastapi import APIRouter

from . import (
    capabilities,
    directory_sync,
    docs,
    log_config,
    operational_logs,
    orphans,
    sessions,
    snapshots,
    structured_logs,
    system_status,
)
from ._deps import require_platform_admin

router = APIRouter()
router.include_router(capabilities.router)
router.include_router(orphans.router)
router.include_router(system_status.router)
router.include_router(operational_logs.router)
router.include_router(sessions.router)
router.include_router(directory_sync.router)
router.include_router(structured_logs.router)
router.include_router(docs.router)
router.include_router(log_config.router)
router.include_router(snapshots.router)

__all__ = ["require_platform_admin", "router"]
