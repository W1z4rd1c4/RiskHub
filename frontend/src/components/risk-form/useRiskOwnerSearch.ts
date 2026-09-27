import { useEffect, useState } from 'react';

import { lookupApi, type UserLookupItem } from '@/services/lookupApi';

const OWNER_SEARCH_LIMIT = 50;
type OwnerSearchStatus = 'loading' | 'ready' | 'error';

export function useRiskOwnerSearch(search: string, departmentId?: number | null) {
    const query = search.trim();
    const key = JSON.stringify([query, departmentId ?? null]);
    const [attempt, setAttempt] = useState(0);
    const [result, setResult] = useState<{
        key: string;
        attempt: number;
        status: OwnerSearchStatus;
        users: UserLookupItem[];
    }>({ key: '', attempt: 0, status: 'loading', users: [] });

    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            void lookupApi.getRiskOwners({
                limit: OWNER_SEARCH_LIMIT,
                ...(query ? { q: query } : {}),
                ...(departmentId ? { department_id: departmentId } : {}),
            }, { signal: controller.signal }).then((users) => {
                if (!cancelled) setResult({ key, attempt, status: 'ready', users });
            }).catch(() => {
                if (!cancelled) setResult({ key, attempt, status: 'error', users: [] });
            });
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            controller.abort();
        };
    }, [query, departmentId, key, attempt]);

    // Hide previous candidates immediately, including during the debounce window.
    const current = result.key === key && result.attempt === attempt;
    const users = current ? result.users : [];
    return {
        users,
        status: current ? result.status : 'loading' as OwnerSearchStatus,
        limited: users.length === OWNER_SEARCH_LIMIT,
        retry: () => setAttempt((value) => value + 1),
    };
}
