import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getBlobMock = vi.fn();

vi.mock('@/services/apiClient', () => ({
    apiClient: {
        getBlob: (...args: unknown[]) => getBlobMock(...args),
    },
}));

import { issuesApi } from '@/services/issuesApi';
import { kriApi } from '@/services/kriApi';

function requestedUrl(): URL {
    const [path] = getBlobMock.mock.calls.at(-1) ?? [];
    return new URL(String(path), 'http://riskhub.test');
}

describe('KRI and Issue current-view export API', () => {
    beforeEach(() => {
        getBlobMock.mockReset();
        getBlobMock.mockResolvedValue({ blob: new Blob(['name\n']), headers: new Headers() });
        vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:register-export');
        vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => undefined);
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    });

    afterEach(() => vi.restoreAllMocks());

    it('exports the complete unpaged KRI view with locale and grouping', async () => {
        await kriApi.downloadExport({
            offset: 100, limit: 20, lifecycle: 'archived', is_archived: true,
            monitoring_status: 'warning', frequency: 'monthly', department_id: 7,
            reporting_owner_id: 9, search: 'threshold',
            sort: { field: 'metric_name', direction: 'desc' },
            group_by: 'risk', group_value: 'risk:42',
        }, 'cs');

        const url = requestedUrl();
        expect(url.pathname).toBe('/kris/export');
        expect(url.searchParams.has('offset')).toBe(false);
        expect(url.searchParams.has('limit')).toBe(false);
        expect(url.searchParams.get('locale')).toBe('cs');
        expect(JSON.parse(url.searchParams.get('filters') ?? '{}')).toMatchObject({
            lifecycle: 'archived', is_archived: true, monitoring_status: 'warning',
            frequency: 'monthly', department_id: 7, reporting_owner_id: 9, search: 'threshold',
        });
        expect(JSON.parse(url.searchParams.get('sort') ?? '{}')).toEqual({ field: 'metric_name', direction: 'desc' });
        expect(url.searchParams.get('group_by')).toBe('risk');
        expect(url.searchParams.get('group_value')).toBe('risk:42');
    });

    it('exports the complete unpaged Issue view without losing closure or exception semantics', async () => {
        await issuesApi.downloadExport({
            offset: 40, limit: 20, status: 'in_progress', severity_group: 'high_critical',
            overdue: true, exclude_active_exceptions: true, include_closed: true,
            department_id: 7, owner_user_id: 9, search: 'remediation',
            sort: { field: 'due_at', direction: 'asc' },
            group_by: 'owner', group_value: 'owner:9',
        }, 'en');

        const url = requestedUrl();
        expect(url.pathname).toBe('/issues/export');
        expect(url.searchParams.has('offset')).toBe(false);
        expect(url.searchParams.has('limit')).toBe(false);
        expect(url.searchParams.get('locale')).toBe('en');
        expect(JSON.parse(url.searchParams.get('filters') ?? '{}')).toMatchObject({
            status: 'in_progress', severity_group: 'high_critical', overdue: true,
            exclude_active_exceptions: true, include_closed: true,
            department_id: 7, owner_user_id: 9, search: 'remediation',
        });
        expect(JSON.parse(url.searchParams.get('sort') ?? '{}')).toEqual({ field: 'due_at', direction: 'asc' });
        expect(url.searchParams.get('group_by')).toBe('owner');
        expect(url.searchParams.get('group_value')).toBe('owner:9');
    });
});
