"""Centralized policy constants shared across endpoints/services."""

from app.models.role import RoleType


PROTECTED_SYSTEM_ROLES: set[RoleType] = {
    RoleType.ADMIN,
    RoleType.CRO,
    RoleType.VIEWER,
    RoleType.INTERNAL_AUDIT,
}

PUBLIC_CONFIG_ALLOWLIST: set[str] = {
    "kri_reminder_days_before",
    "kri_overdue_grace_days",
    "session_timeout_minutes",
    "password_expiry_days",
    "medium_risk_min_net_score",
    "high_risk_min_net_score",
    "critical_risk_min_net_score",
    "total_assets_value",
}

SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES: tuple[RoleType, ...] = (
    RoleType.EMPLOYEE,
    RoleType.CONTROL_OWNER,
    RoleType.VIEWER,
)
