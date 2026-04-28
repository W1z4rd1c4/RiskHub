import { Plus } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';

import { LinkConfirmationPanel } from './LinkConfirmationPanel';
import { LinkSearchFilters } from './LinkSearchFilters';
import { LinkSearchResults } from './LinkSearchResults';
import { getSearchPanelHeading } from './linkSearchPresentation';
import type { DepartmentLookup, LinkMode, SearchResultItem } from './linkTypes';

export type { DepartmentLookup, SearchResultItem } from './linkTypes';

export interface LinkSearchPanelProps {
    mode: LinkMode;
    searchQuery: string;
    onSearchQueryChange: (query: string) => void;
    searchResults: SearchResultItem[];
    isSearching: boolean;
    selectedDeptId: number | null;
    onDeptIdChange: (id: number | null) => void;
    selectedProcess: string;
    onProcessChange: (process: string) => void;
    selectedCategory: string;
    onCategoryChange: (category: string) => void;
    includeArchived: boolean;
    onIncludeArchivedChange: (include: boolean) => void;
    departments: DepartmentLookup[];
    processes: string[];
    categories: string[];
    isLoadingLookups: boolean;
    selectedTargetId: number | null;
    onSelectTarget: (id: number | null) => void;
    onLink: () => void;
    isLinking: boolean;
    onUnarchive: (id: number) => Promise<void>;
}

export function LinkSearchPanel({
    mode,
    searchQuery,
    onSearchQueryChange,
    searchResults,
    isSearching,
    selectedDeptId,
    onDeptIdChange,
    selectedProcess,
    onProcessChange,
    selectedCategory,
    onCategoryChange,
    includeArchived,
    onIncludeArchivedChange,
    departments,
    processes,
    categories,
    isLoadingLookups,
    selectedTargetId,
    onSelectTarget,
    onLink,
    isLinking,
    onUnarchive,
}: LinkSearchPanelProps) {
    const { t } = useTranslation(['common', 'controls', 'kris', 'risks']);
    const selectedResult = searchResults.find((result) => result.id === selectedTargetId);

    return (
        <section className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Plus className="h-3 w-3" />
                {getSearchPanelHeading(mode, t)}
            </h3>

            <div className="space-y-4">
                <LinkSearchFilters
                    mode={mode}
                    searchQuery={searchQuery}
                    onSearchQueryChange={onSearchQueryChange}
                    selectedDeptId={selectedDeptId}
                    onDeptIdChange={onDeptIdChange}
                    selectedProcess={selectedProcess}
                    onProcessChange={onProcessChange}
                    selectedCategory={selectedCategory}
                    onCategoryChange={onCategoryChange}
                    includeArchived={includeArchived}
                    onIncludeArchivedChange={onIncludeArchivedChange}
                    departments={departments}
                    processes={processes}
                    categories={categories}
                    isLoadingLookups={isLoadingLookups}
                    isSearching={isSearching}
                />
                <LinkSearchResults
                    mode={mode}
                    searchQuery={searchQuery}
                    searchResults={searchResults}
                    isSearching={isSearching}
                    isLoadingLookups={isLoadingLookups}
                    selectedTargetId={selectedTargetId}
                    onSelectTarget={onSelectTarget}
                    onUnarchive={onUnarchive}
                />
                <LinkConfirmationPanel
                    mode={mode}
                    selectedTargetId={selectedTargetId}
                    selectedResult={selectedResult}
                    onSelectTarget={onSelectTarget}
                    onLink={onLink}
                    isLinking={isLinking}
                />
            </div>
        </section>
    );
}
