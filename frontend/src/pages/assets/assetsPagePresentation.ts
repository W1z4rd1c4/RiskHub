import type { Asset, AssetListParams, AssetSortField, AssetWritePayload } from '@/types/asset';

export type AssetArchiveFilter = 'active' | 'archived' | '';
export type AssetDisplayStatus = 'active' | 'archived';

export function getAssetDisplayStatus(asset: Pick<Asset, 'is_archived'>): AssetDisplayStatus {
    return asset.is_archived ? 'archived' : 'active';
}

/**
 * FR-P5-5 (S10): distinguish a genuinely empty register ("no data") from a
 * search that matched nothing ("no search results"). Keyed on the live search
 * box (not the status filter) so an unmatched query gets the "no results" copy.
 */
export function assetsEmptyStateKey(hasActiveSearch: boolean): string {
    return hasActiveSearch ? 'empty.no_results' : 'empty.no_assets';
}

interface BuildAssetListParamsOptions {
    currentPage: number;
    debouncedSearch: string;
    includeArchived: boolean;
    limit: number;
    sortDirection: 'asc' | 'desc' | null;
    sortField: AssetSortField | null;
}

export function buildAssetListParams({
    currentPage,
    debouncedSearch,
    includeArchived,
    limit,
    sortDirection,
    sortField,
}: BuildAssetListParamsOptions): AssetListParams {
    const params: AssetListParams = {
        offset: (currentPage - 1) * limit,
        limit,
        include_archived: includeArchived,
    };

    if (debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
    }
    if (sortField && sortDirection) {
        params.sort_by = sortField;
        params.sort_order = sortDirection;
    }

    return params;
}

/**
 * Normalize a form's field values into a write payload: trims strings,
 * converts empty strings to null (clearing the field), and passes through
 * numbers and nulls untouched. Only fields present in the input are emitted,
 * so untouched fields stay unsent on PATCH.
 */
export function buildAssetWritePayload(
    fields: Record<string, string | number | null | undefined>
): AssetWritePayload {
    const payload: Record<string, string | number | null> = {};
    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) {
            continue;
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            payload[key] = trimmed === '' ? null : trimmed;
            continue;
        }
        payload[key] = value;
    }
    return payload as AssetWritePayload;
}
