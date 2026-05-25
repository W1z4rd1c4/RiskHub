import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../../../');
const sourcePath = resolve(repoRoot, 'frontend/src/authz/BusinessRouteGuards.tsx');

describe('BusinessRouteGuards structure', () => {
    it('uses a single typed route guard factory', () => {
        const source = readFileSync(sourcePath, 'utf8');

        expect(source.match(/function createBusinessRouteGuard</g) ?? []).toHaveLength(1);
        expect(source.match(/function\s+\w+RouteGuard\s*\(/g) ?? []).toHaveLength(0);
    });

    it('exports the six named route guards from the factory', () => {
        const source = readFileSync(sourcePath, 'utf8');
        const factoryExports = source.match(/export const \w+RouteGuard\s*=\s*createBusinessRouteGuard\(/g) ?? [];

        expect(factoryExports).toHaveLength(6);
        expect(source).toContain("export const GovernanceRouteGuard = createBusinessRouteGuard('canViewGovernance')");
        expect(source).toContain("export const ActivityLogRouteGuard = createBusinessRouteGuard('canViewActivityLog')");
        expect(source).toContain("export const UsersRouteGuard = createBusinessRouteGuard('canViewUsersRoute')");
        expect(source).toContain("export const UserLifecycleRouteGuard = createBusinessRouteGuard('isPlatformAdmin')");
        expect(source).toContain("export const AdminConsoleRouteGuard = createBusinessRouteGuard('canViewAdminConsole')");
        expect(source).toContain("export const AuditTrailRouteGuard = createBusinessRouteGuard('canReadControls')");
    });
});
