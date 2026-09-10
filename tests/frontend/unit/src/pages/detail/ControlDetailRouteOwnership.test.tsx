import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ControlDetailPage } from '@/pages/ControlDetailPage';
import { ApiClientError } from '@/services/apiClient';
import { createTestQueryClient } from '@test/queryClient';
import { renderWithoutProviders as render } from '@test/render';

const getControlMock = vi.fn();
const getLinkedRisksMock = vi.fn();
const getRiskMock = vi.fn();
const unlinkRiskMock = vi.fn();

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((accept) => { resolve = accept; });
    return { promise, resolve };
}

function control(id: number) {
    return {
        id,
        name: `Control ${id}`,
        description: `Control ${id} description`,
        status: 'active',
        risk_level: 3,
        frequency: 'monthly',
        control_form: 'preventive',
        monitoring_status: 'passed',
        capabilities: {
            can_create_issue: true,
            can_link_risk: true,
            can_unlink_risk: true,
            can_log_execution: true,
        },
    };
}

function link(id: number, name: string) {
    return {
        id,
        control_id: id,
        risk_id: id,
        effectiveness: 'high',
        risk: { id, name, is_archived: false },
    };
}

vi.mock('@/services/controlApi', () => ({
    controlApi: {
        getControl: (...args: unknown[]) => getControlMock(...args),
        getLinkedRisks: (...args: unknown[]) => getLinkedRisksMock(...args),
        unlinkRisk: (...args: unknown[]) => unlinkRiskMock(...args),
        linkRisk: vi.fn(),
        deleteControl: vi.fn(),
        restoreControl: vi.fn(),
    },
}));

vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisk: (...args: unknown[]) => getRiskMock(...args),
    },
}));

vi.mock('@/pages/detail/ContextualIssueAction', () => ({
    ContextualIssueAction: ({
        contextEntityLabel,
        isOpen,
        onOpen,
    }: {
        contextEntityLabel: string;
        isOpen: boolean;
        onOpen: () => void;
    }) => (
        <div>
            <button type="button" onClick={onOpen}>open-issue</button>
            {isOpen ? <span>issue:{contextEntityLabel}</span> : null}
        </div>
    ),
}));

vi.mock('@/pages/controls/ControlDetailOverviewTab', () => ({
    ControlDetailOverviewTab: ({
        isLinkDialogOpen,
        isRiskModalOpen,
        linkedRisks,
        linkedRisksOutcome,
        onOpenLinkDialog,
        onRetryLinkedRisks,
        onRiskClick,
        onUnlinkRisk,
        selectedRisk,
    }: {
        isLinkDialogOpen: boolean;
        isRiskModalOpen: boolean;
        linkedRisks: Array<{ risk: { name: string } }>;
        linkedRisksOutcome: string;
        onOpenLinkDialog: () => void;
        onRetryLinkedRisks: () => void;
        onRiskClick: (riskId: number, event: { stopPropagation: () => void }) => void;
        onUnlinkRisk: (riskId: number) => void;
        selectedRisk: { name: string } | null;
    }) => (
        <div>
            <button type="button" onClick={onOpenLinkDialog}>open-link</button>
            <button type="button" onClick={(event) => onRiskClick(101, event)}>open-risk-a</button>
            <button type="button" onClick={(event) => onRiskClick(202, event)}>open-risk-b</button>
            <button type="button" onClick={() => onUnlinkRisk(1)}>unlink-risk</button>
            <button type="button" onClick={onRetryLinkedRisks}>retry-linked</button>
            <span>outcome:{linkedRisksOutcome}</span>
            {isLinkDialogOpen ? <span>link-dialog</span> : null}
            {isRiskModalOpen ? <span>quick:{selectedRisk?.name}</span> : null}
            {linkedRisks.map(({ risk }) => <span key={risk.name}>linked:{risk.name}</span>)}
        </div>
    ),
}));

vi.mock('@/components/executions/ExecutionHistory', () => ({
    ExecutionHistory: () => null,
}));

vi.mock('@/components/executions/ExecutionLogModal', () => ({
    ExecutionLogModal: ({ onSuccess }: { onSuccess: () => void }) => (
        <button type="button" onClick={onSuccess}>execution-succeeded</button>
    ),
}));

