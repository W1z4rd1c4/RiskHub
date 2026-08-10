import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildRiskColumns } from '@/pages/risks/riskColumns';
import {
    formatRiskGroupLabel,
    getRiskDisplayStatus,
    normalizeRiskSummary,
} from '@/pages/risks/risksPagePresentation';
import type { RiskSummary } from '@/types/risk';

describe('Risks page presentation helpers', () => {
    it('normalizes missing collection counts', () => {
        expect(
            normalizeRiskSummary({
                id: 1,
                risk_id_code: 'R-001',
                name: 'Priority risk',
                process: 'Operations',
                risk_type: 'operational',
                category: 'Process',
                description: 'Desc',
                gross_score: 9,
                gross_probability: 3,
                gross_impact: 3,
                net_score: 4,
                status: 'active',
                is_priority: false,
            })
        ).toMatchObject({
            kri_count: 0,
            has_breach: false,
            control_count: 0,
            linked_vendors: [],
        });
    });

    it('maps server group fallback labels', () => {
        expect(
            formatRiskGroupLabel(
                { value: '__unlinked_vendor__', label: '__unlinked_vendor__', count: 1 },
                {
                    unlinkedVendor: 'Unlinked Vendor',
                    uncategorized: 'Uncategorized',
                    unknownDepartment: 'Unknown Department',
                    noProcess: 'No Process',
                    unknownRiskType: 'Unknown type',
                },
            )
        ).toBe('Unlinked Vendor');
    });

    it('derives archived display status from the archive flag', () => {
        expect(getRiskDisplayStatus({ status: 'active', is_archived: true })).toBe('archived');
        expect(getRiskDisplayStatus({ status: 'emerging', is_archived: false })).toBe('emerging');
    });

    it('renders archived-normalized risks as archived in the table status column', () => {
        const statusColumn = buildRiskColumns({
            t: (key) => key,
            pendingApprovalIds: new Set(),
            getColor: () => 'bg-slate-500',
            getDisplayName: (riskType) => riskType,
            getInitials: () => 'OP',
            getScoreColor: () => 'text-slate-300 border-slate-300/20',
            handleRestoreRisk: () => undefined,
        }).find((column) => column.key === 'status');

        const archivedRisk = {
            id: 9,
            risk_id_code: 'R-ARCH-009',
            name: 'Archived normalized risk',
            process: 'Operations',
            risk_type: 'operational',
            category: 'Operational',
            description: 'Archived risk normalized to active lifecycle status',
            gross_score: 9,
            gross_probability: 3,
            gross_impact: 3,
            net_score: 6,
            status: 'active',
            is_archived: true,
            is_priority: false,
        } satisfies RiskSummary;

        render(statusColumn?.render?.(archivedRisk) as ReactElement);

        expect(screen.getByText('archived')).toBeInTheDocument();
    });
});
