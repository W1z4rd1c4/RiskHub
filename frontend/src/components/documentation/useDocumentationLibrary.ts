import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useQuery, type QueryKey } from '@tanstack/react-query';

import { useFormat, useTranslation } from '@/i18n/hooks';
import { adminApi } from '@/services/adminApi';

import { stripDuplicateLeadingTitle } from './contentFormatting';

/**
 * Data and state of the shared documentation library (audit 2026-09-30 SM-10):
 * the docs query, tag filter, open manual and the scroll/anchor reset that
 * `DocumentationPage` (admin route) and `DocumentationSettings` (Settings tab)
 * share. The two callers only differ in their chrome, their query key and the
 * `testIdPrefix` of the ids they expose (`DocumentationLibrary.tsx`).
 */
export interface UseDocumentationLibraryOptions {
    /** Per-surface query key (`docsKeys.adminDocs` / `docsKeys.settingsDocs`). */
    queryKey: (locale: string) => QueryKey;
    /**
     * Refs created by the caller (so they never travel inside the returned state):
     * `docTopRef` wraps the open manual, `docScrollContainerRef` is the reader's
     * scroll container. Opening a manual resets both to the top / to its anchor.
     */
    docTopRef: RefObject<HTMLDivElement | null>;
    docScrollContainerRef: RefObject<HTMLDivElement | null>;
}

export function useDocumentationLibrary({ queryKey, docTopRef, docScrollContainerRef }: UseDocumentationLibraryOptions) {
    const { t } = useTranslation('common');
    const format = useFormat();
    const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
    const [selectedTag, setSelectedTag] = useState<string>('all');
    const [pendingAnchor, setPendingAnchor] = useState<string | undefined>(undefined);

    const query = useQuery({
        queryKey: queryKey(format.locale),
        queryFn: () => adminApi.getDocs(format.locale),
    });

    const docs = useMemo(() => query.data?.documents ?? [], [query.data?.documents]);
    const audienceLabel = (docs[0]?.audience || 'user') === 'admin'
        ? t('documentation.audience_admin')
        : t('documentation.audience_user');

    const availableTags = useMemo(
        () => Array.from(new Set(docs.flatMap((doc) => doc.tags))).sort((a, b) => a.localeCompare(b)),
        [docs],
    );
    const filteredDocs = useMemo(
        () => (selectedTag === 'all' ? docs : docs.filter((doc) => doc.tags.includes(selectedTag))),
        [docs, selectedTag],
    );
    const activeDoc = useMemo(
        () => docs.find((doc) => doc.id === selectedDocId) ?? null,
        [docs, selectedDocId],
    );
    const activeDocContent = useMemo(
        () => (activeDoc ? stripDuplicateLeadingTitle(activeDoc.content || '', activeDoc.title || '') : ''),
        [activeDoc],
    );

    useEffect(() => {
        if (selectedTag !== 'all' && !availableTags.includes(selectedTag)) {
            setSelectedTag('all');
        }
    }, [availableTags, selectedTag]);

    useEffect(() => {
        if (!activeDoc) {
            return;
        }

        docTopRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
        docScrollContainerRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });

        if (!pendingAnchor) {
            return;
        }

        requestAnimationFrame(() => {
            const target = document.getElementById(pendingAnchor);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            setPendingAnchor(undefined);
        });
    }, [activeDoc, docScrollContainerRef, docTopRef, pendingAnchor]);

    const openDoc = (docId: string, anchor?: string) => {
        setSelectedDocId(docId);
        setPendingAnchor(anchor);
    };

    return {
        activeDoc,
        activeDocContent,
        audienceLabel,
        availableTags,
        closeDoc: () => setSelectedDocId(null),
        docs,
        filteredDocs,
        isError: query.isError,
        isFetching: query.isFetching,
        isLoading: query.isLoading,
        hasData: query.data !== undefined,
        openDoc,
        refetch: query.refetch,
        selectedTag,
        setSelectedTag,
    };
}

export type DocumentationLibraryState = ReturnType<typeof useDocumentationLibrary>;

