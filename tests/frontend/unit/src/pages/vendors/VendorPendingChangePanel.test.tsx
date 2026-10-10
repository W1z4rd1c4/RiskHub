import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PendingChangePanel } from '@/components/approvals/PendingChangePanel';
import type { VendorPendingChangeRead } from '@/types/vendor';

const safePendingChange: VendorPendingChangeRead = {
    approval_id: 87,
    mutation_kind: 'vendor.edit',
    reason: 'Critical service scope changed',
    requested_by_name: 'Alice Requester',
    requested_at: '2026-07-30T08:30:00Z',
    before: { name: 'Payments provider' },
    after: { name: 'Critical payments provider' },
    derived_impact: {
        before: { tier: 'standard' },
        after: { tier: 'critical' },
    },
    impacted_resources: [
        { resource_type: 'vendor', resource_name: 'Payments provider' },
    ],
    relationship_change: null,
    capabilities: {
        can_view_diff: true,
        can_cancel: true,
    },
};

/**
 * D13 / GAP-D-07: the Vendor detail and blocked-edit views render the shared
 * `PendingChangePanel` with the vendors namespace (the former
 * `VendorPendingChangePanel` is folded into it).
 */
describe('Vendor pending change (shared PendingChangePanel)', () => {
    it('shows the authorized Vendor diff and exposes an accessible cancel action', () => {
        const onCancel = vi.fn();

        render(
            <PendingChangePanel
                pendingChange={safePendingChange}
                namespace="vendors"
                testIdPrefix="vendor"
                onCancel={onCancel}
            />,
        );

        const panel = screen.getByTestId('vendor-pending-change');
        expect(panel).toHaveAttribute('aria-labelledby', 'vendor-pending-change-title');
        expect(screen.getByTestId('vendor-pending-change-diff')).toBeInTheDocument();
        expect(screen.getByText('Protected change')).toBeInTheDocument();

        expect(screen.getByRole('heading', { name: 'Pending approval' })).toBeInTheDocument();
        expect(screen.getByText('Critical service scope changed')).toBeInTheDocument();
        expect(screen.getAllByText('Payments provider')).toHaveLength(2);
        expect(screen.getByText('Critical payments provider')).toBeInTheDocument();
        expect(screen.getByText('Vendor tier')).toBeInTheDocument();
        expect(screen.getByText('Standard provider')).toBeInTheDocument();
        expect(screen.getByText('Critical provider')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it('fails closed when the requester cannot view the proposal diff', () => {
        render(
            <PendingChangePanel
                namespace="vendors"
                testIdPrefix="vendor"
                pendingChange={{
                    ...safePendingChange,
                    reason: '',
                    requested_by_name: null,
                    before: {},
                    after: {},
                    derived_impact: {},
                    impacted_resources: [],
                    capabilities: {
                        can_view_diff: false,
                        can_cancel: false,
                    },
                }}
                onCancel={vi.fn()}
            />,
        );

        expect(screen.getByText('Proposal details are restricted.')).toBeInTheDocument();
        expect(screen.queryByText('Critical service scope changed')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeInTheDocument();
    });
});
