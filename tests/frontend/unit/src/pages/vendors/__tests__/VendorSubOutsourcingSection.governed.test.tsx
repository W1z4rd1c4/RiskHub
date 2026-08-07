/**
 * Ticket #101 — protected Vendor sub-outsourcing maintenance is governed.
 *
 * Matrix over {create, edit, archive}: the reason is collected and forwarded,
 * a governed rejection (422 reason-required) surfaces as a visible alert, and
 * a 202 ApprovalQueuedResponse is treated as QUEUED (the requester lands on
 * the surfaced approval) — never as immediate success. Restore stays direct
 * even on a protected Vendor (focused regression), and an unprotected Vendor
 * never sees the reason UI.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@test/queryClient';

const subOutsourcingApiMocks = vi.hoisted(() => ({
    getEntries: vi.fn(),
    createEntry: vi.fn(),
    updateEntry: vi.fn(),
    archiveEntry: vi.fn(),
    restoreEntry: vi.fn(),
    getIctServiceTaxonomy: vi.fn(),
}));

vi.mock('@/services/vendorSubOutsourcingApi', () => ({
    vendorSubOutsourcingApi: subOutsourcingApiMocks,
}));
vi.mock('@/services/vendorContractApi', () => ({
    vendorContractApi: { getContracts: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/services/assetApi', () => ({
    assetApi: { getClosedLists: vi.fn().mockResolvedValue({}) },
}));
// Radix Select needs pointer APIs jsdom lacks; a native stand-in keeps the
// governed flow drivable (the VendorForm.test.tsx convention).
vi.mock('@/components/ui/ThemedSelect', () => ({
    ThemedSelect: ({ value, onValueChange, options, allowEmpty, emptyLabel, placeholder, triggerTestId }: {
        value: string;
        onValueChange: (value: string) => void;
        options: Array<{ value: string; label: string }>;
        allowEmpty?: boolean;
        emptyLabel?: string;
        placeholder?: string;
        triggerTestId?: string;
    }) => (
        <select
            aria-label={placeholder ?? 'select'}
            data-testid={triggerTestId}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
        >
            {allowEmpty ? <option value="">{emptyLabel ?? placeholder ?? 'empty'}</option> : null}
            {options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
            ))}
        </select>
    ),
}));

import { VendorSubOutsourcingSection } from '@/pages/vendors/VendorSubOutsourcingSection';
import { vendorContractApi } from '@/services/vendorContractApi';
import i18n from '@/i18n';

const CONTRACT = {
    id: 11,
    vendor_id: 1,
    contract_reference: 'GOV-CTR-11',
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
};

const ACTIVE_ENTRY = {
    id: 7,
    vendor_id: 1,
    contract_id: 11,
    predecessor_id: null,
    sub_provider_name: 'Governed Sub Provider',
    is_archived: false,
    capabilities: { can_read: true, can_update: true, can_archive: true, can_restore: false },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
};

const ARCHIVED_ENTRY = {
    ...ACTIVE_ENTRY,
    id: 8,
    sub_provider_name: 'Archived Sub Provider',
    is_archived: true,
    capabilities: { can_read: true, can_update: false, can_archive: false, can_restore: true },
};

const queuedResponse = {
    status: 'approval_required',
    message: 'Queued',
    approval_id: 186,
    action_type: 'edit',
    pending_fields: ['sub_outsourcing'],
    proposal_id: 'proposal-vendor-sub-outsourcing-186',
    proposal_version: 1,
};

const REASON = 'Material register change';

function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location">{location.pathname}{location.search}</div>;
}

function renderSection(protectedChangeRequiresApproval: boolean) {
    const client = createTestQueryClient();
    return render(
        <QueryClientProvider client={client}>
            <MemoryRouter>
                <VendorSubOutsourcingSection
                    vendorId={1}
                    canManageSubOutsourcing
                    protectedChangeRequiresApproval={protectedChangeRequiresApproval}
                />
                <LocationProbe />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

async function openCreateFormWithContract() {
    fireEvent.click(await screen.findByTestId('vendor-sub-outsourcing-add'));
    const contractSelect = screen.getByTestId('vendor-sub-outsourcing-field-contract_id');
    // The contract choices arrive with the contracts query — wait them in.
    await within(contractSelect).findByRole('option', { name: CONTRACT.contract_reference });
    fireEvent.change(contractSelect, { target: { value: String(CONTRACT.id) } });
    fireEvent.change(screen.getByTestId('vendor-sub-outsourcing-field-sub_provider_name'), {
        target: { value: 'Fresh Sub Provider' },
    });
}

async function openEditForm() {
    fireEvent.click(await screen.findByTestId(`vendor-sub-outsourcing-edit-${ACTIVE_ENTRY.id}`));
    fireEvent.change(screen.getByTestId('vendor-sub-outsourcing-field-sub_provider_name'), {
        target: { value: 'Edited Sub Provider' },
    });
}

function fillFormReasonAndSave(reason: string) {
    fireEvent.change(screen.getByTestId('vendor-sub-outsourcing-request-reason'), {
        target: { value: reason },
    });
    fireEvent.click(screen.getByTestId('vendor-sub-outsourcing-form-save'));
}

async function archiveThroughDialog(reason: string) {
    fireEvent.click(await screen.findByTestId(`vendor-sub-outsourcing-archive-${ACTIVE_ENTRY.id}`));
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', {
        name: i18n.t('vendors:sub_outsourcing.actions.archive'),
    });
    // The dialog's confirm stays disabled until a reason is collected.
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: reason } });
    fireEvent.click(confirm);
}

beforeEach(() => {
    vi.clearAllMocks();
    subOutsourcingApiMocks.getEntries.mockResolvedValue([ACTIVE_ENTRY, ARCHIVED_ENTRY]);
    subOutsourcingApiMocks.getIctServiceTaxonomy.mockResolvedValue([]);
    vi.mocked(vendorContractApi.getContracts).mockResolvedValue([CONTRACT]);
});

/** Ticket #101 matrix: {create, edit, archive} governed sub-outsourcing UX. */
const matrix = [
    {
        action: 'create',
        mutation: subOutsourcingApiMocks.createEntry,
        submitWithReason: async (reason: string) => {
            await openCreateFormWithContract();
            fillFormReasonAndSave(reason);
        },
        expectForwardedReason: (reason: string) => {
            expect(subOutsourcingApiMocks.createEntry).toHaveBeenCalledWith(
                1,
                expect.objectContaining({ contract_id: 11, sub_provider_name: 'Fresh Sub Provider' }),
                reason,
            );
        },
        expectRetryStateKept: () => {
            expect(screen.getByTestId('vendor-sub-outsourcing-form')).toBeInTheDocument();
            expect(screen.getByTestId('vendor-sub-outsourcing-field-contract_id')).toHaveValue(String(CONTRACT.id));
            expect(screen.getByTestId('vendor-sub-outsourcing-field-sub_provider_name')).toHaveValue('Fresh Sub Provider');
            expect(screen.getByTestId('vendor-sub-outsourcing-request-reason')).toHaveValue(REASON);
        },
    },
    {
        action: 'edit',
        mutation: subOutsourcingApiMocks.updateEntry,
        submitWithReason: async (reason: string) => {
            await openEditForm();
            fillFormReasonAndSave(reason);
        },
        expectForwardedReason: (reason: string) => {
            expect(subOutsourcingApiMocks.updateEntry).toHaveBeenCalledWith(
                1,
                ACTIVE_ENTRY.id,
                expect.objectContaining({ sub_provider_name: 'Edited Sub Provider' }),
                reason,
            );
        },
        expectRetryStateKept: () => {
            expect(screen.getByTestId('vendor-sub-outsourcing-form')).toBeInTheDocument();
            expect(screen.getByTestId('vendor-sub-outsourcing-field-sub_provider_name')).toHaveValue('Edited Sub Provider');
            expect(screen.getByTestId('vendor-sub-outsourcing-request-reason')).toHaveValue(REASON);
        },
    },
    {
        action: 'archive',
        mutation: subOutsourcingApiMocks.archiveEntry,
        submitWithReason: archiveThroughDialog,
        expectForwardedReason: (reason: string) => {
            expect(subOutsourcingApiMocks.archiveEntry).toHaveBeenCalledWith(1, ACTIVE_ENTRY.id, reason);
        },
        expectRetryStateKept: () => {
            // pendingArchive is only cleared on success, so the dialog stays
            // open for retry. ConfirmDialog clears its reason input on confirm
            // by design (ConfirmDialog.tsx handleConfirm), so only the open
            // retry surface is locked here — not a retained reason value.
            expect(screen.getByRole('alertdialog')).toBeInTheDocument();
        },
    },
] as const;

