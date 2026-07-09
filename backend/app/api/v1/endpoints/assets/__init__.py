from . import lifecycle, links
from .crud import router

router.include_router(lifecycle.router)
router.include_router(links.router)

__all__ = ["router"]
