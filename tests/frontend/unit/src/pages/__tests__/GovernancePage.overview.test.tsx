import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@test/queryClient';

const getOverviewMock = vi.fn();
const scanOrphansMock = vi.fn();

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => ({
        canViewGovernance: true,
    }),
}));

vi.mock('@/i18n/hooks', async (importOriginal) => ({
    // `useFormat` / `translateUiMessage` stay real (locale en); only `useTranslation` is stubbed.
    ...(await importOriginal<typeof import('@/i18n/hooks')>()),
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/services/orphanedItemsApi', () => ({
    orphanedItemsApi: {
        getOverview: (...args: unknown[]) => getOverviewMock(...args),
        scanOrphans: (...args: unknown[]) => scanOrphansMock(...args),
    },
}));

vi.mock('@/components/governance', () => ({
    OrphanedItemsTable: ({
        items,
        onResolve,
    }: {
        items: Array<{ item_name: string }>;
        onResolve: (item: { item_name: string }) => void;
    }) => (
        <div>
            {items.map((item) => item.item_name).join(', ')}
            {items[0] ? (
                <button type="button" onClick={() => onResolve(items[0])}>Open orphan resolution</button>
            ) : null}
        </div>
    ),
    ResolveOrphanModal: ({
        isOpen,
        onApprovalQueued,
    }: {
        isOpen: boolean;
        onApprovalQueued?: (response: { approval_id: number }) => void;
    }) => isOpen ? (
        <button
            type="button"
            onClick={() => onApprovalQueued?.({ approval_id: 88 })}
        >
            Queue orphan approval
        </button>
    ) : null,
    OrphanQuickViewModal: () => null,
}));

import GovernancePage from '@/pages/GovernancePage';

function GovernanceHarness() {
    const location = useLocation();
    const navigate = useNavigate();
    return (
        <>
            <GovernancePage />
            <output data-testid="governance-location">{location.search}</output>
            <output data-testid="governance-route">{location.pathname}{location.search}</output>
            <button type="button" onClick={() => navigate(-1)}>History back</button>
            <button type="button" onClick={() => navigate(1)}>History forward</button>
            <button type="button" onClick={() => navigate('/governance?type=threat')}>Set threat query</button>
        </>
    );
}

