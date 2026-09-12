import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { entityDetailQueryKey } from '@/lib/queryKeys/detail';
import { RiskDetailPage } from '@/pages/RiskDetailPage';
import { createTestQueryClient } from '@test/queryClient';
import { renderWithoutProviders as render } from '@test/render';

const getRiskMock = vi.fn();
const getLinkedControlsMock = vi.fn();
const getLinkedVendorsMock = vi.fn();
const getOverdueMock = vi.fn();
const deleteRiskMock = vi.fn();
const linkControlMock = vi.fn();

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((accept, decline) => {
        resolve = accept;
        reject = decline;
    });
    return { promise, reject, resolve };
}

function risk(id: number) {
    return {
        id,
        risk_id_code: `RISK-${id}`,
        name: `Risk ${id}`,
        status: 'active',
        risk_type: 'operational',
        is_priority: false,
        process: `Process ${id}`,
        description: `Risk ${id} description`,
        kris: [],
        capabilities: {
            can_archive_immediately: true,
            can_create_issue: true,
            can_link_controls: true,
        },
    };
}

function linkedControl(id: number) {
    return {
        id,
        control_id: id,
        risk_id: id,
        effectiveness: 'high',
        control: { id, name: `Control ${id}`, status: 'active', is_archived: false },
    };
}

vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisk: (...args: unknown[]) => getRiskMock(...args),
        getLinkedControls: (...args: unknown[]) => getLinkedControlsMock(...args),
        getLinkedVendors: (...args: unknown[]) => getLinkedVendorsMock(...args),
        deleteRisk: (...args: unknown[]) => deleteRiskMock(...args),
        restoreRisk: vi.fn(),
        linkControl: (...args: unknown[]) => linkControlMock(...args),
        unlinkControl: vi.fn(),
    },
}));

vi.mock('@/services/kriApi', () => ({
    kriApi: {
        getOverdue: (...args: unknown[]) => getOverdueMock(...args),
    },
}));

vi.mock('@/hooks/useRiskHubConfig', () => ({
    useRiskTypes: () => ({ getColor: () => '', getDisplayName: () => 'Operational' }),
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
    }) => <div>
        <button type="button" onClick={onOpen}>open-issue</button>
        {isOpen ? <span>issue:{contextEntityLabel}</span> : null}
    </div>,
}));

vi.mock('@/components/risks/RiskDetailOverviewTab', () => ({
    RiskDetailOverviewTab: ({
        isCreateDialogOpen,
        isLinkDialogOpen,
        linkedControls,
        onLinkControl,
        onRefreshData,
        setIsCreateDialogOpen,
        setIsLinkDialogOpen,
    }: {
        isCreateDialogOpen: boolean;
        isLinkDialogOpen: boolean;
        linkedControls: Array<{ control: { name: string } }>;
        onLinkControl: (id: number, effectiveness: string) => Promise<void>;
        onRefreshData: () => void;
        setIsCreateDialogOpen: (open: boolean) => void;
        setIsLinkDialogOpen: (open: boolean) => void;
    }) => <div>
        {linkedControls.map(({ control }) => <span key={control.name}>linked:{control.name}</span>)}
        <button type="button" onClick={() => setIsLinkDialogOpen(true)}>open-link</button>
        <button type="button" onClick={() => setIsCreateDialogOpen(true)}>open-create</button>
        <button type="button" onClick={() => void onLinkControl(91, 'high')}>link-control</button>
        <button type="button" onClick={onRefreshData}>refresh-risk</button>
        {isLinkDialogOpen ? <span>link-dialog</span> : null}
        {isCreateDialogOpen ? <span>create-dialog</span> : null}
    </div>,
}));

vi.mock('@/components/risks/RiskDetailKriHistoryTab', () => ({ RiskDetailKriHistoryTab: () => null }));
vi.mock('@/components/risks/RiskDetailQuestionnairesTab', () => ({
    RiskDetailQuestionnairesTab: ({ risk: owner }: { risk: { name: string } }) => <span>questionnaires:{owner.name}</span>,
}));
vi.mock('@/components/ConfirmDialog', () => ({
    ConfirmDialog: ({
        isOpen,
        onConfirm,
    }: {
        isOpen: boolean;
        onConfirm: (reason?: string) => void;
    }) => isOpen ? <button type="button" onClick={() => onConfirm('Owner reason')}>confirm-archive</button> : null,
}));

describe('Risk detail route ownership', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getRiskMock.mockImplementation((id: number) => Promise.resolve(risk(id)));
        getLinkedVendorsMock.mockResolvedValue([]);
        getOverdueMock.mockResolvedValue([]);
    });

    it('never lets late A sidecars, errors, archive navigation, or dialogs affect cached B', async () => {
        const refreshedA = deferred<ReturnType<typeof linkedControl>[]>();
        const deleteA = deferred<void>();
        const linkA = deferred<void>();
        getLinkedControlsMock
            .mockResolvedValueOnce([linkedControl(1)])
            .mockReturnValueOnce(refreshedA.promise)
            .mockResolvedValueOnce([linkedControl(2)]);
        deleteRiskMock.mockReturnValue(deleteA.promise);
        linkControlMock.mockReturnValue(linkA.promise);

        const queryClient = createTestQueryClient();
        queryClient.setQueryData(entityDetailQueryKey('risk', undefined, 2), risk(2));
        const router = createMemoryRouter([
            { path: '/risks/:id', element: <RiskDetailPage /> },
            { path: '/risks', element: <div>Risk register</div> },
        ], { initialEntries: ['/risks/1'] });
        render(
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router} />
            </QueryClientProvider>,
        );

        expect(await screen.findByRole('heading', { name: 'Risk 1' })).toBeInTheDocument();
        expect(await screen.findByText('linked:Control 1')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'open-issue' }));
        fireEvent.click(screen.getByRole('button', { name: 'open-link' }));
        fireEvent.click(screen.getByRole('button', { name: 'open-create' }));
        fireEvent.click(screen.getByRole('button', { name: 'refresh-risk' }));
        fireEvent.click(screen.getByRole('button', { name: 'link-control' }));
        fireEvent.click(screen.getByRole('button', { name: /Archive/i }));
        fireEvent.click(screen.getByRole('button', { name: 'confirm-archive' }));

        await act(async () => router.navigate('/risks/2'));
        expect(await screen.findByRole('heading', { name: 'Risk 2' })).toBeInTheDocument();
        expect(await screen.findByText('linked:Control 2')).toBeInTheDocument();
        expect(screen.queryByText('issue:Risk 1')).not.toBeInTheDocument();
        expect(screen.queryByText('link-dialog')).not.toBeInTheDocument();
        expect(screen.queryByText('create-dialog')).not.toBeInTheDocument();

        await act(async () => {
            refreshedA.resolve([linkedControl(11)]);
            linkA.reject(new Error('late A link failure'));
            deleteA.resolve();
        });

        expect(router.state.location.pathname).toBe('/risks/2');
        expect(screen.queryByText('linked:Control 11')).not.toBeInTheDocument();
        expect(screen.queryByText('Risk register')).not.toBeInTheDocument();
    });
});
