import { Filter, Loader2, RotateCcw, Search } from 'lucide-react';

import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';

import { getSearchPlaceholder } from './linkSearchPresentation';
import type { DepartmentLookup, LinkMode } from './linkTypes';

interface LinkSearchFiltersProps {
    mode: LinkMode;
    searchQuery: string;
    onSearchQueryChange: (query: string) => void;
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
    isSearching: boolean;
}

export function LinkSearchFilters({
    mode,
    searchQuery,
    onSearchQueryChange,
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
    isSearching,
}: LinkSearchFiltersProps) {
    const { t } = useTranslation(['common', 'controls', 'kris', 'risks']);
    const hasActiveFilters = Boolean(selectedDeptId || selectedProcess || selectedCategory || includeArchived);

    const clearAllFilters = () => {
        onDeptIdChange(null);
        onProcessChange('');
        onCategoryChange('');
        onIncludeArchivedChange(false);
    };

    return (
        <div className="space-y-4">
            <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                    type="text"
                    placeholder={getSearchPlaceholder(mode, t)}
                    value={searchQuery}
                    onChange={(event) => onSearchQueryChange(event.target.value)}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all font-medium"
                />
                {isSearching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="h-4 w-4 text-accent animate-spin" />
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <Filter className="h-3 w-3" />
                {t('common:actions.filter')}
                {isLoadingLookups && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-400 font-semibold">
                <input
                    type="checkbox"
                    checked={includeArchived}
                    onChange={(event) => onIncludeArchivedChange(event.target.checked)}
                />
                {t('filters.include_archived')}
            </label>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <ThemedSelect
                    value={selectedDeptId?.toString() ?? ''}
                    onValueChange={(value) => onDeptIdChange(value ? Number(value) : null)}
                    placeholder={t('filters.all_departments')}
                    allowEmpty
                    emptyLabel={t('filters.all_departments')}
                    options={departments.map((department) => ({
                        value: department.id.toString(),
                        label: department.name,
                    }))}
                />

                <ThemedSelect
                    value={selectedProcess}
                    onValueChange={onProcessChange}
                    placeholder={t('filters.all_processes')}
                    allowEmpty
                    emptyLabel={t('filters.all_processes')}
                    options={processes.map((process) => ({ value: process, label: process }))}
                />

                <ThemedSelect
                    value={selectedCategory}
                    onValueChange={onCategoryChange}
                    placeholder={t('filters.all_categories')}
                    allowEmpty
                    emptyLabel={t('filters.all_categories')}
                    options={categories.map((category) => ({ value: category, label: category }))}
                />
            </div>

            {hasActiveFilters && (
                <button
                    onClick={clearAllFilters}
                    className="flex items-center gap-2 text-[10px] text-slate-500 hover:text-accent transition-colors mt-1 ml-1 self-start group"
                >
                    <RotateCcw className="h-3 w-3 group-hover:rotate-[-45deg] transition-transform" />
                    {t('common:actions.clear')}
                </button>
            )}
        </div>
    );
}
