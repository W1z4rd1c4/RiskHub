import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApprovalList } from '@/pages/approvals/ApprovalList';
import type { ApprovalRequest } from '@/types/approval';

function makeApproval(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
    return {
        id: 1,
        resource_type: 'risk',
        resource_id: 101,
        resource_name: 'Quarterly Risk Review',
        action_type: 'edit',
        pending_changes: null,
        status: 'pending',
        reason: 'Needs verification',
        requested_by_id: 2,
        requested_by_name: 'Requester',
        requested_by_email: 'requester@example.com',
        resolved_by_id: null,
        resolved_by_name: null,
        resolved_at: null,
        resolution_notes: null,
        created_at: '2026-03-01T00:00:00Z',
        can_approve: false,
        can_reject: false,
        capabilities: {
            can_read: true,
            can_approve: false,
            can_reject: false,
            can_cancel: false,
            can_cancel_as_requester: false,
            can_cancel_as_resolver: false,
            can_view_pending_changes: true,
            can_view_resolution_notes: false,
            can_inspect_side_effects: false,
            is_requester: false,
            is_primary_approver: false,
            is_privileged_resolver: false,
            is_pending: true,
            requires_privileged_resolution: false,
            would_apply_side_effects_on_approve: false,
        },
        ...overrides,
    };
}

describe('ApprovalList action gating', () => {
    const onToggleRow = vi.fn();
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const onCancel = vi.fn();
    const t = (key: string) => key;

    it('shows approve but hides reject for primary-approver rows', () => {
        render(
            <ApprovalList
                approvals={[makeApproval({
                    can_approve: true,
                    can_reject: false,
                    capabilities: {
                        can_read: true,
                        can_approve: true,
                        can_reject: false,
                        can_cancel: false,
                        can_cancel_as_requester: false,
                        can_cancel_as_resolver: false,
                        can_view_pending_changes: true,
                        can_view_resolution_notes: false,
                        can_inspect_side_effects: false,
                        is_requester: false,
                        is_primary_approver: true,
                        is_privileged_resolver: false,
                        is_pending: true,
                        requires_privileged_resolution: false,
                        would_apply_side_effects_on_approve: true,
                    },
                })]}
                loading={false}
                expandedRows={new Set()}
                currentUserId={5}
                onToggleRow={onToggleRow}
                onApprove={onApprove}
                onReject={onReject}
                onCancel={onCancel}
                t={t as never}
            />,
        );

        expect(screen.getByTitle('common:actions.approve')).toBeInTheDocument();
        expect(screen.queryByTitle('common:actions.reject')).not.toBeInTheDocument();
    });

    it('shows approve and reject for privileged-resolver rows', () => {
        render(
            <ApprovalList
                approvals={[makeApproval({
                    can_approve: true,
                    can_reject: true,
                    capabilities: {
                        can_read: true,
                        can_approve: true,
                        can_reject: true,
                        can_cancel: false,
                        can_cancel_as_requester: false,
                        can_cancel_as_resolver: false,
                        can_view_pending_changes: true,
                        can_view_resolution_notes: false,
                        can_inspect_side_effects: true,
                        is_requester: false,
                        is_primary_approver: false,
                        is_privileged_resolver: true,
                        is_pending: true,
                        requires_privileged_resolution: false,
                        would_apply_side_effects_on_approve: true,
                    },
                })]}
                loading={false}
                expandedRows={new Set()}
                currentUserId={5}
                onToggleRow={onToggleRow}
                onApprove={onApprove}
                onReject={onReject}
                onCancel={onCancel}
                t={t as never}
            />,
        );

        expect(screen.getByTitle('common:actions.approve')).toBeInTheDocument();
        expect(screen.getByTitle('common:actions.reject')).toBeInTheDocument();
    });

    it('hides approve/reject but keeps cancel for requester-owned pending rows', () => {
        render(
            <ApprovalList
                approvals={[makeApproval({
                    requested_by_id: 5,
                    can_approve: false,
                    can_reject: false,
                    status: 'pending',
                    capabilities: {
                        can_read: true,
                        can_approve: false,
                        can_reject: false,
                        can_cancel: true,
                        can_cancel_as_requester: true,
                        can_cancel_as_resolver: false,
                        can_view_pending_changes: true,
                        can_view_resolution_notes: false,
                        can_inspect_side_effects: false,
                        is_requester: true,
                        is_primary_approver: false,
                        is_privileged_resolver: false,
                        is_pending: true,
                        requires_privileged_resolution: false,
                        would_apply_side_effects_on_approve: false,
                    },
                })]}
                loading={false}
                expandedRows={new Set()}
                currentUserId={5}
                onToggleRow={onToggleRow}
                onApprove={onApprove}
                onReject={onReject}
                onCancel={onCancel}
                t={t as never}
            />,
        );

        expect(screen.queryByTitle('common:actions.approve')).not.toBeInTheDocument();
        expect(screen.queryByTitle('common:actions.reject')).not.toBeInTheDocument();
        expect(screen.getByTitle('common:tooltips.cancel_request')).toBeInTheDocument();
    });

    it('hides pending-change details when backend capabilities deny visibility', () => {
        render(
            <ApprovalList
                approvals={[makeApproval({
                    pending_changes: {
                        owner_id: { old: 'Alice', new: 'Bob' },
                    },
                    capabilities: {
                        can_read: true,
                        can_approve: false,
                        can_reject: false,
                        can_cancel: false,
                        can_cancel_as_requester: false,
                        can_cancel_as_resolver: false,
                        can_view_pending_changes: false,
                        can_view_resolution_notes: false,
                        can_inspect_side_effects: false,
                        is_requester: false,
                        is_primary_approver: false,
                        is_privileged_resolver: false,
                        is_pending: true,
                        requires_privileged_resolution: false,
                        would_apply_side_effects_on_approve: false,
                    },
                })]}
                loading={false}
                expandedRows={new Set([1])}
                currentUserId={5}
                onToggleRow={onToggleRow}
                onApprove={onApprove}
                onReject={onReject}
                onCancel={onCancel}
                t={t as never}
            />,
        );

        expect(screen.queryByTitle('common:tooltips.view_changes')).not.toBeInTheDocument();
        expect(screen.queryByText('labels.proposed_changes')).not.toBeInTheDocument();
        expect(screen.queryByText('owner_id')).not.toBeInTheDocument();
        expect(screen.queryByText('Alice')).not.toBeInTheDocument();
        expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    });
});
