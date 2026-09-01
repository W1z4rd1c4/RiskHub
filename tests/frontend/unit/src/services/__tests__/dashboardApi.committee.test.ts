import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dashboardApi } from '@/services/dashboardApi';

describe('dashboardApi committee summary responses', () => {
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
});
