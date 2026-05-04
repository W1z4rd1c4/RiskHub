from __future__ import annotations

from enum import StrEnum

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import can_resolve_approvals
from app.models import User
from app.schemas.kri import KRIRecordValue, KRIResponse

from .loading import _assert_kri_submit_access, _load_kri_with_risk_or_404
from .recording import DuplicateKRIPeriodError
from .approval_intake import create_kri_submission_approval
from .direct_application import apply_kri_value_directly


class KRIValueIntakeMode(StrEnum):
    DIRECT = "direct"
    APPROVAL = "approval"


def select_kri_value_intake_mode(*, can_resolve: bool) -> KRIValueIntakeMode:
    if can_resolve:
        return KRIValueIntakeMode.DIRECT
    return KRIValueIntakeMode.APPROVAL


async def record_kri_value_intake(
    *,
    db: AsyncSession,
    kri_id: int,
    data: KRIRecordValue,
    current_user: User,
) -> KRIResponse:
    kri = await _load_kri_with_risk_or_404(db, kri_id, for_update=True)

    if kri.is_archived:
        raise HTTPException(status_code=409, detail="Cannot submit values for archived KRI")
    await _assert_kri_submit_access(db, kri=kri, kri_id=kri_id, current_user=current_user)

    mode = select_kri_value_intake_mode(can_resolve=can_resolve_approvals(current_user))
    try:
        if mode is KRIValueIntakeMode.DIRECT:
            return await apply_kri_value_directly(
                db,
                kri=kri,
                data=data,
                current_user=current_user,
                is_privileged_submission=True,
            )
        return await create_kri_submission_approval(db, kri=kri, data=data, current_user=current_user)
    except DuplicateKRIPeriodError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
