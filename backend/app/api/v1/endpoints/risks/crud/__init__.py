from . import archive, detail, restore, update
from ._shared import validate_risk_type
from .archive import delete_risk
from .create import create_risk
from .detail import get_risk
from .list import list_risks, router
from .restore import restore_risk
from .update import update_risk

router.include_router(detail.router)
router.include_router(update.router)
router.include_router(archive.router)
router.include_router(restore.router)

__all__ = [
    "create_risk",
    "delete_risk",
    "get_risk",
    "list_risks",
    "restore_risk",
    "router",
    "update_risk",
    "validate_risk_type",
]