vi.mock('@/components/ArchiveConfirmDialog', () => ({ ArchiveConfirmDialog: () => null }));

describe('Control detail route ownership', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getControlMock.mockImplementation((id: number) => Promise.resolve(control(id)));
        unlinkRiskMock.mockResolvedValue(undefined);
    });

    it('keeps B linked, modal, quick-view, and refresh state when deferred A requests finish last', async () => {
        const linkedA = deferred<ReturnType<typeof link>[]>();
        const riskA = deferred<{ id: number; name: string }>();
        getLinkedRisksMock.mockImplementation((id: number) => (
            id === 1 ? linkedA.promise : Promise.resolve([link(2, 'Risk B')])
        ));
        getRiskMock.mockReturnValue(riskA.promise);

        const router = createMemoryRouter([
            { path: '/controls/:id', element: <ControlDetailPage /> },
        ], { initialEntries: ['/controls/1'] });
        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <RouterProvider router={router} />
            </QueryClientProvider>,
        );

        expect(await screen.findByRole('heading', { name: 'Control 1' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'open-issue' }));
        fireEvent.click(screen.getByRole('button', { name: 'open-link' }));
        fireEvent.click(screen.getByRole('button', { name: 'open-risk-a' }));
        expect(screen.getByText('issue:Control 1')).toBeInTheDocument();
        expect(screen.getByText('link-dialog')).toBeInTheDocument();

        await act(async () => router.navigate('/controls/2'));
        expect(await screen.findByRole('heading', { name: 'Control 2' })).toBeInTheDocument();
        expect(await screen.findByText('linked:Risk B')).toBeInTheDocument();
        expect(screen.queryByText(/^issue:/)).not.toBeInTheDocument();
        expect(screen.queryByText('link-dialog')).not.toBeInTheDocument();

        await act(async () => {
            linkedA.resolve([link(1, 'Risk A')]);
            riskA.resolve({ id: 101, name: 'Risk A quick view' });
        });
        expect(screen.queryByText('linked:Risk A')).not.toBeInTheDocument();
        expect(screen.queryByText('quick:Risk A quick view')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'execution-succeeded' }));
        await waitFor(() => {
            expect(getControlMock.mock.calls.filter(([id]) => id === 2)).toHaveLength(2);
        });
        expect(getControlMock.mock.calls.filter(([id]) => id === 1)).toHaveLength(1);
    });

    it('keeps the newest linked refresh and quick-view request for the same Control', async () => {
        const initialLinks = deferred<ReturnType<typeof link>[]>();
        const riskA = deferred<{ id: number; name: string }>();
        getLinkedRisksMock
            .mockReturnValueOnce(initialLinks.promise)
            .mockResolvedValueOnce([link(2, 'Newest linked Risk')]);
        getRiskMock.mockImplementation((id: number) => (
            id === 101 ? riskA.promise : Promise.resolve({ id, name: 'Newest quick Risk' })
        ));

        const router = createMemoryRouter([
            { path: '/controls/:id', element: <ControlDetailPage /> },
        ], { initialEntries: ['/controls/1'] });
        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <RouterProvider router={router} />
            </QueryClientProvider>,
        );

        expect(await screen.findByRole('heading', { name: 'Control 1' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'unlink-risk' }));
        expect(await screen.findByText('linked:Newest linked Risk')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'open-risk-a' }));
        fireEvent.click(screen.getByRole('button', { name: 'open-risk-b' }));
        expect(await screen.findByText('quick:Newest quick Risk')).toBeInTheDocument();

        await act(async () => {
            initialLinks.resolve([link(1, 'Stale linked Risk')]);
            riskA.resolve({ id: 101, name: 'Stale quick Risk' });
        });
        expect(screen.queryByText('linked:Stale linked Risk')).not.toBeInTheDocument();
        expect(screen.queryByText('quick:Stale quick Risk')).not.toBeInTheDocument();
    });

    it('clears protected linked rows and exposes a denied outcome', async () => {
        getLinkedRisksMock
            .mockResolvedValueOnce([link(1, 'Previously visible Risk')])
            .mockRejectedValueOnce(new Error('temporary linked-risk failure'))
            .mockRejectedValueOnce(new ApiClientError({
                status: 403,
                messageKey: 'errorKeys.forbidden',
            }));

        const router = createMemoryRouter([
            { path: '/controls/:id', element: <ControlDetailPage /> },
        ], { initialEntries: ['/controls/1'] });
        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <RouterProvider router={router} />
            </QueryClientProvider>,
        );

        expect(await screen.findByText('linked:Previously visible Risk')).toBeInTheDocument();
        getRiskMock.mockResolvedValueOnce({ id: 101, name: 'Previously visible quick Risk' });
        fireEvent.click(screen.getByRole('button', { name: 'open-link' }));
        fireEvent.click(screen.getByRole('button', { name: 'open-risk-a' }));
        expect(await screen.findByText('quick:Previously visible quick Risk')).toBeInTheDocument();
        expect(screen.getByText('link-dialog')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'unlink-risk' }));

        expect(await screen.findByText('outcome:stale-with-error')).toBeInTheDocument();
        expect(screen.getByText('linked:Previously visible Risk')).toBeInTheDocument();
        expect(screen.getByText('quick:Previously visible quick Risk')).toBeInTheDocument();
        expect(screen.getByText('link-dialog')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'retry-linked' }));

        expect(await screen.findByText('outcome:denied')).toBeInTheDocument();
        expect(screen.queryByText('linked:Previously visible Risk')).not.toBeInTheDocument();
        expect(screen.queryByText('quick:Previously visible quick Risk')).not.toBeInTheDocument();
        expect(screen.queryByText('link-dialog')).not.toBeInTheDocument();
    });

    it('clears protected linked rows and dialogs on anti-enumeration 404', async () => {
        getLinkedRisksMock
            .mockResolvedValueOnce([link(1, 'Previously visible Risk')])
            .mockRejectedValueOnce(new ApiClientError({
                status: 404,
                messageKey: 'errorKeys.not_found',
            }));

        const router = createMemoryRouter([
            { path: '/controls/:id', element: <ControlDetailPage /> },
        ], { initialEntries: ['/controls/1'] });
        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <RouterProvider router={router} />
            </QueryClientProvider>,
        );

        expect(await screen.findByText('linked:Previously visible Risk')).toBeInTheDocument();
        getRiskMock.mockResolvedValueOnce({ id: 101, name: 'Previously visible quick Risk' });
        fireEvent.click(screen.getByRole('button', { name: 'open-link' }));
        fireEvent.click(screen.getByRole('button', { name: 'open-risk-a' }));
        expect(await screen.findByText('quick:Previously visible quick Risk')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'retry-linked' }));

        expect(await screen.findByText('outcome:denied')).toBeInTheDocument();
        expect(screen.queryByText('linked:Previously visible Risk')).not.toBeInTheDocument();
        expect(screen.queryByText('quick:Previously visible quick Risk')).not.toBeInTheDocument();
        expect(screen.queryByText('link-dialog')).not.toBeInTheDocument();
    });

    it('does not let a late A unlink refresh replace B links', async () => {
        const unlinkA = deferred<void>();
        getLinkedRisksMock.mockImplementation((id: number) => Promise.resolve([
            id === 1 ? link(1, 'Risk A') : link(2, 'Risk B'),
        ]));
        unlinkRiskMock.mockReturnValue(unlinkA.promise);

        const router = createMemoryRouter([
            { path: '/controls/:id', element: <ControlDetailPage /> },
        ], { initialEntries: ['/controls/1'] });
        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <RouterProvider router={router} />
            </QueryClientProvider>,
        );

        expect(await screen.findByText('linked:Risk A')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'unlink-risk' }));
        await waitFor(() => expect(unlinkRiskMock).toHaveBeenCalledWith(1, 1));

        await act(async () => router.navigate('/controls/2'));
        expect(await screen.findByText('linked:Risk B')).toBeInTheDocument();
        await act(async () => unlinkA.resolve());

        expect(screen.queryByText('linked:Risk A')).not.toBeInTheDocument();
        expect(getLinkedRisksMock.mock.calls.filter(([id]) => id === 1)).toHaveLength(1);
    });
});
