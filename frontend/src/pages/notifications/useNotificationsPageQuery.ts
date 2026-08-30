import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export const notificationTabs = ['all', 'unread'] as const;
export type NotificationTab = (typeof notificationTabs)[number];

function parsePage(rawValues: string[]): number {
    if (rawValues.length !== 1 || !/^[1-9]\d*$/.test(rawValues[0])) {
        return 0;
    }
    const oneBasedPage = Number(rawValues[0]);
    return Number.isSafeInteger(oneBasedPage) ? oneBasedPage - 1 : 0;
}

export function useNotificationsPageQuery() {
    const [searchParams, setSearchParams] = useSearchParams();
    const serializedParams = searchParams.toString();
    const tabValues = searchParams.getAll('tab');
    const pageValues = searchParams.getAll('page');
    const requestedTab = tabValues.length === 1 ? tabValues[0] : null;
    const activeTab: NotificationTab = requestedTab === 'unread' ? 'unread' : 'all';
    const page = parsePage(pageValues);
    const needsNormalization = (
        tabValues.length > 0 && (tabValues.length !== 1 || activeTab === 'all')
    ) || (
        pageValues.length > 0 && (pageValues.length !== 1 || page === 0)
    );

    useEffect(() => {
        if (!needsNormalization) {
            return;
        }

        const next = new URLSearchParams(serializedParams);
        if (tabValues.length !== 1 || activeTab === 'all') {
            next.delete('tab');
        }
        if (pageValues.length !== 1 || page === 0) {
            next.delete('page');
        }
        setSearchParams(next, { replace: true });
    }, [activeTab, needsNormalization, page, pageValues.length, serializedParams, setSearchParams, tabValues.length]);

    const setActiveTab = useCallback((tab: NotificationTab) => {
        if (tab === activeTab && page === 0) {
            return;
        }

        const next = new URLSearchParams(serializedParams);
        if (tab === 'all') {
            next.delete('tab');
        } else {
            next.set('tab', tab);
        }
        next.delete('page');
        setSearchParams(next);
    }, [activeTab, page, serializedParams, setSearchParams]);

    const setPage = useCallback((nextPage: number, replace = false) => {
        const boundedPage = Math.max(0, Math.trunc(nextPage));
        if (boundedPage === page) {
            return;
        }

        const next = new URLSearchParams(serializedParams);
        if (boundedPage === 0) {
            next.delete('page');
        } else {
            next.set('page', String(boundedPage + 1));
        }
        setSearchParams(next, { replace });
    }, [page, serializedParams, setSearchParams]);

    return { activeTab, isReady: !needsNormalization, page, setActiveTab, setPage };
}
