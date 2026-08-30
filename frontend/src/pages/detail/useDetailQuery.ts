import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { DETAIL_QUERY_STALE_TIME_MS, entityDetailQueryKey } from '@/lib/queryKeys/detail';
import { ApiClientError } from '@/services/apiClient';
import { useSessionSnapshot } from '@/services/session';

interface UseDetailQueryOptions<T> {
    enabled?: boolean;
    entity: string;
    load: (id: number, signal?: AbortSignal) => Promise<T>;
    rawId: string | undefined;
}

export type DetailLoadOutcome = 'disabled' | 'loading' | 'content' | 'stale-with-error' | 'unavailable';

export function parsePositiveRouteId(rawId: string | undefined): number | null {
    if (!rawId || !/^[1-9]\d*$/.test(rawId)) {
        return null;
    }

    const parsed = Number(rawId);
    return Number.isSafeInteger(parsed) ? parsed : null;
}

function isProtectedResourceUnavailable(error: unknown): boolean {
    return error instanceof ApiClientError && (error.status === 403 || error.status === 404);
}

export function useDetailQuery<T>({
    entity,
    enabled = true,
    load,
    rawId,
}: UseDetailQueryOptions<T>) {
    const queryClient = useQueryClient();
    const session = useSessionSnapshot();
    const resourceId = useMemo(() => parsePositiveRouteId(rawId), [rawId]);
    const queryKey = useMemo(
        () => (resourceId === null ? null : entityDetailQueryKey(entity, session.user?.id, resourceId)),
        [entity, resourceId, session.user?.id]
    );
    const hasValidResourceId = resourceId !== null;
    const shouldLoad = enabled && hasValidResourceId;
    const detailQuery = useQuery({
        queryKey: queryKey ?? entityDetailQueryKey(entity, session.user?.id, 0),
        enabled: shouldLoad,
        queryFn: ({ signal }) => load(resourceId as number, signal),
        retry: (failureCount, error) => !isProtectedResourceUnavailable(error) && failureCount < 1,
        staleTime: DETAIL_QUERY_STALE_TIME_MS,
    });

    const setResource = useCallback(
        (resource: T | null) => {
            if (queryKey) {
                queryClient.setQueryData(queryKey, resource);
            }
        },
        [queryClient, queryKey]
    );

    const refetch = useCallback(async () => {
        await detailQuery.refetch();
    }, [detailQuery]);

    const mustClearResource = isProtectedResourceUnavailable(detailQuery.error);
    const resource = mustClearResource ? null : detailQuery.data ?? null;
    const hasResource = resource !== null;

    useEffect(() => {
        if (mustClearResource && queryKey && detailQuery.data != null) {
            queryClient.setQueryData(queryKey, null);
        }
    }, [detailQuery.data, mustClearResource, queryClient, queryKey]);

    let loadOutcome: DetailLoadOutcome;
    if (!enabled) {
        loadOutcome = 'disabled';
    } else if (!hasValidResourceId) {
        loadOutcome = 'unavailable';
    } else if (detailQuery.error) {
        loadOutcome = hasResource ? 'stale-with-error' : 'unavailable';
    } else if (detailQuery.isLoading) {
        loadOutcome = 'loading';
    } else {
        loadOutcome = hasResource ? 'content' : 'unavailable';
    }

    return {
        isLoading: loadOutcome === 'loading',
        isRetrying: detailQuery.isFetching && !detailQuery.isLoading,
        loadOutcome,
        refetch,
        resource,
        resourceId,
        setResource,
    };
}
