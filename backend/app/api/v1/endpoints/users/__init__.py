"""User management endpoints with RBAC."""

from app.core.security import get_password_hash

from . import detail, lookup, mock_auth, org, summary
from .crud import router

router.include_router(lookup.router)
router.include_router(org.router)
router.include_router(mock_auth.router)
router.include_router(detail.router)
router.include_router(summary.router)

__all__ = ["get_password_hash", "router"]
