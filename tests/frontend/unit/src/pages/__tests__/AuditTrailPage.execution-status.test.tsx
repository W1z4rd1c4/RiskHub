import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Profiler } from 'react';

import { AuditTrailPage } from '@/pages/AuditTrailPage';
import { ApiClientError } from '@/services/apiClient';

const getExecutionsMock = vi.fn();
const downloadAuditTrailCsvMock = vi.fn();
const mockUseAuthz = vi.fn(() => ({ canViewActivityLog: true }));

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => mockUseAuthz(),
}));

function LocationProbe() {
    const location = useLocation();
    return <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>;
}

function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });
    return { promise, reject, resolve };
}

function executionResponse(name = 'Quarterly Review Control') {
    return {
        items: [{
            id: 41,
            control_id: 9,
            executed_by_id: 2,
            executed_at: '2026-03-07T10:00:00Z',
            result: 'warning',
            findings: 'Follow-up required',
            created_at: '2026-03-07T10:00:00Z',
            control_name: name,
            executed_by_name: 'Anna Kowalski',
            control_owner_name: 'Martin Prochazka',
            linked_risks: ['Access Governance'],
        }],
        total: 1,
        skip: 0,
        limit: 50,
        capabilities: { can_read: true, can_export_csv: true },
    };
}

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { count?: number }) => (
            typeof options?.count === 'number' ? `${key}:${options.count}` : key
        ),
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/services/executionApi', () => ({
    executionApi: {
        getExecutions: (...args: unknown[]) => getExecutionsMock(...args),
    },
}));

vi.mock('@/services/reportApi', () => ({
    reportApi: {
        downloadAuditTrailCsv: (...args: unknown[]) => downloadAuditTrailCsvMock(...args),
    },
}));

