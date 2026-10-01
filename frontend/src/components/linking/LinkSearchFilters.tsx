import { Filter, RotateCcw, Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';

import { getSearchPlaceholder } from './linkSearchPresentation';
import type { DepartmentLookup, LinkMode } from './linkTypes';
import { Spinner } from '@/components/ui/state';

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
            <div className="relative">
                <Input
                    type="text"
                    leadingIcon={Search}
                    aria-label={getSearchPlaceholder(mode, t)}
                    placeholder={getSearchPlaceholder(mode, t)}
                    value={searchQuery}
                    onChange={(event) => onSearchQueryChange(event.target.value)}
                    className="pr-10"
                />
                {isSearching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Spinner size="sm" label={t('common:loading.generic')} />
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-foreground">
                <Filter className="h-3 w-3" />
                {t('common:actions.filter')}
                {isLoadingLookups && <Spinner size="sm" className="ml-auto" />}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground font-semibold">
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
                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-accent-text transition-colors mt-1 ml-1 self-start group"
                >
                    <RotateCcw className="h-3 w-3 group-hover:rotate-[-45deg] transition-transform" />
                    {t('common:actions.clear')}
                </button>
            )}
        </div>
    );
}
