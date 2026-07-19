/**
 * FR-P4-8 (P6): removing a link is a one-click destructive action, so it must
 * route through the governed reason dialog — nothing mutates until the user
 * supplies a reason and confirms, making a mis-click recoverable.
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
import { processApi } from '@/services/processApi';
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
        {
            id: 10,
            process_id: 100,
            process_name: 'Payroll',
            process_business_edit_blocked: false,
            is_primary: false,
            significance: null,
            spof: null,
        },
    ]);
    (processApi.getProcesses as ReturnType<typeof vi.fn>).mockResolvedValue({
        items: [{
            id: 100,
            derived: { cif: 'yes' },
            capabilities: { protected_change_requires_approval: true },
        }],
    });
});

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('AssetLinkSections link removal (FR-P4-8 / P6)', () => {
    it('requires a reason and only removes the Process link after confirmation', async () => {
        renderSection();

        const removeButton = await screen.findByTestId('asset-process-link-remove-100');
        fireEvent.click(removeButton);

        // The click alone must not mutate — it only opens the confirm dialog.
        expect(mockRemoveProcessLink).not.toHaveBeenCalled();

        const dialog = screen.getByRole('alertdialog');
        expect(within(dialog).getByText(i18n.t('processes:link_approval.link_remove.title'))).toBeInTheDocument();

        fireEvent.change(within(dialog).getByRole('textbox', { name: /request reason/i }), {
            target: { value: 'Remove obsolete dependency' },
        });
        fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('processes:link_approval.continue') }));
        await waitFor(() => expect(mockRemoveProcessLink).toHaveBeenCalledWith(
            1,
            100,
            'Remove obsolete dependency',
        ));
    });

    it('cancelling the dialog leaves the link untouched', async () => {
        renderSection();

        fireEvent.click(await screen.findByTestId('asset-process-link-remove-100'));

        const dialog = screen.getByRole('alertdialog');
        fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('common:actions.cancel') }));

        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(mockRemoveProcessLink).not.toHaveBeenCalled();
    });

    it('confirms a directly applied non-protected link without forcing a discarded reason', async () => {
        (processApi.getProcesses as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [{
                id: 100,
                derived: { cif: 'no' },
                capabilities: { protected_change_requires_approval: true },
            }],
        });
        renderSection();

        fireEvent.click(await screen.findByTestId('asset-process-link-remove-100'));
        const dialog = screen.getByRole('alertdialog');
        expect(within(dialog).queryByRole('textbox', { name: /request reason/i })).not.toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('processes:link_approval.continue') }));

        await waitFor(() => expect(mockRemoveProcessLink).toHaveBeenCalledWith(1, 100, ''));
    });

    it('disables Process relationship actions while the authoritative impact lock is active', async () => {
        (assetApi.getProcessLinks as ReturnType<typeof vi.fn>).mockResolvedValue([{
            id: 10,
            process_id: 100,
            process_name: 'Payroll',
            process_business_edit_blocked: true,
            is_primary: false,
            significance: null,
            spof: null,
        }]);
        renderSection();

        expect(await screen.findByTestId('asset-process-link-remove-100')).toBeDisabled();
        expect(screen.getByTestId('asset-process-link-set-primary-100')).toBeDisabled();
        expect(screen.getByText(/pending governed change/i)).toBeInTheDocument();
        expect(mockRemoveProcessLink).not.toHaveBeenCalled();
    });
});
