import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { ApprovalQueuedNotice } from '@/components/approvals/ApprovalQueuedNotice';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VendorLinkedControlsTab } from '@/components/vendors/VendorLinkedControlsTab';
import { VendorLinkedKRIsTab } from '@/components/vendors/VendorLinkedKRIsTab';
import { VendorLinkedRisksTab } from '@/components/vendors/VendorLinkedRisksTab';

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { count?: number }) => (
            options?.count === undefined ? key : `${key}:${options.count}`
        ),
    }),
}));

const linkApiMocks = vi.hoisted(() => ({
    getLinkedRisks: vi.fn(),
    linkRisk: vi.fn(),
    unlinkRisk: vi.fn(),
    getLinkedControls: vi.fn(),
    linkControl: vi.fn(),
    unlinkControl: vi.fn(),
    getLinkedKRIs: vi.fn(),
    linkKRI: vi.fn(),
    unlinkKRI: vi.fn(),
}));

vi.mock('@/services/vendorLinkApi', () => ({ vendorLinkApi: linkApiMocks }));

vi.mock('@/components/LinkManagementDialog', () => ({
    LinkManagementDialog: ({ isOpen, onLink, onUnlink }: {
        isOpen: boolean;
        onLink: (targetId: number, effectiveness: string, notes?: string) => Promise<void>;
        onUnlink: (targetId: number) => Promise<void>;
    }) => (
        isOpen ? (
            <div role="dialog">
                <button type="button" onClick={() => { void onLink(501, 'medium', ''); }}>
                    mock-link-target
                </button>
                <button type="button" onClick={() => { void onUnlink(501); }}>
                    mock-unlink-target
                </button>
            </div>
        ) : null
    ),
}));

const queuedResponse = {
    status: 'approval_required',
    message: 'Queued',
    approval_id: 186,
    action_type: 'edit',
    pending_fields: ['relationship'],
    proposal_id: 'proposal-vendor-link-186',
    proposal_version: 1,
};

function LocationProbe() {
    const location = useLocation();
    return <><div data-testid="location">{location.pathname}{location.search}</div><output data-testid="location-state">{JSON.stringify(location.state)}</output></>;
}

function tabView(tab: 'risk' | 'control' | 'kri', protectedChangeRequiresApproval: boolean, vendorId = 7) {
    const tabElement = tab === 'risk'
        ? (
            <VendorLinkedRisksTab
                vendorId={vendorId}
                canCreateRisk
                canEdit
                protectedChangeRequiresApproval={protectedChangeRequiresApproval}
                onAddRisk={vi.fn()}
                onNavigateToRisk={vi.fn()}
            />
        )
        : tab === 'control'
            ? (
                <VendorLinkedControlsTab
                    vendorId={vendorId}
                    canCreateControl
                    canEdit
                    protectedChangeRequiresApproval={protectedChangeRequiresApproval}
                    onAddControl={vi.fn()}
                    onNavigateToControl={vi.fn()}
                />
            )
            : (
                <VendorLinkedKRIsTab
                    vendorId={vendorId}
                    canCreateKri
                    canEdit
                    protectedChangeRequiresApproval={protectedChangeRequiresApproval}
                    onAddKri={vi.fn()}
                    onNavigateToKri={vi.fn()}
                />
            );
    return (
        <MemoryRouter>
            <ApprovalQueuedNotice />
            {tabElement}
            <LocationProbe />
        </MemoryRouter>,
    );
}

function renderTab(tab: 'risk' | 'control' | 'kri', protectedChangeRequiresApproval: boolean) {
    return render(tabView(tab, protectedChangeRequiresApproval));
}

beforeEach(() => {
    vi.clearAllMocks();
    linkApiMocks.getLinkedRisks.mockResolvedValue([]);
    linkApiMocks.getLinkedControls.mockResolvedValue([]);
    linkApiMocks.getLinkedKRIs.mockResolvedValue([]);
});

/** Ticket #100 matrix: {risk,control,kri} x {add,remove} governed link UX. */
const matrix = [
    { tab: 'risk', action: 'add', mutation: linkApiMocks.linkRisk, trigger: 'mock-link-target' },
    { tab: 'risk', action: 'remove', mutation: linkApiMocks.unlinkRisk, trigger: 'mock-unlink-target' },
    { tab: 'control', action: 'add', mutation: linkApiMocks.linkControl, trigger: 'mock-link-target' },
    { tab: 'control', action: 'remove', mutation: linkApiMocks.unlinkControl, trigger: 'mock-unlink-target' },
    { tab: 'kri', action: 'add', mutation: linkApiMocks.linkKRI, trigger: 'mock-link-target' },
    { tab: 'kri', action: 'remove', mutation: linkApiMocks.unlinkKRI, trigger: 'mock-unlink-target' },
] as const;

