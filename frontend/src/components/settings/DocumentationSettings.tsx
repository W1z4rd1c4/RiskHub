import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, FileText, ChevronLeft, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useFormat, useTranslation } from '@/i18n/hooks';
import { useAuth } from '@/contexts/AuthContext';
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

export function DocumentationSettings() {
    const { t } = useTranslation('settings');
    const format = useFormat();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
    const [selectedTag, setSelectedTag] = useState<string>('all');
    const [pendingAnchor, setPendingAnchor] = useState<string | undefined>(undefined);
    const docTopRef = useRef<HTMLDivElement | null>(null);
    const docScrollContainerRef = useRef<HTMLDivElement | null>(null);

    const { data: docsData, isLoading, isError, isFetching, refetch } = useQuery({
        queryKey: docsKeys.settingsDocs(format.locale),
        queryFn: () => adminApi.getDocs(format.locale),
    });

    const docs = useMemo(() => docsData?.documents ?? [], [docsData?.documents]);
    const audience = docs[0]?.audience || 'user';
    const audienceLabel = audience === 'admin'
        ? t('documentation.audience_admin')
        : t('documentation.audience_user');

    const availableTags = useMemo(() => {
        return Array.from(new Set(docs.flatMap((doc) => doc.tags))).sort((a, b) => a.localeCompare(b));
    }, [docs]);

    const filteredDocs = useMemo(() => {
        if (selectedTag === 'all') return docs;
        return docs.filter((doc) => doc.tags.includes(selectedTag));
    }, [docs, selectedTag]);

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

    const sanitizeTag = (tag: string) => tag.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const openDoc = (docId: string, anchor?: string) => {
        setSelectedDocId(docId);
        setPendingAnchor(anchor);
    };

    if (isLoading) {
        return (
            <LoadingState label={t('documentation.loading')} />
        );
    }

    // GAP-C-11: a failed load is an error with retry, never "no documentation".
    if (isError && !docsData) {
        return <ErrorState onRetry={() => void refetch()} isRetrying={isFetching} />;
    }

    if (activeDoc) {
        return (
            <div ref={docTopRef} className="space-y-6">
                <button
                    onClick={() => setSelectedDocId(null)}
                    className="flex items-center gap-2 px-4 py-2 bg-tint/5 hover:bg-tint/10 text-muted-foreground hover:text-foreground text-sm font-medium rounded-xl transition-all border border-border"
                >
                    <ChevronLeft className="h-4 w-4" />
                    {t('documentation.back')}
                </button>

                <div className="docs-reader-surface min-h-[500px] flex flex-col overflow-hidden">
                    <div className="px-8 py-6 border-b border-border space-y-3">
                        <div>
                            <h2 className="text-2xl font-bold text-foreground">{activeDoc.title}</h2>
                            {activeDoc.summary && (
                                <p className="text-foreground text-base mt-2 max-w-4xl leading-relaxed">{activeDoc.summary}</p>
                            )}
                        </div>

                        <div className="docs-reader-meta">
                            <span
                                className="docs-reader-meta-chip bg-info/20 text-accent-text border border-info/30"
                                data-testid="settings-docs-audience"
                            >
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
                                {t('common:documentation.maintainer_reference')} {maintainerReference}
                            </p>
                        )}
                    </div>

                    <div
                        ref={docScrollContainerRef}
                        className="flex-1 px-5 py-6 overflow-auto md:px-8 md:py-8"
                        data-testid="settings-doc-content-scroll"
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
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <section>
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-accent" />
                    {t('documentation.title')}
                </h3>
                <p className="text-muted-foreground text-sm mb-6">
                    {t('documentation.subtitle', { role: user?.role_display_name || 'User' })}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-1 rounded-md text-xs font-semibold bg-info/20 text-accent-text" data-testid="settings-docs-audience">
                        {audienceLabel}
                    </span>
                </div>
            </section>

            {availableTags.length > 0 && (
                <section className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => setSelectedTag('all')}
                        data-testid="settings-docs-filter-all"
                        className={[
                            'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                            selectedTag === 'all'
                                ? 'bg-accent/20 text-accent-text border-accent/50'
                                : 'bg-tint/5 text-foreground border-border hover:bg-tint/10',
                        ].join(' ')}
                    >
                        {t('documentation.filter_all')}
                    </button>
                    {availableTags.map((tag) => (
                        <button
                            key={tag}
                            onClick={() => setSelectedTag(tag)}
                            data-testid={`settings-docs-filter-${sanitizeTag(tag)}`}
                            className={[
                                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors uppercase tracking-wider',
                                selectedTag === tag
                                    ? 'bg-accent/20 text-accent-text border-accent/50'
                                    : 'bg-tint/5 text-foreground border-border hover:bg-tint/10',
                            ].join(' ')}
                        >
                            {tag}
                        </button>
                    ))}
                </section>
            )}

            {filteredDocs.length === 0 ? (
                <EmptyState
                    icon={BookOpen}
                    kind={docs.length === 0 ? 'no-data' : 'no-results'}
                    title={docs.length === 0 ? t('documentation.empty_title') : t('documentation.no_matches_title')}
                    description={docs.length === 0 ? t('documentation.empty_subtitle') : t('documentation.no_matches_subtitle')}
                    className="glass-card py-16"
                />
            ) : (
                <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filteredDocs.map((doc) => (
                        <button
                            key={doc.id}
                            onClick={() => openDoc(doc.id)}
                            data-testid={`settings-doc-card-${doc.id}`}
                            className="glass-card p-6 flex flex-col text-left group hover:border-accent/50 hover:bg-accent/5 transition-all duration-300"
                        >
                            <div className="bg-tint/5 p-3 rounded-xl w-fit mb-4 group-hover:bg-accent/20 transition-colors">
                                <FileText className="h-6 w-6 text-muted-foreground group-hover:text-accent transition-colors" />
                            </div>

                            <h3 className="text-lg font-bold text-foreground mb-2 group-hover:text-accent-text transition-colors">
                                {doc.title}
                            </h3>

                            <p className="text-sm text-muted-foreground mb-5 flex-1 line-clamp-3">
                                {(doc.summary || doc.content.replace(/[#*`]/g, '').slice(0, 120)).trim()}...
                            </p>

                            <div className="flex flex-wrap gap-1.5 mb-4">
                                {doc.tags.map((tag) => (
                                    <span
                                        key={`${doc.id}-${tag}`}
                                        data-testid={`settings-doc-tag-${doc.id}-${sanitizeTag(tag)}`}
                                        className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-tint/5 text-foreground"
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
                </section>
            )}

            <section className="text-center">
                <p className="text-xs text-muted-foreground">
                    {t('documentation.library_footer')}
                </p>
            </section>
        </div>
    );
}
