import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KRIDetailPage } from '@/pages/KRIDetailPage';
import { ApiClientError } from '@/services/apiClient';
import { createTestQueryClient } from '@test/queryClient';
import { renderWithoutProviders as render } from '@test/render';
import { applyAuthenticatedSession, applyBootstrappedSession, getSessionOwnershipSnapshot, getSessionSnapshot, setSessionSnapshot } from '@/services/session';
import { assertRequestSessionOwnershipCurrent } from '@/services/api/sessionRefreshPolicy';
import type { AuthUser } from '@/services/authApi';

const getKri = vi.fn();
const restoreKri = vi.fn();
const getHistory = vi.fn();
vi.mock('@/services/kriApi', () => ({ kriApi: {
    getKRI: (...args: unknown[]) => getKri(...args),
    restoreKRI: (...args: unknown[]) => restoreKri(...args),
    getHistory: (...args: unknown[]) => getHistory(...args),
} }));
vi.mock('@/components/kris/KRIDetailOverviewTab', () => ({ KRIDetailOverviewTab: () => null }));
vi.mock('@/components/history', () => ({ HistoryTrendChart: () => null, HistoryComparisonPanel: () => null, HistoryTimeline: () => null }));
vi.mock('@/components/kri/KRIModal', () => ({ KRIModal: () => null }));
vi.mock('@/components/kri/KRIValueModal', () => ({ KRIValueModal: () => null }));
vi.mock('@/components/issues/IssueQuickCreateModal', () => ({ IssueQuickCreateModal: () => null }));

function record(id = 1, archived = true) {
    return { id, risk_id: null, metric_name: `Liquidity ${id}`, current_value: 3,
        lower_limit: 0, upper_limit: 5, unit: '%', breach_status: 'within', is_archived: archived,
        capabilities: { can_restore: archived, can_archive_immediately: !archived } };
}
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
function start() {
    const router = createMemoryRouter([{ path: '/kris/:id', element: <KRIDetailPage /> }],
        { initialEntries: ['/kris/1'] });
    render(<QueryClientProvider client={createTestQueryClient()}><RouterProvider router={router} /></QueryClientProvider>);
    return router;
}

