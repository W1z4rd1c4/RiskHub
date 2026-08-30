import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { ApprovalRequest } from '@/types/approval';

export function canViewApprovalPendingChanges(approval: ApprovalRequest): boolean {
    return (
        (approval.action_type === 'edit' || approval.governed_mutation != null)
        && (approval.pending_changes !== null || approval.governed_mutation != null)
        && resolveCapabilityFlag(approval.capabilities, 'can_view_pending_changes')
    );
}
