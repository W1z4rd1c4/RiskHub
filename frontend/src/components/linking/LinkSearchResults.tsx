import { EmptyState } from '@/components/ui/state';
import { useTranslation } from '@/i18n/hooks';

import { LinkSearchResultItem } from './LinkSearchResultItem';
import { getEmptyResultsLabel } from './linkSearchPresentation';
import type { LinkMode, SearchResultItem } from './linkTypes';

interface LinkSearchResultsProps {
    mode: LinkMode;
    searchQuery: string;
    searchResults: SearchResultItem[];
    isSearching: boolean;
    isLoadingLookups: boolean;
    selectedTargetId: number | null;
    onSelectTarget: (id: number) => void;
    onUnarchive: (id: number) => Promise<void>;
}

export function LinkSearchResults({
    mode,
    searchQuery,
    searchResults,
    isSearching,
    isLoadingLookups,
    selectedTargetId,
    onSelectTarget,
    onUnarchive,
}: LinkSearchResultsProps) {
    const { t } = useTranslation(['common', 'controls', 'kris', 'risks']);
    const listHeading = searchQuery ? t('linking.search_results') : t('linking.initial_suggestions');

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
                <span className="text-eyebrow">{listHeading}</span>
                <span className="text-xs font-medium text-foreground">
                    {t('linking.result_count', { count: searchResults.length })}
                </span>
            </div>

            {searchResults.length > 0 && !selectedTargetId && (
                <div className="bg-tint/[0.03] border border-border rounded-xl overflow-hidden divide-y divide-border animate-in fade-in slide-in-from-top-2 duration-200">
                    {searchResults.map((result) => (
                        <LinkSearchResultItem
                            key={result.id}
                            mode={mode}
                            result={result}
                            onSelect={onSelectTarget}
                            onUnarchive={onUnarchive}
                        />
                    ))}
                </div>
            )}

            {searchResults.length === 0 && !isSearching && !isLoadingLookups && !selectedTargetId && (
                <EmptyState
                    kind="no-results"
                    layout="section"
                    title={getEmptyResultsLabel(mode, t)}
                    description={t('common:linking.try_adjust_filters')}
                />
            )}
        </div>
    );
}
