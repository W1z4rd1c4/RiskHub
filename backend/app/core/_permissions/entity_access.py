from app.models import User

from .evaluation import has_permission
from .ownership import (
    is_control_owner,
    is_risk_control_owner,
    is_risk_kri_reporting_owner,
)
from .scoping import can_access_department_id, get_user_department_ids, is_privileged_user


async def can_read_risk_id(db, user: User, risk_id: int) -> bool:
    """
    Risk visibility rule:
    - Must have risks:read permission
    - Must be in-scope by department OR directly own the risk OR be a KRI reporting owner OR control owner on the risk
    """
    if not has_permission(user, "risks", "read"):
        return False

    if await is_risk_kri_reporting_owner(db, user.id, risk_id):
        return True
    if await is_risk_control_owner(db, user.id, risk_id):
        return True

    from sqlalchemy import select

    from app.models import Risk

    row = (await db.execute(select(Risk.id, Risk.department_id, Risk.owner_id).where(Risk.id == risk_id))).one_or_none()
    if row is None:
        return False
    _, dept_id, owner_id = row
    if owner_id == user.id:
        return True
    return can_access_department_id(user, dept_id)


async def can_read_control_id(db, user: User, control_id: int) -> bool:
    """
    Control visibility rule:
    - Must have controls:read permission
    - Must be in-scope by department OR be the control owner
    """
    if not has_permission(user, "controls", "read"):
        return False

    if await is_control_owner(db, user.id, control_id):
        return True

    from sqlalchemy import select

    from app.models import Control

    row = (await db.execute(select(Control.id, Control.department_id).where(Control.id == control_id))).one_or_none()
    if row is None:
        return False
    _, dept_id = row
    return can_access_department_id(user, dept_id)


async def can_read_vendor_id(db, user: User, vendor_id: int) -> bool:
    """
    Vendor visibility rule (Phase 18):
    - Must have vendors:read permission
    - Unassigned vendors (department_id is None): privileged users only
    - Privileged users: all vendors
    - Dept-scoped users: vendors in their department(s) OR where they are outsourcing owner
    """
    if not has_permission(user, "vendors", "read"):
        return False

    from sqlalchemy import select

    from app.models import Vendor

    row = (
        await db.execute(
            select(Vendor.id, Vendor.department_id, Vendor.outsourcing_owner_user_id).where(Vendor.id == vendor_id)
        )
    ).one_or_none()
    if row is None:
        return False

    _, dept_id, owner_id = row

    if dept_id is None:
        return is_privileged_user(user)

    dept_ids = get_user_department_ids(user)
    if dept_ids is None:
        return True
    if dept_id in dept_ids:
        return True
    return bool(owner_id == user.id)


async def can_read_kri_id(db, user: User, kri_id: int) -> bool:
    """
    KRI visibility rule:
    - KRIs inherit from risks (they are risk sub-entities)
    - Must have risks:read
    - Must be able to read the linked risk by department/ownership rules
    """
    if not has_permission(user, "risks", "read"):
        return False

    from sqlalchemy import select

    from app.models import KeyRiskIndicator

    risk_id = (
        await db.execute(select(KeyRiskIndicator.risk_id).where(KeyRiskIndicator.id == kri_id))
    ).scalar_one_or_none()
    if risk_id is None:
        return False
    return await can_read_risk_id(db, user, risk_id)
