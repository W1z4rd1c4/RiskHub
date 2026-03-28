import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
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
});
