import type { Threat, ThreatListParams, ThreatSortField, ThreatWritePayload } from '@/types/threat';

export type ThreatArchiveFilter = 'active' | 'archived' | '';
export type ThreatDisplayStatus = 'active' | 'archived';

export const THREAT_CATEGORY_CODES = [
    'availability',
    'integrity',
    'confidentiality',
    'authenticity',
    'physical',
    'personnel',
    'third_party',
] as const;

export function threatCategoryLabel(
    translate: (key: string) => string,
    category: string | null | undefined,
): string {
    if (!category) return '—';
    return THREAT_CATEGORY_CODES.includes(category as (typeof THREAT_CATEGORY_CODES)[number])
        ? translate(`threats:categories.${category}`)
        : translate('threats:register.values.unknown');
}

export function getThreatDisplayStatus(threat: Pick<Threat, 'is_archived'>): ThreatDisplayStatus {
    return threat.is_archived ? 'archived' : 'active';
}

/**
 * FR-P5-5 (S10): distinguish a genuinely empty register ("no data") from a
 * search that matched nothing ("no search results"). Keyed on the live search
 * box (not the status filter) so an unmatched query gets the "no results" copy.
 */
export function threatsEmptyStateKey(hasActiveSearch: boolean): string {
    return hasActiveSearch ? 'empty.no_results' : 'empty.no_threats';
}

interface BuildThreatListParamsOptions {
    currentPage: number;
    debouncedSearch: string;
    includeArchived: boolean;
    limit: number;
    sortDirection: 'asc' | 'desc' | null;
    sortField: ThreatSortField | null;
}

export function buildThreatListParams({
    currentPage,
    debouncedSearch,
    includeArchived,
    limit,
    sortDirection,
    sortField,
}: BuildThreatListParamsOptions): ThreatListParams {
    const params: ThreatListParams = {
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
 * nulls untouched. Only fields present in the input are emitted, so
 * untouched fields stay unsent on PATCH.
 */
export function buildThreatWritePayload(
    fields: Record<string, string | null | undefined>
): ThreatWritePayload {
    const payload: Record<string, string | null> = {};
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
    return payload as ThreatWritePayload;
}
