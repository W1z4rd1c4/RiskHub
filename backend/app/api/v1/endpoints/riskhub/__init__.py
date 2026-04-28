"""Risk Hub API endpoints for CRO business configuration."""

from fastapi import APIRouter

from ._shared import _ensure_total_assets_value_config, get_cro_user, require_cro
from .approval_scenarios import router as approval_scenarios_router
from .capabilities import router as capabilities_router
from .departments import router as departments_router
from .global_config import router as global_config_router
from .permissions import router as permissions_router
from .public_config import router as public_config_router
from .risk_types import router as risk_types_router
from .roles import router as roles_router

router = APIRouter()

router.include_router(risk_types_router)
router.include_router(capabilities_router)
router.include_router(global_config_router)
router.include_router(approval_scenarios_router)
router.include_router(public_config_router)
router.include_router(permissions_router)
router.include_router(roles_router)
router.include_router(departments_router)

__all__ = [
    "router",
    "require_cro",
    "get_cro_user",
    "_ensure_total_assets_value_config",
]
