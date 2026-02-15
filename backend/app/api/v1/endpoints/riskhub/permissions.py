from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models import User
from app.schemas.riskhub import PermissionHubRead

from ._shared import get_cro_user

router = APIRouter()


@router.get("/permissions", response_model=list[PermissionHubRead])
async def list_permissions(
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> list[PermissionHubRead]:
    """List all available permissions for role assignment. CRO only."""
    from app.models.role import Permission

    result = await db.execute(select(Permission).order_by(Permission.resource, Permission.action))
    permissions = result.scalars().all()

    return [
        PermissionHubRead(
            id=p.id,
            resource=p.resource,
            action=p.action,
            description=p.description,
        )
        for p in permissions
    ]

