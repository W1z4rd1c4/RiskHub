from fastapi import APIRouter

from .crud import router as crud_router
from .exceptions import router as exceptions_router
from .links import router as links_router
from .lookups import router as lookups_router
from .workflow import router as workflow_router

router = APIRouter()
router.include_router(lookups_router)
router.include_router(crud_router)
router.include_router(links_router)
router.include_router(workflow_router)
router.include_router(exceptions_router)