describe('AuditTrailPage execution status rendering', () => {
    beforeEach(() => {
        getExecutionsMock.mockReset();
        downloadAuditTrailCsvMock.mockReset();
        mockUseAuthz.mockReturnValue({ canViewActivityLog: true });
        downloadAuditTrailCsvMock.mockResolvedValue(undefined);
    });

    it('links to Activity Log only with activity-log authority', async () => {
        getExecutionsMock.mockResolvedValue(executionResponse());

        const rendered = render(
            <MemoryRouter>
                <AuditTrailPage />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('link', { name: 'admin:activity_log.title' })).toHaveAttribute(
            'href',
            '/activity-log',
        );

        mockUseAuthz.mockReturnValue({ canViewActivityLog: false });
        rendered.rerender(
            <MemoryRouter>
                <AuditTrailPage />
            </MemoryRouter>,
        );
        expect(screen.queryByRole('link', { name: 'admin:activity_log.title' })).not.toBeInTheDocument();
    });

    it('renders audit results from the paginated execution response and uses canonical result labels', async () => {
        getExecutionsMock.mockResolvedValue({
            items: [
                {
                    id: 41,
                    control_id: 9,
                    executed_by_id: 2,
                    executed_at: '2026-03-07T10:00:00Z',
                    result: 'warning',
                    findings: 'Follow-up required',
                    created_at: '2026-03-07T10:00:00Z',
                    control_name: 'Quarterly Review Control',
                    executed_by_name: 'Anna Kowalski',
                    control_owner_name: 'Martin Prochazka',
                    linked_risks: ['Access Governance'],
                },
            ],
            total: 75,
            skip: 0,
            limit: 50,
            capabilities: {
                can_read: true,
                can_export_csv: true,
            },
        });

        render(
            <MemoryRouter>
                <AuditTrailPage />
            </MemoryRouter>
        );

        await screen.findByText('Quarterly Review Control');
        expect(getExecutionsMock).toHaveBeenCalledWith({
            skip: 0,
            limit: 50,
            result: undefined,
        });
        expect(screen.getByText('audit_trail.total_records:75')).toBeInTheDocument();
        expect(screen.getByText('controls:executions.issues_found')).toBeInTheDocument();
        expect(screen.getByText('Access Governance')).toBeInTheDocument();
    });

    it('shows the CSV action only when execution list capabilities allow export', async () => {
        getExecutionsMock.mockResolvedValue({
            items: [],
            total: 0,
            skip: 0,
            limit: 50,
            capabilities: {
                can_read: true,
                can_export_csv: true,
            },
        });

        render(
            <MemoryRouter>
                <AuditTrailPage />
            </MemoryRouter>
        );

        await screen.findByText('audit_trail.total_records:0');
        await userEvent.click(screen.getByRole('button', { name: 'CSV' }));

        await waitFor(() => {
            expect(downloadAuditTrailCsvMock).toHaveBeenCalledWith({ result: undefined });
        });
    });

    it.each([
        ['false capability', { can_read: true, can_export_csv: false }],
        ['missing capabilities', undefined],
    ])('hides the CSV action when %s is returned', async (_caseName, capabilities) => {
        getExecutionsMock.mockResolvedValue({
            items: [],
            total: 0,
            skip: 0,
            limit: 50,
            capabilities,
        });

        render(
            <MemoryRouter>
                <AuditTrailPage />
            </MemoryRouter>
        );

        await screen.findByText('audit_trail.total_records:0');
        expect(screen.queryByRole('button', { name: 'CSV' })).not.toBeInTheDocument();
    });

    it('renders a denied state when execution list access is forbidden', async () => {
        getExecutionsMock.mockRejectedValue(
            new ApiClientError({
                status: 403,
                messageKey: 'errorKeys.forbidden',
            })
        );

        render(
            <MemoryRouter>
                <AuditTrailPage />
            </MemoryRouter>
        );

        await screen.findByText('access.denied');
        expect(screen.getByText('access.denied_control_execution_history')).toBeInTheDocument();
        expect(screen.queryByText('access.denied_activity_log')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'CSV' })).not.toBeInTheDocument();
        expect(screen.queryByText('audit_trail.total_records:0')).not.toBeInTheDocument();
        expect(screen.queryByText('common:empty.no_executions')).not.toBeInTheDocument();
        expect(screen.queryByText('audit_trail.all_results')).not.toBeInTheDocument();
    });

    it('clears previously loaded audit data when a refetch is forbidden', async () => {
        getExecutionsMock
            .mockResolvedValueOnce({
                items: [
                    {
                        id: 41,
                        control_id: 9,
                        executed_by_id: 2,
                        executed_at: '2026-03-07T10:00:00Z',
                        result: 'warning',
                        findings: 'Follow-up required',
                        created_at: '2026-03-07T10:00:00Z',
                        control_name: 'Quarterly Review Control',
                        executed_by_name: 'Anna Kowalski',
                        control_owner_name: 'Martin Prochazka',
                        linked_risks: ['Access Governance'],
                    },
                ],
                total: 1,
                skip: 0,
                limit: 50,
                capabilities: {
                    can_read: true,
                    can_export_csv: true,
                },
            })
            .mockRejectedValueOnce(
                new ApiClientError({
                    status: 403,
                    messageKey: 'errorKeys.forbidden',
                })
            );

        render(
            <MemoryRouter>
                <AuditTrailPage />
            </MemoryRouter>
        );

        await screen.findByText('Quarterly Review Control');
        await userEvent.click(screen.getByRole('combobox', { name: 'audit_trail.all_results' }));
        await userEvent.click(screen.getByText('results.failed'));

        await screen.findByText('access.denied');
        expect(screen.queryByText('Quarterly Review Control')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'CSV' })).not.toBeInTheDocument();
    });

    it('does not retain rows from a different query when the new collection request fails', async () => {
        getExecutionsMock
            .mockResolvedValueOnce(executionResponse('Unfiltered Review Control'))
            .mockRejectedValueOnce(new Error('filtered collection unavailable'));

        render(
            <MemoryRouter>
                <AuditTrailPage />
            </MemoryRouter>,
        );

        await screen.findByText('Unfiltered Review Control');
        await userEvent.click(screen.getByRole('combobox', { name: 'audit_trail.all_results' }));
        await userEvent.click(screen.getByText('results.failed'));

        expect(await screen.findByRole('alert')).toHaveTextContent('common:tables.error.message');
        expect(screen.queryByText('Unfiltered Review Control')).not.toBeInTheDocument();
        expect(screen.queryByText('common:empty.no_executions')).not.toBeInTheDocument();
        expect(screen.queryByText('audit_trail.total_records:0')).not.toBeInTheDocument();
    });

    it('shows announced retry recovery for an initial failure without a false empty or zero count', async () => {
        getExecutionsMock
            .mockRejectedValueOnce(new Error('network'))
            .mockResolvedValueOnce(executionResponse());

        render(
            <MemoryRouter initialEntries={['/audit-trail?source=audit#history']}>
                <AuditTrailPage />
                <LocationProbe />
            </MemoryRouter>
        );

        expect(await screen.findByRole('alert')).toHaveTextContent('common:tables.error.message');
        expect(screen.queryByText('common:empty.no_executions')).not.toBeInTheDocument();
        expect(screen.queryByText('audit_trail.total_records:0')).not.toBeInTheDocument();
        expect(screen.queryByText('access.denied')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'CSV' })).not.toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent('/audit-trail?source=audit#history');

        await userEvent.click(screen.getByRole('button', { name: 'common:actions.retry' }));

        expect(await screen.findByText('Quarterly Review Control')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent('/audit-trail?source=audit#history');
    });

    it('retains safe rows with announced stale recovery after a same-query refresh fails', async () => {
        getExecutionsMock
            .mockResolvedValueOnce(executionResponse())
            .mockRejectedValueOnce(new Error('temporary network failure'))
            .mockResolvedValueOnce(executionResponse('Recovered Review Control'));

        render(
            <MemoryRouter>
                <AuditTrailPage />
            </MemoryRouter>,
        );

        await screen.findByText('Quarterly Review Control');
        await userEvent.click(screen.getByRole('button', { name: 'common:actions.refresh' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('common:tables.error.message');
        expect(screen.getByText('Quarterly Review Control')).toBeInTheDocument();
        expect(screen.queryByText('common:empty.no_executions')).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'common:actions.retry' }));
        expect(await screen.findByText('Recovered Review Control')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('keeps CSV failure local and retries the captured filter without changing the URL', async () => {
        const firstDownload = createDeferred<void>();
        getExecutionsMock.mockResolvedValue(executionResponse());
        downloadAuditTrailCsvMock
            .mockReturnValueOnce(firstDownload.promise)
            .mockResolvedValueOnce(undefined);

        render(
            <MemoryRouter initialEntries={['/audit-trail?source=audit#history']}>
                <AuditTrailPage />
                <LocationProbe />
            </MemoryRouter>,
        );

        await screen.findByText('Quarterly Review Control');
        await userEvent.click(screen.getByRole('combobox', { name: 'audit_trail.all_results' }));
        await userEvent.click(screen.getByText('results.failed'));
        await waitFor(() => expect(getExecutionsMock).toHaveBeenLastCalledWith({
            skip: 0,
            limit: 50,
            result: 'failed',
        }));

        const csvButton = screen.getByRole('button', { name: 'CSV' });
        await userEvent.click(csvButton);
        expect(csvButton).toBeDisabled();
        firstDownload.reject(new Error('CSV unavailable'));

        expect(await screen.findByRole('alert')).toHaveTextContent('common:export.errors.failed');
        expect(screen.getByRole('combobox', { name: 'audit_trail.all_results' })).toHaveTextContent('results.failed');
        expect(screen.getByTestId('location')).toHaveTextContent('/audit-trail?source=audit#history');

        await userEvent.click(screen.getByRole('button', { name: 'common:actions.retry' }));
        await waitFor(() => expect(downloadAuditTrailCsvMock).toHaveBeenCalledTimes(2));
        expect(downloadAuditTrailCsvMock).toHaveBeenNthCalledWith(1, { result: 'failed' });
        expect(downloadAuditTrailCsvMock).toHaveBeenNthCalledWith(2, { result: 'failed' });
        await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    });

    it('keeps newer filtered rows when an older collection request succeeds later', async () => {
        const olderRequest = createDeferred<ReturnType<typeof executionResponse>>();
        const newerRequest = createDeferred<ReturnType<typeof executionResponse>>();
        getExecutionsMock
            .mockReturnValueOnce(olderRequest.promise)
            .mockReturnValueOnce(newerRequest.promise);

        render(
            <MemoryRouter>
                <AuditTrailPage />
            </MemoryRouter>,
        );

        await userEvent.click(screen.getByRole('combobox', { name: 'audit_trail.all_results' }));
        await userEvent.click(screen.getByText('results.failed'));
        await waitFor(() => expect(getExecutionsMock).toHaveBeenCalledTimes(2));

        await act(async () => {
            newerRequest.resolve(executionResponse('Newer Filtered Control'));
            await newerRequest.promise;
        });
        expect(await screen.findByText('Newer Filtered Control')).toBeInTheDocument();

        await act(async () => {
            olderRequest.resolve(executionResponse('Older Unfiltered Control'));
            await olderRequest.promise;
        });
        expect(screen.getByText('Newer Filtered Control')).toBeInTheDocument();
        expect(screen.queryByText('Older Unfiltered Control')).not.toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'audit_trail.all_results' })).toHaveTextContent('results.failed');
    });

    it('hides the prior query rows and CSV capability immediately while a new filter is pending', async () => {
        const filteredRequest = createDeferred<ReturnType<typeof executionResponse>>();
        const filterCommitSnapshots: Array<{ hasCsv: boolean; hasPriorRow: boolean }> = [];
        const host = document.createElement('div');
        document.body.appendChild(host);
        getExecutionsMock
            .mockResolvedValueOnce(executionResponse('Unfiltered Review Control'))
            .mockReturnValueOnce(filteredRequest.promise);

        render(
            <Profiler
                id="audit-trail"
                onRender={() => {
                    const filter = host.querySelector('[aria-label="audit_trail.all_results"]');
                    if (!filter?.textContent?.includes('results.failed')) return;
                    filterCommitSnapshots.push({
                        hasCsv: Array.from(host.querySelectorAll('button')).some((button) => button.textContent?.trim() === 'CSV'),
                        hasPriorRow: host.textContent?.includes('Unfiltered Review Control') ?? false,
                    });
                }}
            >
                <MemoryRouter>
                    <AuditTrailPage />
                </MemoryRouter>
            </Profiler>,
            { container: host },
        );

        await screen.findByText('Unfiltered Review Control');
        expect(screen.getByRole('button', { name: 'CSV' })).toBeInTheDocument();
        await userEvent.click(screen.getByRole('combobox', { name: 'audit_trail.all_results' }));
        fireEvent.click(screen.getByText('results.failed'));

        expect(filterCommitSnapshots).not.toContainEqual({ hasCsv: true, hasPriorRow: true });
        expect(screen.queryByText('Unfiltered Review Control')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'CSV' })).not.toBeInTheDocument();
        await waitFor(() => expect(getExecutionsMock).toHaveBeenCalledTimes(2));

        await act(async () => {
            filteredRequest.resolve(executionResponse('Filtered Review Control'));
            await filteredRequest.promise;
        });
        expect(await screen.findByText('Filtered Review Control')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'CSV' })).toBeInTheDocument();
    });

    it('does not let an older success reverse a newer forbidden collection result', async () => {
        const olderRequest = createDeferred<ReturnType<typeof executionResponse>>();
        const newerRequest = createDeferred<ReturnType<typeof executionResponse>>();
        getExecutionsMock
            .mockReturnValueOnce(olderRequest.promise)
            .mockReturnValueOnce(newerRequest.promise);

        render(
            <MemoryRouter>
                <AuditTrailPage />
            </MemoryRouter>,
        );

        await userEvent.click(screen.getByRole('combobox', { name: 'audit_trail.all_results' }));
        await userEvent.click(screen.getByText('results.failed'));
        await waitFor(() => expect(getExecutionsMock).toHaveBeenCalledTimes(2));

        await act(async () => {
            newerRequest.reject(new ApiClientError({
                status: 403,
                messageKey: 'errorKeys.forbidden',
            }));
            await newerRequest.promise.catch(() => undefined);
        });
        expect(await screen.findByText('access.denied')).toBeInTheDocument();

        await act(async () => {
            olderRequest.resolve(executionResponse('Older Unfiltered Control'));
            await olderRequest.promise;
        });
        expect(screen.getByText('access.denied')).toBeInTheDocument();
        expect(screen.queryByText('Older Unfiltered Control')).not.toBeInTheDocument();
    });

    it('keeps the initial Retry focused, busy, and single-flight while recovery is pending', async () => {
        const retryRequest = createDeferred<ReturnType<typeof executionResponse>>();
        getExecutionsMock
            .mockRejectedValueOnce(new Error('network'))
            .mockReturnValueOnce(retryRequest.promise);
        const user = userEvent.setup();

        render(
            <MemoryRouter>
                <AuditTrailPage />
            </MemoryRouter>,
        );

        const retryButton = await screen.findByRole('button', { name: 'common:actions.retry' });
        await user.click(retryButton);

        expect(retryButton).toBeDisabled();
        expect(retryButton).toHaveAttribute('aria-busy', 'true');
        expect(retryButton).toHaveFocus();
        await user.click(retryButton);
        expect(getExecutionsMock).toHaveBeenCalledTimes(2);

        await act(async () => {
            retryRequest.resolve(executionResponse('Recovered Review Control'));
            await retryRequest.promise;
        });
        expect(await screen.findByText('Recovered Review Control')).toBeInTheDocument();
    });
});
