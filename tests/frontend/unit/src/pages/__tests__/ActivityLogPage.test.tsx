import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    calculatePageWindow,
    formatDiffValue,
    getDiffPair,
} from '@/components/activity-log/activityLogPresentation';
import { ApiClientError } from '@/services/apiClient';

const mockList = vi.fn();
const mockGetActions = vi.fn();
const mockGetActors = vi.fn();
const mockGetUsers = vi.fn();
const mockGetDepartments = vi.fn();
const mockGetRisks = vi.fn();
const mockUseDebouncedValue = vi.fn((value: unknown) => value);
const mockUseAuthz = vi.fn(() => ({ canReadControls: true }));

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => mockUseAuthz(),
}));

vi.mock('@/hooks/useDebouncedValue', () => ({
    useDebouncedValue: <T,>(value: T) => mockUseDebouncedValue(value) as T,
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/services/activityLogApi', () => ({
    activityLogApi: {
        list: (...args: unknown[]) => mockList(...args),
        getActions: () => mockGetActions(),
        getActors: () => mockGetActors(),
    },
}));

vi.mock('@/services/lookupApi', () => ({
    lookupApi: {
        getUsers: () => mockGetUsers(),
        getDepartments: () => mockGetDepartments(),
    },
}));

vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisks: (...args: unknown[]) => mockGetRisks(...args),
    },
}));

import { ActivityLogPage } from '@/pages/ActivityLogPage';

function renderActivityLogPage() {
    return render(
        <MemoryRouter>
            <ActivityLogPage />
        </MemoryRouter>,
    );
}

const activityEntry = {
    id: 91,
    entity_type: 'risk',
    entity_id: 7,
    entity_name: 'Cyber risk',
    action: 'update',
    actor_id: 5,
    actor_name: 'Analyst',
    department_id: 3,
    changes: null,
    description: 'Risk evidence updated',
    created_at: '2026-04-20T08:00:00Z',
};

describe('Activity Log Helpers', () => {
    describe('formatDiffValue', () => {
        it('returns (empty) for null', () => {
            expect(formatDiffValue(null)).toBe('(empty)');
        });

        it('returns (empty) for undefined', () => {
            expect(formatDiffValue(undefined)).toBe('(empty)');
        });

        it('preserves falsy values like 0', () => {
            expect(formatDiffValue(0)).toBe('0');
        });

        it('preserves falsy values like false', () => {
            expect(formatDiffValue(false)).toBe('false');
        });

        it('preserves empty string', () => {
            expect(formatDiffValue('')).toBe('');
        });

        it('converts numbers to strings', () => {
            expect(formatDiffValue(42)).toBe('42');
        });

        it('JSON stringifies objects', () => {
            expect(formatDiffValue({ foo: 'bar' })).toBe('{"foo":"bar"}');
        });

        it('truncates long JSON values', () => {
            const longValue = { data: 'x'.repeat(100) };
            const result = formatDiffValue(longValue);
            expect(result.length).toBeLessThanOrEqual(80);
            expect(result).toContain('...');
        });

        it('JSON stringifies arrays', () => {
            expect(formatDiffValue([1, 2, 3])).toBe('[1,2,3]');
        });
    });

    describe('getDiffPair', () => {
        it('handles null delta', () => {
            const result = getDiffPair(null);
            expect(result.old).toBe('(empty)');
            expect(result.new).toBe('(empty)');
            expect(result.isLegacy).toBe(true);
        });

        it('handles primitive delta as new value only', () => {
            const result = getDiffPair(42);
            expect(result.old).toBe('(empty)');
            expect(result.new).toBe('42');
            expect(result.isLegacy).toBe(true);
        });

        it('handles standard {old, new} shape', () => {
            const result = getDiffPair({ old: 'draft', new: 'active' });
            expect(result.old).toBe('draft');
            expect(result.new).toBe('active');
            expect(result.isLegacy).toBe(false);
        });

        it('handles {old, new} with null values', () => {
            const result = getDiffPair({ old: null, new: 'created' });
            expect(result.old).toBe('(empty)');
            expect(result.new).toBe('created');
            expect(result.isLegacy).toBe(false);
        });

        it('handles {old, new} with false values', () => {
            const result = getDiffPair({ old: false, new: true });
            expect(result.old).toBe('false');
            expect(result.new).toBe('true');
        });

        it('handles {old, new} with 0 values', () => {
            const result = getDiffPair({ old: 0, new: 10 });
            expect(result.old).toBe('0');
            expect(result.new).toBe('10');
        });
    });

    describe('calculatePageWindow', () => {
        it('returns all pages for small total (5 pages)', () => {
            const result = calculatePageWindow(2, 5);
            expect(result).toEqual([0, 1, 2, 3, 4]);
        });

        it('returns bounded window for large total (200 pages) at start', () => {
            const result = calculatePageWindow(0, 200);
            expect(result).toEqual([0, 1, 'ellipsis', 199]);
        });

        it('returns bounded window for large total (200 pages) at middle', () => {
            const result = calculatePageWindow(100, 200);
            expect(result).toEqual([0, 'ellipsis', 99, 100, 101, 'ellipsis', 199]);
        });

        it('returns bounded window for large total (200 pages) at end', () => {
            const result = calculatePageWindow(199, 200);
            expect(result).toEqual([0, 'ellipsis', 198, 199]);
        });

        it('does not allocate more than needed for 10000 pages', () => {
            const result = calculatePageWindow(5000, 10000);
            expect(result.length).toBeLessThanOrEqual(10);
        });

        it('handles single page', () => {
            const result = calculatePageWindow(0, 1);
            expect(result).toEqual([0]);
        });

        it('handles two pages', () => {
            const result = calculatePageWindow(0, 2);
            expect(result).toEqual([0, 1]);
        });
    });

    describe('Date Range Semantics', () => {
        it('end-of-day timestamp format is correct', () => {
            const dateTo = '2026-01-04';
            const inclusive = `${dateTo}T23:59:59.999`;
            expect(inclusive).toBe('2026-01-04T23:59:59.999');
        });
    });

    describe('Label Fallbacks', () => {
        const ACTION_LABELS: Record<string, string> = {
            create: 'Created',
            update: 'Updated',
            delete: 'Deleted',
        };

        it('returns known label for known action', () => {
            expect(ACTION_LABELS['create'] ?? 'create').toBe('Created');
        });

        it('returns raw value for unknown action', () => {
            expect(ACTION_LABELS['custom_action'] ?? 'custom_action').toBe('custom_action');
        });
    });
});

