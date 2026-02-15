from . import archive, detail, restore, update
from .archive import delete_control
from .create import create_control
from .detail import get_control
from .list import list_controls, router
from .restore import restore_control
from .update import update_control

router.include_router(detail.router)
router.include_router(update.router)
router.include_router(archive.router)
router.include_router(restore.router)

__all__ = [
    "create_control",
    "delete_control",
    "get_control",
    "list_controls",
    "restore_control",
    "router",
    "update_control",
]

