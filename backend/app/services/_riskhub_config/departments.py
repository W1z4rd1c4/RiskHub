"""Department configuration policy and serialization helpers."""

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.core.exceptions import NotFoundError
from app.models import Control, KeyRiskIndicator, OrphanedItem, Risk, User, Vendor
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.department import Department
from app.schemas.riskhub import DepartmentHubRead
from app.services._authorization_capabilities import department_capabilities
from app.services._org_chart import validate_department_manager_membership

from .lifecycle import ConfigAuditPlan, build_config_audit_plan


@dataclass(frozen=True)
class DepartmentDependencyCounts:
    users: int = 0
    risks: int = 0
    controls: int = 0
    kris: int = 0
    vendors: int = 0
    pending_orphans: int = 0

    @property
    def blocks_delete(self) -> bool:
        return any(
            count > 0
            for count in (
                self.users,
                self.risks,
                self.controls,
                self.kris,
                self.vendors,
                self.pending_orphans,
            )
        )

def department_to_read(department: Department, counts: DepartmentDependencyCounts) -> DepartmentHubRead:
    return DepartmentHubRead(
        id=department.id,
        name=department.name,
        code=department.code if hasattr(department, "code") else None,
        manager_id=department.manager_id,
        manager_name=department.manager.name if department.manager else None,
        is_active=department.is_active,
        user_count=counts.users,
        risk_count=counts.risks,
        control_count=counts.controls,
        kri_count=counts.kris,
        vendor_count=counts.vendors,
        pending_orphan_count=counts.pending_orphans,
        capabilities=department_capabilities(department, counts),
    )


def _department_audit_plan(
    department: Department,
    *,
    action: ActivityAction,
    verb: str,
    safe_description: str | None = None,
) -> ConfigAuditPlan:
    return build_config_audit_plan(
        action=action,
        entity_type=ActivityEntityType.DEPARTMENT,
        entity_id=department.id,
        entity_name=department.name,
        safe_entity_label=department.code or department.name,
        safe_description=safe_description,
        safe_description_siem=safe_description,
        description=f"{verb} department: {department.name}",
    )


def department_create_audit_plan(department: Department) -> ConfigAuditPlan:
    return _department_audit_plan(department, action=ActivityAction.CREATE, verb="Created")


def department_update_audit_plan(department: Department) -> ConfigAuditPlan:
    return _department_audit_plan(department, action=ActivityAction.UPDATE, verb="Updated")


def department_delete_audit_plan(department: Department) -> ConfigAuditPlan:
    return _department_audit_plan(department, action=ActivityAction.DELETE, verb="Deleted")


def department_restore_audit_plan(department: Department) -> ConfigAuditPlan:
    return _department_audit_plan(
        department,
        action=ActivityAction.UPDATE,
        verb="Restored",
        safe_description="Restored department",
    )


async def load_department_for_update(db: AsyncSession, department_id: int) -> Department:
    result = await db.execute(
        select(Department)
        .options(selectinload(Department.manager), selectinload(Department.users))
        .where(Department.id == department_id)
        .with_for_update()
    )
    department = result.scalar_one_or_none()
    if not department:
        raise NotFoundError("Department not found")
    return department


async def validate_department_manager(
    db: AsyncSession,
    manager_id: int | None,
    *,
    department_id: int | None = None,
) -> None:
    await validate_department_manager_membership(db, department_id=department_id, manager_id=manager_id)


async def get_department_dependency_counts(db: AsyncSession, department_id: int) -> DepartmentDependencyCounts:
    orphan_risk = aliased(Risk)
    orphan_kri_risk = aliased(Risk)
    user_count = (
        await db.execute(
            select(func.count(User.id)).where(User.department_id == department_id).where(User.is_active.is_(True))
        )
    ).scalar() or 0
    risk_count = (
        await db.execute(select(func.count(Risk.id)).where(Risk.department_id == department_id))
    ).scalar() or 0
    control_count = (
        await db.execute(select(func.count(Control.id)).where(Control.department_id == department_id))
    ).scalar() or 0
    kri_count = (
        await db.execute(
            select(func.count(KeyRiskIndicator.id))
            .join(Risk, Risk.id == KeyRiskIndicator.risk_id)
            .where(Risk.department_id == department_id)
        )
    ).scalar() or 0
    vendor_count = (
        await db.execute(select(func.count(Vendor.id)).where(Vendor.department_id == department_id))
    ).scalar() or 0
    pending_orphans = (
        await db.execute(
            select(func.count(OrphanedItem.id))
            .outerjoin(orphan_risk, (OrphanedItem.item_type == "risk") & (orphan_risk.id == OrphanedItem.item_id))
            .outerjoin(Control, (OrphanedItem.item_type == "control") & (Control.id == OrphanedItem.item_id))
            .outerjoin(
                KeyRiskIndicator,
                (OrphanedItem.item_type == "kri") & (KeyRiskIndicator.id == OrphanedItem.item_id),
            )
            .outerjoin(orphan_kri_risk, orphan_kri_risk.id == KeyRiskIndicator.risk_id)
            .where(OrphanedItem.status == "pending")
            .where(
                (orphan_risk.department_id == department_id)
                | (Control.department_id == department_id)
                | (orphan_kri_risk.department_id == department_id)
            )
        )
    ).scalar() or 0
    return DepartmentDependencyCounts(
        users=user_count,
        risks=risk_count,
        controls=control_count,
        kris=kri_count,
        vendors=vendor_count,
        pending_orphans=pending_orphans,
    )
