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

// N17 (R3b): when the cached contracts are ALL archived, the active/error-aware table is
// gated out, so a failed refetch used to be silent (the archived table carries no error
// contract). One shared banner must surface the error above BOTH sections regardless of
// which table is showing, while the (archived) rows are retained. Red on the pre-fix code
// (no error surface in the archived-only path).

function makeArchivedContract() {
    return {
        id: 9,
        contract_reference: 'ARCHIVED-ONLY',
        arrangement_type: null,
        main_contract: null,
        roi_scope: null,
        start_date: null,
        end_date: null,
        annual_cost: null,
        currency: null,
        derived: null,
        is_archived: true,
        capabilities: null,
    };
}

function renderSectionWithClient() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const utils = render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <VendorContractsSection vendorId={1} canManageContracts={false} />
            </MemoryRouter>
        </QueryClientProvider>,
    );
    return { queryClient, ...utils };
}

describe('VendorContractsSection archived-only refetch failure (N17 / R3b)', () => {
    it('surfaces one retry banner and keeps the archived rows when an archived-only refetch fails', async () => {
        mockGetContracts
            .mockResolvedValueOnce([makeArchivedContract()])
            .mockRejectedValue(new Error('refetch boom'));

        const { queryClient } = renderSectionWithClient();

        // First load: every contract is archived, so only the demoted archived table shows.
        expect(await screen.findByText('ARCHIVED-ONLY')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        // A refetch fails while the only cached rows are archived.
        await queryClient.refetchQueries().catch(() => {});

        // The failure now surfaces a retry banner (regardless of which table is showing)…
        expect(await screen.findByRole('alert')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
        // …and the archived rows are retained (never blanked).
        expect(screen.getByText('ARCHIVED-ONLY')).toBeInTheDocument();
    });
});
