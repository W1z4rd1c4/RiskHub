import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dashboardSummarySchema } from '@/services/api/schemas';
import { dashboardApi } from '@/services/dashboardApi';

describe('dashboardApi response contracts', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('defaults missing critical_vendors to an empty array', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
            const url = String(input);
            if (!url.endsWith('/api/v1/dashboard/committee-summary')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }

            return Promise.resolve(new Response(JSON.stringify({
                critical_risks: [],
                critical_risks_total: 0,
                recent_activity: [],
                department_exposure: [],
                critical_vendors_total: 0,
                can_view_vendors: true,
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));
        });

        await expect(dashboardApi.fetchCommitteeSummary()).resolves.toMatchObject({
            critical_risks: [],
            critical_risks_total: 0,
            recent_activity: [],
            department_exposure: [],
            critical_vendors: [],
            critical_vendors_total: 0,
            can_view_vendors: true,
        });
    });

    it('rejects Dashboard summaries without configured Risk thresholds', () => {
        const result = dashboardSummarySchema.safeParse({
            total_controls: 0,
            controls_by_status: {},
            controls_by_form: {},
            controls_by_frequency: {},
            total_risks: 0,
            risks_by_status: {},
            critical_risks_count: 0,
            average_net_risk_score: 0,
        });

        expect(result.success).toBe(false);
    });
});
