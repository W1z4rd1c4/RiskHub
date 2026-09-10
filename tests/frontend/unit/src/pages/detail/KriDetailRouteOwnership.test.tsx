import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KRIDetailPage } from '@/pages/KRIDetailPage';
import { ApiClientError } from '@/services/apiClient';
import { createTestQueryClient } from '@test/queryClient';
import { renderWithoutProviders as render } from '@test/render';

const getKriMock = vi.fn();
const getHistoryMock = vi.fn();
const getRiskMock = vi.fn();
const requestHistoryEditMock = vi.fn();
const deleteKriMock = vi.fn();

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((accept) => { resolve = accept; });
    return { promise, resolve };
}

function kri(id: number) {
    return {
        id,
        risk_id: id * 10,
        metric_name: `KRI ${id}`,
        description: `KRI ${id} description`,
        current_value: id,
        lower_limit: 0,
        upper_limit: 10,
        unit: '%',
        breach_status: 'optimal',
        is_archived: false,
        capabilities: {
            can_archive_immediately: true,
            can_create_issue: true,
            can_submit_value: true,
            can_request_history_correction: true,
        },
    };
}

vi.mock('@/services/kriApi', () => ({
    kriApi: {
        getKRI: (...args: unknown[]) => getKriMock(...args),
        getHistory: (...args: unknown[]) => getHistoryMock(...args),
        updateKRI: vi.fn(),
        deleteKRI: (...args: unknown[]) => deleteKriMock(...args),
        restoreKRI: vi.fn(),
        requestHistoryEdit: (...args: unknown[]) => requestHistoryEditMock(...args),
    },
}));

vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisk: (...args: unknown[]) => getRiskMock(...args),
    },
}));

vi.mock('@/components/kri/KRIModal', () => ({ KRIModal: () => null }));
vi.mock('@/components/ConfirmDialog', () => ({
    ConfirmDialog: ({ isOpen, onConfirm }: { isOpen: boolean; onConfirm: (reason?: string) => void }) => (
        isOpen ? <button type="button" onClick={() => onConfirm('Owner reason')}>confirm-delete</button> : null
    ),
}));
vi.mock('@/components/kris/KRIDetailOverviewTab', () => ({
    KRIDetailOverviewTab: ({
        linkedRisk,
        linkedRiskOutcome,
        onRetryLinkedRisk,
    }: {
        linkedRisk: { name: string } | null;
        linkedRiskOutcome: { kind: string };
        onRetryLinkedRisk: () => void;
    }) => (
        <div>
            <span>linked:{linkedRisk?.name ?? (linkedRiskOutcome.kind === 'empty' ? 'none' : 'masked')}</span>
            <span>linked-outcome:{linkedRiskOutcome.kind}</span>
            {linkedRiskOutcome.kind !== 'denied' ? (
                <button type="button" onClick={onRetryLinkedRisk}>retry-linked-risk</button>
            ) : null}
        </div>
    ),
}));
vi.mock('@/components/kris/KRIDetailHistoryTab', () => ({
    KRIDetailHistoryTab: ({
        history,
        onSelectEntry,
    }: {
        history: Array<{ id: number }>;
        onSelectEntry: (entry: { id: number }) => void;
    }) => (
        <div>
            {history.map((entry) => (
                <button key={entry.id} type="button" onClick={() => onSelectEntry(entry)}>
                    history:{entry.id}
                </button>
            ))}
        </div>
    ),
}));
vi.mock('@/components/kri/KRIValueModal', () => ({
    KRIValueModal: ({ isOpen, onSuccess }: { isOpen: boolean; onSuccess: () => void }) => (
        isOpen ? <button type="button" onClick={onSuccess}>record-succeeded</button> : null
    ),
}));
vi.mock('@/components/issues/IssueQuickCreateModal', () => ({
    IssueQuickCreateModal: ({ isOpen, contextEntityLabel }: { isOpen: boolean; contextEntityLabel: string }) => (
        isOpen ? <div>issue-for:{contextEntityLabel}</div> : null
    ),
}));

