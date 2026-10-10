/**
 * AX-04 / audit §4.8: the link pickers of the Asset page carry a visible label that survives
 * a selected value (WCAG 3.3.2), not only a placeholder, and every add control is named.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import * as axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Asset } from '@/types/asset';

vi.mock('@/services/assetApi', () => ({
    assetApi: {
        getProcessLinks: vi.fn().mockResolvedValue([]),
        getAssetLinks: vi.fn().mockResolvedValue([]),
        getVendorLinks: vi.fn().mockResolvedValue([]),
        getClosedLists: vi.fn().mockResolvedValue({}),
        getAssets: vi.fn().mockResolvedValue({ items: [] }),
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

import { AssetLinkSections } from '@/pages/assets/AssetLinkSections';
import i18n from '@/i18n';

function renderSections(canManageLinks = true) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <AssetLinkSections asset={{ id: 1 } as unknown as Asset} canManageLinks={canManageLinks} />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

beforeEach(async () => {
    await i18n.changeLanguage('en');
});

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('AssetLinkSections picker labels', () => {
    it('names every picker with a visible label and the add buttons with their action', async () => {
        renderSections();

        expect(await screen.findByRole('combobox', { name: 'Process' })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Direction' })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Asset' })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Vendor' })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'ICT service (S-code)' })).toHaveAttribute('aria-required', 'true');
        expect(screen.getByRole('combobox', { name: 'Link significance (optional)' })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Vendor role (optional)' })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Contract reference (optional)' })).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: 'Primary Process' })).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Link' })).toHaveLength(3);
    });

    it('never names a picker only by its placeholder', async () => {
        renderSections();
        await screen.findByRole('combobox', { name: 'Process' });

        for (const combobox of screen.getAllByRole('combobox')) {
            expect(combobox).not.toHaveAccessibleName(/^Select an? /);
            expect(combobox).not.toHaveAccessibleName('Not set');
            expect(combobox.getAttribute('aria-labelledby')).toBeTruthy();
        }
    });

    it('associates each visible label with its control', async () => {
        const { container } = renderSections();
        const processPicker = await screen.findByRole('combobox', { name: 'Process' });

        const label = container.querySelector(`label[for="${processPicker.id}"]`);
        expect(label).not.toBeNull();
        expect(within(label as HTMLElement).getByText('Process')).toBeInTheDocument();
    });

    it('translates the picker labels in Czech', async () => {
        await i18n.changeLanguage('cs');
        renderSections();

        expect(await screen.findByRole('combobox', { name: 'Proces' })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Aktivum' })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Dodavatel' })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Směr vazby' })).toBeInTheDocument();
    });

    it('passes the accessibility scan with the add forms open and renders no pickers when read-only', async () => {
        const { container, unmount } = renderSections();
        await screen.findByRole('combobox', { name: 'Process' });

        const results = await axe.run(container, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
            rules: { 'color-contrast': { enabled: false } },
        });
        expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
        unmount();

        renderSections(false);
        expect(await screen.findAllByText(/No (Processes|Asset|Vendors) linked yet|No Asset links yet/)).not.toHaveLength(0);
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });
});
