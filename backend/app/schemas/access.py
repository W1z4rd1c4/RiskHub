"""Pydantic schemas for access management endpoints."""
from typing import Optional
from pydantic import BaseModel

from app.schemas.user import RoleRead, AccessScopeEnum


class PermissionRead(BaseModel):
    """Schema for permission details."""
    resource: str
    action: str
    description: Optional[str] = None

    model_config = {"from_attributes": True}


class RoleWithPermissions(BaseModel):
    """Role schema with its permissions."""
    id: int
    name: str
    display_name: str
    description: Optional[str] = None
    permissions: list[PermissionRead]

    model_config = {"from_attributes": True}


class AccessUserRead(BaseModel):
    """Schema for access management user list/read."""
    id: int
    email: str
    name: str
    is_active: bool
    role_id: int
    role: RoleRead
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    manager_id: Optional[int] = None
    manager_name: Optional[str] = None
    access_scope: AccessScopeEnum
    scope_label: str
    effective_permissions: list[str]

    model_config = {"from_attributes": True}


class AccessUserUpdate(BaseModel):
    """
    Schema for access-management updates.

    Backend policy: all updates using this payload are restricted to admin/CRO.
    """
    role_id: Optional[int] = None
    department_id: Optional[int] = None
    manager_id: Optional[int] = None
    access_scope: Optional[AccessScopeEnum] = None
