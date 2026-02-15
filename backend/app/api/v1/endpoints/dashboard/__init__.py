"""
Dashboard API endpoints for executive and department-level metrics.
"""

from fastapi import APIRouter

from .committee import router as committee_router
from .controls import router as controls_router
from .departments import router as departments_router
from .issues_metrics import router as issues_metrics_router
from .kris import router as kris_router
from .quarterly import router as quarterly_router
from .risks import router as risks_router
from .summary import router as summary_router

router = APIRouter()
router.include_router(issues_metrics_router)
router.include_router(summary_router)
router.include_router(departments_router)
router.include_router(risks_router)
router.include_router(controls_router)
router.include_router(kris_router)
router.include_router(quarterly_router)
router.include_router(committee_router)
