from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.exceptions import AuthorizationError
from app.core.pagination import MAX_LOOKUP_SIZE
from app.core.permissions import can_manage_users, has_permission, is_platform_admin
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Role, User
from app.models.role import RoleType
from app.schemas import RoleRead
from app.schemas.asset import AssetOwnerLookup
from app.schemas.user import AssignableOwnerLookup, ThreatStewardLookup, UserLookup
from app.services._ict_register_lifecycle.asset_policy import (
    assert_asset_assignment_lookup_allowed,
)
from app.services._ict_register_lifecycle.policy import assert_process_assignment_lookup_allowed
from app.services._vendor_governance.policy import (
    assert_vendor_assignment_lookup_allowed,
)

from ._lifecycle import ensure_admin_user_lifecycle
from ._visibility import build_visible_users_query

router = APIRouter()


async def _lookup_assignable_owners(
    *,
    current_user: User,
    db: AsyncSession,
    q: str | None,
    department_id: int | None,
    limit: int,
) -> list[AssignableOwnerLookup]:
    """Return active, visible business identities for an authorized assignment flow."""
    query = (
        build_visible_users_query(current_user, department_id=department_id)
        .join(Role, User.role_id == Role.id)
        .options(
            selectinload(User.role),
            selectinload(User.department),
        )
        .where(
            User.is_active.is_(True),
            Role.is_active.is_(True),
            Role.name != RoleType.ADMIN,
        )
    )
    if q:
        search_term = f"%{q}%"
        query = query.where(or_(User.name.ilike(search_term), User.email.ilike(search_term)))

    result = await db.execute(
        query.order_by(User.name.asc(), User.id.asc()).limit(min(limit, MAX_LOOKUP_SIZE))
    )
    return [
        AssignableOwnerLookup(
            id=user.id,
            name=user.name,
            email=user.email,
            role_name=user.role.name if user.role else None,
            department_id=user.department_id,
            department_name=user.department.name if user.department else None,
        )
        for user in result.scalars().all()
    ]


@router.get("/roles", response_model=list[RoleRead])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """List roles for admin-only user lifecycle flows."""
    ensure_admin_user_lifecycle(current_user)
    result = await db.execute(select(Role).where(Role.is_active.is_(True)))
    return result.scalars().all()


@router.get("/lookup", response_model=list[UserLookup])
async def lookup_users(
    q: str | None = None,
    include_inactive: bool = False,
    department_id: int | None = None,
    role_name: str | None = None,
    ids: list[int] | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_permission("users", "read")),
    db: AsyncSession = Depends(get_db),
):
    """
    Scoped user lookup for pickers/dropdowns.

    Returns users visible to the current user based on their access scope:
    - GLOBAL: All active users
    - DEPARTMENT: Same-department users
    - MANAGER: Self + direct reports

    Args:
        q: Optional text search (name or email)
        include_inactive: Include inactive users (default False)
        department_id: Optional filter by department (scoped to caller's access)
        role_name: Optional exact RiskHub role filter
        ids: Optional exact user IDs to resolve (scoped to caller's access)
        skip: Number of records to skip (default 0)
        limit: Maximum number of records to return (default 50, max 200)
    """
    # Enforce max lookup size
    limit = min(limit, MAX_LOOKUP_SIZE)
    if ids is not None and len(ids) > MAX_LOOKUP_SIZE:
        raise HTTPException(status_code=400, detail="Too many user ids requested")
    exact_ids = list(dict.fromkeys(ids or []))

    query = build_visible_users_query(current_user, department_id=department_id).options(
        selectinload(User.role),
        selectinload(User.department),
    )
    if exact_ids:
        query = query.where(User.id.in_(exact_ids))
    if role_name:
        query = query.where(User.role.has(Role.name == role_name))

    # Apply active filter
    if not include_inactive:
        query = query.where(User.is_active.is_(True))

    # Apply text search
    if q:
        search_term = f"%{q}%"
        query = query.where(or_(User.name.ilike(search_term), User.email.ilike(search_term)))

    # Deterministic ordering for stable paging
    if exact_ids:
        result = await db.execute(query.order_by(User.id))
    else:
        result = await db.execute(query.order_by(User.id).offset(skip).limit(limit))
    users = result.scalars().all()

    return [
        UserLookup(
            id=u.id,
            name=u.name,
            email=u.email,
            role_name=u.role.name if u.role else None,
            department_id=u.department_id,
            department_name=u.department.name if u.department else None,
            manager_id=u.manager_id,
        )
        for u in users
    ]


@router.get("/lookup/risk-owners", response_model=list[AssignableOwnerLookup])
async def lookup_risk_owners(
    q: str | None = None,
    department_id: int | None = None,
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_permission("risks", "write")),
    db: AsyncSession = Depends(get_db),
):
    """Return active, visible identities assignable as Risk or KRI owners."""
    return await _lookup_assignable_owners(
        current_user=current_user,
        db=db,
        q=q,
        department_id=department_id,
        limit=limit,
    )


