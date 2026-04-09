export type IssueSessionScope = number | 'anonymous';

function toIssueSessionScope(userId: number | null | undefined): IssueSessionScope {
    return userId ?? 'anonymous';
}

export function issueDetailQueryKey(userId: number | null | undefined, issueId: number) {
    return ['issue', toIssueSessionScope(userId), issueId] as const;
}

export function issueHistoryQueryKey(
    userId: number | null | undefined,
    issueId: number | null | undefined,
) {
    return ['issue-history', toIssueSessionScope(userId), issueId ?? null] as const;
}
