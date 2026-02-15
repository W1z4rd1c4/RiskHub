from . import lifecycle, reassessment
from .crud import router

router.include_router(reassessment.router)
router.include_router(lifecycle.router)

__all__ = ["router"]

