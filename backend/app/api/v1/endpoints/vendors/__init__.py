from . import lifecycle
from .crud import router

router.include_router(lifecycle.router)

__all__ = ["router"]
