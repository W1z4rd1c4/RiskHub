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
    // ICT Register link sections + their presentation modules: row names come
    // from server-embedded display fields, unresolved ends render the i18n'd
    // "Unknown <entity>" label — never a `#<id>` fallback.
    'frontend/src/components/risks/detail-overview/RiskRegisterLinksSection.tsx',
    'frontend/src/components/risks/detail-overview/riskRegisterLinksPresentation.ts',
    'frontend/src/pages/assets/AssetLinkSections.tsx',
    'frontend/src/pages/assets/assetVendorLinksPresentation.ts',
    'frontend/src/pages/processes/ProcessVendorLinksSection.tsx',
    'frontend/src/pages/processes/processVendorLinksPresentation.ts',
    'frontend/src/pages/threats/ThreatRiskLinksSection.tsx',
    'frontend/src/pages/threats/threatRiskLinksPresentation.ts',
    'frontend/src/pages/vendors/VendorRegisterLinksSection.tsx',
    'frontend/src/pages/vendors/vendorRegisterLinksPresentation.ts',
] as const;

const rawIdFallbackPatterns = [
    /String\([^)]*(?:owner_id|department_id|user_id|role_id|resource_id|outsourcing_owner_user_id)[^)]*\)/,
    /\?\?\s*(?:owner_id|department_id|user_id|role_id|resource_id|outsourcing_owner_user_id)\b/,
    /(?:owner_id|department_id|user_id|role_id|resource_id|outsourcing_owner_user_id)\.toString\(\)/,
    // `#${...id...}` template fallbacks (e.g. `#${row.targetId}`, `#${link.vendor_id}`).
    /#\$\{[^}]*[iI]d[^}]*\}/,
];

describe('frontend raw ID display guardrails', () => {
    it.each(guardedFiles)('%s does not use technical IDs as visible fallbacks', (filePath) => {
        const source = readFileSync(resolve(repoRoot, filePath), 'utf8');

        for (const pattern of rawIdFallbackPatterns) {
            expect(source).not.toMatch(pattern);
        }
    });
});
