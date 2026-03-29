from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, EmailStr


class AccessScopeEnum(str, Enum):
    """Access scope for user data visibility."""
    global_ = "global"
    department = "department"
    manager = "manager"


class RoleBase(BaseModel):
    """Base schema for Role."""
    name: str
    display_name: str
    description: Optional[str] = None


class RoleRead(RoleBase):
    """Schema for reading Role."""
    id: int

    model_config = {"from_attributes": True}


class UserBase(BaseModel):
    """Base schema for User."""
    email: EmailStr
    name: str
    is_active: bool = True
    role_id: int
    department_id: Optional[int] = None
    manager_id: Optional[int] = None  # Manager-employee hierarchy


class UserCreate(UserBase):
    """Schema for creating User."""
    password: str  # Plain password, will be hashed


class UserUpdate(BaseModel):
    """Schema for updating an existing user."""
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    password: Optional[str] = None
    role_id: Optional[int] = None
    department_id: Optional[int] = None
    manager_id: Optional[int] = None
    is_active: Optional[bool] = None


class UserRead(BaseModel):
    """Schema for reading User."""
    id: int
    email: str
    name: str
    is_active: bool
    role: RoleRead
    access_scope: AccessScopeEnum
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    manager_id: Optional[int] = None
    manager_name: Optional[str] = None  # Manager's name
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserBrief(BaseModel):
    """Brief user info for current user endpoint."""
    id: int
    email: str
    name: str
    role: str
    role_display_name: str
    permissions: list[str]
    effective_permissions: list[str]
    access_scope: AccessScopeEnum
    scope_label: str
    department_id: Optional[int] = None
    department_name: Optional[str] = None


    model_config = {"from_attributes": True}


class UserLookup(BaseModel):
    """Lightweight user info for lookups/pickers."""
    id: int
    name: str
    email: str
    role_name: str | None = None
    department_id: int | None = None
    department_name: str | None = None
    manager_id: int | None = None

    model_config = {"from_attributes": True}


class UserDirectoryEntry(BaseModel):
    """Directory entry for the `/users` page in directory mode."""

    id: int
    name: str
    email: str
    role_name: str | None = None
    role_display_name: str | None = None
    department_id: int | None = None
    department_name: str | None = None

    model_config = {"from_attributes": True}


class UserDirectoryListResponse(BaseModel):
    """Paginated response for user-directory collection reads."""

    items: list[UserDirectoryEntry]
    total: int
    skip: int
    limit: int


class UserShellSummary(BaseModel):
    """Aggregated counters for header/sidebar shell surfaces."""
    unread_notifications_count: int = 0
    pending_approvals_count: int = 0
    questionnaire_inbox_count: int = 0
    orphan_total_count: int = 0
    can_view_governance: bool = False
    generated_at: datetime


class DepartmentBase(BaseModel):
    """Base schema for Department."""
    name: str
    code: str
    description: Optional[str] = None


class DepartmentRead(DepartmentBase):
    """Schema for reading Department."""
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
