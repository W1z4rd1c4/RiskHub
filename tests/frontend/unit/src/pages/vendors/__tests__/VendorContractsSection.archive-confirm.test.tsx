/**
 * GAP-C-06 / D10 / PM-1: a contract archive is always confirmed with the
 * archive intent; the reason is optional unless the Vendor's change is routed
 * through approval, and an approval-routed archive keeps the user on the
 * vendor with the pending notice (D12 / PM-2).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApprovalQueuedNotice } from '@/components/approvals/ApprovalQueuedNotice';
import { FeedbackProvider } from '@/contexts/FeedbackContext';
import i18n from '@/i18n';
import { VendorContractsSection } from '@/pages/vendors/VendorContractsSection';
import { vendorContractApi } from '@/services/vendorContractApi';

vi.mock('@/services/vendorContractApi', () => ({
    vendorContractApi: {
        getContracts: vi.fn(),
        createContract: vi.fn(),
        updateContract: vi.fn(),
        archiveContract: vi.fn(),
        restoreContract: vi.fn(),
    },
}));

vi.mock('@/services/assetApi', () => ({
    assetApi: { getClosedLists: vi.fn().mockResolvedValue({}) },
}));

const contract = {
    id: 5,
    vendor_id: 1,
    contract_reference: 'SML-2026-05',
    arrangement_type: null,
    main_contract: null,
    roi_scope: null,
    start_date: null,
    end_date: null,
    annual_cost: null,
    currency: null,
    derived: null,
    is_archived: false,
    capabilities: { can_read: true, can_update: true, can_archive: true, can_restore: false },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
};

function renderSection(protectedChangeRequiresApproval: boolean) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <FeedbackProvider>
                <MemoryRouter>
                    <ApprovalQueuedNotice />
                    <VendorContractsSection
                        vendorId={1}
                        canManageContracts
                        protectedChangeRequiresApproval={protectedChangeRequiresApproval}
                    />
                </MemoryRouter>
            </FeedbackProvider>
        </QueryClientProvider>,
    );
}

const archiveLabel = () => i18n.t('vendors:contracts.actions.archive');

describe('VendorContractsSection archive confirmation (GAP-C-06)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(vendorContractApi.getContracts).mockResolvedValue([contract] as never);
    });

    it('confirms an unprotected archive with an optional reason before archiving', async () => {
        vi.mocked(vendorContractApi.archiveContract).mockResolvedValue(undefined as never);
        renderSection(false);

        const rowAction = await screen.findByTestId('vendor-contract-archive-5');
        expect(rowAction.querySelector('svg.lucide-archive')).not.toBeNull();
        expect(rowAction.querySelector('svg.lucide-trash-2')).toBeNull();
        fireEvent.click(rowAction);

        expect(vendorContractApi.archiveContract).not.toHaveBeenCalled();
        const dialog = await screen.findByRole('alertdialog');
        const reason = within(dialog).getByRole('textbox');
        expect(reason).toHaveAttribute('aria-required', 'false');
        fireEvent.click(within(dialog).getByRole('button', { name: archiveLabel() }));

        await waitFor(() => expect(vendorContractApi.archiveContract).toHaveBeenCalledWith(1, 5, ''));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    });

    it('requires the reason when approval applies and surfaces the queued request on the vendor', async () => {
        vi.mocked(vendorContractApi.archiveContract).mockResolvedValue({
            status: 'approval_required',
            message: 'Queued',
            approval_id: 186,
            action_type: 'edit',
            pending_fields: ['is_archived'],
            proposal_id: 'proposal-contract-186',
            proposal_version: 1,
        } as never);
        renderSection(true);

        fireEvent.click(await screen.findByTestId('vendor-contract-archive-5'));
        const dialog = await screen.findByRole('alertdialog');
        const confirm = within(dialog).getByRole('button', { name: archiveLabel() });
        expect(confirm).toBeDisabled();
        fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Contract ended' } });
        fireEvent.click(confirm);

        await waitFor(() => expect(vendorContractApi.archiveContract).toHaveBeenCalledWith(1, 5, 'Contract ended'));
        const notice = await screen.findByTestId('approval-queued-notice');
        expect(within(notice).getByRole('link')).toHaveAttribute('href', '/approvals?tab=mine&approvalId=186');
        const toast = (await screen.findByText('Submitted for approval')).closest('li');
        expect(toast).toHaveAttribute('data-tone', 'success');
    });
});
