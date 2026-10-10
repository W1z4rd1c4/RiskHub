import { Filter, RotateCcw, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
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

            <div className="text-eyebrow flex items-center gap-2">
                <Filter aria-hidden="true" className="size-3" />
                {t('common:actions.filter')}
                {isLoadingLookups && <Spinner size="sm" className="ml-auto" />}
            </div>
            <Field label={t('filters.include_archived')} layout="inline">
                {(field) => (
                    <Checkbox
                        {...field}
                        checked={includeArchived}
                        onCheckedChange={onIncludeArchivedChange}
                    />
                )}
            </Field>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label={t('labels.department')}>
                    {(field) => (
                        <ThemedSelect
                            {...field}
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
                    )}
                </Field>

                <Field label={t('labels.process')}>
                    {(field) => (
                        <ThemedSelect
                            {...field}
                            value={selectedProcess}
                            onValueChange={onProcessChange}
                            placeholder={t('filters.all_processes')}
                            allowEmpty
                            emptyLabel={t('filters.all_processes')}
                            options={processes.map((process) => ({ value: process, label: process }))}
                        />
                    )}
                </Field>

                <Field label={t('labels.category')}>
                    {(field) => (
                        <ThemedSelect
                            {...field}
                            value={selectedCategory}
                            onValueChange={onCategoryChange}
                            placeholder={t('filters.all_categories')}
                            allowEmpty
                            emptyLabel={t('filters.all_categories')}
                            options={categories.map((category) => ({ value: category, label: category }))}
                        />
                    )}
                </Field>
            </div>

            {hasActiveFilters && (
                <Button variant="ghost" size="compact" onClick={clearAllFilters} className="self-start">
                    <RotateCcw aria-hidden="true" />
                    {t('common:actions.clear')}
                </Button>
            )}
        </div>
    );
}
