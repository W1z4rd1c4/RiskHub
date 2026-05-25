import { describe, expect, it } from 'vitest';

import {
  AdminConsoleRouteGuard,
  AuditTrailRouteGuard,
} from '@/authz/BusinessRouteGuards';
import { buildAuthz, type AuthUser, type PermissionChecker } from '@/authz/policy';
import { adminRoutes } from '@/routing/admin';
import { businessRoutes } from '@/routing/business';
import { getSidebarNavRoutes, protectedAppRoutes } from '@/routing';
import type { MeCapabilities } from '@/services/authApi';
import type { AppRouteDef } from '@/routing/types';

function createPermissionChecker(permissions: string[]): PermissionChecker {
  const allowed = new Set(permissions);
  return (resource, action) => allowed.has(`${resource}:${action}`) || allowed.has('*:*');
}

function visibleSidebarHrefs(user: AuthUser, permissions: string[]) {
  const hasPermission = createPermissionChecker(permissions);
  const authz = buildAuthz(user, hasPermission);
  return getSidebarNavRoutes({ authz, hasPermission }).map((route) => route.nav.href);
}

function meCapabilities(overrides: Partial<MeCapabilities> = {}): MeCapabilities {
  return {
    can_view_user_directory: false,
    can_view_access_users: false,
    can_view_department_access_users: false,
    can_view_users_route: false,
    can_manage_access: false,
    can_view_department_access: false,
    can_view_admin_console: false,
    can_view_riskhub: false,
    can_view_governance: false,
    can_view_activity_log: false,
    can_view_committee: false,
    can_view_users_page: false,
    is_second_line: false,
    can_read_risks: false,
    can_read_controls: false,
    can_read_vendors: false,
    can_read_departments: false,
    resource_permissions: {},
    ...overrides,
  };
}

function expectRouteElementGuard(
  routes: AppRouteDef[],
  key: string,
  guard: unknown,
) {
  const route = routes.find((candidate) => candidate.key === key);

  expect(route).toBeDefined();
  expect(route?.element.type).toBe(guard);
}

describe('routing manifest parity', () => {
  it('maps every sidebar href to a concrete protected route', () => {
    const protectedHrefs = new Set(
      protectedAppRoutes.flatMap((route) => {
        if (route.index) return ['/'];
        if (route.path) return [`/${route.path}`];
        return [];
      }),
    );

    for (const route of protectedAppRoutes) {
      if (!route.nav) continue;
      expect(protectedHrefs.has(route.nav.href)).toBe(true);
    }
  });

  it('has no duplicate sidebar hrefs', () => {
    const hrefs = protectedAppRoutes.flatMap((route) => (route.nav ? [route.nav.href] : []));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('guards direct navigation for audit and admin route entries', () => {
    expectRouteElementGuard(businessRoutes, 'audit-trail', AuditTrailRouteGuard);
    expectRouteElementGuard(adminRoutes, 'admin', AdminConsoleRouteGuard);
    expectRouteElementGuard(adminRoutes, 'admin-docs', AdminConsoleRouteGuard);
  });

  it('matches admin sidebar visibility contract', () => {
    const hrefs = visibleSidebarHrefs(
      { role: 'admin', access_scope: 'global' },
      ['users:read', 'activity_log:read', 'issues:read', 'vendors:read'],
    );

    expect(hrefs).toEqual(['/settings', '/users', '/admin', '/admin/docs']);
  });

  it('matches CRO sidebar visibility contract', () => {
    const hrefs = visibleSidebarHrefs(
      { role: 'cro', access_scope: 'global' },
      [
        'users:read',
        'activity_log:read',
        'controls:read',
        'risks:read',
        'issues:read',
        'users:write',
        'vendors:read',
        'departments:read',
      ],
    );

    expect(hrefs).toEqual([
      '/',
      '/approvals',
      '/controls',
      '/risks',
      '/issues',
      '/kris',
      '/vendors',
      '/departments',
      '/governance',
      '/activity-log',
      '/settings',
      '/users',
      '/risk-hub',
    ]);
  });

  it('matches risk-manager sidebar visibility contract', () => {
    const hrefs = visibleSidebarHrefs(
      { role: 'risk_manager', access_scope: 'global' },
      ['activity_log:read', 'controls:read', 'risks:read', 'issues:read', 'vendors:read', 'departments:read'],
    );

    expect(hrefs).toEqual([
      '/',
      '/approvals',
      '/controls',
      '/risks',
      '/issues',
      '/kris',
      '/vendors',
      '/departments',
      '/activity-log',
      '/settings',
      '/users',
    ]);
  });

  it('hides core entity navigation without matching read permissions', () => {
    const hrefs = visibleSidebarHrefs(
      { role: 'risk_manager', access_scope: 'global' },
      ['activity_log:read', 'issues:read', 'vendors:read'],
    );

    expect(hrefs).toContain('/approvals');
    expect(hrefs).not.toContain('/controls');
    expect(hrefs).not.toContain('/risks');
    expect(hrefs).not.toContain('/kris');
    expect(hrefs).toContain('/vendors');
    expect(hrefs).not.toContain('/departments');
  });

  it('shows Controls navigation for controls:read without risk read access', () => {
    const hrefs = visibleSidebarHrefs(
      { role: 'risk_manager', access_scope: 'global' },
      ['controls:read'],
    );

    expect(hrefs).toContain('/approvals');
    expect(hrefs).toContain('/controls');
    expect(hrefs).not.toContain('/risks');
    expect(hrefs).not.toContain('/kris');
  });

  it('shows KRI navigation for risks:read without department read access', () => {
    const hrefs = visibleSidebarHrefs(
      { role: 'risk_manager', access_scope: 'global' },
      ['risks:read'],
    );

    expect(hrefs).toContain('/approvals');
    expect(hrefs).toContain('/risks');
    expect(hrefs).toContain('/kris');
    expect(hrefs).not.toContain('/controls');
    expect(hrefs).not.toContain('/departments');
  });

  it('shows Issues navigation from strict MeCapabilities issues:read', () => {
    const hasPermission = createPermissionChecker([]);
    const authz = buildAuthz(
      { role: 'risk_manager', access_scope: 'global' },
      hasPermission,
      meCapabilities({
        resource_permissions: { 'issues:read': true },
      }),
      true,
    );

    const hrefs = getSidebarNavRoutes({ authz, hasPermission }).map((route) => route.nav.href);

    expect(hrefs).toContain('/issues');
  });
});
