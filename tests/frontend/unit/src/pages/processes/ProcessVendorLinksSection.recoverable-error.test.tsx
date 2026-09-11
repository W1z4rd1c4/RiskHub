import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';
import { ProcessVendorLinksSection } from '@/pages/processes/ProcessVendorLinksSection';
import { processApi } from '@/services/processApi';
import type { Process } from '@/types/process';

vi.mock('@/services/processApi', () => ({
    processApi: {
        getVendorLinks: vi.fn().mockResolvedValue([{
            id: 41,
            process_id: 4,
            vendor_id: 7,
            vendor_name: 'Core supplier',
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

describe('ProcessVendorLinksSection recoverable error', () => {
    it('keeps a rejected link error and rationale inside its open dialog', async () => {
        vi.mocked(processApi.removeVendorLink).mockRejectedValueOnce(new Error('rejected'));
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });
        render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>
                    <ProcessVendorLinksSection
                        process={{
                            id: 4,
                            derived: { cif: 'yes' },
                            capabilities: { protected_change_requires_approval: true },
                        } as Process}
                        canManageLinks
                    />
                </MemoryRouter>
            </QueryClientProvider>,
        );

        fireEvent.click(await screen.findByTestId('process-vendor-link-remove-41'));
        let dialog = screen.getByRole('alertdialog');
        const reason = within(dialog).getByRole('textbox', { name: /request reason/i });
        fireEvent.change(reason, { target: { value: 'Retain Process link rationale' } });
        fireEvent.click(within(dialog).getByRole('button', {
            name: i18n.t('processes:link_approval.continue'),
        }));

        expect(await within(dialog).findByRole('alert')).toHaveTextContent(
            i18n.t('processes:links.errors.mutation_failed'),
        );
        expect(reason).toHaveValue('Retain Process link rationale');
        expect(screen.getAllByText(i18n.t('processes:links.errors.mutation_failed'))).toHaveLength(1);

        fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('common:actions.cancel') }));
        fireEvent.click(screen.getByTestId('process-vendor-link-remove-41'));
        dialog = screen.getByRole('alertdialog');
        expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    });
});
