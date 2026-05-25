import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { DETAIL_QUERY_STALE_TIME_MS, entityDetailQueryKey } from '@/lib/queryKeys/detail';
import { isForbiddenApiError } from '@/services/apiClient';
import { useSessionSnapshot } from '@/services/session';

interface UseDetailQueryOptions<T> {
    enabled?: boolean;
    entity: string;
    invalidIdErrorKey?: string;
    load: (id: number, signal?: AbortSignal) => Promise<T>;
    rawId: string | undefined;
    toErrorKey: (error: unknown) => string;
}

export function parsePositiveRouteId(rawId: string | undefined): number | null {
    const parsed = Number.parseInt(rawId ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function useDetailQuery<T>({
    entity,
    enabled = true,
    invalidIdErrorKey = 'errorKeys.not_found',
    load,
    rawId,
    toErrorKey,
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

    const isAccessDenied = isForbiddenApiError(detailQuery.error);
    const errorKey = !enabled
        ? null
        : !hasValidResourceId
        ? invalidIdErrorKey
        : detailQuery.error && !isAccessDenied
            ? toErrorKey(detailQuery.error)
            : null;
    const resource = errorKey ? null : detailQuery.data ?? null;

    return {
        errorKey,
        isAccessDenied,
        isLoading: shouldLoad ? detailQuery.isLoading : false,
        refetch,
        resource,
        resourceId,
        setResource,
    };
}
