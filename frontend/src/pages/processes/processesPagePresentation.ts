import type { ProcessListParams, ProcessSortField, ProcessWritePayload } from '@/types/process';
import type { Process } from '@/types/process';

export type ProcessArchiveFilter = 'active' | 'archived' | '';
export type ProcessDisplayStatus = 'active' | 'archived';

export function getProcessDisplayStatus(process: Pick<Process, 'is_archived'>): ProcessDisplayStatus {
    return process.is_archived ? 'archived' : 'active';
}

interface BuildProcessListParamsOptions {
    currentPage: number;
    debouncedSearch: string;
    includeArchived: boolean;
    limit: number;
    sortDirection: 'asc' | 'desc' | null;
    sortField: ProcessSortField | null;
}

export function buildProcessListParams({
    currentPage,
    debouncedSearch,
    includeArchived,
    limit,
    sortDirection,
    sortField,
}: BuildProcessListParamsOptions): ProcessListParams {
    const params: ProcessListParams = {
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
export function buildProcessWritePayload(
    fields: Record<string, string | number | null | undefined>
): ProcessWritePayload {
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
    return payload as ProcessWritePayload;
}
