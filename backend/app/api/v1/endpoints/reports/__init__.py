"""
Report generation endpoints.

Includes unified export endpoints for risks/controls/kris/vendors/issues
with format + as_of_date support.
"""

from fastapi import APIRouter

from .audit_trail_excel import router as audit_trail_router
from .summary_excel import router as summary_router
from .unified_exports import router as unified_exports_router

router = APIRouter()
router.include_router(unified_exports_router)
router.include_router(summary_router)
router.include_router(audit_trail_router)