function createWrapper() {
    const queryClient = createTestQueryClient();

    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

describe('GovernancePage overview aggregation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getOverviewMock.mockResolvedValue({
            stats: {
                risk_count: 1,
                control_count: 0,
                kri_count: 0,
                threat_count: 0,
                process_count: 0,
                total_count: 1,
            },
            items: [
                {
                    id: 1,
                    item_type: 'risk',
                    item_id: 10,
                    item_name: 'Orphaned Risk',
                    item_description: null,
                    item_identifier: 'R-001',
                    department_name: 'Ops',
                    previous_owner_name: 'Former Owner',
                    previous_owner_email: 'former@example.com',
                    orphaned_at: '2026-03-07T10:00:00Z',
                    status: 'pending',
                },
            ],
            last_scan_at: '2026-03-07T10:00:00Z',
            scan_status: 'succeeded',
        });
    });

    it('loads governance via the overview endpoint without triggering a scan', async () => {
        render(
            <MemoryRouter>
                <GovernancePage />
            </MemoryRouter>,
            { wrapper: createWrapper() },
        );

        await waitFor(() => expect(getOverviewMock).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.queryByText('governance.loading')).not.toBeInTheDocument());
        expect(scanOrphansMock).not.toHaveBeenCalled();
        expect(screen.getByText('Orphaned Risk')).toBeInTheDocument();
    });

    it('renders a visible fail-closed state when the authoritative orphan list cannot load', async () => {
        getOverviewMock.mockRejectedValue(new Error('overview unavailable'));

        render(
            <MemoryRouter>
                <GovernancePage />
            </MemoryRouter>,
            { wrapper: createWrapper() },
        );

        expect(await screen.findByRole('alert')).toHaveTextContent('governance.load_failed');
        expect(screen.getByText('governance.load_failed_help')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Open orphan resolution' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'governance.refresh' })).toBeEnabled();
    });

    it('keeps a queued orphan reassignment on Governance with a notice deep-linking to the My Requests approval (D12 / PM-2)', async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter initialEntries={['/governance?type=risk']}>
                <GovernanceHarness />
            </MemoryRouter>,
            { wrapper: createWrapper() },
        );

        await user.click(await screen.findByRole('button', { name: 'Open orphan resolution' }));
        await user.click(screen.getByRole('button', { name: 'Queue orphan approval' }));

        expect(screen.getByTestId('governance-route')).toHaveTextContent('/governance?type=risk');
        expect(await screen.findByTestId('approval-queued-notice-link')).toHaveAttribute(
            'href',
            '/approvals?tab=mine&approvalId=88',
        );
        expect(screen.queryByRole('button', { name: 'Queue orphan approval' })).not.toBeInTheDocument();
    });

    it('opens the Threat queue when linked from an orphaned Threat detail', async () => {
        getOverviewMock.mockResolvedValue({
            stats: {
                risk_count: 1,
                control_count: 0,
                kri_count: 0,
                threat_count: 1,
                process_count: 0,
                total_count: 2,
            },
            items: [
                {
                    id: 1,
                    item_type: 'risk',
                    item_id: 10,
                    item_name: 'Orphaned Risk',
                    item_description: null,
                    item_identifier: 'R-001',
                    department_name: 'Ops',
                    previous_owner_name: 'Former Owner',
                    previous_owner_email: 'former@example.com',
                    orphaned_at: '2026-03-07T10:00:00Z',
                    status: 'pending',
                },
                {
                    id: 2,
                    item_type: 'threat',
                    item_id: 11,
                    item_name: 'Orphaned Threat',
                    item_description: null,
                    item_identifier: null,
                    department_name: null,
                    previous_owner_name: 'Former CISO',
                    previous_owner_email: 'former-ciso@example.com',
                    orphaned_at: '2026-03-07T10:00:00Z',
                    status: 'pending',
                },
            ],
            last_scan_at: '2026-03-07T10:00:00Z',
            scan_status: 'succeeded',
        });

        render(
            <MemoryRouter initialEntries={['/governance?type=threat']}>
                <GovernancePage />
            </MemoryRouter>,
            { wrapper: createWrapper() },
        );

        expect(await screen.findByText('Orphaned Threat')).toBeInTheDocument();
        expect(screen.queryByText('Orphaned Risk')).not.toBeInTheDocument();
    });

    it('opens the Process queue when linked from an orphaned Process detail', async () => {
        getOverviewMock.mockResolvedValue({
            stats: {
                risk_count: 1,
                control_count: 0,
                kri_count: 0,
                threat_count: 0,
                process_count: 1,
                total_count: 2,
            },
            items: [
                {
                    id: 1,
                    item_type: 'risk',
                    item_id: 10,
                    item_name: 'Orphaned Risk',
                    item_description: null,
                    item_identifier: 'R-001',
                    department_name: 'Ops',
                    previous_owner_name: 'Former Owner',
                    previous_owner_email: 'former@example.com',
                    orphaned_at: '2026-03-07T10:00:00Z',
                    status: 'pending',
                },
                {
                    id: 3,
                    item_type: 'process',
                    item_id: 74,
                    item_name: 'Orphaned Process',
                    item_description: 'Claims handling',
                    item_identifier: 'F74',
                    department_name: 'Operations',
                    previous_owner_name: 'Former Process Owner',
                    previous_owner_email: 'process-owner@example.com',
                    orphaned_at: '2026-03-07T10:00:00Z',
                    status: 'pending',
                },
            ],
            last_scan_at: '2026-03-07T10:00:00Z',
            scan_status: 'succeeded',
        });

        render(
            <MemoryRouter initialEntries={['/governance?type=process']}>
                <GovernancePage />
            </MemoryRouter>,
            { wrapper: createWrapper() },
        );

        expect(await screen.findByText('Orphaned Process')).toBeInTheDocument();
        expect(screen.queryByText('Orphaned Risk')).not.toBeInTheDocument();
    });

    it('uses semantic stat buttons and keeps selection synchronized with URL history', async () => {
        const user = userEvent.setup();
        getOverviewMock.mockResolvedValue({
            stats: {
                risk_count: 1,
                control_count: 0,
                kri_count: 0,
                threat_count: 1,
                process_count: 1,
                total_count: 3,
            },
            items: [
                {
                    id: 1,
                    item_type: 'risk',
                    item_id: 10,
                    item_name: 'Orphaned Risk',
                    item_description: null,
                    item_identifier: 'R-001',
                    department_name: 'Ops',
                    previous_owner_name: 'Former Owner',
                    previous_owner_email: 'former@example.com',
                    orphaned_at: '2026-03-07T10:00:00Z',
                    status: 'pending',
                },
                {
                    id: 2,
                    item_type: 'threat',
                    item_id: 11,
                    item_name: 'Orphaned Threat',
                    item_description: null,
                    item_identifier: null,
                    department_name: null,
                    previous_owner_name: 'Former CISO',
                    previous_owner_email: 'former-ciso@example.com',
                    orphaned_at: '2026-03-07T10:00:00Z',
                    status: 'pending',
                },
                {
                    id: 3,
                    item_type: 'process',
                    item_id: 74,
                    item_name: 'Orphaned Process',
                    item_description: 'Claims handling',
                    item_identifier: 'F74',
                    department_name: 'Operations',
                    previous_owner_name: 'Former Process Owner',
                    previous_owner_email: 'process-owner@example.com',
                    orphaned_at: '2026-03-07T10:00:00Z',
                    status: 'pending',
                },
            ],
            last_scan_at: '2026-03-07T10:00:00Z',
            scan_status: 'succeeded',
        });

        render(
            <MemoryRouter initialEntries={['/governance?type=risk']}>
                <GovernanceHarness />
            </MemoryRouter>,
            { wrapper: createWrapper() },
        );

        const processButton = await screen.findByRole('button', { name: /governance\.orphaned_processes/ });
        expect(processButton).toHaveAttribute('aria-pressed', 'false');
        processButton.focus();
        await user.keyboard('{Enter}');
        expect(screen.getByTestId('governance-location')).toHaveTextContent('?type=process');
        expect(await screen.findByText('Orphaned Process')).toBeInTheDocument();
        expect(processButton).toHaveAttribute('aria-pressed', 'true');

        await user.click(screen.getByRole('button', { name: 'History back' }));
        expect(await screen.findByText('Orphaned Risk')).toBeInTheDocument();
        expect(screen.getByTestId('governance-location')).toHaveTextContent('?type=risk');

        await user.click(screen.getByRole('button', { name: 'History forward' }));
        expect(await screen.findByText('Orphaned Process')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Set threat query' }));
        expect(await screen.findByText('Orphaned Threat')).toBeInTheDocument();
        expect(screen.getByTestId('governance-location')).toHaveTextContent('?type=threat');

        const riskButton = screen.getByRole('button', { name: /governance\.pending_orphans/ });
        riskButton.focus();
        await user.keyboard(' ');
        expect(screen.getByTestId('governance-location')).toHaveTextContent('?type=risk');
        expect(screen.getByText('governance.grand_total').closest('button')).toBeNull();
    });

    it('lays the stat cards out on an auto-fit grid instead of six fixed columns (RS-01)', async () => {
        render(
            <MemoryRouter>
                <GovernancePage />
            </MemoryRouter>,
            { wrapper: createWrapper() },
        );

        const card = await screen.findByTestId('governance-filter-card-risk');
        const grid = card.parentElement as HTMLElement;
        expect(grid.className).toContain('repeat(auto-fit,minmax(11rem,1fr))');
        expect(grid.className).not.toContain('lg:grid-cols-6');
        expect(grid.querySelectorAll('[data-testid^="governance-filter-card-"]')).toHaveLength(8);
    });

    it('titles the orphan table with an h2 for the active type, the stat cards being the only filter (SM-11)', async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter initialEntries={['/governance?type=risk']}>
                <GovernanceHarness />
            </MemoryRouter>,
            { wrapper: createWrapper() },
        );

        expect(await screen.findByRole('heading', { level: 2, name: 'governance.orphaned_risks_section' })).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /governance\.orphaned_threats/ }));
        expect(await screen.findByRole('heading', { level: 2, name: 'governance.orphaned_threats_section' })).toBeInTheDocument();
    });

    it('ties the live status to the data state and shows stale data as a banner (FB-02)', async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <GovernancePage />
            </MemoryRouter>,
            { wrapper: createWrapper() },
        );

        const status = await screen.findByTestId('governance-live-status');
        expect(status).toHaveTextContent('governance.live_status');
        expect(status).toHaveAttribute('data-tone', 'success');
        expect(screen.queryByText('governance.may_be_out_of_date')).not.toBeInTheDocument();

        getOverviewMock.mockRejectedValueOnce(new Error('poll failed'));
        await user.click(screen.getByRole('button', { name: 'governance.refresh' }));

        expect(await screen.findByText('governance.may_be_out_of_date')).toBeInTheDocument();
        expect(screen.getByTestId('governance-live-status')).toHaveTextContent('governance.live_status_stale');
        expect(screen.getByTestId('governance-live-status')).toHaveAttribute('data-tone', 'danger');
        // The last good list stays on screen under the banner.
        expect(screen.getByText('Orphaned Risk')).toBeInTheDocument();
    });
});
