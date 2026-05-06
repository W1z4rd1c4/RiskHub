from __future__ import annotations

from typing import TYPE_CHECKING

from app.core.policy import PROTECTED_SYSTEM_ROLES
from app.models import RiskTypeConfig
from app.models.department import Department
from app.models.role import Role, RoleType
from app.schemas.riskhub import (
    ApprovalScenarioCapabilities,
    DepartmentHubCapabilities,
    RiskTypeCapabilities,
    RoleHubCapabilities,
)

if TYPE_CHECKING:
    from app.services._riskhub_config.departments import DepartmentDependencyCounts


IMMUTABLE_ROLE_NAMES = {RoleType.CRO, RoleType.ADMIN, RoleType.VIEWER}


def role_capabilities(role: Role, *, active_user_count: int | None = None) -> RoleHubCapabilities:
    active_users = (
        active_user_count
        if active_user_count is not None
        else len([user for user in role.users if user.is_active])
    )
    protected = role.is_system or role.name in PROTECTED_SYSTEM_ROLES
    mutable = role.name not in IMMUTABLE_ROLE_NAMES
    return RoleHubCapabilities(
        can_update=bool(role.is_active and mutable),
        can_delete=bool(role.is_active and not protected and active_users == 0),
        can_restore=bool(not role.is_active),
    )


def department_capabilities(
    department: Department,
    counts: DepartmentDependencyCounts,
) -> DepartmentHubCapabilities:
    return DepartmentHubCapabilities(
        can_update=bool(department.is_active),
        can_delete=bool(department.is_active and not department.is_system and not counts.blocks_delete),
        can_restore=bool(not department.is_active),
    )


def risk_type_capabilities(risk_type: RiskTypeConfig | None = None) -> RiskTypeCapabilities:
    return RiskTypeCapabilities(
        can_create=True,
        can_update=bool(risk_type is None or risk_type.is_active),
        can_delete=bool(risk_type is not None and risk_type.is_active and not risk_type.is_system),
        can_restore=bool(risk_type is not None and not risk_type.is_active),
    )


def approval_scenario_capabilities() -> ApprovalScenarioCapabilities:
    return ApprovalScenarioCapabilities(can_update=True)
