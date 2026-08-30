import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

interface ContentTabQueryOptions<T extends string> {
    tabs: readonly T[];
    defaultTab: T;
    param?: string;
}

export function useContentTabQuery<T extends string>({
    tabs,
    defaultTab,
    param = 'tab',
}: ContentTabQueryOptions<T>): readonly [T, (tab: T) => void] {
    const [searchParams, setSearchParams] = useSearchParams();
    const serializedParams = searchParams.toString();
    const requestedValues = searchParams.getAll(param);
    const requestedTab = requestedValues.length === 1 ? requestedValues[0] : null;
    const activeTab = tabs.includes(requestedTab as T) ? requestedTab as T : defaultTab;
    const needsNormalization = requestedValues.length > 0
        && (requestedValues.length !== 1 || requestedTab === defaultTab || activeTab === defaultTab);

    useEffect(() => {
        if (!needsNormalization) {
            return;
        }

        const next = new URLSearchParams(serializedParams);
        next.delete(param);
        setSearchParams(next, { replace: true });
    }, [needsNormalization, param, serializedParams, setSearchParams]);

    const setActiveTab = useCallback((tab: T) => {
        if (tab === activeTab) {
            return;
        }

        const next = new URLSearchParams(serializedParams);
        if (tab === defaultTab) {
            next.delete(param);
        } else {
            next.set(param, tab);
        }
        setSearchParams(next);
    }, [activeTab, defaultTab, param, serializedParams, setSearchParams]);

    return [activeTab, setActiveTab] as const;
}
