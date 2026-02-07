"""Centralized policy constants shared across endpoints/services."""

from app.models.role import RoleType


PROTECTED_SYSTEM_ROLES: set[RoleType] = {
    RoleType.ADMIN,
    RoleType.CRO,
    RoleType.VIEWER,
    RoleType.INTERNAL_AUDIT,
}
