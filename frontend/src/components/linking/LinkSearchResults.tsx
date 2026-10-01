import { Search } from 'lucide-react';

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
    const resultCountLabel = searchResults.length === 1
        ? t('linking.result_singular')
        : t('linking.result_plural');

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    {listHeading}
                </span>
                <span className="text-xs text-foreground font-medium">
                    {searchResults.length} {resultCountLabel}
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
                <div className="py-12 flex flex-col items-center justify-center bg-tint/[0.03] border border-dashed border-border rounded-2xl">
                    <div className="p-4 rounded-full bg-tint/5 mb-4">
                        <Search className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-bold text-muted-foreground">
                        {getEmptyResultsLabel(mode, t)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{t('common:linking.try_adjust_filters')}</p>
                </div>
            )}
        </div>
    );
}
