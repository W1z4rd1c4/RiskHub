import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApprovalList } from '@/pages/approvals/ApprovalList';
import type { ApprovalRequest } from '@/types/approval';

function governedApproval(
    canViewPendingChanges: boolean,
    capabilityOverrides: Partial<ApprovalRequest['capabilities']> = {},
): ApprovalRequest {
    return {
        id: 84,
        resource_type: 'process',
        resource_id: 7,
        resource_name: 'F-0007 · Payments',
        action_type: 'edit',
        pending_changes: null,
        governed_mutation: {
            proposal_id: 'proposal-84',
            proposal_version: 1,
            mutation_kind: 'process_edit',
            before: { l1_process: 'Payments' },
            after: { l1_process: 'Payments v2' },
            derived_impact: {
                before: { cif: 'no', criticality_class: 'medium' },
                after: { cif: 'yes', criticality_class: 'critical' },
            },
            impacted_resources: [{ resource_type: 'process', resource_name: 'F-0007 · Payments' }],
        },
        status: 'pending',
        reason: 'Improve resilience',
        requested_by_id: 1,
        requested_by_name: 'Alice',
        requested_by_email: 'alice@example.test',
        resolved_by_id: null,
        resolved_by_name: null,
        resolved_at: null,
        resolution_notes: null,
        created_at: '2026-07-16T00:00:00Z',
        can_approve: false,
        can_reject: false,
        capabilities: {
            can_read: true,
            can_approve: false,
            can_reject: false,
            can_cancel: false,
            can_cancel_as_requester: false,
            can_cancel_as_resolver: false,
            can_view_pending_changes: canViewPendingChanges,
            can_view_resolution_notes: false,
            can_inspect_side_effects: false,
            is_requester: false,
            is_primary_approver: false,
            is_privileged_resolver: false,
            is_pending: true,
            requires_privileged_resolution: false,
            would_apply_side_effects_on_approve: false,
            ...capabilityOverrides,
        },
    };
}

const handlers = {
    onToggleRow: vi.fn(),
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onCancel: vi.fn(),
};
const t = (key: string) => key;

describe('ApprovalList governed Process mutation', () => {
    it('renders the governed before/after and derived impact in Pending/My Requests rows', () => {
        render(
            <ApprovalList
                approvals={[governedApproval(true)]}
                loading={false}
                expandedRows={new Set([84])}
                t={t as never}
                {...handlers}
            />,
        );

        expect(screen.getByTestId('approval-governed-mutation-84')).toBeInTheDocument();
        expect(screen.getByText('Payments v2')).toBeInTheDocument();
        expect(screen.getAllByText('F-0007 · Payments')).toHaveLength(2);
    });

    it('hides the complete proposal when the capability denies access', () => {
        render(
            <ApprovalList
                approvals={[governedApproval(false)]}
                loading={false}
                expandedRows={new Set([84])}
                t={t as never}
                {...handlers}
            />,
        );

        expect(screen.queryByTestId('approval-governed-mutation-84')).not.toBeInTheDocument();
        expect(screen.queryByText('Payments v2')).not.toBeInTheDocument();
    });

    it('does not render governed cancellation for a resolver', () => {
        render(
            <ApprovalList
                approvals={[
                    governedApproval(true, {
                        can_cancel: true,
                        can_cancel_as_requester: false,
                        can_cancel_as_resolver: true,
                        is_privileged_resolver: true,
                    }),
                ]}
                loading={false}
                expandedRows={new Set()}
                t={t as never}
                {...handlers}
            />,
        );

        expect(
            screen.queryByRole('button', { name: 'common:tooltips.cancel_request' }),
        ).not.toBeInTheDocument();
    });

    it('renders governed cancellation for the requester', () => {
        render(
            <ApprovalList
                approvals={[
                    governedApproval(true, {
                        can_cancel: true,
                        can_cancel_as_requester: true,
                        can_cancel_as_resolver: false,
                        is_requester: true,
                    }),
                ]}
                loading={false}
                expandedRows={new Set()}
                t={t as never}
                {...handlers}
            />,
        );

        expect(
            screen.getByRole('button', { name: 'common:tooltips.cancel_request' }),
        ).toBeInTheDocument();
    });
});
