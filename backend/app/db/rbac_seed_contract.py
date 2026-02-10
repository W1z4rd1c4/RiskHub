"""Canonical RBAC seed definitions shared by all seed entrypoints."""
from __future__ import annotations

from collections.abc import Iterable


RBAC_ROLES: tuple[dict[str, object], ...] = (
    {"name": "admin", "display_name": "Administrator", "description": "System administration, platform access only", "is_system": True},
    {"name": "cro", "display_name": "Chief Risk Officer", "description": "Full access, risk oversight, reporting", "is_system": True},
    {"name": "risk_manager", "display_name": "Risk Manager", "description": "Risk register management, control oversight"},
    {"name": "actuarial", "display_name": "Actuarial Function", "description": "Actuarial controls, reserving oversight"},
    {"name": "compliance", "display_name": "Compliance Officer", "description": "Regulatory compliance, policy controls"},
    {"name": "internal_audit", "display_name": "Internal Audit", "description": "Read-only audit access, verification rights", "is_system": True},
    {"name": "department_head", "display_name": "Department Head", "description": "Department control catalog ownership"},
    {"name": "employee", "display_name": "Employee", "description": "Department member with basic access"},
    {"name": "viewer", "display_name": "Viewer", "description": "Read-only dashboard access", "is_system": True},
)

RBAC_PERMISSIONS: tuple[dict[str, str], ...] = (
    {"resource": "*", "action": "*", "description": "Full access to all resources"},
    {"resource": "controls", "action": "read", "description": "View controls"},
    {"resource": "controls", "action": "write", "description": "Create/edit controls"},
    {"resource": "controls", "action": "delete", "description": "Delete controls"},
    {"resource": "controls", "action": "approve", "description": "Approve control changes"},
    {"resource": "risks", "action": "read", "description": "View risks"},
    {"resource": "risks", "action": "write", "description": "Create/edit risks"},
    {"resource": "risks", "action": "delete", "description": "Delete risks"},
    {"resource": "vendors", "action": "read", "description": "View vendors"},
    {"resource": "vendors", "action": "write", "description": "Create/edit vendors"},
    {"resource": "vendors", "action": "delete", "description": "Archive vendors"},
    {"resource": "vendor_contracts", "action": "read", "description": "View vendor contracts and DORA clauses"},
    {"resource": "vendor_contracts", "action": "write", "description": "Create/edit vendor contracts and DORA clauses"},
    {"resource": "departments", "action": "read", "description": "View departments"},
    {"resource": "departments", "action": "write", "description": "Create/edit departments"},
    {"resource": "reports", "action": "read", "description": "View and export reports"},
    {"resource": "users", "action": "read", "description": "View users"},
    {"resource": "users", "action": "write", "description": "Manage users"},
    {"resource": "approvals", "action": "write", "description": "Resolve approval requests"},
    {"resource": "kri", "action": "submit", "description": "Submit KRI values"},
    {"resource": "activity_log", "action": "read", "description": "View activity log"},
)

RBAC_ROLE_PERMISSIONS: dict[str, tuple[str, ...]] = {
    "admin": ("users:*", "activity_log:read", "departments:read"),
    "cro": ("*:*",),
    "risk_manager": ("controls:*", "risks:*", "vendors:*", "departments:read", "reports:*", "users:read", "approvals:write", "activity_log:read", "kri:submit"),
    "actuarial": ("controls:read", "controls:write", "risks:read", "vendors:read", "reports:read"),
    "compliance": ("controls:read", "controls:write", "risks:read", "vendors:read", "reports:read", "vendor_contracts:*"),
    "internal_audit": ("controls:read", "risks:read", "vendors:read", "departments:read", "reports:read"),
    "department_head": ("controls:read", "controls:write", "risks:read", "vendors:read", "vendors:write", "departments:read", "reports:read", "kri:submit", "activity_log:read"),
    "employee": ("controls:read", "risks:read", "vendors:read", "departments:read", "reports:read"),
    "viewer": ("controls:read", "risks:read", "vendors:read", "departments:read", "reports:read"),
}

PERMISSION_BY_KEY: dict[str, dict[str, str]] = {
    f"{permission['resource']}:{permission['action']}": permission
    for permission in RBAC_PERMISSIONS
}

ROLE_BY_NAME: dict[str, dict[str, object]] = {
    role["name"]: role
    for role in RBAC_ROLES
}


def expand_permission_keys(permission_keys: Iterable[str]) -> set[str]:
    """Expand wildcard entries (for example, ``controls:*``) into concrete keys."""
    expanded: set[str] = set()
    for key in permission_keys:
        if key in PERMISSION_BY_KEY:
            expanded.add(key)
            continue

        if key.endswith(":*"):
            resource = key.split(":", maxsplit=1)[0]
            for permission_key in PERMISSION_BY_KEY:
                if permission_key.startswith(f"{resource}:"):
                    expanded.add(permission_key)
            continue

        raise ValueError(f"Unknown permission key in RBAC contract: {key}")
    return expanded
