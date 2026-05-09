import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
    adminKeys,
    dashboardKeys,
    docsKeys,
    governanceKeys,
    riskHubKeys,
    usersKeys,
} from '@/lib/queryKeys';

const REPO_ROOT = path.resolve(__dirname, '../../../../../../../');
const SRC_ROOT = path.join(REPO_ROOT, 'frontend/src');
const FACTORY_DIR = path.join(SRC_ROOT, 'lib', 'queryKeys');

const factorySpecs = [
    {
        module: 'riskHubKeys.capabilities',
        key: riskHubKeys.capabilities(),
        expected: ['riskHubCapabilities'],
    },
    {
        module: 'riskHubKeys.globalConfig',
        key: riskHubKeys.globalConfig(),
        expected: ['globalConfig'],
    },
    {
        module: 'riskHubKeys.departments',
        key: riskHubKeys.departments(),
        expected: ['departments'],
    },
    {
        module: 'riskHubKeys.roles',
        key: riskHubKeys.roles(),
        expected: ['roles'],
    },
    {
        module: 'riskHubKeys.roles',
        key: riskHubKeys.roles(false),
        expected: ['roles', false],
    },
    {
        module: 'riskHubKeys.permissions',
        key: riskHubKeys.permissions(),
        expected: ['permissions'],
    },
    {
        module: 'riskHubKeys.riskTypes',
        key: riskHubKeys.riskTypes(),
        expected: ['riskTypes'],
    },
    {
        module: 'riskHubKeys.approvalScenarios',
        key: riskHubKeys.approvalScenarios(),
        expected: ['approvalScenarios'],
    },
    {
        module: 'riskHubKeys.publicRiskTypes',
        key: riskHubKeys.publicRiskTypes(),
        expected: ['riskHub', 'publicRiskTypes'],
    },
    {
        module: 'riskHubKeys.thresholdsPublic',
        key: riskHubKeys.thresholdsPublic(),
        expected: ['riskHub', 'thresholds', 'public'],
    },
    {
        module: 'riskHubKeys.totalAssetsValue',
        key: riskHubKeys.totalAssetsValue(),
        expected: ['riskHub', 'config', 'total_assets_value'],
    },
    {
        module: 'adminKeys.auditLogs',
        key: adminKeys.auditLogs(100, 'login'),
        expected: ['adminAuditLogs', 100, 'login'],
    },
    {
        module: 'adminKeys.auditLogUsers',
        key: adminKeys.auditLogUsers([1, 2]),
        expected: ['adminAuditLogUsers', [1, 2]],
    },
    {
        module: 'adminKeys.capabilities',
        key: adminKeys.capabilities(),
        expected: ['adminCapabilities'],
    },
    {
        module: 'adminKeys.logConfig',
        key: adminKeys.logConfig(),
        expected: ['logConfig'],
    },
    {
        module: 'adminKeys.health',
        key: adminKeys.health(),
        expected: ['adminHealth'],
    },
    {
        module: 'adminKeys.schedulerStatus',
        key: adminKeys.schedulerStatus(),
        expected: ['adminSchedulerStatus'],
    },
    {
        module: 'adminKeys.outboxStatus',
        key: adminKeys.outboxStatus(),
        expected: ['adminOutboxStatus'],
    },
    {
        module: 'adminKeys.stats',
        key: adminKeys.stats(),
        expected: ['adminStats'],
    },
    {
        module: 'adminKeys.sessions',
        key: adminKeys.sessions(),
        expected: ['adminSessions'],
    },
    {
        module: 'adminKeys.logs',
        key: adminKeys.logs('error'),
        expected: ['adminLogs', 'error'],
    },
    {
        module: 'usersKeys.accessDepartmentManagers',
        key: usersKeys.accessDepartmentManagers(7),
        expected: ['users', 'access', 'department-managers', 7],
    },
    {
        module: 'governanceKeys.overview',
        key: governanceKeys.overview(),
        expected: ['governanceOverview'],
    },
    {
        module: 'dashboardKeys.shellSummary',
        key: dashboardKeys.shellSummary(1, 2, 'department'),
        expected: ['shellSummary', 1, 2, 'department'],
    },
    {
        module: 'dashboardKeys.overview',
        key: dashboardKeys.overview({
            departmentId: 3,
            riskLevel: 'high',
            controlStatus: 'active',
            controlForm: 'attestation',
        }),
        expected: ['dashboardOverview', 3, 'high', 'active', 'attestation'],
    },
    {
        module: 'docsKeys.settingsDocs',
        key: docsKeys.settingsDocs('en'),
        expected: ['settingsDocs', 'en'],
    },
    {
        module: 'docsKeys.adminDocs',
        key: docsKeys.adminDocs('en'),
        expected: ['adminDocs', 'en'],
    },
] as const;

function frontendSourceWithoutFactories(): string {
    const parts: string[] = [];
    const stack = [SRC_ROOT];
    while (stack.length > 0) {
        const dir = stack.pop();
        if (!dir) continue;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (full.startsWith(FACTORY_DIR)) continue;
            if (entry.isDirectory()) {
                stack.push(full);
                continue;
            }
            if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.[tj]sx?$/.test(entry.name)) {
                parts.push(fs.readFileSync(full, 'utf8'));
            }
        }
    }
    return parts.join('\n');
}

describe('query-key factories (#46)', () => {
    it.each(factorySpecs)('$module preserves the legacy query-key array shape', ({ key, expected }) => {
        expect([...key]).toEqual(expected);
    });

    it.each(factorySpecs)('$module has at least one frontend caller', ({ module }) => {
        const source = frontendSourceWithoutFactories();
        expect(source).toContain(module);
    });
});
