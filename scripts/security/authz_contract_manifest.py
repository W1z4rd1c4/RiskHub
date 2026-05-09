"""Static policy data for authorization/capability contract validation."""

from __future__ import annotations

from typing import TypedDict


class FrontendLocalGateClassification(TypedDict):
    reason: str
    allowed_patterns: tuple[str, ...]


FRONTEND_LOCAL_GATE_CLASSIFICATIONS: dict[str, FrontendLocalGateClassification] = {
    "frontend/src/authz/policy.ts": {
        "reason": "Route and navigation policy projection from backend me-capabilities with session fallback.",
        "allowed_patterns": (
            r"hasPermission: PermissionChecker,",
            r"function buildLegacyAuthz\(user: AuthUser, hasPermission: PermissionChecker\): Authz \{",
            r"return buildLegacyAuthz\(user, hasPermission\);",
            r"const can = \(action: string, resource: string\): boolean => hasPermission\(resource, action\);",
            r"const canViewUserDirectory = hasPermission\('users', 'read'\);",
            r"canViewGovernance: !isPlatformAdmin && hasGlobalScope && hasPermission\('users', 'write'\),",
            r"canViewActivityLog: !isPlatformAdmin && hasPermission\('activity_log', 'read'\),",
            r"canReadRisks: hasPermission\('risks', 'read'\),",
            r"canReadControls: hasPermission\('controls', 'read'\),",
            r"canReadVendors: hasPermission\('vendors', 'read'\),",
            r"canReadDepartments: hasPermission\('departments', 'read'\),",
        ),
    },
    "frontend/src/authz/useAuthz.ts": {
        "reason": "Authz hook passes backend me-capabilities into the route/session projection.",
        "allowed_patterns": (
            r"const \{ user, hasPermission \} = useAuth\(\);",
            r"const strictCapabilities = useSyncExternalStore\(",
            r"\(\) => buildAuthz\(user, hasPermission, user\?\.me_capabilities, strictCapabilities\),",
            r"\[user, hasPermission, strictCapabilities\],",
        ),
    },
    "frontend/src/contexts/AuthContext.tsx": {
        "reason": "Compatibility shim exposes the session provider's permission helper through useAuth.",
        "allowed_patterns": (
            r"hasPermission: session\.hasPermission,",
        ),
    },
    "frontend/src/contexts/SessionContext.tsx": {
        "reason": "Session provider owns the legacy permission helper used by route/session projections.",
        "allowed_patterns": (
            r"hasPermission: \(resource: string, action: string\) => boolean;",
            r"const hasPermission = useCallback\(\(resource: string, action: string\): boolean => \{",
            r"hasPermission,",
        ),
    },
    "frontend/src/routing/business.tsx": {
        "reason": "Business route navigation visibility only.",
        "allowed_patterns": (
            r"isVisible: \(\{ authz \}\) => !authz\.isPlatformAdmin && authz\.can\('read', 'controls'\),",
            r"isVisible: \(\{ authz \}\) => !authz\.isPlatformAdmin && authz\.can\('read', 'risks'\),",
            r"isVisible: \(\{ authz \}\) => !authz\.isPlatformAdmin && authz\.can\('read', 'issues'\),",
            r"isVisible: \(\{ authz \}\) => !authz\.isPlatformAdmin && authz\.can\('read', 'vendors'\),",
            r"isVisible: \(\{ authz \}\) => !authz\.isPlatformAdmin && authz\.can\('read', 'departments'\),",
        ),
    },
    "frontend/src/components/layout/Sidebar.tsx": {
        "reason": "Navigation visibility only.",
        "allowed_patterns": (
            r"const \{ user, logout, logoutPending, logoutErrorKey, hasPermission \} = useAuth\(\);",
            r"const navigation = getSidebarNavRoutes\(\{ authz, hasPermission \}\)\.map\(\(route\) => \{",
        ),
    },
}


BUSINESS_ROUTE_NAV_EXPECTATIONS: dict[str, str] = {
    "approvals": "({ authz }) => !authz.isPlatformAdmin",
    "controls": "({ authz }) => !authz.isPlatformAdmin && authz.can('read', 'controls')",
    "risks": "({ authz }) => !authz.isPlatformAdmin && authz.can('read', 'risks')",
    "issues": "({ authz }) => !authz.isPlatformAdmin && authz.can('read', 'issues')",
    "kris": "({ authz }) => !authz.isPlatformAdmin && authz.can('read', 'risks')",
    "vendors": "({ authz }) => !authz.isPlatformAdmin && authz.can('read', 'vendors')",
    "departments": "({ authz }) => !authz.isPlatformAdmin && authz.can('read', 'departments')",
    "governance": "({ authz }) => authz.canViewGovernance",
    "activity-log": "({ authz }) => authz.canViewActivityLog",
    "risk-hub": "({ authz }) => authz.canViewRiskHub",
}
