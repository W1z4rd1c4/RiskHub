from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import can_access_department_id, get_user_department_ids
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Department, Role, User
from app.models.role import RoleType
from app.models.user import AccessScope
from app.schemas.issue import IssueDepartmentLookup, IssueOwnerLookup

router = APIRouter()


@router.get("/issues/lookups/departments", response_model=list[IssueDepartmentLookup])
async def list_issue_departments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> list[IssueDepartmentLookup]:
    query = select(Department).where(Department.is_active.is_(True))
    allowed_department_ids = get_user_department_ids(current_user)
    if allowed_department_ids is not None:
        if not allowed_department_ids:
            return []
        query = query.where(Department.id.in_(allowed_department_ids))

    departments = (await db.execute(query.order_by(Department.name.asc()))).scalars().all()
    return [IssueDepartmentLookup.model_validate({"id": dept.id, "name": dept.name, "code": dept.code}) for dept in departments]


@router.get("/issues/lookups/owners", response_model=list[IssueOwnerLookup])
async def list_issue_assignable_owners(
    department_id: int = Query(..., ge=1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("issues", "write")),
) -> list[IssueOwnerLookup]:
    if not can_access_department_id(current_user, department_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this department")

    owners = (
        await db.execute(
            select(User)
            .join(Role, User.role_id == Role.id)
            .options(
                selectinload(User.role),
                selectinload(User.department),
            )
            .where(
                User.is_active.is_(True),
                Role.name != RoleType.ADMIN,
                or_(
                    User.access_scope == AccessScope.GLOBAL,
                    User.department_id == department_id,
                ),
            )
            .order_by(User.name.asc(), User.id.asc())
        )
    ).scalars().all()
    return [
        IssueOwnerLookup.model_validate(
            {
                "id": owner.id,
                "name": owner.name,
                "role_name": getattr(owner.role, "display_name", None) or getattr(owner.role, "name", None),
                "department_name": getattr(owner.department, "name", None),
            }
        )
        for owner in owners
    ]
