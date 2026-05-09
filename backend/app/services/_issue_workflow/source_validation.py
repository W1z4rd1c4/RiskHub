from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import can_read_vendor_id, is_issue_owner_assignable_to_department
from app.models import Control, ControlExecution, IssueLink, KeyRiskIndicator, Risk, User, Vendor
from app.services._issue_register.source_mutation import (
    clear_issue_source_links,
    ensure_issue_source_link,
    resolve_issue_source_metadata,
)


async def validate_user_exists(db: AsyncSession, user_id: int | None) -> None:
    if user_id is None:
        return
    exists = (await db.execute(select(User.id).where(User.id == user_id))).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"User {user_id} not found")


async def ensure_owner_assignable(
    db: AsyncSession,
    *,
    owner_user_id: int | None,
    department_id: int,
    denied_status: int = status.HTTP_403_FORBIDDEN,
) -> None:
    if owner_user_id is None:
        return
    allowed = await is_issue_owner_assignable_to_department(
        db,
        owner_user_id=owner_user_id,
        issue_department_id=department_id,
    )
    if not allowed:
        raise HTTPException(
            status_code=denied_status,
            detail="Owner user must have global scope or belong to the issue department",
        )


async def issue_link_department_ids(db: AsyncSession, issue_id: int) -> set[int]:
    department_ids: set[int] = set()

    risk_rows = await db.execute(
        select(Risk.department_id)
        .join(IssueLink, IssueLink.risk_id == Risk.id)
        .where(IssueLink.issue_id == issue_id, IssueLink.risk_id.is_not(None))
    )
    department_ids.update(dept_id for dept_id in risk_rows.scalars().all() if dept_id is not None)

    control_rows = await db.execute(
        select(Control.department_id)
        .join(IssueLink, IssueLink.control_id == Control.id)
        .where(IssueLink.issue_id == issue_id, IssueLink.control_id.is_not(None))
    )
    department_ids.update(dept_id for dept_id in control_rows.scalars().all() if dept_id is not None)

    execution_rows = await db.execute(
        select(Control.department_id)
        .join(ControlExecution, ControlExecution.control_id == Control.id)
        .join(IssueLink, IssueLink.execution_id == ControlExecution.id)
        .where(IssueLink.issue_id == issue_id, IssueLink.execution_id.is_not(None))
    )
    department_ids.update(dept_id for dept_id in execution_rows.scalars().all() if dept_id is not None)

    kri_rows = await db.execute(
        select(Risk.department_id)
        .join(KeyRiskIndicator, KeyRiskIndicator.risk_id == Risk.id)
        .join(IssueLink, IssueLink.kri_id == KeyRiskIndicator.id)
        .where(IssueLink.issue_id == issue_id, IssueLink.kri_id.is_not(None))
    )
    department_ids.update(dept_id for dept_id in kri_rows.scalars().all() if dept_id is not None)

    vendor_rows = await db.execute(
        select(func.coalesce(Vendor.department_id, User.department_id))
        .join(IssueLink, IssueLink.vendor_id == Vendor.id)
        .outerjoin(User, Vendor.outsourcing_owner_user_id == User.id)
        .where(IssueLink.issue_id == issue_id, IssueLink.vendor_id.is_not(None))
    )
    department_ids.update(dept_id for dept_id in vendor_rows.scalars().all() if dept_id is not None)

    return department_ids


async def resolve_vendor_department_and_access(
    db: AsyncSession,
    current_user: User,
    vendor_id: int,
) -> int:
    row = (
        await db.execute(
            select(Vendor.id, Vendor.department_id, User.department_id, Vendor.is_archived)
            .outerjoin(User, Vendor.outsourcing_owner_user_id == User.id)
            .where(Vendor.id == vendor_id)
        )
    ).one_or_none()
    if row is None or not await can_read_vendor_id(db, current_user, vendor_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Linked vendor not found")

    _, vendor_department_id, owner_department_id, vendor_is_archived = row
    if vendor_is_archived:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot link archived vendor")

    resolved_department_id = vendor_department_id or owner_department_id
    if resolved_department_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Linked vendor has no department and owner department is unresolved",
        )
    return resolved_department_id


__all__ = [
    "clear_issue_source_links",
    "ensure_issue_source_link",
    "ensure_owner_assignable",
    "issue_link_department_ids",
    "resolve_issue_source_metadata",
    "resolve_vendor_department_and_access",
    "validate_user_exists",
]
