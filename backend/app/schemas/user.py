from enum import Enum
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.datetime_utils import UtcAwareDatetime
from app.core.email import normalize_email


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

    @field_validator("email", mode="before")
    @classmethod
    def _normalize_email(cls, value: str) -> str | None:
        return normalize_email(value)


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

    @field_validator("email", mode="before")
    @classmethod
    def _normalize_email(cls, value: str | None) -> str | None:
        return normalize_email(value)


class UserRead(BaseModel):
    """Schema for reading User."""

    id: int
    email: str
    name: str
    is_active: bool
    role: RoleRead
    access_scope: AccessScopeEnum
    entra_business_role: Optional[str] = None
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    manager_id: Optional[int] = None
    manager_name: Optional[str] = None  # Manager's name
    created_at: UtcAwareDatetime
    updated_at: UtcAwareDatetime

    model_config = {"from_attributes": True}


class MeCapabilities(BaseModel):
    """Backend-authoritative shell and route-gate capabilities for the current user."""

    can_view_user_directory: bool = False
    can_view_access_users: bool = False
    can_view_department_access_users: bool = False
    can_view_users_route: bool = False
    can_manage_access: bool = False
    can_view_department_access: bool = False
    can_view_admin_console: bool = False
    can_view_riskhub: bool = False
    can_view_governance: bool = False
    can_view_activity_log: bool = False
    can_view_committee: bool = False
    can_view_users_page: bool = False
    is_second_line: bool = False
    can_read_risks: bool = False
    can_read_controls: bool = False
    can_read_vendors: bool = False
    can_read_departments: bool = False
    resource_permissions: dict[str, bool] = Field(default_factory=dict)


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
    entra_business_role: Optional[str] = None
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    me_capabilities: MeCapabilities | None = None

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


class UserDirectoryRoleFacet(BaseModel):
    """Available role filter option for the visible directory universe."""

    name: str
    display_name: str
    count: int


class UserDirectoryCapabilities(BaseModel):
    """Backend-authoritative user-directory action capabilities."""

    can_read_directory: bool = False
    can_view_access_details: bool = False
    can_use_role_facets: bool = False
    can_create_local_user: bool = False
    can_import_directory_user: bool = False


class UserDirectoryListResponse(BaseModel):
    """Paginated response for user-directory collection reads."""

    items: list[UserDirectoryEntry]
    available_roles: list[UserDirectoryRoleFacet]
    total: int
    skip: int
    limit: int
    capabilities: UserDirectoryCapabilities | None = None


class UserShellSummary(BaseModel):
    """Aggregated counters for header/sidebar shell surfaces."""

    unread_notifications_count: int = 0
    pending_approvals_count: int = 0
    questionnaire_inbox_count: int = 0
    orphan_total_count: int = 0
    can_view_governance: bool = False
    generated_at: UtcAwareDatetime


class DepartmentBase(BaseModel):
    """Base schema for Department."""

    name: str
    code: str
    description: Optional[str] = None


class DepartmentRead(DepartmentBase):
    """Schema for reading Department."""

    id: int
    created_at: UtcAwareDatetime
    updated_at: UtcAwareDatetime

    model_config = {"from_attributes": True}
