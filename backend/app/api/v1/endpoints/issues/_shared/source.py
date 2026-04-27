from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import can_read_control_id, can_read_kri_id, can_read_risk_id
from app.models import Control, ControlExecution, IssueLink, KeyRiskIndicator, Risk, User
from app.models.issue import IssueSourceType
from app.schemas.issue import IssueContextEntityTypeEnum

from .links import _resolve_vendor_department_and_access


@dataclass(frozen=True)
class ResolvedIssueSource:
    department_id: int
    source_type: IssueSourceType
    source_id: int | None
    link_values: dict[str, int]


def _source_type_value(source_type: IssueSourceType | Enum | str) -> str:
    return source_type.value if isinstance(source_type, Enum) else str(source_type)


async def resolve_contextual_issue_source(
    db: AsyncSession,
    current_user: User,
    *,
    entity_type: IssueContextEntityTypeEnum,
    entity_id: int,
) -> ResolvedIssueSource:
    if entity_type == IssueContextEntityTypeEnum.risk:
        row = (await db.execute(select(Risk.id, Risk.department_id).where(Risk.id == entity_id))).one_or_none()
        if row is None or not await can_read_risk_id(db, current_user, entity_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source risk not found")
        return ResolvedIssueSource(row[1], IssueSourceType.manual, None, {"risk_id": entity_id})

    if entity_type == IssueContextEntityTypeEnum.control:
        row = (await db.execute(select(Control.id, Control.department_id).where(Control.id == entity_id))).one_or_none()
        if row is None or not await can_read_control_id(db, current_user, entity_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source control not found")
        return ResolvedIssueSource(row[1], IssueSourceType.manual, None, {"control_id": entity_id})

    if entity_type == IssueContextEntityTypeEnum.execution:
        execution_row = (
            await db.execute(
                select(ControlExecution.id, ControlExecution.control_id, Control.department_id)
                .join(Control, ControlExecution.control_id == Control.id)
                .where(ControlExecution.id == entity_id)
            )
        ).one_or_none()
        if execution_row is None or not await can_read_control_id(db, current_user, execution_row[1]):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source execution not found")
        return ResolvedIssueSource(
            execution_row[2],
            IssueSourceType.control_execution,
            entity_id,
            {"execution_id": entity_id},
        )

    if entity_type == IssueContextEntityTypeEnum.kri:
        row = (
            await db.execute(
                select(KeyRiskIndicator.id, Risk.department_id)
                .join(Risk, KeyRiskIndicator.risk_id == Risk.id)
                .where(KeyRiskIndicator.id == entity_id)
            )
        ).one_or_none()
        if row is None or not await can_read_kri_id(db, current_user, entity_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source KRI not found")
        return ResolvedIssueSource(row[1], IssueSourceType.kri_breach, entity_id, {"kri_id": entity_id})

    if entity_type == IssueContextEntityTypeEnum.vendor:
        department_id = await _resolve_vendor_department_and_access(db, current_user, entity_id)
        return ResolvedIssueSource(department_id, IssueSourceType.manual, None, {"vendor_id": entity_id})

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported contextual entity type")


async def resolve_issue_source_metadata(
    db: AsyncSession,
    current_user: User,
    *,
    source_type: IssueSourceType | Enum | str,
    source_id: int | None,
) -> ResolvedIssueSource | None:
    source_type_value = _source_type_value(source_type)

    if source_type_value in {IssueSourceType.manual.value, IssueSourceType.audit.value}:
        if source_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{source_type_value} issues cannot include source_id",
            )
        return None

    if source_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="source_id is required")

    if source_type_value == IssueSourceType.control_execution.value:
        execution_row = (
            await db.execute(
                select(ControlExecution.id, ControlExecution.control_id, Control.department_id)
                .join(Control, ControlExecution.control_id == Control.id)
                .where(ControlExecution.id == source_id)
            )
        ).one_or_none()
        if execution_row is None or not await can_read_control_id(db, current_user, execution_row[1]):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source execution not found")
        return ResolvedIssueSource(
            execution_row[2],
            IssueSourceType.control_execution,
            source_id,
            {"execution_id": source_id},
        )

    if source_type_value == IssueSourceType.kri_breach.value:
        row = (
            await db.execute(
                select(KeyRiskIndicator.id, Risk.department_id)
                .join(Risk, KeyRiskIndicator.risk_id == Risk.id)
                .where(KeyRiskIndicator.id == source_id)
            )
        ).one_or_none()
        if row is None or not await can_read_kri_id(db, current_user, source_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source KRI not found")
        return ResolvedIssueSource(row[1], IssueSourceType.kri_breach, source_id, {"kri_id": source_id})

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported source_type")


async def ensure_issue_source_link(
    db: AsyncSession,
    *,
    issue_id: int,
    link_values: dict[str, int],
    is_source_link: bool = False,
) -> tuple[IssueLink, bool] | None:
    if not link_values:
        return None

    existing = (
        await db.execute(
            select(IssueLink).where(
                IssueLink.issue_id == issue_id,
                IssueLink.risk_id == link_values.get("risk_id"),
                IssueLink.control_id == link_values.get("control_id"),
                IssueLink.execution_id == link_values.get("execution_id"),
                IssueLink.kri_id == link_values.get("kri_id"),
                IssueLink.vendor_id == link_values.get("vendor_id"),
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        if is_source_link and not existing.is_source_link:
            existing.is_source_link = True
            db.add(existing)
            await db.flush()
        return existing, False

    link = IssueLink(issue_id=issue_id, is_source_link=is_source_link, **link_values)
    db.add(link)
    await db.flush()
    return link, True


async def clear_issue_source_links(db: AsyncSession, *, issue_id: int) -> None:
    await db.execute(
        update(IssueLink).where(IssueLink.issue_id == issue_id, IssueLink.is_source_link.is_(True)).values(
            is_source_link=False
        )
    )
    await db.flush()
