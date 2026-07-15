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

vi.mock('@/i18n/hooks', () => ({
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
    OrphanedItemsTable: ({ items }: { items: Array<{ item_name: string }> }) => <div>{items.map((item) => item.item_name).join(', ')}</div>,
    ResolveOrphanModal: () => null,
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
});
