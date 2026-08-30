export type RegisterPrimitive = string | number | boolean;
export type RegisterRange = { min?: number; max?: number };
export type RegisterFilterValue = RegisterPrimitive | RegisterPrimitive[] | RegisterRange | null;
export type RegisterFilters = Record<string, RegisterFilterValue | undefined>;

export interface RegisterSortState {
    field: string;
    direction: 'asc' | 'desc';
}

export interface RegisterUrlState {
    filters: RegisterFilters;
    page: number;
    search: string;
    selectedGroupValue: string | null;
    sort: RegisterSortState | null;
    view: string;
}

interface ParseRegisterUrlStateOptions {
    defaultView: string;
    allowedViews?: readonly string[];
}

interface NormalizeRegisterUrlParamsOptions extends ParseRegisterUrlStateOptions {
    allowedSortFields: readonly string[];
    canonicalizeFilters: (filters: RegisterFilters) => RegisterFilters;
}

interface BuildRegisterUrlParamsOptions {
    defaultView?: string;
}

const OWNED_QUERY_KEYS = ['q', 'view', 'sort', 'filters', 'group', 'page'] as const;

function isRange(value: unknown): value is RegisterRange {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const range = value as Record<string, unknown>;
    return (range.min === undefined || typeof range.min === 'number')
        && (range.max === undefined || typeof range.max === 'number');
}

function isFilterValue(value: unknown): value is RegisterFilterValue {
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true;
    if (Array.isArray(value)) {
        return value.every((entry) => ['string', 'number', 'boolean'].includes(typeof entry));
    }
    return isRange(value);
}

function parseFilters(raw: string | null): RegisterFilters {
    if (!raw) return {};
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return Object.fromEntries(
            Object.entries(parsed).filter(([, value]) => isFilterValue(value)),
        );
    } catch {
        return {};
    }
}

function parseSort(raw: string | null): RegisterSortState | null {
    if (!raw) return null;
    const separator = raw.lastIndexOf(':');
    if (separator <= 0) return null;
    const field = raw.slice(0, separator);
    const direction = raw.slice(separator + 1);
    return direction === 'asc' || direction === 'desc' ? { field, direction } : null;
}

function parsePage(raw: string | null): number {
    if (raw === null || !/^\d+$/.test(raw)) return 1;
    const page = Number(raw);
    return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function normalizeRegisterUrlParams(
    params: URLSearchParams,
    options: NormalizeRegisterUrlParamsOptions,
): boolean {
    const state = parseRegisterUrlState(params, options);
    const sort = state.sort && options.allowedSortFields.includes(state.sort.field)
        ? state.sort
        : null;
    const selectedGroupValue = state.selectedGroupValue?.trim() || null;
    const canonical = buildRegisterUrlParams({
        ...state,
        filters: options.canonicalizeFilters(state.filters),
        search: state.search.trim(),
        selectedGroupValue,
        sort,
    }, new URLSearchParams(), { defaultView: options.defaultView });

    let changed = false;
    OWNED_QUERY_KEYS.forEach((key) => {
        const currentValues = params.getAll(key);
        const canonicalValues = canonical.getAll(key);
        if (
            currentValues.length === canonicalValues.length
            && currentValues.every((value, index) => value === canonicalValues[index])
        ) return;

        changed = true;
        params.delete(key);
        canonicalValues.forEach((value) => params.append(key, value));
    });
    return changed;
}

export function parseRegisterUrlState(
    params: URLSearchParams,
    { allowedViews, defaultView }: ParseRegisterUrlStateOptions,
): RegisterUrlState {
    const requestedView = params.get('view') || defaultView;
    return {
        filters: parseFilters(params.get('filters')),
        page: parsePage(params.get('page')),
        search: params.get('q') ?? '',
        selectedGroupValue: params.get('group') || null,
        sort: parseSort(params.get('sort')),
        view: !allowedViews || allowedViews.includes(requestedView) ? requestedView : defaultView,
    };
}

function compactFilters(filters: RegisterFilters): RegisterFilters {
    return Object.fromEntries(Object.entries(filters).filter(([, value]) => {
        if (value === undefined || value === null || value === '') return false;
        if (Array.isArray(value)) return value.length > 0;
        if (isRange(value)) return value.min !== undefined || value.max !== undefined;
        return true;
    }));
}

export function buildRegisterUrlParams(
    state: RegisterUrlState,
    existingParams = new URLSearchParams(),
    { defaultView = 'all' }: BuildRegisterUrlParamsOptions = {},
): URLSearchParams {
    const params = new URLSearchParams(existingParams);
    OWNED_QUERY_KEYS.forEach((key) => params.delete(key));

    if (state.search.trim()) params.set('q', state.search.trim());
    if (state.view !== defaultView) params.set('view', state.view);
    if (state.sort) params.set('sort', `${state.sort.field}:${state.sort.direction}`);
    const filters = compactFilters(state.filters);
    if (Object.keys(filters).length > 0) params.set('filters', JSON.stringify(filters));
    if (state.selectedGroupValue) params.set('group', state.selectedGroupValue);
    if (state.page > 1) params.set('page', String(state.page));
    return params;
}
