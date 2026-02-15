from . import remediation
from .incidents import router

router.include_router(remediation.router)

__all__ = ["router"]

