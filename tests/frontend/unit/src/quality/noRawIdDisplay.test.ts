import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

const guardedFiles = [
    'frontend/src/pages/vendors/VendorsTableSection.tsx',
    'frontend/src/pages/vendors/useVendorDetailState.ts',
    'frontend/src/pages/ControlDetailPage.tsx',
    'frontend/src/components/access/AccessEditModal.tsx',
    'frontend/src/components/riskhub/RolesPanel.tsx',
    'frontend/src/components/riskhub/DepartmentsPanel.tsx',
    'frontend/src/components/riskhub/RiskQuestionnairesPanel.tsx',
    'frontend/src/components/governance/OrphanedItemsTable.tsx',
    'frontend/src/components/governance/ResolveOrphanModal.tsx',
] as const;

const rawIdFallbackPatterns = [
    /String\([^)]*(?:owner_id|department_id|user_id|role_id|resource_id|outsourcing_owner_user_id)[^)]*\)/,
    /\?\?\s*(?:owner_id|department_id|user_id|role_id|resource_id|outsourcing_owner_user_id)\b/,
    /(?:owner_id|department_id|user_id|role_id|resource_id|outsourcing_owner_user_id)\.toString\(\)/,
];

describe('frontend raw ID display guardrails', () => {
    it.each(guardedFiles)('%s does not use technical IDs as visible fallbacks', (filePath) => {
        const source = readFileSync(resolve(repoRoot, filePath), 'utf8');

        for (const pattern of rawIdFallbackPatterns) {
            expect(source).not.toMatch(pattern);
        }
    });
});
