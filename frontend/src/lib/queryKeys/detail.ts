export type QuerySessionScope = number | 'anonymous';

export const DETAIL_QUERY_STALE_TIME_MS = 30_000;

export function toQuerySessionScope(userId: number | null | undefined): QuerySessionScope {
    return userId ?? 'anonymous';
}

export function entityDetailQueryKey(entity: string, userId: number | null | undefined, entityId: number) {
    return [entity, toQuerySessionScope(userId), entityId] as const;
}
