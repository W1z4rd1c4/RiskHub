"""Pydantic schemas for access management endpoints."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator

from app.core.email import normalize_email
from app.schemas.user import AccessScopeEnum, RoleRead


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
    external_id: Optional[str] = None
    job_title: Optional[str] = None
    entra_business_role: Optional[str] = None
    directory_last_checked_at: datetime | None = None
    directory_last_seen_at: datetime | None = None
    directory_sync_status: Optional[str] = None
    deprovisioned_at: datetime | None = None
    deprovision_reason: Optional[str] = None
    capabilities: "AccessUserCapabilities | None" = None

    model_config = {"from_attributes": True}


class AccessUserCapabilities(BaseModel):
    """Backend-authoritative access-user action capabilities."""

    can_edit_identity: bool
    can_edit_business_access: bool
    can_edit_role: bool
    can_deactivate: bool
    can_change_active_status: bool
    can_break_glass_enable: bool
    can_revoke_sessions: bool


class AccessUserUpdate(BaseModel):
    """
    Schema for access-management updates.

    Backend policy:
    - name/email and Admin-role assignment are restricted to platform Admin
    - department/manager/scope and non-admin role assignment are restricted to CRO
    """

    name: Optional[str] = None
    email: Optional[EmailStr] = None
    role_id: Optional[int] = None
    department_id: Optional[int] = None
    manager_id: Optional[int] = None
    access_scope: Optional[AccessScopeEnum] = None

    @field_validator("email", mode="before")
    @classmethod
    def _normalize_email(cls, value: str | None) -> str | None:
        return normalize_email(value)
