from . import lifecycle, links, lookups
from .crud import router

router.include_router(lifecycle.router)
router.include_router(links.router)
router.include_router(lookups.router)

__all__ = ["router"]
