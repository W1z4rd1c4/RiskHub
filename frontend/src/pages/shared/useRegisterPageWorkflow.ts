import type { SortDirection } from '@/components/tables';

export interface RegisterFilterChangeState {
    currentPage: number;
    selectedGroupValue: string | null;
}

export interface RegisterExportCriteria<TFilters extends Record<string, unknown>> {
    filters: TFilters;
    sort?: {
        field: string | null;
        direction: SortDirection;
    };
    view?: {
        groupBy: string | null;
        groupValue: string | null;
    };
}

export function resolveRegisterFilterChange(
    _state: RegisterFilterChangeState
): RegisterFilterChangeState {
    return {
        currentPage: 1,
        selectedGroupValue: null,
    };
}

export function buildRegisterExportCriteria<TFilters extends Record<string, unknown>>({
    filters,
    sort,
    view,
}: RegisterExportCriteria<TFilters>) {
    return {
        filters,
        sort,
        groupBy: view?.groupBy ?? null,
        groupValue: view?.groupValue ?? null,
    };
}

export function applyRegisterViewModeChange<TViewMode>(
    value: TViewMode,
    setViewMode: (value: TViewMode) => void,
    resetGroupAndPage: () => void
): void {
    setViewMode(value);
    resetGroupAndPage();
}
