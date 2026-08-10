import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { useIssuesPageState } from '@/pages/issues/useIssuesPageState';

const mocks = vi.hoisted(() => ({
    downloadExport: vi.fn(),
    list: vi.fn(),
}));

vi.mock('@/services/issuesApi', () => ({
    issuesApi: {
        downloadExport: (...args: unknown[]) => mocks.downloadExport(...args),
        list: (...args: unknown[]) => mocks.list(...args),
    },
}));

vi.mock('@/services/reportApi', () => ({ reportApi: { exportIssues: vi.fn() } }));

function Harness() {
    const state = useIssuesPageState('en');
    const location = useLocation();
    return <>
        <button type="button" onClick={() => state.updateFilter('status', '')}>remove-status</button>
        <button type="button" onClick={() => void state.exportCurrentIssues()}>export-current</button>
        <output data-testid="location">{location.search}</output>
    </>;
}

describe('useIssuesPageState normalized Issue filters', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.list.mockResolvedValue({
            items: [], total: 0, offset: 0, limit: 20,
            facets: { status: [{ value: 'closed', label: 'closed', count: 0, selected: false, disabled: true }] },
        });
        mocks.downloadExport.mockResolvedValue(undefined);
    });

    it('keeps a selected zero-count Closed deep link normalized and removable', async () => {
        const user = userEvent.setup();
        const query = new URLSearchParams({
            page: '4',
            filters: JSON.stringify({ status: 'closed', include_closed: true }),
        });
        render(<MemoryRouter initialEntries={[`/issues?${query.toString()}`]}><Harness /></MemoryRouter>);

        await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({
            status: 'closed', include_closed: true,
        })));
        await user.click(screen.getByRole('button', { name: 'remove-status' }));
        await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({
            include_closed: true,
        })));
        expect(mocks.list.mock.calls.at(-1)?.[0]).not.toHaveProperty('status');
        const params = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
        expect(params.has('page')).toBe(false);
        expect(JSON.parse(params.get('filters') ?? '{}')).toEqual({ include_closed: true });
    });

    it('parses normalized severity_group state and mirrors it in current-view export', async () => {
        const user = userEvent.setup();
        const query = new URLSearchParams({ filters: JSON.stringify({ severity_group: 'high_critical' }) });
        render(<MemoryRouter initialEntries={[`/issues?${query.toString()}`]}><Harness /></MemoryRouter>);

        await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({
            severity_group: 'high_critical', include_closed: false,
        })));
        expect(mocks.list.mock.calls.at(-1)?.[0]).not.toHaveProperty('severity');

        await user.click(screen.getByRole('button', { name: 'export-current' }));
        await waitFor(() => expect(mocks.downloadExport).toHaveBeenCalledWith(expect.objectContaining({
            offset: 0, severity_group: 'high_critical', include_closed: false,
        }), 'en'));
        expect(mocks.downloadExport.mock.calls.at(-1)?.[0]).not.toHaveProperty('severity');
    });
});
