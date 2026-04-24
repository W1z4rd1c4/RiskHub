import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface UseDetailResourceOptions<T> {
    rawId: string | undefined;
    load: (id: number) => Promise<T>;
    toErrorKey: (error: unknown) => string;
}

export function useDetailResource<T>({
    load,
    rawId,
    toErrorKey,
}: UseDetailResourceOptions<T>) {
    const resourceId = useMemo(() => {
        const parsed = Number.parseInt(rawId ?? '', 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }, [rawId]);

    const [resource, setResource] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const toErrorKeyRef = useRef(toErrorKey);

    useEffect(() => {
        toErrorKeyRef.current = toErrorKey;
    }, [toErrorKey]);

    const refetch = useCallback(async () => {
        if (resourceId === null) {
            setResource(null);
            setErrorKey('errorKeys.not_found');
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            const data = await load(resourceId);
            setResource(data);
            setErrorKey(null);
        } catch (error) {
            console.error('Error fetching detail resource:', error);
            setResource(null);
            setErrorKey(toErrorKeyRef.current(error));
        } finally {
            setIsLoading(false);
        }
    }, [load, resourceId]);

    useEffect(() => {
        void refetch();
    }, [refetch]);

    return {
        errorKey,
        isLoading,
        refetch,
        resource,
        resourceId,
        setResource,
    };
}
