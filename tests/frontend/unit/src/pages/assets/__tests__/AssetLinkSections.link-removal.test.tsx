/**
 * FR-P4-8 (P6): removing a link is a one-click destructive action, so it must
 * route through the shared ConfirmDialog — nothing mutates until the user
 * confirms, making a mis-click recoverable.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Asset } from '@/types/asset';

const mockRemoveProcessLink = vi.fn().mockResolvedValue({});

vi.mock('@/services/assetApi', () => ({
    assetApi: {
        getProcessLinks: vi.fn(),
        getAssetLinks: vi.fn().mockResolvedValue([]),
        getVendorLinks: vi.fn().mockResolvedValue([]),
        getClosedLists: vi.fn().mockResolvedValue({}),
        getAssets: vi.fn().mockResolvedValue({ items: [] }),
        addProcessLink: vi.fn(),
        updateProcessLink: vi.fn(),
        removeProcessLink: (...args: unknown[]) => mockRemoveProcessLink(...args),
        addAssetLink: vi.fn(),
        removeAssetLink: vi.fn(),
        addVendorLink: vi.fn(),
        removeVendorLink: vi.fn(),
    },
}));

vi.mock('@/services/processApi', () => ({
    processApi: { getProcesses: vi.fn().mockResolvedValue({ items: [] }) },
}));

vi.mock('@/services/vendorApi', () => ({
    vendorApi: { getVendors: vi.fn().mockResolvedValue({ items: [] }) },
}));

vi.mock('@/services/vendorContractApi', () => ({
    vendorContractApi: { getContracts: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/services/vendorSubOutsourcingApi', () => ({
    vendorSubOutsourcingApi: { getIctServiceTaxonomy: vi.fn().mockResolvedValue([]) },
}));

import { assetApi } from '@/services/assetApi';
import { AssetLinkSections } from '@/pages/assets/AssetLinkSections';
import i18n from '@/i18n';

const asset = { id: 1 } as unknown as Asset;

function renderSection() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <AssetLinkSections asset={asset} canManageLinks />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    mockRemoveProcessLink.mockResolvedValue({});
    (assetApi.getProcessLinks as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 10, process_id: 100, process_name: 'Payroll', is_primary: false, significance: null, spof: null },
    ]);
});

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('AssetLinkSections link removal (FR-P4-8 / P6)', () => {
    it('opens a ConfirmDialog and only removes the link after confirmation', async () => {
        renderSection();

        const removeButton = await screen.findByTestId('asset-process-link-remove-100');
        fireEvent.click(removeButton);

        // The click alone must not mutate — it only opens the confirm dialog.
        expect(mockRemoveProcessLink).not.toHaveBeenCalled();

        const dialog = screen.getByRole('alertdialog');
        expect(within(dialog).getByText(i18n.t('assets:links.remove_confirm.title'))).toBeInTheDocument();
        // The dialog names the link being removed (recoverable framing).
        expect(dialog).toHaveTextContent('Payroll');

        // Confirming runs the removal with (assetId, processId).
        fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('assets:links.remove') }));
        await waitFor(() => expect(mockRemoveProcessLink).toHaveBeenCalledWith(1, 100));
    });

    it('cancelling the dialog leaves the link untouched', async () => {
        renderSection();

        fireEvent.click(await screen.findByTestId('asset-process-link-remove-100'));

        const dialog = screen.getByRole('alertdialog');
        fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('common:actions.cancel') }));

        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(mockRemoveProcessLink).not.toHaveBeenCalled();
    });
});
