"""Static policy data for authorization/capability contract validation."""

from __future__ import annotations

from typing import TypedDict


class FrontendLocalGateClassification(TypedDict):
    reason: str
    allowed_patterns: tuple[str, ...]


FRONTEND_LOCAL_GATE_CLASSIFICATIONS: dict[str, FrontendLocalGateClassification] = {
    "frontend/src/authz/policy.ts": {
        "reason": "Route and navigation policy projection from the session.",
        "allowed_patterns": (
            r"const canViewUserDirectory = hasPermission\('users', 'read'\);",
            r"const canViewGovernance = !isPlatformAdmin && hasGlobalScope && hasPermission\('users', 'write'\);",
            r"const canViewActivityLog = !isPlatformAdmin && hasPermission\('activity_log', 'read'\);",
            r"const canReadRisks = hasPermission\('risks', 'read'\);",
            r"const canReadControls = hasPermission\('controls', 'read'\);",
            r"const canReadVendors = hasPermission\('vendors', 'read'\);",
            r"const canReadDepartments = hasPermission\('departments', 'read'\);",
        ),
    },
    "frontend/src/routing/business.tsx": {
        "reason": "Business route navigation visibility only.",
        "allowed_patterns": (
            r"isVisible: \(\{ authz, hasPermission \}\) => !authz\.isPlatformAdmin && "
            r"hasPermission\('controls', 'read'\),",
            r"isVisible: \(\{ authz, hasPermission \}\) => !authz\.isPlatformAdmin && "
            r"hasPermission\('risks', 'read'\),",
            r"isVisible: \(\{ authz, hasPermission \}\) => !authz\.isPlatformAdmin && "
            r"hasPermission\('issues', 'read'\),",
            r"isVisible: \(\{ authz, hasPermission \}\) => !authz\.isPlatformAdmin && "
            r"hasPermission\('vendors', 'read'\),",
            r"isVisible: \(\{ authz, hasPermission \}\) => !authz\.isPlatformAdmin && "
            r"hasPermission\('departments', 'read'\),",
        ),
    },
    "frontend/src/components/layout/Sidebar.tsx": {
        "reason": "Navigation visibility only.",
        "allowed_patterns": (
            r"import \{ usePermissions \} from '@/hooks/usePermissions';",
            r"const \{ hasPermission \} = usePermissions\(\);",
            r"const navigation = getSidebarNavRoutes\(\{ authz, hasPermission \}\)\.map\(\(route\) => \{",
        ),
    },
    "frontend/src/hooks/usePermissions.ts": {
        "reason": "Session permission projection helper.",
        "allowed_patterns": (
            r"export function usePermissions\(\) \{",
        ),
    },
}


BUSINESS_ROUTE_NAV_EXPECTATIONS: dict[str, str] = {
    "approvals": "({ authz }) => !authz.isPlatformAdmin",
    "controls": "({ authz, hasPermission }) => !authz.isPlatformAdmin && hasPermission('controls', 'read')",
    "risks": "({ authz, hasPermission }) => !authz.isPlatformAdmin && hasPermission('risks', 'read')",
    "issues": "({ authz, hasPermission }) => !authz.isPlatformAdmin && hasPermission('issues', 'read')",
    "kris": "({ authz, hasPermission }) => !authz.isPlatformAdmin && hasPermission('risks', 'read')",
    "vendors": "({ authz, hasPermission }) => !authz.isPlatformAdmin && hasPermission('vendors', 'read')",
    "departments": "({ authz, hasPermission }) => !authz.isPlatformAdmin && hasPermission('departments', 'read')",
    "governance": "({ authz }) => authz.canViewGovernance",
    "activity-log": "({ authz }) => authz.canViewActivityLog",
    "risk-hub": "({ authz }) => authz.canViewRiskHub",
}