@router.get("/lookup/control-owners", response_model=list[AssignableOwnerLookup])
async def lookup_control_owners(
    q: str | None = None,
    department_id: int | None = None,
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_permission("controls", "write")),
    db: AsyncSession = Depends(get_db),
):
    """Return active, visible identities assignable as Control owners."""
    return await _lookup_assignable_owners(
        current_user=current_user,
        db=db,
        q=q,
        department_id=department_id,
        limit=limit,
    )


@router.get("/lookup/vendor-owners", response_model=list[AssignableOwnerLookup])
async def lookup_vendor_owners(
    q: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return active Users eligible for cross-Department Vendor ownership."""
    await assert_vendor_assignment_lookup_allowed(
        db,
        current_user=current_user,
        allow_orphan_operator=True,
    )
    query = (
        select(User)
        .options(selectinload(User.role), selectinload(User.department))
        .where(User.is_active.is_(True))
    )
    if q:
        search_term = f"%{q}%"
        query = query.where(
            or_(User.name.ilike(search_term), User.email.ilike(search_term))
        )
    users = (
        await db.execute(
            query.order_by(User.name.asc(), User.id.asc()).limit(
                min(limit, MAX_LOOKUP_SIZE)
            )
        )
    ).scalars().all()
    return [
        AssignableOwnerLookup(
            id=user.id,
            name=user.name,
            email=user.email,
            role_name=user.role.name,
            department_id=user.department_id,
            department_name=(
                user.department.name if user.department is not None else None
            ),
        )
        for user in users
    ]


@router.get("/lookup/process-owners", response_model=list[AssignableOwnerLookup])
async def lookup_process_owners(
    q: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return active Users eligible for cross-Department Process ownership."""
    await assert_process_assignment_lookup_allowed(db, current_user=current_user)
    query = (
        select(User)
        .options(selectinload(User.role), selectinload(User.department))
        .where(
            User.is_active.is_(True),
            ~User.role.has(Role.name == RoleType.ADMIN),
        )
    )
    if q:
        search_term = f"%{q}%"
        query = query.where(or_(User.name.ilike(search_term), User.email.ilike(search_term)))
    users = (
        await db.execute(
            query.order_by(User.name.asc(), User.id.asc()).limit(
                min(limit, MAX_LOOKUP_SIZE)
            )
        )
    ).scalars().all()
    return [
        AssignableOwnerLookup(
            id=user.id,
            name=user.name,
            email=user.email,
            role_name=user.role.name if user.role else None,
            department_id=user.department_id,
            department_name=user.department.name if user.department else None,
        )
        for user in users
    ]


@router.get("/lookup/asset-owners", response_model=list[AssetOwnerLookup])
async def lookup_asset_owners(
    q: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AssetOwnerLookup]:
    """Return active identities eligible for either Asset responsibility."""
    await assert_asset_assignment_lookup_allowed(db, current_user=current_user)
    query = (
        select(User)
        .options(selectinload(User.role), selectinload(User.department))
        .where(User.is_active.is_(True))
    )
    if q:
        search_term = f"%{q}%"
        query = query.where(
            or_(User.name.ilike(search_term), User.email.ilike(search_term))
        )
    users = (
        await db.execute(
            query.order_by(User.name.asc(), User.id.asc()).limit(
                min(limit, MAX_LOOKUP_SIZE)
            )
        )
    ).scalars().all()
    return [
        AssetOwnerLookup(
            id=user.id,
            name=user.name,
            email=user.email,
            role_name=user.role.name,
            department_id=user.department_id,
            department_name=(
                user.department.name if user.department is not None else None
            ),
        )
        for user in users
    ]


@router.get("/lookup/threat-stewards", response_model=list[ThreatStewardLookup])
async def lookup_threat_stewards(
    q: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return active canonical CISO identities for the Threat Steward picker.

    This purpose-scoped lookup deliberately ignores the caller's department
    visibility because Threat stewardship is a cross-department governance
    assignment. It exposes only the identity fields needed by the picker.
    """
    if not (
        has_permission(current_user, "threats", "write")
        or (
            not is_platform_admin(current_user)
            and can_manage_users(current_user)
        )
    ):
        raise AuthorizationError("Permission denied: Threat Steward assignment lookup")
    query = (
        select(User)
        .join(Role, User.role_id == Role.id)
        .where(
            User.is_active.is_(True),
            Role.name == RoleType.CISO,
            Role.is_active.is_(True),
        )
    )
    if q:
        search_term = f"%{q}%"
        query = query.where(or_(User.name.ilike(search_term), User.email.ilike(search_term)))

    result = await db.execute(query.order_by(User.name.asc(), User.id.asc()).limit(min(limit, MAX_LOOKUP_SIZE)))
    return [
        ThreatStewardLookup(id=user.id, name=user.name, email=user.email)
        for user in result.scalars().all()
    ]
