import { describe, expect, it } from 'vitest';

import { groupLinkedControls } from '@/components/risks/detail-overview/riskOverviewHelpers';
import type { RiskControlLink } from '@/types/risk';

function link(id: number, status?: string): RiskControlLink {
    return {
        id,
        control_id: id,
        risk_id: 99,
        effectiveness: 'medium',
        created_at: '2026-01-01T00:00:00Z',
        control: {
            id,
            name: `Control ${id}`,
            frequency: 'monthly',
            risk_level: 3,
            status: status ?? 'active',
        },
    };
}

describe('risk overview helpers', () => {
    it('groups linked controls into active, draft, and archived buckets', () => {
        const grouped = groupLinkedControls([
            link(1, 'active'),
            link(2, 'draft'),
            link(3, 'archived'),
            link(4, 'inactive'),
        ]);

        expect(grouped.activeControls.map((item) => item.id)).toEqual([1, 4]);
        expect(grouped.draftControls.map((item) => item.id)).toEqual([2]);
        expect(grouped.archivedControls.map((item) => item.id)).toEqual([3]);
    });
});
