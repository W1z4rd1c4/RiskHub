import { useRef } from 'react';
import { BookOpen, ChevronLeft } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { docsKeys } from '@/lib/queryKeys';
import {
    DocumentationLibrary,
    DocumentationReader,
    useDocumentationLibrary,
} from '@/components/documentation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/ui/state';

/**
 * Settings tab: the documentation library inside the Settings chrome (a section
 * heading and role-specific subtitle). The data, filters, cards and reader are the
 * shared `DocumentationLibrary` (SM-10), also used by the admin `DocumentationPage`.
 */
export function DocumentationSettings() {
    const { t } = useTranslation('settings');
    const { user } = useAuth();
    const docTopRef = useRef<HTMLDivElement | null>(null);
    const docScrollContainerRef = useRef<HTMLDivElement | null>(null);
    const library = useDocumentationLibrary({ queryKey: docsKeys.settingsDocs, docTopRef, docScrollContainerRef });

    if (library.isLoading) {
        return (
            <LoadingState label={t('documentation.loading')} />
        );
    }

    // GAP-C-11: a failed load is an error with retry, never "no documentation".
    if (library.isError && !library.hasData) {
        return <ErrorState onRetry={() => void library.refetch()} isRetrying={library.isFetching} />;
    }

    if (library.activeDoc) {
        const activeDoc = library.activeDoc;
        return (
            <div ref={docTopRef} className="space-y-6">
                <Button
                    variant="outline"
                    onClick={library.closeDoc}
                    className="self-start"
                >
                    <ChevronLeft aria-hidden="true" />
                    {t('documentation.back')}
                </Button>

                <DocumentationReader
                    doc={activeDoc}
                    docs={library.docs}
                    content={library.activeDocContent}
                    audienceLabel={library.audienceLabel}
                    onOpenDoc={library.openDoc}
                    scrollRef={docScrollContainerRef}
                    testIdPrefix="settings"
                    header={(
                        <div>
                            <h2 className="text-2xl font-bold text-foreground">{activeDoc.title}</h2>
                            {activeDoc.summary && (
                                <p className="text-foreground text-base mt-2 max-w-4xl leading-relaxed">{activeDoc.summary}</p>
                            )}
                        </div>
                    )}
                />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <section>
                <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
                    <BookOpen aria-hidden="true" className="h-5 w-5 text-accent-text" />
                    {t('documentation.title')}
                </h2>
                <p className="text-muted-foreground text-sm mb-6">
                    {t('documentation.subtitle', { role: user?.role_display_name || t('common:fallbacks.unknown') })}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                    <Badge tone="info" shape="rounded" data-testid="settings-docs-audience">
                        {library.audienceLabel}
                    </Badge>
                </div>
            </section>

            <DocumentationLibrary
                docs={library.docs}
                filteredDocs={library.filteredDocs}
                availableTags={library.availableTags}
                selectedTag={library.selectedTag}
                onSelectTag={library.setSelectedTag}
                onOpenDoc={library.openDoc}
                testIdPrefix="settings"
                emptyTitle={t('documentation.empty_title')}
                emptyDescription={t('documentation.empty_subtitle')}
            />

            <section className="text-center">
                <p className="text-xs text-muted-foreground">
                    {t('documentation.library_footer')}
                </p>
            </section>
        </div>
    );
}
