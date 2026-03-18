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
                approvals={[makeApproval({ can_approve: true, can_reject: false })]}
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
                approvals={[makeApproval({ can_approve: true, can_reject: true })]}
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
                approvals={[makeApproval({ requested_by_id: 5, can_approve: false, can_reject: false, status: 'pending' })]}
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
});
