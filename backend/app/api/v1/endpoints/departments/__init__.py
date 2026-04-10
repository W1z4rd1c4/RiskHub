from . import controls, detail, kris, risks
from .list import router

router.include_router(detail.router)
router.include_router(risks.router)
router.include_router(controls.router)
router.include_router(kris.router)

__all__ = ["router"]
