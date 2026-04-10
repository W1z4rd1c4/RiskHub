from . import history
from .crud import router

router.include_router(history.router)

__all__ = ["router"]
