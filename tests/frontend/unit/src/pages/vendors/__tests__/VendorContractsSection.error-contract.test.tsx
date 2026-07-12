/**
 * Representative consumer regression for issue #61 (C4): a failed contracts
 * fetch must surface the shared table-error contract (retry affordance), never
 * render as an empty "no contracts" table.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetContracts = vi.fn();

vi.mock('@/services/vendorContractApi', () => ({
    vendorContractApi: {
        getContracts: (...args: unknown[]) => mockGetContracts(...args),
        createContract: vi.fn(),
        updateContract: vi.fn(),
        archiveContract: vi.fn(),
        restoreContract: vi.fn(),
    },
}));

vi.mock('@/services/assetApi', () => ({
    assetApi: {
        getClosedLists: vi.fn().mockResolvedValue({}),
    },
}));

import { VendorContractsSection } from '@/pages/vendors/VendorContractsSection';
import i18n from '@/i18n';

function renderSection() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <VendorContractsSection vendorId={1} canManageContracts={false} />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('VendorContractsSection error contract (#61 / C4)', () => {
    it('renders the table error state with a retry affordance when the fetch fails', async () => {
        mockGetContracts.mockRejectedValue(new Error('network down'));

        renderSection();

        const alert = await screen.findByRole('alert');
        expect(alert).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
        // The failure must NOT collapse into the empty "no contracts" state.
        expect(screen.queryByText(i18n.t('vendors:contracts.empty'))).not.toBeInTheDocument();
    });

    it('renders the localized empty state (not an error) when the fetch returns no rows', async () => {
        mockGetContracts.mockResolvedValue([]);

        renderSection();

        expect(await screen.findByText(i18n.t('vendors:contracts.empty'))).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});
