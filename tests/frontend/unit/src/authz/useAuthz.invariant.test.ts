import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildAuthz } from '@/authz/policy';
import type { MeCapabilities } from '@/services/authApi';

const REPO_ROOT = resolve(__dirname, '../../../../..');

function readRepoSource(path: string): string {
    return readFileSync(resolve(REPO_ROOT, path), 'utf-8');
}

describe('useAuthz invariants', () => {
    it('does not fall back from MeCapabilities to local permission checks in buildAuthz', () => {
        const policySource = readRepoSource('frontend/src/authz/policy.ts');
        const buildAuthzBody = policySource.slice(policySource.indexOf('export function buildAuthz'));

        expect(buildAuthzBody).not.toContain('?? hasPermission(');
        expect(buildAuthzBody).not.toContain('?? hasPermission');
        expect(buildAuthzBody).not.toMatch(/meCapabilities\?\.[A-Za-z0-9_]+ \?\?/);
    });

    it('uses authz.can for business route resource gates', () => {
        const businessRoutesSource = readRepoSource('frontend/src/routing/business.tsx');

        expect(businessRoutesSource).not.toContain('hasPermission(');
        expect(businessRoutesSource).toContain("authz.can('read', 'issues')");
    });

    it('strict mode reads route-level resource permissions from MeCapabilities', () => {
        const policySource = readRepoSource('frontend/src/authz/policy.ts');
        const buildAuthzBody = policySource.slice(policySource.indexOf('export function buildAuthz'));

        expect(buildAuthzBody).toContain('meCapabilities.resource_permissions[key] === true');
    });

    it('strict mode covers every business route read resource permission', () => {
        const businessRoutesSource = readRepoSource('frontend/src/routing/business.tsx');
        const routeResources = new Set(
            [...businessRoutesSource.matchAll(/authz\.can\('read', '([^']+)'\)/g)].map(
                ([, resource]) => resource,
            ),
        );

        expect(routeResources).toEqual(
            new Set(['controls', 'risks', 'issues', 'vendors', 'departments']),
        );

        const resource_permissions = Object.fromEntries(
            [...routeResources].map((resource) => [`${resource}:read`, true]),
        );
        const meCapabilities: MeCapabilities = {
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
            can_read_risks: true,
            can_read_controls: true,
            can_read_vendors: true,
            can_read_departments: true,
            resource_permissions,
        };

        const authz = buildAuthz(
            { role: 'risk_manager', access_scope: 'global', me_capabilities: meCapabilities },
            () => false,
            meCapabilities,
            true,
        );

        for (const resource of routeResources) {
            expect(authz.can('read', resource)).toBe(true);
        }
    });
});
