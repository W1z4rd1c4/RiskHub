from __future__ import annotations

from typing import Any

from sqlalchemy import and_, false, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.models import Control, KeyRiskIndicator, Risk, User, Vendor

from .evaluation import has_permission
from .ownership import (
    get_risk_ids_where_control_owner,
    get_risk_ids_where_kri_reporting_owner,
)
from .scoping import get_user_department_ids


def _department_strict_clause(
    *,
    user: User,
    department_id: int | None,
    department_column: Any,
) -> ColumnElement[bool] | None:
    dept_ids = get_user_department_ids(user)
    if department_id is None:
        return None
    if dept_ids is not None and department_id not in dept_ids:
        return false()
    return department_column == department_id


async def risk_visibility_clause(
    db: AsyncSession,
    user: User,
    *,
    department_id: int | None = None,
) -> ColumnElement[bool] | None:
    if not has_permission(user, "risks", "read"):
        return false()

    strict_clause = _department_strict_clause(
        user=user,
        department_id=department_id,
        department_column=Risk.department_id,
    )
    if strict_clause is not None:
        return strict_clause

    dept_ids = get_user_department_ids(user)
    if dept_ids is None:
        return None

    clauses: list[ColumnElement[bool]] = [Risk.owner_id == user.id]
    if dept_ids:
        clauses.append(Risk.department_id.in_(dept_ids))

    reporting_owner_risk_ids = await get_risk_ids_where_kri_reporting_owner(db, user.id)
    if reporting_owner_risk_ids:
        clauses.append(Risk.id.in_(reporting_owner_risk_ids))

    control_owner_risk_ids = await get_risk_ids_where_control_owner(db, user.id)
    if control_owner_risk_ids:
        clauses.append(Risk.id.in_(control_owner_risk_ids))

    return or_(*clauses) if clauses else false()


def control_visibility_clause(
    user: User,
    *,
    department_id: int | None = None,
) -> ColumnElement[bool] | None:
    if not has_permission(user, "controls", "read"):
        return false()

    strict_clause = _department_strict_clause(
        user=user,
        department_id=department_id,
        department_column=Control.department_id,
    )
    if strict_clause is not None:
        return strict_clause

    dept_ids = get_user_department_ids(user)
    if dept_ids is None:
        return None

    clauses: list[ColumnElement[bool]] = [Control.control_owner_id == user.id]
    if dept_ids:
        clauses.append(Control.department_id.in_(dept_ids))
    return or_(*clauses)


async def kri_visibility_clause(
    db: AsyncSession,
    user: User,
    *,
    department_id: int | None = None,
) -> ColumnElement[bool] | None:
    if not has_permission(user, "risks", "read"):
        return false()

    strict_clause = _department_strict_clause(
        user=user,
        department_id=department_id,
        department_column=Risk.department_id,
    )
    if strict_clause is not None:
        return strict_clause

    dept_ids = get_user_department_ids(user)
    if dept_ids is None:
        return None

    clauses: list[ColumnElement[bool]] = [Risk.owner_id == user.id]
    if dept_ids:
        clauses.append(Risk.department_id.in_(dept_ids))

    reporting_owner_risk_ids = await get_risk_ids_where_kri_reporting_owner(db, user.id)
    if reporting_owner_risk_ids:
        clauses.append(KeyRiskIndicator.risk_id.in_(reporting_owner_risk_ids))

    control_owner_risk_ids = await get_risk_ids_where_control_owner(db, user.id)
    if control_owner_risk_ids:
        clauses.append(KeyRiskIndicator.risk_id.in_(control_owner_risk_ids))

    return or_(*clauses) if clauses else false()


def vendor_visibility_clause(
    user: User,
    *,
    department_id: int | None = None,
) -> ColumnElement[bool] | None:
    if not has_permission(user, "vendors", "read"):
        return false()

    strict_clause = _department_strict_clause(
        user=user,
        department_id=department_id,
        department_column=Vendor.department_id,
    )
    if strict_clause is not None:
        return strict_clause

    dept_ids = get_user_department_ids(user)
    if dept_ids is None:
        return None

    clauses: list[ColumnElement[bool]] = [Vendor.outsourcing_owner_user_id == user.id]
    if dept_ids:
        clauses.append(Vendor.department_id.in_(dept_ids))
    return and_(Vendor.department_id.is_not(None), or_(*clauses))
