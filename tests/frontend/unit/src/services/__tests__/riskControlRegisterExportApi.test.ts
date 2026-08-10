import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getBlobMock = vi.fn();

vi.mock('@/services/apiClient', () => ({
    apiClient: {
        getBlob: (...args: unknown[]) => getBlobMock(...args),
    },
}));

import { controlApi } from '@/services/controlApi';
import { riskApi } from '@/services/riskApi';

function requestedUrl(): URL {
    const [path] = getBlobMock.mock.calls.at(-1) ?? [];
    return new URL(String(path), 'http://riskhub.test');
}

describe('Risk and Control current-view export API', () => {
    beforeEach(() => {
        getBlobMock.mockReset();
        getBlobMock.mockResolvedValue({ blob: new Blob(['name\n']), headers: new Headers() });
        vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:register-export');
        vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => undefined);
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    });

    afterEach(() => vi.restoreAllMocks());

    it('exports the complete Risk view contract without pagination', async () => {
        await riskApi.downloadExport({
            offset: 100,
            limit: 50,
            department_id: 7,
            status: 'emerging',
            risk_type: 'operational',
            is_priority: true,
            has_breach: false,
            min_net_score: 15,
            process: 'Payments',
            category: 'Technology',
            lifecycle: 'all',
            ict_linked: true,
            above_tolerance: true,
            response: 'acceptance',
            gross_probability: 4,
            gross_impact: 5,
            gross_band: 'critical',
            net_band: 'high',
            search: 'resilience',
            sort: { field: 'net_score', direction: 'desc' },
            group_by: 'department',
            group_value: 'Operations',
        }, 'cs');

        const url = requestedUrl();
        expect(url.pathname).toBe('/risks/export');
        expect(url.searchParams.has('offset')).toBe(false);
        expect(url.searchParams.has('limit')).toBe(false);
        expect(url.searchParams.get('locale')).toBe('cs');
        expect(JSON.parse(url.searchParams.get('filters') ?? '{}')).toEqual({
            department_id: 7,
            status: 'emerging',
            risk_type: 'operational',
            is_priority: true,
            search: 'resilience',
            has_breach: false,
            min_net_score: 15,
            process: 'Payments',
            category: 'Technology',
            lifecycle: 'all',
            ict_linked: true,
            above_tolerance: true,
            response: 'acceptance',
            gross_probability: 4,
            gross_impact: 5,
            gross_band: 'critical',
            net_band: 'high',
        });
        expect(JSON.parse(url.searchParams.get('sort') ?? '{}')).toEqual({ field: 'net_score', direction: 'desc' });
        expect(url.searchParams.get('group_by')).toBe('department');
        expect(url.searchParams.get('group_value')).toBe('Operations');
    });

    it('exports the complete Control view contract without pagination', async () => {
        await controlApi.downloadExport({
            offset: 50,
            limit: 50,
            department_id: 9,
            status: 'active',
            process: 'Claims',
            category: 'manual',
            lifecycle: 'all',
            monitoring_status: 'failed',
            search: 'evidence',
            sort: { field: 'name', direction: 'asc' },
            group_by: 'risk',
            group_value: 'risk:42',
        }, 'en');

        const url = requestedUrl();
        expect(url.pathname).toBe('/controls/export');
        expect(url.searchParams.has('offset')).toBe(false);
        expect(url.searchParams.has('limit')).toBe(false);
        expect(url.searchParams.get('locale')).toBe('en');
        expect(JSON.parse(url.searchParams.get('filters') ?? '{}')).toEqual({
            department_id: 9,
            status: 'active',
            search: 'evidence',
            process: 'Claims',
            category: 'manual',
            lifecycle: 'all',
            monitoring_status: 'failed',
        });
        expect(JSON.parse(url.searchParams.get('sort') ?? '{}')).toEqual({ field: 'name', direction: 'asc' });
        expect(url.searchParams.get('group_by')).toBe('risk');
        expect(url.searchParams.get('group_value')).toBe('risk:42');
    });

    it.each(['all', 'archived'] as const)(
        'keeps Risk lifecycle=%s and domain status in the unpaged current-view export',
        async (lifecycle) => {
            await riskApi.downloadExport({
                offset: 50,
                limit: 25,
                lifecycle,
                status: 'emerging',
            }, 'en');

            const url = requestedUrl();
            expect(url.searchParams.has('offset')).toBe(false);
            expect(url.searchParams.has('limit')).toBe(false);
            expect(JSON.parse(url.searchParams.get('filters') ?? '{}')).toMatchObject({
                lifecycle,
                status: 'emerging',
            });
        },
    );

    it.each(['all', 'archived'] as const)(
        'keeps Control lifecycle=%s, domain status, and monitoring status in the unpaged current-view export',
        async (lifecycle) => {
            await controlApi.downloadExport({
                offset: 50,
                limit: 25,
                lifecycle,
                status: 'inactive',
                monitoring_status: 'failed',
            }, 'cs');

            const url = requestedUrl();
            expect(url.searchParams.has('offset')).toBe(false);
            expect(url.searchParams.has('limit')).toBe(false);
            expect(JSON.parse(url.searchParams.get('filters') ?? '{}')).toMatchObject({
                lifecycle,
                status: 'inactive',
                monitoring_status: 'failed',
            });
        },
    );
});
