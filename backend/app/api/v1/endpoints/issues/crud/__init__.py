from fastapi import APIRouter

from . import contextual, create, detail, list, update

router = APIRouter()
router.include_router(list.router)
router.include_router(create.router)
router.include_router(contextual.router)
router.include_router(detail.router)
router.include_router(update.router)

__all__ = ["router"]

