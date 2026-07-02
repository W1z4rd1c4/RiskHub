from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.permissions import can_read_control_id, can_read_kri_id, can_read_risk_id, can_read_vendor_id
from app.models import Control, ControlExecution, IssueLink, KeyRiskIndicator, Risk, User, Vendor
from app.models.issue import IssueSourceType
from app.schemas.issue import IssueContextEntityTypeEnum

from .constants import source_type_value


@dataclass(frozen=True)
class ResolvedIssueSource:
    department_id: int
    source_type: IssueSourceType
    source_id: int | None
    link_values: dict[str, int]


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
        raise NotFoundError("Linked vendor not found")

    _, vendor_department_id, owner_department_id, vendor_is_archived = row
    # BL §11.5 treats inactive linked vendors as archived after vendor status removal.
    if vendor_is_archived:
        raise ConflictError("Cannot link archived vendor")

    resolved_department_id = vendor_department_id or owner_department_id
    if resolved_department_id is None:
        raise ConflictError("Linked vendor has no department and owner department is unresolved")
    return resolved_department_id


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
            raise NotFoundError("Source risk not found")
        return ResolvedIssueSource(row[1], IssueSourceType.manual, None, {"risk_id": entity_id})

    if entity_type == IssueContextEntityTypeEnum.control:
        row = (await db.execute(select(Control.id, Control.department_id).where(Control.id == entity_id))).one_or_none()
        if row is None or not await can_read_control_id(db, current_user, entity_id):
            raise NotFoundError("Source control not found")
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
            raise NotFoundError("Source execution not found")
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
            raise NotFoundError("Source KRI not found")
        return ResolvedIssueSource(row[1], IssueSourceType.kri_breach, entity_id, {"kri_id": entity_id})

    if entity_type == IssueContextEntityTypeEnum.vendor:
        department_id = await resolve_vendor_department_and_access(db, current_user, entity_id)
        return ResolvedIssueSource(department_id, IssueSourceType.manual, None, {"vendor_id": entity_id})

    raise ValidationError("Unsupported contextual entity type")


async def resolve_issue_source_metadata(
    db: AsyncSession,
    current_user: User,
    *,
    source_type: IssueSourceType | Enum | str,
    source_id: int | None,
) -> ResolvedIssueSource | None:
    value = source_type_value(source_type)

    if value in {IssueSourceType.manual.value, IssueSourceType.audit.value}:
        if source_id is not None:
            raise ValidationError(f"{value} issues cannot include source_id")
        return None

    if source_id is None:
        raise ValidationError("source_id is required")

    if value == IssueSourceType.control_execution.value:
        execution_row = (
            await db.execute(
                select(ControlExecution.id, ControlExecution.control_id, Control.department_id)
                .join(Control, ControlExecution.control_id == Control.id)
                .where(ControlExecution.id == source_id)
            )
        ).one_or_none()
        if execution_row is None or not await can_read_control_id(db, current_user, execution_row[1]):
            raise NotFoundError("Source execution not found")
        return ResolvedIssueSource(
            execution_row[2],
            IssueSourceType.control_execution,
            source_id,
            {"execution_id": source_id},
        )

    if value == IssueSourceType.kri_breach.value:
        row = (
            await db.execute(
                select(KeyRiskIndicator.id, Risk.department_id)
                .join(Risk, KeyRiskIndicator.risk_id == Risk.id)
                .where(KeyRiskIndicator.id == source_id)
            )
        ).one_or_none()
        if row is None or not await can_read_kri_id(db, current_user, source_id):
            raise NotFoundError("Source KRI not found")
        return ResolvedIssueSource(row[1], IssueSourceType.kri_breach, source_id, {"kri_id": source_id})

    raise ValidationError("Unsupported source_type")


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
