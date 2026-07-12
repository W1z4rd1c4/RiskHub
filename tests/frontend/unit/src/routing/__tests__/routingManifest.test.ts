import { describe, expect, it } from 'vitest';

import {
  AdminConsoleRouteGuard,
  AuditTrailRouteGuard,
} from '@/authz/BusinessRouteGuards';
import { buildAuthz, type AuthUser, type PermissionChecker } from '@/authz/policy';
import { adminRoutes } from '@/routing/admin';
import { businessRoutes } from '@/routing/business';
import {
  SIDEBAR_GROUP_ORDER,
  getGroupedSidebarNav,
  getSidebarNavRoutes,
  protectedAppRoutes,
  resolveActiveSidebarHref,
} from '@/routing';
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

function groupedSidebarNav(user: AuthUser, permissions: string[]) {
  const hasPermission = createPermissionChecker(permissions);
  const authz = buildAuthz(user, hasPermission);
  return getGroupedSidebarNav({ authz, hasPermission }).map((section) => ({
    group: section.group,
    hrefs: section.items.map((route) => route.nav.href),
  }));
}

// A CRO holding every register + ICT read: exercises all four sections fully
// populated, so grouping and intra-group ordering are asserted in one shot.
const FULL_ACCESS_CRO_PERMISSIONS = [
  'users:read',
  'users:write',
  'activity_log:read',
  'controls:read',
  'risks:read',
  'issues:read',
  'vendors:read',
  'departments:read',
  'processes:read',
  'assets:read',
  'threats:read',
  'ict_committee:read',
];

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
        'ict_committee:read',
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
      '/ict-register/data-quality',
      '/ict-register/committee',
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
      [
        'activity_log:read',
        'controls:read',
        'risks:read',
        'issues:read',
        'vendors:read',
        'departments:read',
        'ict_committee:read',
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
      '/ict-register/data-quality',
      '/ict-register/committee',
      '/departments',
      '/activity-log',
      '/settings',
      '/users',
    ]);
  });

  it('hides the ICT Risk Committee entry without ict_committee:read (employee manifest)', () => {
    // The #51 grant set: executive/oversight roles only — an employee holds
    // the register reads but NOT the committee resource.
    const hrefs = visibleSidebarHrefs(
      { role: 'employee', access_scope: 'department' },
      ['controls:read', 'risks:read', 'vendors:read', 'processes:read', 'assets:read', 'threats:read'],
    );

    expect(hrefs).not.toContain('/ict-register/committee');
    expect(hrefs).toContain('/ict-register/data-quality');
  });

  it('shows the ICT Risk Committee entry from strict MeCapabilities ict_committee:read', () => {
    const hasPermission = createPermissionChecker([]);
    const authz = buildAuthz(
      { role: 'ceo', access_scope: 'global' },
      hasPermission,
      meCapabilities({
        resource_permissions: { 'ict_committee:read': true },
      }),
      true,
    );

    const hrefs = getSidebarNavRoutes({ authz, hasPermission }).map((route) => route.nav.href);

    expect(hrefs).toContain('/ict-register/committee');
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

describe('sidebar nav grouping (P4 section map)', () => {
  it('assigns every sidebar nav item to a stable group key (FR-P4-1/11)', () => {
    const navRoutes = protectedAppRoutes.filter((route) => route.nav);

    expect(navRoutes.length).toBeGreaterThan(0);
    for (const route of navRoutes) {
      if (!route.nav) continue;
      expect(SIDEBAR_GROUP_ORDER).toContain(route.nav.group);
    }
  });

  it('groups the sidebar into the four-section map in canonical order with intra-group order preserved (FR-P4-1/9/11)', () => {
    const grouped = groupedSidebarNav(
      { role: 'cro', access_scope: 'global' },
      FULL_ACCESS_CRO_PERMISSIONS,
    );

    expect(grouped).toEqual([
      { group: 'overview', hrefs: ['/', '/approvals', '/departments'] },
      { group: 'registers', hrefs: ['/controls', '/risks', '/issues', '/kris', '/vendors'] },
      {
        group: 'ict_register',
        hrefs: ['/processes', '/assets', '/threats', '/ict-register/data-quality', '/ict-register/committee'],
      },
      { group: 'administration', hrefs: ['/governance', '/activity-log', '/settings', '/users', '/risk-hub'] },
    ]);
  });

  it('retains the transitional ICT Committee entry under the ict_register group (#63 pending #64)', () => {
    const grouped = groupedSidebarNav(
      { role: 'cro', access_scope: 'global' },
      FULL_ACCESS_CRO_PERMISSIONS,
    );
    const ict = grouped.find((section) => section.group === 'ict_register');

    // #63 lands the grouped map but keeps the committee reachable; #64 removes it
    // with the route migration + redirect.
    expect(ict?.hrefs).toContain('/ict-register/committee');
  });

  it('omits an empty group while keeping populated siblings for a non-admin (FR-P4-10)', () => {
    // controls:read populates Registers; the user holds no ICT reads, so the
    // ICT Register group has zero visible items and is omitted entirely.
    const grouped = groupedSidebarNav(
      { role: 'employee', access_scope: 'department' },
      ['controls:read'],
    );
    const groups = grouped.map((section) => section.group);

    expect(groups).toContain('overview');
    expect(groups).toContain('registers');
    expect(groups).not.toContain('ict_register');
    expect(grouped.find((section) => section.group === 'registers')?.hrefs).toEqual(['/controls']);
  });

  it('renders only the administration group for a platform admin (FR-P4-10/12 admin view)', () => {
    const grouped = groupedSidebarNav(
      { role: 'admin', access_scope: 'global' },
      ['users:read', 'activity_log:read', 'issues:read', 'vendors:read'],
    );

    // Every overview/registers/ict_register item is gated on !isPlatformAdmin, so
    // those groups are empty and omitted; admin items keep adminOrder ordering.
    expect(grouped).toEqual([
      { group: 'administration', hrefs: ['/settings', '/users', '/admin', '/admin/docs'] },
    ]);
  });
});

describe('resolveActiveSidebarHref (FR-P4-2, finding S3)', () => {
  const hrefs = ['/', '/risks', '/admin', '/admin/docs', '/ict-register/data-quality'];

  it('matches the exact list route', () => {
    expect(resolveActiveSidebarHref('/risks', hrefs)).toBe('/risks');
  });

  it('highlights the list item on :id / edit / detail routes', () => {
    expect(resolveActiveSidebarHref('/risks/42', hrefs)).toBe('/risks');
    expect(resolveActiveSidebarHref('/risks/42/edit', hrefs)).toBe('/risks');
  });

  it('never lets the root href swallow nested routes', () => {
    expect(resolveActiveSidebarHref('/', hrefs)).toBe('/');
    expect(resolveActiveSidebarHref('/risks/42', hrefs)).toBe('/risks');
  });

  it('picks the longest match so nested siblings do not both highlight', () => {
    expect(resolveActiveSidebarHref('/admin', hrefs)).toBe('/admin');
    expect(resolveActiveSidebarHref('/admin/docs', hrefs)).toBe('/admin/docs');
  });

  it('returns null when no nav item matches', () => {
    expect(resolveActiveSidebarHref('/unmapped', hrefs)).toBeNull();
  });
});
