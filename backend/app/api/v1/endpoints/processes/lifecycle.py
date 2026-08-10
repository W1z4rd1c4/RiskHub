from __future__ import annotations

from fastapi import APIRouter, Body, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.approval_request import ApprovalQueuedResponse
from app.schemas.process import ProcessArchiveRequest, ProcessRead
from app.services._ict_register_lifecycle.lifecycle import archive_process_detail, restore_process_detail

router = APIRouter()


@router.delete(
    "/{process_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={202: {"model": ApprovalQueuedResponse}},
)
async def archive_process(
    process_id: int,
    payload: ProcessArchiveRequest | None = Body(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("processes", "delete")),
):
    return await archive_process_detail(
        db=db,
        process_id=process_id,
        current_user=current_user,
        request_reason=payload.request_reason if payload is not None else None,
    )


@router.post("/{process_id}/restore", response_model=ProcessRead)
async def restore_process(
    process_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("processes", "delete")),
):
    return await restore_process_detail(db=db, process_id=process_id, current_user=current_user)
