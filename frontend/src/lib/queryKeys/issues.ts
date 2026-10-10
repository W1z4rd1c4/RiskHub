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

/**
 * One page of an issue's history (GAP-C-11). It extends `issueHistoryQueryKey`, so
 * invalidating that key refreshes every loaded page.
 */
export function issueHistoryPageQueryKey(
    userId: number | null | undefined,
    issueId: number | null | undefined,
    page: number,
) {
    return [...issueHistoryQueryKey(userId, issueId), page] as const;
}
