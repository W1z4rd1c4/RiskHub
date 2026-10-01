import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, FileText, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useFormat, useTranslation } from '@/i18n/hooks';
import { docsKeys } from '@/lib/queryKeys';
import { adminApi } from '@/services/adminApi';
import { DocumentationMarkdown } from '@/components/documentation';
import { stripDuplicateLeadingTitle } from '@/components/documentation/contentFormatting';
import {
    formatDocumentationTag,
    getMaintainerReference,
    shouldShowRawVersion,
} from '@/components/documentation/documentationPresentation';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';

export function DocumentationPage() {
    const { t } = useTranslation('common');
    const format = useFormat();
    const navigate = useNavigate();

    const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
    const [selectedTag, setSelectedTag] = useState<string>('all');
    const [pendingAnchor, setPendingAnchor] = useState<string | undefined>(undefined);
    const docTopRef = useRef<HTMLDivElement | null>(null);
    const docScrollContainerRef = useRef<HTMLDivElement | null>(null);

    const { data: docsData, isLoading, isError, isFetching, refetch } = useQuery({
        queryKey: docsKeys.adminDocs(format.locale),
        queryFn: () => adminApi.getDocs(format.locale),
    });

    const docs = useMemo(() => docsData?.documents ?? [], [docsData?.documents]);
    const audience = docs[0]?.audience || 'user';
    const audienceLabel = audience === 'admin'
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
        () => (activeDoc
            ? stripDuplicateLeadingTitle(activeDoc.content || '', activeDoc.title || '')
            : ''),
        [activeDoc],
    );
    const maintainerReference = getMaintainerReference(activeDoc);

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
    }, [activeDoc, pendingAnchor]);

    const openDoc = (docId: string, anchor?: string) => {
        setSelectedDocId(docId);
        setPendingAnchor(anchor);
    };

    // D7: the library title is the route's `h1` and `document.title`; an open
    // manual's title takes over both, with a labelled back control (D14).
    const libraryHeader = (
        <PageHeader
            title={t('documentation.library_title')}
            description={t('documentation.library_subtitle')}
            icon={BookOpen}
        />
    );

    if (isLoading) {
        return (
            <PageContainer>
                {libraryHeader}
                <LoadingState layout="page" label={t('loading.platform_docs')} />
            </PageContainer>
        );
    }

    // GAP-C-11: a failed load is an error with retry, never "no documentation".
    if (isError && !docsData) {
        return (
            <PageContainer>
                {libraryHeader}
                <ErrorState className="glass-card" onRetry={() => void refetch()} isRetrying={isFetching} />
            </PageContainer>
        );
    }

    if (docs.length === 0) {
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

    if (activeDoc) {
        return (
            <div ref={docTopRef}>
                <PageContainer>
                    <PageHeader
                        title={activeDoc.title}
                        description={activeDoc.summary || undefined}
                        back={{ label: t('documentation.back_to_library'), onClick: () => setSelectedDocId(null) }}
                        breadcrumbs={[
                            { label: t('documentation.library_title') },
                            { label: activeDoc.title },
                        ]}
                    />

                    <div className="docs-reader-surface min-h-[600px] flex flex-col overflow-hidden">
                        <div className="px-8 py-6 border-b border-tint/10 space-y-3">

                            <div className="docs-reader-meta mt-1">
                                <span className="docs-reader-meta-chip bg-info/20 text-accent-text border border-info/30">
                                    {audienceLabel}
                                </span>
                                {shouldShowRawVersion(activeDoc) && (
                                    <span className="docs-reader-meta-chip">
                                        v{activeDoc.version}
                                    </span>
                                )}
                                {activeDoc.last_updated && (
                                    <span className="docs-reader-meta-chip">
                                        {activeDoc.last_updated}
                                    </span>
                                )}
                                {activeDoc.tags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="docs-reader-meta-chip"
                                    >
                                        {formatDocumentationTag(tag)}
                                    </span>
                                ))}
                            </div>

                            {maintainerReference && (
                                <p className="docs-reader-meta-source">
                                    {t('documentation.maintainer_reference')} {maintainerReference}
                                </p>
                            )}
                        </div>

                        <div
                            ref={docScrollContainerRef}
                            className="flex-1 px-5 py-6 overflow-auto md:px-8 md:py-8"
                            data-testid="admin-doc-content-scroll"
                            data-doc-scroll-container="true"
                        >
                            <div className="mx-auto w-full max-w-4xl">
                                <article className="docs-reader-prose prose max-w-none prose-pre:border prose-table:border prose-th:p-2 prose-td:p-2 prose-td:border-t">
                                    <DocumentationMarkdown
                                        content={activeDocContent}
                                        currentDoc={activeDoc}
                                        docs={docs}
                                        onOpenDoc={openDoc}
                                        onNavigateApp={(path) => navigate(path)}
                                    />
                                </article>
                            </div>
                        </div>
                    </div>
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
                actions={(
                    <span className="px-2 py-1 rounded-md text-xs font-semibold bg-info/10 text-accent-text">
                        {audienceLabel}
                    </span>
                )}
            />

            {availableTags.length > 0 && (
                <section className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => setSelectedTag('all')}
                        className={[
                            'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                            selectedTag === 'all'
                                ? 'bg-accent/20 text-accent-text border-accent/50'
                                : 'bg-tint/5 text-muted-foreground border-border hover:bg-tint/10',
                        ].join(' ')}
                    >
                        {t('documentation.filter_all')}
                    </button>
                    {availableTags.map((tag) => (
                        <button
                            key={tag}
                            onClick={() => setSelectedTag(tag)}
                            className={[
                                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors uppercase tracking-wider',
                                selectedTag === tag
                                    ? 'bg-accent/20 text-accent-text border-accent/50'
                                    : 'bg-tint/5 text-muted-foreground border-border hover:bg-tint/10',
                            ].join(' ')}
                        >
                            {tag}
                        </button>
                    ))}
                </section>
            )}

            {filteredDocs.length === 0 ? (
                <EmptyState
                    kind="no-results"
                    icon={BookOpen}
                    title={t('documentation.no_matches_title')}
                    description={t('documentation.no_matches_subtitle')}
                    className="glass-card py-24"
                />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredDocs.map((doc) => (
                        <button
                            key={doc.id}
                            onClick={() => openDoc(doc.id)}
                            className="glass-card p-6 flex flex-col text-left group hover:border-accent/50 hover:bg-accent/5 transition-all duration-300"
                        >
                            <div className="bg-tint/5 p-3 rounded-xl w-fit mb-4 group-hover:bg-accent/20 transition-colors">
                                <FileText className="h-6 w-6 text-muted-foreground group-hover:text-accent-text transition-colors" />
                            </div>
                            <h3 className="text-xl font-bold text-foreground mb-2 group-hover:text-accent-text transition-colors">{doc.title}</h3>
                            <p className="text-sm text-muted-foreground mb-6 flex-1 line-clamp-3">
                                {(doc.summary || doc.content.replace(/[#*`]/g, '').slice(0, 150)).trim()}...
                            </p>
                            <div className="flex flex-wrap gap-1.5 mb-4">
                                {doc.tags.map((tag) => (
                                    <span
                                        key={`${doc.id}-${tag}`}
                                        className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-tint/5 text-muted-foreground"
                                    >
                                        {formatDocumentationTag(tag)}
                                    </span>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 text-accent-text text-sm font-semibold mt-auto">
                                {t('documentation.view_manual')}
                                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </PageContainer>
    );
}

export default DocumentationPage;
