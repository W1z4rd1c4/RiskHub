import { describe, expect, it } from 'vitest';

import { mapLinkedRiskToSummary, mapRiskToSummary } from '@/components/kri-form/kriForm.utils';
import type { Risk } from '@/types/risk';
import type { LinkedRisk } from '@/types/vendorLink';

describe('KRI form risk summary archive state', () => {
    it('carries archive state from vendor-linked risks into risk summaries', () => {
        const linkedRisk: LinkedRisk = {
            id: 12,
            risk_id_code: 'R-KRI-LINKED',
            name: 'Linked archived risk',
            process: 'Vendor risk',
            is_priority: false,
            is_archived: true,
            status: 'active',
        };

        expect(mapLinkedRiskToSummary(linkedRisk).is_archived).toBe(true);
    });

    it('carries archive state from selected risk details into risk summaries', () => {
        const risk = {
            id: 13,
            risk_id_code: 'R-KRI-DETAIL',
            name: 'Selected archived risk',
            process: 'Risk detail',
            risk_type: 'operational',
            category: 'Operations',
            description: 'Risk detail fixture',
            gross_score: 9,
            gross_probability: 3,
            gross_impact: 3,
            net_score: 4,
            net_probability: 2,
            net_impact: 2,
            status: 'active',
            is_archived: true,
            is_priority: false,
            created_at: '2026-05-07T12:00:00+00:00',
            updated_at: '2026-05-07T12:00:00+00:00',
        } satisfies Risk;

        expect(mapRiskToSummary(risk).is_archived).toBe(true);
    });
});