describe('protected Vendor link/unlink governed UX (#100)', () => {
    it.each(matrix)(
        '$tab $action collects a reason, forwards it, and surfaces the queued approval',
        async ({ tab, mutation, trigger }) => {
            mutation.mockResolvedValue(queuedResponse);

            renderTab(tab, true);
            fireEvent.click(screen.getByText('links.actions.link_existing'));
            fireEvent.click(await screen.findByText(trigger));

            // The mutation must wait for the collected reason.
            expect(mutation).not.toHaveBeenCalled();
            const reasonDialog = await screen.findByRole('alertdialog');
            fireEvent.change(within(reasonDialog).getByRole('textbox'), {
                target: { value: 'Material register change' },
            });
            fireEvent.click(within(reasonDialog).getByText('vendors:link_approval.continue'));

            await waitFor(() => {
                expect(mutation).toHaveBeenCalledWith(7, 501, 'Material register change');
            });
            // 202 is QUEUED, never success (D12 / PM-2): the user stays on the
            // vendor with the persistent pending notice linking to the request.
            const notice = await screen.findByTestId('approval-queued-notice');
            expect(within(notice).getByRole('link')).toHaveAttribute('href', '/approvals?tab=mine&approvalId=186');
            expect(screen.getByTestId('location')).toHaveTextContent('/');
        },
    );

    it('skips the reason dialog and links directly when the Vendor is not protected', async () => {
        linkApiMocks.linkRisk.mockResolvedValue({ status: 'linked' });

        renderTab('risk', false);
        fireEvent.click(screen.getByText('links.actions.link_existing'));
        fireEvent.click(await screen.findByText('mock-link-target'));

        await waitFor(() => {
            expect(linkApiMocks.linkRisk).toHaveBeenCalledWith(7, 501, undefined);
        });
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent('/');
    });

    it('surfaces a rejected governed mutation (422 reason-required) as a visible error', async () => {
        linkApiMocks.linkRisk.mockRejectedValue(
            Object.assign(new Error('reason required'), { status: 422 }),
        );

        renderTab('risk', true);
        fireEvent.click(screen.getByText('links.actions.link_existing'));
        fireEvent.click(await screen.findByText('mock-link-target'));
        const reasonDialog = await screen.findByRole('alertdialog');
        fireEvent.change(within(reasonDialog).getByRole('textbox'), {
            target: { value: 'Material register change' },
        });
        fireEvent.click(within(reasonDialog).getByText('vendors:link_approval.continue'));

        expect(await screen.findByText('register_links.errors.mutation_failed')).toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent('/');
        // The reason dialog stays open for correction — no silent success.
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });
});


describe.each(matrix)('$tab $action mutation generation', ({ tab, mutation, trigger }) => {
    it.each(['rejected-after-switch', 'pending-after-return'])('ignores %s from a previous owner generation', async (completion) => {
        let resolve!: (value: unknown) => void;
        let reject!: (error: Error) => void;
        mutation.mockReturnValueOnce(new Promise((res, rej) => { resolve = res; reject = rej; }));
        const view = renderTab(tab as 'risk' | 'control' | 'kri', true);
        fireEvent.click(await screen.findByText('links.actions.link_existing'));
        fireEvent.click(screen.getByText(trigger));
        const dialog = screen.getByRole('alertdialog');
        fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Owner A rationale' } });
        fireEvent.submit(dialog.querySelector('form')!);
        await waitFor(() => expect(mutation).toHaveBeenCalledOnce());
        view.rerender(tabView(tab as 'risk' | 'control' | 'kri', true, 8));
        await act(async () => { await Promise.resolve(); });
        if (completion === 'pending-after-return') {
            view.rerender(tabView(tab as 'risk' | 'control' | 'kri', true, 7));
            await act(async () => { await Promise.resolve(); });
        }
        await act(async () => {
            if (completion === 'rejected-after-switch') reject(new Error('Old owner rejection'));
            else resolve({ ...queuedResponse, proposal_id: '10000000-0000-4000-8000-000000000186' });
        });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByTestId('location-state')).not.toHaveTextContent('approvalQueued');
    });
});
