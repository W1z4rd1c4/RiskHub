/**
 * AX-04 / AX-01 / audit §4.8: the Process vendor-link pickers are labelled (not placeholder-only),
 * the service-description input is a real labelled `Input`, and the remove action names the vendor.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';
import { ProcessVendorLinksSection } from '@/pages/processes/ProcessVendorLinksSection';
import type { Process } from '@/types/process';

vi.mock('@/services/processApi', () => ({
    processApi: {
        getVendorLinks: vi.fn().mockResolvedValue([{
            id: 41,
            process_id: 4,
            vendor_id: 7,
            vendor_name: 'Core supplier',
            direct_service_description: 'Payments hosting',
            process_business_edit_blocked: false,
            capabilities: { can_delete: true },
            created_at: '2026-07-15T08:00:00Z',
        }]),
        addVendorLink: vi.fn(),
        removeVendorLink: vi.fn(),
    },
}));
vi.mock('@/services/vendorApi', () => ({
    vendorApi: { getVendors: vi.fn().mockResolvedValue({ items: [] }) },
}));

function renderSection(canManageLinks = true) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <ProcessVendorLinksSection process={{ id: 4 } as Process} canManageLinks={canManageLinks} />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('ProcessVendorLinksSection labels', () => {
    it('labels the vendor picker and the service description, and names the add and remove actions', async () => {
        const user = userEvent.setup();
        const { container } = renderSection();

        expect(await screen.findByRole('combobox', { name: 'Vendor' })).toBeInTheDocument();
        const description = screen.getByRole('textbox', { name: 'Direct service description (optional)' });
        expect(description).toBe(screen.getByTestId('process-vendor-link-description'));
        await user.type(description, 'Hosting');
        expect(description).toHaveValue('Hosting');
        expect(screen.getByRole('button', { name: 'Link' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Remove link: Core supplier' })).toBe(
            screen.getByTestId('process-vendor-link-remove-41'),
        );

        const results = await axe.run(container, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
            rules: { 'color-contrast': { enabled: false } },
        });
        expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
    });

    it('translates the labels in Czech and shows no editing controls when read-only', async () => {
        await i18n.changeLanguage('cs');
        const { unmount } = renderSection();
        expect(await screen.findByRole('combobox', { name: 'Dodavatel' })).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: /Popis přímé služby/ })).toBeInTheDocument();
        unmount();

        renderSection(false);
        expect(await screen.findByText('Core supplier')).toBeInTheDocument();
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
        expect(screen.queryByTestId('process-vendor-link-remove-41')).not.toBeInTheDocument();
    });
});
