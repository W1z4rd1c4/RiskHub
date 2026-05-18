import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { ApprovalRequest, PendingChange } from '@/types/approval';

export function canViewApprovalPendingChanges(approval: ApprovalRequest): boolean {
    return (
        approval.action_type === 'edit'
        && approval.pending_changes !== null
        && resolveCapabilityFlag(approval.capabilities, 'can_view_pending_changes')
    );
}

export function approvalPendingChangeEntries(approval: ApprovalRequest): [string, PendingChange][] {
    if (!canViewApprovalPendingChanges(approval) || approval.pending_changes === null) {
        return [];
    }
    return Object.entries(approval.pending_changes);
}
