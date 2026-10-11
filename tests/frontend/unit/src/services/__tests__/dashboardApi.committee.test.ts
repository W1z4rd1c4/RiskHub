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

it('exposes only the five Dashboard fetchers with production consumers', () => {
    expect(Object.keys(dashboardApi).sort()).toEqual([
        'fetchAvailablePeriods',
        'fetchCommitteeSummary',
        'fetchOverview',
        'fetchQuarterlyComparison',
        'fetchRisksByCell',
    ]);
});

it('retains transport, schema validation and abort options on all live fetchers', async () => {
    const { apiClient } = await import('@/services/apiClient');
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({});
    const filters = { departmentId: 17, riskLevel: 'high' as const, controlStatus: 'active' as const, controlForm: 'manual' as const };
    const params = { department_id: 17, risk_level: 'high', control_status: 'active', control_form: 'manual' };
    const signal = new AbortController().signal;
    await dashboardApi.fetchOverview(filters, { signal });
    await dashboardApi.fetchRisksByCell(3, 4, filters, 'gross');
    await dashboardApi.fetchQuarterlyComparison('2026-Q3', '2026-Q2');
    await dashboardApi.fetchAvailablePeriods();
    await dashboardApi.fetchCommitteeSummary();
    expect(get).toHaveBeenNthCalledWith(1, '/dashboard/overview', expect.objectContaining({ params, signal, schema: expect.objectContaining({ parse: expect.any(Function) }) }));
    expect(get).toHaveBeenNthCalledWith(2, '/dashboard/risks-by-cell', expect.objectContaining({ params: { ...params, probability: 3, impact: 4, risk_type: 'gross' }, schema: expect.objectContaining({ parse: expect.any(Function) }) }));
    expect(get).toHaveBeenNthCalledWith(3, '/dashboard/quarterly-comparison', expect.objectContaining({ params: { current_quarter: '2026-Q3', compare_quarter: '2026-Q2' }, schema: expect.objectContaining({ parse: expect.any(Function) }) }));
    expect(get).toHaveBeenNthCalledWith(4, '/dashboard/available-periods', expect.objectContaining({ schema: expect.objectContaining({ parse: expect.any(Function) }) }));
    expect(get).toHaveBeenNthCalledWith(5, '/dashboard/committee-summary', expect.objectContaining({ schema: expect.objectContaining({ parse: expect.any(Function) }) }));
    get.mockRestore();
});
