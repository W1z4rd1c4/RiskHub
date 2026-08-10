/**
 * FR-P4-6 (S9 demote): archived contracts are demoted into a dimmed, visually
 * separated section (the VendorLinkedEntitiesTab convention) rather than
 * interleaved with the active rows. Formatting (dates/currency) is out of scope
 * here (P5) — these tests only pin the demotion + separation.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
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

function makeContract(overrides: Record<string, unknown>) {
    return {
        id: 1,
        contract_reference: 'SML',
        arrangement_type: null,
        main_contract: null,
        roi_scope: null,
        start_date: null,
        end_date: null,
        annual_cost: null,
        currency: null,
        derived: null,
        is_archived: false,
        capabilities: null,
        ...overrides,
    };
}

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

describe('VendorContractsSection archived demotion (FR-P4-6 / S9)', () => {
    it('separates archived contracts into a dimmed section, apart from active rows', async () => {
        mockGetContracts.mockResolvedValue([
            makeContract({ id: 1, contract_reference: 'SML-ACTIVE', is_archived: false }),
            makeContract({ id: 2, contract_reference: 'SML-ARCHIVED', is_archived: true }),
        ]);

        renderSection();

        // The active contract renders (outside the archived section).
        await screen.findByText('SML-ACTIVE');

        const archivedSection = screen.getByTestId('vendor-contracts-archived');
        // The archived contract lives inside the demoted section…
        expect(within(archivedSection).getByText('SML-ARCHIVED')).toBeInTheDocument();
        // …and the active one does not (they are separated, not interleaved).
        expect(within(archivedSection).queryByText('SML-ACTIVE')).not.toBeInTheDocument();

        // The section is labelled with the archived count and visually dimmed.
        expect(archivedSection).toHaveAttribute(
            'aria-label',
            i18n.t('vendors:contracts.archived_heading', { count: 1 }),
        );
        expect(archivedSection.querySelector('.opacity-60')).not.toBeNull();
    });

    it('shows the archived section without a contradictory empty state when every contract is archived', async () => {
        mockGetContracts.mockResolvedValue([
            makeContract({ id: 3, contract_reference: 'SML-ONLY-ARCHIVED', is_archived: true }),
        ]);

        renderSection();

        const archivedSection = await screen.findByTestId('vendor-contracts-archived');
        expect(within(archivedSection).getByText('SML-ONLY-ARCHIVED')).toBeInTheDocument();
        // The "no contracts" empty card must not show while archived rows are visible.
        expect(screen.queryByText(i18n.t('vendors:contracts.empty'))).not.toBeInTheDocument();
    });
});
