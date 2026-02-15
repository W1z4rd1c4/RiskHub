from fastapi import APIRouter

from . import crud, due, history, values

router = APIRouter()
router.include_router(crud.router)
router.include_router(values.router)
router.include_router(history.router)
router.include_router(due.router)

__all__ = ["router"]

