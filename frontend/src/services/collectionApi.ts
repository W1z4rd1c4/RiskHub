import type { CollectionGroup, CollectionListResponse, CollectionSort } from '@/types/collection';

type CollectionFilterValue = string | number | boolean | null | undefined;
type CollectionFilters = Record<string, CollectionFilterValue>;

interface BuildCollectionParamsOptions {
    offset?: number;
    limit?: number;
    sort?: CollectionSort | null;
    filters?: CollectionFilters;
    groupBy?: string | null;
    groupValue?: string | null;
}

interface LoadCollectionPageRequest {
    currentPage: number;
    groupBy?: string | null;
    groupValue?: string | null;
}

interface LoadCollectionPageOptions<TItem> {
    currentPage: number;
    groupBy?: string | null;
    selectedGroupValue?: string | null;
    loadPage: (request: LoadCollectionPageRequest) => Promise<CollectionListResponse<TItem>>;
    normalizeItems?: (items: TItem[]) => TItem[];
}

interface LoadedCollectionPage<TItem> {
    items: TItem[];
    groups: CollectionGroup[];
    total: number;
    capabilities: Record<string, boolean> | null;
}

export function buildCollectionParams({
    offset,
    limit,
    sort,
    filters,
    groupBy,
    groupValue,
}: BuildCollectionParamsOptions): Record<string, string | number> {
    const params: Record<string, string | number> = {};

    if (typeof offset === 'number') {
        params.offset = offset;
    }
    if (typeof limit === 'number') {
        params.limit = limit;
    }
    if (sort) {
        params.sort = JSON.stringify(sort);
    }
    if (filters) {
        const normalizedFilters = Object.fromEntries(
            Object.entries(filters).filter(([, value]) => value !== undefined)
        );
        if (Object.keys(normalizedFilters).length > 0) {
            params.filters = JSON.stringify(normalizedFilters);
        }
    }
    if (groupBy) {
        params.group_by = groupBy;
    }
    if (groupValue) {
        params.group_value = groupValue;
    }

    return params;
}

export function normalizeCollectionResponse<TItem>(
    response: CollectionListResponse<TItem> & {
        skip?: number;
        page?: number;
        size?: number;
    }
): CollectionListResponse<TItem> {
    const offset = typeof response.offset === 'number'
        ? response.offset
        : typeof response.skip === 'number'
            ? response.skip
            : typeof response.page === 'number' && typeof response.size === 'number'
                ? (response.page - 1) * response.size
                : 0;
    const limit = typeof response.limit === 'number'
        ? response.limit
        : typeof response.size === 'number'
            ? response.size
            : 0;

    return {
        items: response.items,
        total: response.total,
        offset,
        limit,
        groups: response.groups ?? null,
        capabilities: response.capabilities ?? null,
    };
}

export async function loadCollectionPage<TItem>({
    currentPage,
    groupBy,
    selectedGroupValue,
    loadPage,
    normalizeItems = (items) => items,
}: LoadCollectionPageOptions<TItem>): Promise<LoadedCollectionPage<TItem>> {
    if (!groupBy) {
        const response = await loadPage({ currentPage });
        return {
            items: normalizeItems(response.items),
            groups: [],
            total: response.total,
            capabilities: response.capabilities ?? null,
        };
    }

    if (selectedGroupValue) {
        const response = await loadPage({
            currentPage,
            groupBy,
            groupValue: selectedGroupValue,
        });
        return {
            items: normalizeItems(response.items),
            groups: response.groups ?? [],
            total: response.total,
            capabilities: response.capabilities ?? null,
        };
    }

    const response = await loadPage({ currentPage: 1, groupBy });
    return {
        items: [],
        groups: response.groups ?? [],
        total: response.total,
        capabilities: response.capabilities ?? null,
    };
}
