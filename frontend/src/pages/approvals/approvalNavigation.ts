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

/** Route through the app router so nested register panels preserve SPA navigation semantics. */
export function navigateToApprovalRequest(
    navigate: (href: string) => void | Promise<void>,
    approvalId: number,
    tab: ApprovalQueueTab = 'mine',
): void {
    void navigate(approvalRequestHref(approvalId, tab));
}
