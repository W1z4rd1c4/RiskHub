import { describe, expect, it } from 'vitest';

import { buildRiskKriHistoryItems } from '@/pages/detail/riskDetailHistory';

describe('buildRiskKriHistoryItems', () => {
    it('flattens and sorts KRI history entries for the risk timeline', () => {
        const items = buildRiskKriHistoryItems([
            {
                kri: { id: 7, metric_name: 'Patch SLA' },
                items: [
                    {
                        id: 2,
                        kri_id: 7,
                        period_start: '2026-02-01',
                        period_end: '2026-02-28',
                        recorded_at: '2026-03-02T10:00:00Z',
                        value: 71,
                        lower_limit: 80,
                        upper_limit: 100,
                        unit: '%',
                        breach_status: 'below',
                        recorded_by_id: null,
                        recorded_by_name: null,
                    },
                    {
                        id: 3,
                        kri_id: 7,
                        period_start: '2026-03-01',
                        period_end: '2026-03-31',
                        recorded_at: '2026-04-02T10:00:00Z',
                        value: 91,
                        lower_limit: 80,
                        upper_limit: 100,
                        unit: '%',
                        breach_status: 'within',
                        recorded_by_id: 12,
                        recorded_by_name: 'Alex Reviewer',
                    },
                ],
            },
        ], {
            language: 'en',
            recordedByLabel: 'Recorded by',
            systemLabel: 'System',
        });

        expect(items.map((item) => item.id)).toEqual(['7-3', '7-2']);
        expect(items[0]).toMatchObject({
            badge: 'OK',
            status: 'success',
            title: 'Patch SLA: 91 %',
        });
        expect(items[0].meta).toContainEqual({ label: 'Recorded by', value: 'Alex Reviewer' });
        expect(items[1]).toMatchObject({
            badge: 'BREACH',
            status: 'danger',
        });
        expect(items[1].meta).toContainEqual({ label: 'Recorded by', value: 'System' });
    });
});