describe('KRI detail route ownership', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        requestHistoryEditMock.mockResolvedValue({ id: 202 });
        deleteKriMock.mockResolvedValue(undefined);
    });

    it('does not let late A deletion navigate away from B', async () => {
        const deletion = deferred<void>();
        getKriMock.mockImplementation((id: number) => Promise.resolve(kri(id)));
        getHistoryMock.mockResolvedValue({ items: [], total: 0 });
        getRiskMock.mockImplementation((id: number) => Promise.resolve({ id, name: `Risk ${id}` }));
        deleteKriMock.mockReturnValueOnce(deletion.promise);

        const router = createMemoryRouter([
            { path: '/kris/:id', element: <KRIDetailPage /> },
            { path: '/kris', element: <div>KRI register</div> },
        ], { initialEntries: ['/kris/1'] });
        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <RouterProvider router={router} />
            </QueryClientProvider>,
        );

        expect(await screen.findByRole('heading', { name: 'KRI 1' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Delete/i }));
        fireEvent.click(screen.getByRole('button', { name: 'confirm-delete' }));
        await waitFor(() => expect(deleteKriMock).toHaveBeenCalledWith(1, 'Owner reason'));

        await act(async () => router.navigate('/kris/2'));
        expect(await screen.findByRole('heading', { name: 'KRI 2' })).toBeInTheDocument();
        await act(async () => deletion.resolve());

        expect(router.state.location.pathname).toBe('/kris/2');
        expect(screen.queryByText('KRI register')).not.toBeInTheDocument();
    });

    it('keeps B state and correction/refresh targets when deferred A requests finish last', async () => {
        const historyA = deferred<{ items: Array<{ id: number }>; total: number }>();
        const riskA = deferred<{ id: number; name: string }>();
        getKriMock.mockImplementation((id: number) => Promise.resolve(kri(id)));
        getHistoryMock.mockImplementation((id: number) => (
            id === 1 ? historyA.promise : Promise.resolve({
                items: [{ id: 202, value: 2, unit: '%', period_end: '2026-08-31' }],
                total: 1,
            })
        ));
        getRiskMock.mockImplementation((id: number) => (
            id === 10 ? riskA.promise : Promise.resolve({ id, name: 'Risk B' })
        ));

        const router = createMemoryRouter([
            { path: '/kris/:id', element: <KRIDetailPage /> },
        ], { initialEntries: ['/kris/1'] });
        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <RouterProvider router={router} />
            </QueryClientProvider>,
        );

        expect(await screen.findByRole('heading', { name: 'KRI 1' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'New Issue' }));
        expect(screen.getByText('issue-for:KRI 1')).toBeInTheDocument();

        await act(async () => router.navigate('/kris/2'));
        expect(await screen.findByRole('heading', { name: 'KRI 2' })).toBeInTheDocument();
        expect(screen.queryByText(/^issue-for:/)).not.toBeInTheDocument();
        expect(await screen.findByText('linked:Risk B')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: /History/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'history:202' }));
        expect(screen.getByRole('heading', { name: /Request correction/i })).toBeInTheDocument();

        await act(async () => {
            historyA.resolve({ items: [{ id: 101 }], total: 1 });
            riskA.resolve({ id: 10, name: 'Risk A' });
        });
        expect(screen.queryByRole('button', { name: 'history:101' })).not.toBeInTheDocument();
        expect(screen.queryByText('linked:Risk A')).not.toBeInTheDocument();
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Correct B evidence' } });
        fireEvent.click(screen.getByRole('button', { name: /Submit correction/i }));
        await waitFor(() => {
            expect(requestHistoryEditMock).toHaveBeenCalledWith(2, 202, {
                value: 2,
                reason: 'Correct B evidence',
            });
        });

        fireEvent.click(screen.getByRole('button', { name: /Record Value/ }));
        fireEvent.click(screen.getByRole('button', { name: 'record-succeeded' }));
        await waitFor(() => {
            expect(getKriMock.mock.calls.filter(([id]) => id === 2)).toHaveLength(2);
        });
        expect(getKriMock.mock.calls.filter(([id]) => id === 1)).toHaveLength(1);
    });

    it('shows a retryable linked-Risk failure without false no-Risk copy', async () => {
        getKriMock.mockImplementation((id: number) => Promise.resolve(kri(id)));
        getHistoryMock.mockResolvedValue({ items: [], total: 0 });
        getRiskMock
            .mockRejectedValueOnce(new ApiClientError({ status: 500, messageKey: 'errorKeys.server' }))
            .mockResolvedValueOnce({ id: 10, name: 'Recovered Risk' });

        const router = createMemoryRouter([
            { path: '/kris/:id', element: <KRIDetailPage /> },
        ], { initialEntries: ['/kris/1'] });
        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <RouterProvider router={router} />
            </QueryClientProvider>,
        );

        expect(await screen.findByText('linked-outcome:fatal-error')).toBeInTheDocument();
        expect(screen.getByText('linked:masked')).toBeInTheDocument();
        expect(screen.queryByText('linked:none')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'retry-linked-risk' }));
        expect(await screen.findByText('linked:Recovered Risk')).toBeInTheDocument();
        expect(screen.getByText('linked-outcome:content')).toBeInTheDocument();
    });

    it('clears a retained linked Risk and its action after anti-enumeration 404', async () => {
        getKriMock.mockImplementation((id: number) => Promise.resolve(kri(id)));
        getHistoryMock.mockResolvedValue({ items: [], total: 0 });
        getRiskMock
            .mockResolvedValueOnce({ id: 10, name: 'Protected Risk' })
            .mockRejectedValueOnce(new ApiClientError({
                status: 404,
                messageKey: 'errorKeys.not_found',
            }));

        const router = createMemoryRouter([
            { path: '/kris/:id', element: <KRIDetailPage /> },
        ], { initialEntries: ['/kris/1'] });
        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <RouterProvider router={router} />
            </QueryClientProvider>,
        );

        expect(await screen.findByText('linked:Protected Risk')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'retry-linked-risk' }));

        expect(await screen.findByText('linked-outcome:denied')).toBeInTheDocument();
        expect(screen.getByText('linked:masked')).toBeInTheDocument();
        expect(screen.queryByText('linked:Protected Risk')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'retry-linked-risk' })).not.toBeInTheDocument();
    });
});
