from __future__ import annotations

from typing import Any, overload

from sqlalchemy import and_, exists, false, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased
from sqlalchemy.sql.elements import ColumnElement

from app.models import Control, KeyRiskIndicator, Risk, User, Vendor
from app.models.risk import ControlRiskLink

from .evaluation import has_permission
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


def risk_cross_ownership_clause(user_id: int, risk_id_column: Any) -> ColumnElement[bool]:
    """Express cross-department KRI and Control ownership without materializing ID lists."""
    owned_kri = aliased(KeyRiskIndicator)
    owned_control = aliased(Control)
    owned_control_link = aliased(ControlRiskLink)
    return or_(
        exists().where(
            owned_kri.risk_id == risk_id_column,
            owned_kri.reporting_owner_id == user_id,
            owned_kri.is_archived.is_(False),
        ),
        exists().where(
            owned_control_link.risk_id == risk_id_column,
            owned_control_link.control_id == owned_control.id,
            owned_control.control_owner_id == user_id,
        ),
    )


# With a concrete department_id the strict clause is always produced (false()
# when out of scope, an equality clause otherwise), so None is impossible.
@overload
async def risk_visibility_clause(
    db: AsyncSession,
    user: User,
    *,
    department_id: int,
) -> ColumnElement[bool]: ...
@overload
async def risk_visibility_clause(
    db: AsyncSession,
    user: User,
    *,
    department_id: int | None = None,
) -> ColumnElement[bool] | None: ...
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

    clauses.append(risk_cross_ownership_clause(user.id, Risk.id))

    return or_(*clauses) if clauses else false()


@overload
def control_visibility_clause(user: User, *, department_id: int) -> ColumnElement[bool]: ...
@overload
def control_visibility_clause(
    user: User, *, department_id: int | None = None
) -> ColumnElement[bool] | None: ...
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


@overload
async def kri_visibility_clause(
    db: AsyncSession,
    user: User,
    *,
    department_id: int,
) -> ColumnElement[bool]: ...
@overload
async def kri_visibility_clause(
    db: AsyncSession,
    user: User,
    *,
    department_id: int | None = None,
) -> ColumnElement[bool] | None: ...
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

    clauses.append(risk_cross_ownership_clause(user.id, KeyRiskIndicator.risk_id))

    return or_(*clauses) if clauses else false()


@overload
def vendor_visibility_clause(user: User, *, department_id: int) -> ColumnElement[bool]: ...
@overload
def vendor_visibility_clause(
    user: User, *, department_id: int | None = None
) -> ColumnElement[bool] | None: ...
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
