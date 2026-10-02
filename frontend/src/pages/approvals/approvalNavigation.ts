import {
    updateApprovalWorkbenchQuery,
    type ApprovalWorkbenchTab,
} from './approvalWorkbenchQuery';

export type ApprovalQueueTab = ApprovalWorkbenchTab;

export function approvalRequestHref(approvalId: number, tab: ApprovalQueueTab = 'mine'): string {
    const tabParams = updateApprovalWorkbenchQuery(new URLSearchParams(), { tab });
    const params = updateApprovalWorkbenchQuery(tabParams, { approvalId });
    return `/approvals?${params.toString()}`;
}
