from fastapi import APIRouter

from . import dependencies, read, relationships, services

router = APIRouter()
router.include_router(read.router)
router.include_router(relationships.router)
router.include_router(services.router)
router.include_router(dependencies.router)

__all__ = ["router"]

