"""Approval request endpoints for deletion and edit workflows."""

from . import detail, resolve
from .queue import router

router.include_router(resolve.router)
router.include_router(detail.router)

__all__ = ["router"]
