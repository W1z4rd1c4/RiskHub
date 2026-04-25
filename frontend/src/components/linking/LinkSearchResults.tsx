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
    canUnarchive: boolean;
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
    canUnarchive,
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
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    {listHeading}
                </span>
                <span className="text-[10px] text-slate-600 font-medium">
                    {searchResults.length} {resultCountLabel}
                </span>
            </div>

            {searchResults.length > 0 && !selectedTargetId && (
                <div className="bg-slate-900/50 border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5 animate-in fade-in slide-in-from-top-2 duration-200">
                    {searchResults.map((result) => (
                        <LinkSearchResultItem
                            key={result.id}
                            mode={mode}
                            result={result}
                            canUnarchive={canUnarchive}
                            onSelect={onSelectTarget}
                            onUnarchive={onUnarchive}
                        />
                    ))}
                </div>
            )}

            {searchResults.length === 0 && !isSearching && !isLoadingLookups && !selectedTargetId && (
                <div className="py-12 flex flex-col items-center justify-center bg-slate-900/30 border border-dashed border-white/5 rounded-2xl">
                    <div className="p-4 rounded-full bg-white/5 mb-4">
                        <Search className="h-6 w-6 text-slate-600" />
                    </div>
                    <p className="text-sm font-bold text-slate-400">
                        {getEmptyResultsLabel(mode, t)}
                    </p>
                    <p className="text-xs text-slate-600 mt-1">{t('common:linking.try_adjust_filters')}</p>
                </div>
            )}
        </div>
    );
}
