from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models import User
from app.schemas.admin import ActiveSessionResponse
from app.services._admin_telemetry.lifecycle import revoke_admin_user_sessions
from app.services._auth_session_workflow import (
    SessionWorkflowError,
    list_active_session_projections,
)
from app.services.transaction_boundary import commit_service_transaction

from ._deps import require_platform_admin

router = APIRouter()


@router.get("/sessions", response_model=list[ActiveSessionResponse])
async def get_active_sessions(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> list[ActiveSessionResponse]:
    """
    Get active refresh-token sessions (real server-side session view).
    Admin only.
    """
    return [
        ActiveSessionResponse(
            user_id=session.user_id,
            user_name=session.user_name,
            user_email=session.user_email,
            role=session.role,
            department=session.department,
            last_activity=session.last_activity.isoformat() if session.last_activity else "",
            is_active=True,
            last_login=session.last_login.isoformat() if session.last_login else None,
            active_sessions=session.active_sessions,
        )
        for session in await list_active_session_projections(db)
    ]


@router.post("/sessions/{user_id}/revoke")
async def revoke_user_session(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> dict:
    """
    Force logout a user's active sessions.
    Admin only.
    """
    try:
        result = await revoke_admin_user_sessions(db, target_user_id=user_id, admin_user=admin_user)
    except SessionWorkflowError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    await commit_service_transaction(db)

    return {"status": "success", "message": f"Revoked {result.revoked_count} active sessions for {result.user_email}"}
