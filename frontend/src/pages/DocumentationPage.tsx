import { useRef } from 'react';
import { BookOpen } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import { docsKeys } from '@/lib/queryKeys';
import {
    DocumentationLibrary,
    DocumentationReader,
    useDocumentationLibrary,
} from '@/components/documentation';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';

/**
 * Admin documentation route. The library and reader are the shared
 * `DocumentationLibrary` / `DocumentationReader` (SM-10), also used by the
 * Settings tab; this page only supplies the page chrome.
 */
export function DocumentationPage() {
    const { t } = useTranslation('common');
    const docTopRef = useRef<HTMLDivElement | null>(null);
    const docScrollContainerRef = useRef<HTMLDivElement | null>(null);
    const library = useDocumentationLibrary({ queryKey: docsKeys.adminDocs, docTopRef, docScrollContainerRef });

    // D7: the library title is the route's `h1` and `document.title`; an open
    // manual's title takes over both, with a labelled back control (D14).
    const libraryHeader = (
        <PageHeader
            title={t('documentation.library_title')}
            description={t('documentation.library_subtitle')}
            icon={BookOpen}
        />
    );

    if (library.isLoading) {
        return (
            <PageContainer>
                {libraryHeader}
                <LoadingState layout="page" label={t('loading.platform_docs')} />
            </PageContainer>
        );
    }

    // GAP-C-11: a failed load is an error with retry, never "no documentation".
    if (library.isError && !library.hasData) {
        return (
            <PageContainer>
                {libraryHeader}
                <ErrorState className="glass-card" onRetry={() => void library.refetch()} isRetrying={library.isFetching} />
            </PageContainer>
        );
    }

    if (library.docs.length === 0) {
        return (
            <PageContainer>
                {libraryHeader}
                <EmptyState
                    icon={BookOpen}
                    title={t('empty.no_documentation')}
                    description={t('documentation.no_manuals_seeded')}
                    className="glass-card py-24"
                />
            </PageContainer>
        );
    }

    if (library.activeDoc) {
        const activeDoc = library.activeDoc;
        return (
            <div ref={docTopRef}>
                <PageContainer>
                    <PageHeader
                        title={activeDoc.title}
                        description={activeDoc.summary || undefined}
                        back={{ label: t('documentation.back_to_library'), onClick: library.closeDoc }}
                        breadcrumbs={[
                            { label: t('documentation.library_title') },
                            { label: activeDoc.title },
                        ]}
                    />

                    <DocumentationReader
                        doc={activeDoc}
                        docs={library.docs}
                        content={library.activeDocContent}
                        audienceLabel={library.audienceLabel}
                        onOpenDoc={library.openDoc}
                        scrollRef={docScrollContainerRef}
                        testIdPrefix="admin"
                        className="min-h-[600px]"
                    />
                </PageContainer>
            </div>
        );
    }

    return (
        <PageContainer>
            <PageHeader
                title={t('documentation.library_title')}
                description={t('documentation.library_subtitle')}
                icon={BookOpen}
                actions={<Badge tone="info" shape="rounded">{library.audienceLabel}</Badge>}
            />

            <DocumentationLibrary
                docs={library.docs}
                filteredDocs={library.filteredDocs}
                availableTags={library.availableTags}
                selectedTag={library.selectedTag}
                onSelectTag={library.setSelectedTag}
                onOpenDoc={library.openDoc}
                testIdPrefix="admin"
                emptyTitle={t('empty.no_documentation')}
                emptyDescription={t('documentation.no_manuals_seeded')}
            />
        </PageContainer>
    );
}

export default DocumentationPage;