describe('KRI restore outcomes', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        setSessionSnapshot(previous => ({ ...previous, user: { id: 7 } as AuthUser,
            token: 'session-7', bootstrapStatus: 'authenticated' }));
        getKri.mockImplementation((id: number) => Promise.resolve(record(id)));
        getHistory.mockResolvedValue({ items: [], total: 0 });
        restoreKri.mockResolvedValue(record(1, false));
    });

    it('locks repeated activation, announces pending, retains rejection and permits one retry', async () => {
        const request = deferred<ReturnType<typeof record>>();
        restoreKri.mockReturnValueOnce(request.promise);
        start();
        const restore = await screen.findByRole('button', { name: 'Unarchive' });
        fireEvent.click(restore);
        fireEvent.click(restore);
        expect(restoreKri).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: 'Restoring…' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Restoring…' })).toHaveAttribute('aria-busy', 'true');
        await act(async () => request.reject(new ApiClientError({ status: 422, messageKey: 'errorKeys.validation' })));
        expect(screen.getByRole('alert')).toHaveTextContent('Restore was rejected');
        expect(screen.getByRole('heading', { name: 'Liquidity 1' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retry restore' }));
        expect(await screen.findByRole('status')).toHaveTextContent('KRI restored');
        expect(restoreKri).toHaveBeenCalledTimes(2);
        expect(screen.queryByRole('button', { name: 'Unarchive' })).not.toBeInTheDocument();
        expect(getKri).toHaveBeenCalledTimes(1);
    });
    it.each([
        new Error('connection lost after submission'),
        new ApiClientError({ status: 500, messageKey: 'errorKeys.server' }),
        new ApiClientError({ status: 200, code: 'INVALID_RESPONSE_PAYLOAD', messageKey: 'errorKeys.unexpected' }),
    ])('requires read reconciliation for an uncertain outcome: %s', async (error) => {
        restoreKri.mockRejectedValueOnce(error);
        start();
        fireEvent.click(await screen.findByRole('button', { name: 'Unarchive' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('outcome is unknown');
        expect(screen.getByRole('button', { name: 'Unarchive' })).toBeDisabled();
        expect(screen.queryByRole('button', { name: 'Retry restore' })).not.toBeInTheDocument();
        getKri.mockResolvedValue(record(1, false));
        fireEvent.click(screen.getByRole('button', { name: 'Refresh record' }));
        expect(await screen.findByRole('status')).toHaveTextContent('KRI restored');
        expect(restoreKri).toHaveBeenCalledTimes(1);
        expect(getKri).toHaveBeenCalledTimes(2);
    });

    it('retains unknown outcome after failed read, then permits retry only from fresh authorized archived state', async () => {
        restoreKri.mockRejectedValueOnce(new Error('connection lost'));
        start();
        fireEvent.click(await screen.findByRole('button', { name: 'Unarchive' }));
        await screen.findByText(/outcome is unknown/);
        getKri.mockRejectedValue(new Error('read unavailable'));
        fireEvent.click(screen.getByRole('button', { name: 'Refresh record' }));
        await waitFor(() => expect(getKri).toHaveBeenCalledTimes(3), { timeout: 3000 }); // detail query retries a transient read once
        await screen.findByRole('button', { name: 'Refresh record' });
        expect(screen.getByText(/outcome is unknown/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Unarchive' })).toBeDisabled();
        getKri.mockResolvedValue(record());
        fireEvent.click(screen.getByRole('button', { name: 'Refresh record' }));
        expect(await screen.findByText(/refreshed record is still archived/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retry restore' }));
        expect(await screen.findByRole('status')).toHaveTextContent('KRI restored');
        expect(restoreKri).toHaveBeenCalledTimes(2);
    });

    it.each([401, 403, 404])('does not reuse old restore capability after %i rejection', async (status) => {
        restoreKri.mockRejectedValueOnce(new ApiClientError({ status, messageKey: 'errorKeys.forbidden' }));
        start();
        fireEvent.click(await screen.findByRole('button', { name: 'Unarchive' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('not authorized');
        expect(screen.getByRole('button', { name: 'Unarchive' })).toBeDisabled();
        getKri.mockResolvedValue({ ...record(), capabilities: { can_restore: false } });
        fireEvent.click(screen.getByRole('button', { name: 'Refresh record' }));
        await screen.findByText(/refreshed record is still archived/);
        expect(screen.queryByRole('button', { name: 'Retry restore' })).not.toBeInTheDocument();
        expect(restoreKri).toHaveBeenCalledTimes(1);
    });

    it('keeps acknowledged success when subsequent history reconciliation fails', async () => {
        start();
        const button = await screen.findByRole('button', { name: 'Unarchive' });
        await waitFor(() => expect(getHistory).toHaveBeenCalledTimes(1));
        getHistory.mockRejectedValue(new Error('history refresh unavailable'));
        fireEvent.click(button);
        expect(await screen.findByRole('status')).toHaveTextContent('KRI restored');
        fireEvent.click(screen.getByRole('tab', { name: /History/ }));
        expect(await screen.findByTestId('kri-history-load-state')).toBeInTheDocument();
        expect(screen.getByText('KRI restored.')).toHaveAttribute('role', 'status');
        expect(screen.queryByRole('button', { name: 'Retry restore' })).not.toBeInTheDocument();
        expect(getKri).toHaveBeenCalledTimes(1);
    });

    it.each(['resolve', 'reject'] as const)('ignores a delayed A %s after navigation to B', async (completion) => {
        const request = deferred<ReturnType<typeof record>>();
        restoreKri.mockReturnValueOnce(request.promise);
        const router = start();
        fireEvent.click(await screen.findByRole('button', { name: 'Unarchive' }));
        await act(async () => router.navigate('/kris/2'));
        expect(await screen.findByRole('heading', { name: 'Liquidity 2' })).toBeInTheDocument();
        await act(async () => {
            if (completion === 'resolve') request.resolve(record(1, false));
            else request.reject(new Error('late A failure'));
        });
        expect(screen.getByRole('button', { name: 'Unarchive' })).toBeEnabled();
        expect(screen.queryByText(/KRI restored|outcome is unknown/)).not.toBeInTheDocument();
        expect(getKri.mock.calls.map(([id]) => id)).toEqual([1, 2]);
    });

    it('invalidates an in-flight callback on same-record session loss and reauthentication', async () => {
        const request = deferred<ReturnType<typeof record>>();
        restoreKri.mockReturnValueOnce(request.promise);
        start();
        fireEvent.click(await screen.findByRole('button', { name: 'Unarchive' }));
        act(() => setSessionSnapshot(previous => ({ ...previous, bootstrapStatus: 'anonymous', token: null })));
        expect(screen.queryByRole('button', { name: /Unarchive|Restoring/ })).not.toBeInTheDocument();
        act(() => setSessionSnapshot(previous => ({ ...previous, bootstrapStatus: 'authenticated', token: 'new-session' })));
        await act(async () => request.resolve(record(1, false)));
        expect(screen.queryByText('KRI restored.')).not.toBeInTheDocument();
    });

    it('clears protected record context on denied reconciliation and can recover through authorized reads', async () => {
        restoreKri.mockRejectedValueOnce(new Error('connection lost'));
        start();
        fireEvent.click(await screen.findByRole('button', { name: 'Unarchive' }));
        await screen.findByText(/outcome is unknown/);
        getKri.mockRejectedValue(new ApiClientError({ status: 403, messageKey: 'errorKeys.forbidden' }));
        fireEvent.click(screen.getByRole('button', { name: 'Refresh record' }));
        expect(await screen.findByTestId('detail-load-unavailable')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Liquidity 1' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Unarchive' })).not.toBeInTheDocument();
        getKri.mockResolvedValue(record());
        fireEvent.click(screen.getByRole('button', { name: 'Retry', exact: true }));
        await screen.findByRole('heading', { name: 'Liquidity 1' });
        fireEvent.click(screen.getByRole('button', { name: 'Refresh record' }));
        await screen.findByText(/refreshed record is still archived/);
        expect(screen.getByRole('button', { name: 'Retry restore' })).toBeEnabled();
        expect(restoreKri).toHaveBeenCalledTimes(1);
    });

    it('does not apply an old principal response to the same record in a new principal session', async () => {
        const request = deferred<ReturnType<typeof record>>();
        restoreKri.mockReturnValueOnce(request.promise);
        start();
        fireEvent.click(await screen.findByRole('button', { name: 'Unarchive' }));
        act(() => setSessionSnapshot(previous => ({ ...previous, user: { id: 8 } as AuthUser, token: 'session-8' })));
        await waitFor(() => expect(getKri).toHaveBeenCalledTimes(2));
        await act(async () => request.resolve(record(1, false)));
        expect(screen.queryByText('KRI restored.')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Unarchive' })).toBeEnabled();
    });

    it.each(['replacement-token', 'session-7'])('ignores the API session-changed rejection after same-principal replacement (%s)', async (token) => {
        const request = deferred<ReturnType<typeof record>>();
        restoreKri.mockImplementationOnce(async () => {
            const owner = getSessionOwnershipSnapshot();
            const response = await request.promise;
            assertRequestSessionOwnershipCurrent(owner);
            return response;
        });
        start();
        fireEvent.click(await screen.findByRole('button', { name: 'Unarchive' }));
        act(() => applyAuthenticatedSession({
            access_token: token, token_type: 'bearer', user: getSessionSnapshot().user!,
        }));
        await act(async () => request.resolve(record(1, false)));
        expect(screen.queryByText(/KRI restored|not authorized/)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Unarchive' })).toBeEnabled();
        expect(restoreKri).toHaveBeenCalledTimes(1);
    });

    it('keeps the pending restore owned during an ordinary same-principal token refresh', async () => {
        const request = deferred<ReturnType<typeof record>>();
        restoreKri.mockImplementationOnce(async () => {
            const owner = getSessionOwnershipSnapshot();
            const response = await request.promise;
            assertRequestSessionOwnershipCurrent(owner);
            return response;
        });
        start();
        fireEvent.click(await screen.findByRole('button', { name: 'Unarchive' }));
        act(() => applyBootstrappedSession({ token: 'refreshed-token', user: getSessionSnapshot().user! }));
        expect(screen.getByRole('button', { name: 'Restoring…' })).toBeDisabled();
        await act(async () => request.resolve(record(1, false)));
        expect(await screen.findByRole('status')).toHaveTextContent('KRI restored');
        expect(restoreKri).toHaveBeenCalledTimes(1);
    });

});
