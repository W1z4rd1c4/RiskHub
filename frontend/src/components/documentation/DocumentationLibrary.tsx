import type { ReactNode, RefObject } from 'react';
import { ArrowRight, BookOpen, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/state';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import type { DocumentationEntry } from '@/services/admin/adminTypes';

import { DocumentationMarkdown } from './DocumentationMarkdown';
import {
    DOCUMENTATION_PROSE_CLASS,
    formatDocumentationTag,
    getMaintainerReference,
    sanitizeDocumentationTag,
    shouldShowRawVersion,
} from './documentationPresentation';

/**
 * Shared documentation library UI (audit 2026-09-30 SM-10): the reader surface and
 * the filterable card grid that `DocumentationPage` (admin route) and
 * `DocumentationSettings` (Settings tab) both render; data and state live in
 * `useDocumentationLibrary`. The callers only supply their chrome, their query
 * key and the `testIdPrefix` of the ids they expose.
 */
interface DocumentationReaderProps {
    doc: DocumentationEntry;
    docs: DocumentationEntry[];
    content: string;
    audienceLabel: string;
    onOpenDoc: (docId: string, anchor?: string) => void;
    scrollRef: RefObject<HTMLDivElement | null>;
    /** `admin` -> `admin-doc-content-scroll`, `settings` -> `settings-doc-content-scroll`. */
    testIdPrefix: string;
    /** Title block rendered above the meta chips when the surface has no page header of its own. */
    header?: ReactNode;
    className?: string;
}

/** The reading surface: meta chips, maintainer reference and the scrolling manual body. */
export function DocumentationReader({
    doc,
    docs,
    content,
    audienceLabel,
    onOpenDoc,
    scrollRef,
    testIdPrefix,
    header,
    className,
}: DocumentationReaderProps) {
    const { t } = useTranslation('common');
    const navigate = useNavigate();
    const maintainerReference = getMaintainerReference(doc);

    return (
        // DS-20 / D5: the reader is a glass `Card` (edge-to-edge sections), not an ad hoc card fill.
        <Card padding="none" className={cn('flex min-h-[500px] flex-col overflow-hidden', className)}>
            <div className="space-y-3 border-b border-border px-8 py-6">
                {header}
                <div className="flex flex-wrap items-center gap-2">
                    <Badge
                        tone="info"
                        shape="rounded"
                        className="uppercase tracking-wider"
                        data-testid={`${testIdPrefix}-docs-audience`}
                    >
                        {audienceLabel}
                    </Badge>
                    {shouldShowRawVersion(doc) && (
                        <Badge shape="rounded" className="uppercase tracking-wider">v{doc.version}</Badge>
                    )}
                    {doc.last_updated && (
                        <Badge shape="rounded" className="uppercase tracking-wider">{doc.last_updated}</Badge>
                    )}
                    {doc.tags.map((tag) => (
                        <Badge key={tag} shape="rounded" className="uppercase tracking-wider">
                            {formatDocumentationTag(tag)}
                        </Badge>
                    ))}
                </div>
                {maintainerReference && (
                    <p className="text-xs text-muted-foreground">
                        {t('documentation.maintainer_reference')} {maintainerReference}
                    </p>
                )}
            </div>

            <div
                ref={scrollRef}
                className="flex-1 overflow-auto px-5 py-6 md:px-8 md:py-8"
                data-testid={`${testIdPrefix}-doc-content-scroll`}
                data-doc-scroll-container="true"
            >
                <div className="mx-auto w-full max-w-4xl">
                    <article className={DOCUMENTATION_PROSE_CLASS}>
                        <DocumentationMarkdown
                            content={content}
                            currentDoc={doc}
                            docs={docs}
                            onOpenDoc={onOpenDoc}
                            onNavigateApp={(path) => navigate(path)}
                        />
                    </article>
                </div>
            </div>
        </Card>
    );
}

interface DocumentationLibraryProps {
    docs: DocumentationEntry[];
    filteredDocs: DocumentationEntry[];
    availableTags: string[];
    selectedTag: string;
    onSelectTag: (tag: string) => void;
    onOpenDoc: (docId: string) => void;
    testIdPrefix: string;
    /** Shown when the library holds no manuals at all (distinct from "no match for the tag"). */
    emptyTitle: string;
    emptyDescription: string;
    className?: string;
}

/** Tag filter plus the manual cards; each card is one control named by its title. */
export function DocumentationLibrary({
    docs,
    filteredDocs,
    availableTags,
    selectedTag,
    onSelectTag,
    onOpenDoc,
    testIdPrefix,
    emptyTitle,
    emptyDescription,
    className,
}: DocumentationLibraryProps) {
    const { t } = useTranslation('common');

    return (
        <div className={cn('space-y-8', className)}>
            {availableTags.length > 0 && (
                <section className="flex flex-wrap items-center gap-2">
                    <Button
                        size="compact"
                        variant={selectedTag === 'all' ? 'accent' : 'outline'}
                        aria-pressed={selectedTag === 'all'}
                        onClick={() => onSelectTag('all')}
                        data-testid={`${testIdPrefix}-docs-filter-all`}
                    >
                        {t('documentation.filter_all')}
                    </Button>
                    {availableTags.map((tag) => (
                        <Button
                            key={tag}
                            size="compact"
                            variant={selectedTag === tag ? 'accent' : 'outline'}
                            aria-pressed={selectedTag === tag}
                            onClick={() => onSelectTag(tag)}
                            data-testid={`${testIdPrefix}-docs-filter-${sanitizeDocumentationTag(tag)}`}
                            className="uppercase tracking-wider"
                        >
                            {tag}
                        </Button>
                    ))}
                </section>
            )}

            {filteredDocs.length === 0 ? (
                <EmptyState
                    icon={BookOpen}
                    kind={docs.length === 0 ? 'no-data' : 'no-results'}
                    title={docs.length === 0 ? emptyTitle : t('documentation.no_matches_title')}
                    description={docs.length === 0 ? emptyDescription : t('documentation.no_matches_subtitle')}
                    className="glass-card py-16"
                />
            ) : (
                <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {filteredDocs.map((doc) => (
                        <Card
                            as="article"
                            key={doc.id}
                            interactive
                            className="group relative flex flex-col text-left hover:border-accent/50 hover:bg-accent/5"
                        >
                            <div className="mb-4 w-fit rounded-xl bg-tint/5 p-3 transition-colors group-hover:bg-accent/20">
                                <FileText aria-hidden="true" className="h-6 w-6 text-muted-foreground transition-colors group-hover:text-accent-text" />
                            </div>

                            <h3 className="mb-2 text-lg font-bold text-foreground">
                                {/* The title button stretches over the whole card (after:inset-0), so
                                    the card is one keyboard-reachable control named by the title. */}
                                <Button
                                    variant="link"
                                    onClick={() => onOpenDoc(doc.id)}
                                    data-testid={`${testIdPrefix}-doc-card-${doc.id}`}
                                    className="h-auto whitespace-normal p-0 text-left text-lg font-bold text-foreground after:absolute after:inset-0 after:content-[''] group-hover:text-accent-text"
                                >
                                    {doc.title}
                                </Button>
                            </h3>

                            <p className="mb-5 line-clamp-3 flex-1 text-sm text-muted-foreground">
                                {(doc.summary || doc.content.replace(/[#*`]/g, '').slice(0, 120)).trim()}...
                            </p>

                            <div className="mb-4 flex flex-wrap gap-1.5">
                                {doc.tags.map((tag) => (
                                    <Badge
                                        key={`${doc.id}-${tag}`}
                                        size="sm"
                                        data-testid={`${testIdPrefix}-doc-tag-${doc.id}-${sanitizeDocumentationTag(tag)}`}
                                    >
                                        {formatDocumentationTag(tag)}
                                    </Badge>
                                ))}
                            </div>

                            <div aria-hidden="true" className="mt-auto flex items-center gap-2 text-sm font-semibold text-accent-text">
                                {t('documentation.view_manual')}
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                            </div>
                        </Card>
                    ))}
                </section>
            )}
        </div>
    );
}
