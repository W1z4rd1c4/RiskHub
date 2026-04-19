import { useEffect, useState } from 'react';
import { useQuery, type QueryFunction, type QueryKey, type UseQueryOptions } from '@tanstack/react-query';

interface UseAdaptivePollingQueryOptions<TQueryFnData, TError = Error, TData = TQueryFnData>
    extends Omit<
        UseQueryOptions<TQueryFnData, TError, TData, QueryKey>,
        'queryKey' | 'queryFn' | 'enabled' | 'refetchInterval' | 'refetchIntervalInBackground' | 'refetchOnWindowFocus'
    > {
    queryKey: QueryKey;
    queryFn: QueryFunction<TQueryFnData, QueryKey>;
    pollMs: number;
    enabled?: boolean;
    maxBackoffMs?: number;
}

function getVisibilityState(): boolean {
    if (typeof document === 'undefined') {
        return true;
    }
    return document.visibilityState === 'visible';
}

export function useAdaptivePollingQuery<TQueryFnData, TError = Error, TData = TQueryFnData>({
    queryKey,
    queryFn,
    pollMs,
    enabled = true,
    maxBackoffMs = 300_000,
    ...options
}: UseAdaptivePollingQueryOptions<TQueryFnData, TError, TData>) {
    const [isVisible, setIsVisible] = useState(getVisibilityState);
    const [failureCount, setFailureCount] = useState(0);

    const query = useQuery({
        ...options,
        queryKey,
        queryFn,
        enabled,
        refetchInterval: enabled && isVisible ? Math.min(pollMs * 2 ** failureCount, maxBackoffMs) : false,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: false,
    });
    const { refetch } = query;

    useEffect(() => {
        setFailureCount(query.failureCount);
    }, [query.failureCount]);

    useEffect(() => {
        if (typeof document === 'undefined') {
            return undefined;
        }

        const handleVisibilityChange = () => {
            const nowVisible = document.visibilityState === 'visible';
            setIsVisible(nowVisible);
            if (nowVisible && enabled) {
                void refetch();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [enabled, refetch]);

    const refresh = async () => {
        return refetch();
    };

    return {
        ...query,
        refresh,
        isPollingActive: enabled && isVisible,
        currentPollMs: enabled && isVisible ? Math.min(pollMs * 2 ** failureCount, maxBackoffMs) : null,
    };
}