describe('protected Vendor sub-outsourcing governed UX (#101)', () => {
    it.each(matrix)(
        '$action collects a reason, forwards it, and surfaces the 202 as QUEUED',
        async ({ mutation, submitWithReason, expectForwardedReason }) => {
            mutation.mockResolvedValue(queuedResponse);

            renderSection(true);
            await submitWithReason(REASON);

            await waitFor(() => expectForwardedReason(REASON));
            // 202 is QUEUED, never success: surface the pending approval.
            await waitFor(() => {
                expect(screen.getByTestId('location')).toHaveTextContent('/approvals?tab=mine&approvalId=186');
            });
        },
    );

    it.each(matrix)(
        '$action surfaces a rejected governed mutation (422 reason-required) as a visible alert and keeps the entry surface open for retry',
        async ({ mutation, submitWithReason, expectRetryStateKept }) => {
            mutation.mockRejectedValue(Object.assign(new Error('reason required'), { status: 422 }));

            renderSection(true);
            await submitWithReason(REASON);

            const alert = await screen.findByRole('alert');
            expect(alert).toHaveTextContent(String(i18n.t('vendors:sub_outsourcing.errors.mutation_failed')));
            expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
            // onError intentionally never calls closeForm/setPendingArchive(null)
            // (VendorSubOutsourcingSection handleMutationError): the user's
            // entries stay put so the rejected mutation can be retried.
            expectRetryStateKept();
        },
    );

    it('blocks a blank governed form reason locally with an accessible field error', async () => {
        renderSection(true);
        await openCreateFormWithContract();

        fireEvent.click(screen.getByTestId('vendor-sub-outsourcing-form-save'));

        const reason = screen.getByTestId('vendor-sub-outsourcing-request-reason');
        expect(reason).toHaveAttribute('aria-invalid', 'true');
        expect(reason).toHaveAccessibleDescription(
            new RegExp(String(i18n.t('vendors:errors.request_reason_required'))),
        );
        expect(subOutsourcingApiMocks.createEntry).not.toHaveBeenCalled();
    });

    it('skips the reason UI entirely and mutates directly when the Vendor is not protected', async () => {
        subOutsourcingApiMocks.createEntry.mockResolvedValue({ ...ACTIVE_ENTRY, id: 9 });

        renderSection(false);
        await openCreateFormWithContract();
        expect(screen.queryByTestId('vendor-sub-outsourcing-request-reason')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('vendor-sub-outsourcing-form-save'));

        await waitFor(() => {
            expect(subOutsourcingApiMocks.createEntry).toHaveBeenCalledWith(1, expect.any(Object), '');
        });
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
    });

    it('archives directly without a reason dialog when the Vendor is not protected', async () => {
        subOutsourcingApiMocks.archiveEntry.mockResolvedValue(undefined);

        renderSection(false);
        fireEvent.click(await screen.findByTestId(`vendor-sub-outsourcing-archive-${ACTIVE_ENTRY.id}`));

        await waitFor(() => {
            expect(subOutsourcingApiMocks.archiveEntry).toHaveBeenCalledWith(1, ACTIVE_ENTRY.id, '');
        });
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('restore stays DIRECT on a protected Vendor: no reason, no dialog, no queue', async () => {
        subOutsourcingApiMocks.restoreEntry.mockResolvedValue({ ...ARCHIVED_ENTRY, is_archived: false });

        renderSection(true);
        fireEvent.click(await screen.findByTestId(`vendor-sub-outsourcing-restore-${ARCHIVED_ENTRY.id}`));

        await waitFor(() => {
            expect(subOutsourcingApiMocks.restoreEntry).toHaveBeenCalledWith(1, ARCHIVED_ENTRY.id);
        });
        expect(subOutsourcingApiMocks.restoreEntry.mock.calls[0]).toHaveLength(2);
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
    });
});