describe('ActivityLogPage capability denial state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseAuthz.mockReturnValue({ canReadControls: true });
        mockGetActions.mockResolvedValue([]);
        mockGetActors.mockResolvedValue([]);
        mockGetUsers.mockResolvedValue([]);
        mockGetDepartments.mockResolvedValue([]);
        mockGetRisks.mockResolvedValue({ items: [], total: 0, offset: 0, limit: 100 });
        mockUseDebouncedValue.mockImplementation((value: unknown) => value);
    });

    it('links to Control Execution History only with control read authority', async () => {
        mockList.mockResolvedValue({
            items: [],
            total: 0,
            skip: 0,
            limit: 50,
            capabilities: null,
        });

        const rendered = renderActivityLogPage();

        expect(await screen.findByRole('link', { name: 'controls:audit_trail.title' })).toHaveAttribute(
            'href',
            '/audit-trail',
        );

        mockUseAuthz.mockReturnValue({ canReadControls: false });
        rendered.rerender(
            <MemoryRouter>
                <ActivityLogPage />
            </MemoryRouter>,
        );
        expect(screen.queryByRole('link', { name: 'controls:audit_trail.title' })).not.toBeInTheDocument();
    });

    it('shows retryable network state instead of access denied when list loading fails without 403', async () => {
        mockList.mockRejectedValue(new Error('temporary outage'));

        renderActivityLogPage();

        await screen.findByText('activity_log.failed_to_load');

        expect(screen.getByText('activity_log.failed_to_load_help')).toBeInTheDocument();
        expect(screen.queryByText('access.denied')).not.toBeInTheDocument();
    });

    it('keeps safe activity rows visible when a same-query refresh fails', async () => {
        mockList
            .mockResolvedValueOnce({
                items: [activityEntry],
                total: 1,
                skip: 0,
                limit: 50,
                capabilities: null,
            })
            .mockRejectedValueOnce(new Error('temporary outage'));

        renderActivityLogPage();

        await screen.findByText('Risk evidence updated');
        await userEvent.click(screen.getByRole('button', { name: 'tooltips.refresh_log' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('activity_log.may_be_out_of_date');
        expect(screen.getByText('Risk evidence updated')).toBeInTheDocument();
        expect(screen.queryByText('empty.no_activity_logs')).not.toBeInTheDocument();
    });

    it('does not reuse KRI rows when the Risk tab query fails', async () => {
        mockList
            .mockResolvedValueOnce({
                items: [activityEntry],
                total: 1,
                skip: 0,
                limit: 50,
                capabilities: null,
            })
            .mockRejectedValueOnce(new Error('risk activity unavailable'));

        renderActivityLogPage();

        await screen.findByText('Risk evidence updated');
        await userEvent.click(screen.getByTestId('activity-log-tab-risk'));

        await screen.findByText('activity_log.failed_to_load');
        expect(screen.queryByText('Risk evidence updated')).not.toBeInTheDocument();
        expect(screen.queryByText('activity_log.may_be_out_of_date')).not.toBeInTheDocument();
        expect(screen.queryByText('empty.no_activity_logs')).not.toBeInTheDocument();
    });

    it('does not reuse rows when a different search query fails', async () => {
        mockList
            .mockResolvedValueOnce({
                items: [activityEntry],
                total: 1,
                skip: 0,
                limit: 50,
                capabilities: {
                    can_read: true,
                    can_filter_by_department: false,
                    can_view_entity_filters: true,
                    can_export_csv: false,
                },
            })
            .mockRejectedValueOnce(new Error('filtered activity unavailable'));

        renderActivityLogPage();

        await screen.findByText('Risk evidence updated');
        fireEvent.change(screen.getByTestId('activity-log-search-input'), {
            target: { value: 'policy' },
        });

        await screen.findByText('activity_log.failed_to_load');
        expect(screen.queryByText('Risk evidence updated')).not.toBeInTheDocument();
        expect(screen.queryByText('activity_log.may_be_out_of_date')).not.toBeInTheDocument();
        expect(screen.queryByText('empty.no_activity_logs')).not.toBeInTheDocument();
    });

    it('disables Refresh until raw search settles, then refreshes only the debounced query', async () => {
        let settledSearch = '';
        mockUseDebouncedValue.mockImplementation((value: unknown) => (
            value === 'policy' ? settledSearch : value
        ));
        mockList.mockImplementation((filters: { search?: string }) => Promise.resolve({
            items: [{
                ...activityEntry,
                description: filters.search === 'policy' ? 'Filtered activity' : 'Prior activity',
            }],
            total: 1,
            skip: 0,
            limit: 50,
            capabilities: {
                can_read: true,
                can_filter_by_department: false,
                can_view_entity_filters: true,
                can_export_csv: false,
            },
        }));
        const rendered = renderActivityLogPage();

        await screen.findByText('Prior activity');
        const requestsBeforeSearch = mockList.mock.calls.length;
        fireEvent.change(screen.getByTestId('activity-log-search-input'), {
            target: { value: 'policy' },
        });

        const refresh = screen.getByRole('button', { name: 'tooltips.refresh_log' });
        expect(refresh).toBeDisabled();
        fireEvent.click(refresh);
        expect(mockList).toHaveBeenCalledTimes(requestsBeforeSearch);

        settledSearch = 'policy';
        rendered.rerender(
            <MemoryRouter>
                <ActivityLogPage />
            </MemoryRouter>,
        );

        await waitFor(() => expect(mockList).toHaveBeenCalledTimes(requestsBeforeSearch + 1));
        expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'policy' }));
        expect(screen.getByRole('button', { name: 'tooltips.refresh_log' })).toBeEnabled();

        fireEvent.click(screen.getByRole('button', { name: 'tooltips.refresh_log' }));
        await waitFor(() => expect(mockList).toHaveBeenCalledTimes(requestsBeforeSearch + 2));
        expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'policy' }));
    });

    it('scopes pending retries to the active normalized query generation', async () => {
        const user = userEvent.setup();
        let releaseKriRetry!: (value: {
            items: (typeof activityEntry)[];
            total: number;
            skip: number;
            limit: number;
            capabilities: null;
        }) => void;
        let releaseRiskRetry!: (value: {
            items: never[];
            total: number;
            skip: number;
            limit: number;
            capabilities: null;
        }) => void;
        const kriRetry = new Promise<{
            items: (typeof activityEntry)[];
            total: number;
            skip: number;
            limit: number;
            capabilities: null;
        }>((resolve) => {
            releaseKriRetry = resolve;
        });
        const riskRetry = new Promise<{
            items: never[];
            total: number;
            skip: number;
            limit: number;
            capabilities: null;
        }>((resolve) => {
            releaseRiskRetry = resolve;
        });
        mockList
            .mockRejectedValueOnce(new Error('KRI activity unavailable'))
            .mockImplementationOnce(() => kriRetry)
            .mockRejectedValueOnce(new Error('Risk activity unavailable'))
            .mockImplementationOnce(() => riskRetry);

        renderActivityLogPage();

        await screen.findByText('activity_log.failed_to_load');
        await user.click(screen.getByRole('button', { name: 'actions.retry' }));
        await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));

        await user.click(screen.getByTestId('activity-log-tab-risk'));
        await waitFor(() => expect(mockList).toHaveBeenCalledTimes(3));
        await screen.findByText('activity_log.failed_to_load');

        const riskRetryButton = screen.getByRole('button', { name: 'actions.retry' });
        riskRetryButton.focus();
        await user.click(riskRetryButton);
        await waitFor(() => expect(mockList).toHaveBeenCalledTimes(4));
        expect(riskRetryButton).toHaveFocus();
        expect(riskRetryButton).toHaveAttribute('aria-busy', 'true');

        await act(async () => {
            releaseKriRetry({
                items: [{ ...activityEntry, description: 'Late KRI activity' }],
                total: 1,
                skip: 0,
                limit: 50,
                capabilities: null,
            });
        });

        expect(riskRetryButton).toHaveAttribute('aria-busy', 'true');
        fireEvent.click(riskRetryButton);
        expect(mockList).toHaveBeenCalledTimes(4);
        expect(screen.queryByText('Late KRI activity')).not.toBeInTheDocument();

        await act(async () => {
            releaseRiskRetry({ items: [], total: 0, skip: 0, limit: 50, capabilities: null });
        });

        await screen.findByText('empty.no_activity_logs');
    });

    it('keeps the adjacent retry focused and single-flight until an empty success commits', async () => {
        const user = userEvent.setup();
        let releaseRetry!: (value: {
            items: never[];
            total: number;
            skip: number;
            limit: number;
            capabilities: null;
        }) => void;
        const retry = new Promise<{
            items: never[];
            total: number;
            skip: number;
            limit: number;
            capabilities: null;
        }>((resolve) => {
            releaseRetry = resolve;
        });
        mockList
            .mockRejectedValueOnce(new Error('temporary outage'))
            .mockImplementationOnce(() => retry);

        renderActivityLogPage();

        await screen.findByText('activity_log.failed_to_load');
        const retryButton = screen.getByRole('button', { name: 'actions.retry' });
        retryButton.focus();
        await user.click(retryButton);

        await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
        expect(retryButton).toHaveFocus();
        expect(retryButton).toHaveAttribute('aria-disabled', 'true');
        expect(retryButton).toHaveAttribute('aria-busy', 'true');
        fireEvent.click(retryButton);
        expect(mockList).toHaveBeenCalledTimes(2);

        await act(async () => {
            releaseRetry({ items: [], total: 0, skip: 0, limit: 50, capabilities: null });
        });

        await screen.findByText('empty.no_activity_logs');
        expect(screen.queryByText('activity_log.failed_to_load')).not.toBeInTheDocument();
    });

    it('clears protected activity rows when a same-query refresh is forbidden', async () => {
        mockList
            .mockResolvedValueOnce({
                items: [activityEntry],
                total: 1,
                skip: 0,
                limit: 50,
                capabilities: null,
            })
            .mockRejectedValueOnce(new ApiClientError({
                status: 403,
                messageKey: 'errorKeys.forbidden',
            }));

        renderActivityLogPage();

        await screen.findByText('Risk evidence updated');
        await userEvent.click(screen.getByRole('button', { name: 'tooltips.refresh_log' }));

        await screen.findByText('access.denied');
        expect(screen.queryByText('Risk evidence updated')).not.toBeInTheDocument();
        expect(screen.queryByText('empty.no_activity_logs')).not.toBeInTheDocument();
    });

    it('shows access denied when the backend explicitly denies read capability', async () => {
        mockList.mockResolvedValue({
            items: [],
            total: 0,
            skip: 0,
            limit: 50,
            capabilities: {
                can_read: false,
                can_filter_by_department: false,
                can_view_entity_filters: false,
                can_export_csv: false,
            },
        });

        renderActivityLogPage();

        await screen.findByText('access.denied');
        expect(screen.queryByText('empty.no_activity_logs')).not.toBeInTheDocument();
    });

    it('shows access denied when the backend returns forbidden', async () => {
        mockList.mockRejectedValue(
            new ApiClientError({
                status: 403,
                messageKey: 'errorKeys.forbidden',
            })
        );

        renderActivityLogPage();

        await screen.findByText('access.denied');
        expect(screen.queryByText('activity_log.failed_to_load')).not.toBeInTheDocument();
        expect(screen.queryByText('empty.no_activity_logs')).not.toBeInTheDocument();
    });

    it('keeps non-action states visible when backend capabilities are absent', async () => {
        mockList.mockResolvedValue({
            items: [],
            total: 0,
            skip: 0,
            limit: 50,
            capabilities: null,
        });

        renderActivityLogPage();

        await waitFor(() => expect(screen.queryByText('access.denied')).not.toBeInTheDocument());
        expect(screen.getByText('empty.no_activity_logs')).toBeInTheDocument();
    });
});
