"""Risk Hub schemas for CRO business configuration endpoints.

Extracted from backend/app/api/v1/endpoints/riskhub.py to reduce file complexity
and follow project conventions (schemas in dedicated modules).
"""

from pydantic import BaseModel, ConfigDict, Field

# ============================================================================
# Risk Types Schemas
# ============================================================================


class RiskTypeRead(BaseModel):
    """Risk type response schema."""

    id: int
    code: str
    display_name: str
    description: str | None
    color: str
    icon: str | None
    sort_order: int
    is_active: bool
    is_system: bool
    risk_count: int
    created_at: str
    updated_at: str

    model_config = ConfigDict(from_attributes=True)


class RiskTypeCreate(BaseModel):
    """Create risk type request schema."""

    code: str = Field(..., min_length=2, max_length=50, pattern=r"^[a-z][a-z0-9_]*$")
    display_name: str = Field(..., min_length=2, max_length=100)
    description: str | None = None
    color: str = Field(default="#64748b", pattern=r"^#[0-9a-fA-F]{6}$")
    icon: str | None = None
    sort_order: int = 0


class RiskTypeUpdate(BaseModel):
    """Update risk type request schema."""

    display_name: str | None = None
    description: str | None = None
    color: str | None = None
    icon: str | None = None
    sort_order: int | None = None


class PublicRiskTypeRead(BaseModel):
    """Minimal risk type schema for public access."""

    code: str
    display_name: str
    color: str
    icon: str | None
    sort_order: int


# ============================================================================
# Global Config Schemas
# ============================================================================


class GlobalConfigRead(BaseModel):
    """Global config response schema."""

    id: int
    key: str
    value: str
    value_type: str
    category: str
    display_name: str
    description: str | None
    min_value: int | None
    max_value: int | None
    is_editable: bool
    updated_at: str
    updated_by_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


class GlobalConfigUpdate(BaseModel):
    """Update global config request schema."""

    value: str


# ============================================================================
# Approval Scenarios Schemas
# ============================================================================


class ApprovalScenarioRead(BaseModel):
    """Approval scenario response schema."""

    id: int
    key: str
    display_name: str
    description: str
    requires_approval: bool
    approver_roles: list[str]
    updated_at: str
    updated_by_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ApprovalScenarioUpdate(BaseModel):
    """Update approval scenario request schema."""

    requires_approval: bool | None = None
    approver_roles: list[str] | None = None


# ============================================================================
# Role Management Schemas
# ============================================================================


class RoleHubRead(BaseModel):
    """Role response schema for Risk Hub."""

    id: int
    name: str
    display_name: str
    description: str | None
    is_system: bool
    is_active: bool
    user_count: int
    permissions: list[str]  # ["risks:read", "controls:write", ...]
    capabilities: "RoleHubCapabilities | None" = None

    model_config = ConfigDict(from_attributes=True)


class RoleHubCapabilities(BaseModel):
    """Backend-authoritative role action capabilities."""

    can_update: bool
    can_delete: bool
    can_restore: bool


class RoleHubCreate(BaseModel):
    """Create role request schema."""

    name: str = Field(..., min_length=2, max_length=50, pattern=r"^[a-z][a-z0-9_]*$")
    display_name: str = Field(..., min_length=2, max_length=100)
    description: str | None = None
    permission_ids: list[int] = Field(default_factory=list)


class RoleHubUpdate(BaseModel):
    """Update role request schema."""

    display_name: str | None = None
    description: str | None = None
    permission_ids: list[int] | None = None


class PermissionHubRead(BaseModel):
    """Permission response schema."""

    id: int
    resource: str
    action: str
    description: str | None

    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# Department Management Schemas
# ============================================================================


class DepartmentHubRead(BaseModel):
    """Department response schema for Risk Hub."""

    id: int
    name: str
    code: str | None
    manager_id: int | None
    manager_name: str | None
    is_active: bool
    user_count: int
    risk_count: int
    control_count: int
    capabilities: "DepartmentHubCapabilities | None" = None

    model_config = ConfigDict(from_attributes=True)


class DepartmentHubCapabilities(BaseModel):
    """Backend-authoritative department action capabilities."""

    can_update: bool
    can_delete: bool
    can_restore: bool


class DepartmentHubCreate(BaseModel):
    """Create department request schema."""

    name: str = Field(..., min_length=2, max_length=100)
    code: str | None = Field(None, max_length=50)
    manager_id: int | None = None


class DepartmentHubUpdate(BaseModel):
    """Update department request schema."""

    name: str | None = None
    code: str | None = None
    manager_id: int | None = None
