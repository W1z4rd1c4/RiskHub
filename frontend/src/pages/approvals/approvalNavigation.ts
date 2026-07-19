export type ApprovalQueueTab = 'mine' | 'pending';

export function approvalRequestHref(approvalId: number, tab: ApprovalQueueTab = 'mine'): string {
    return `/approvals?tab=${tab}&approvalId=${approvalId}`;
}

/** Route through the app router so nested register panels preserve SPA navigation semantics. */
export function navigateToApprovalRequest(
    navigate: (href: string) => void | Promise<void>,
    approvalId: number,
    tab: ApprovalQueueTab = 'mine',
): void {
    void navigate(approvalRequestHref(approvalId, tab));
}
