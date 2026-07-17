import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

const guardedFiles = [
    'frontend/src/pages/vendors/vendorColumns.tsx',
    'frontend/src/pages/vendors/useVendorDetailState.ts',
    'frontend/src/pages/ControlDetailPage.tsx',
    'frontend/src/components/access/AccessEditModal.tsx',
    'frontend/src/components/riskhub/RolesPanel.tsx',
    'frontend/src/components/riskhub/DepartmentsPanel.tsx',
    'frontend/src/components/riskhub/RiskQuestionnairesPanel.tsx',
    'frontend/src/components/governance/OrphanedItemsTable.tsx',
    'frontend/src/components/governance/ResolveOrphanModal.tsx',
    'frontend/src/components/approvals/GovernedMutationDiff.tsx',
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
    // Sub-outsourcing chain: contract labels come from the contract reference
    // (collection row or the entry's embedded derived block), predecessor
    // labels from the sub-provider name; unresolved ends render the i18n'd
    // "Unknown contract"/"Unknown sub-outsourcing provider" labels.
    'frontend/src/pages/vendors/VendorSubOutsourcingSection.tsx',
    'frontend/src/pages/vendors/vendorSubOutsourcingPresentation.tsx',
    // ICT Register data-quality + committee drill-down labels: server rows
    // carry the business label or a {{unknown_<entity>}} token localized on the
    // client (localizeRegisterRowLabel), never a `#<id>`/`SUB-<id>` fallback;
    // the committee Top-10 id likewise falls back to the Unknown-risk label.
    'frontend/src/pages/IctRegisterDqPage.tsx',
    'frontend/src/pages/ictRegisterDq/dqPresentation.ts',
    'frontend/src/pages/IctRegisterCommitteePage.tsx',
    // The committee body moved to a dashboard tab section (#64); the raw-ID
    // guardrail follows the code so the Top-10 fallback stays label-based.
    'frontend/src/components/dashboard/IctCommitteeSection.tsx',
    'frontend/src/pages/ictRegisterCommittee/committeePresentation.ts',
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

    it('governed diffs never stringify arbitrary snapshot values into the UI', () => {
        const source = readFileSync(
            resolve(repoRoot, 'frontend/src/components/approvals/GovernedMutationDiff.tsx'),
            'utf8',
        );

        expect(source).not.toMatch(/String\(value\)/);
        expect(source).not.toMatch(/JSON\.stringify\(value\)/);
    });
});
