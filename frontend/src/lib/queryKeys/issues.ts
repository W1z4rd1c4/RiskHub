import { toQuerySessionScope } from './detail';

export function issueDetailQueryKey(userId: number | null | undefined, issueId: number) {
    return ['issue', toQuerySessionScope(userId), issueId] as const;
}

export function issueHistoryQueryKey(
    userId: number | null | undefined,
    issueId: number | null | undefined,
) {
    return ['issue-history', toQuerySessionScope(userId), issueId ?? null] as const;
}
