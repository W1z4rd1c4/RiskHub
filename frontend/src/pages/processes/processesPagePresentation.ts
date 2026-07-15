import type { ProcessListParams, ProcessSortField, ProcessWritePayload } from '@/types/process';
import type { Process } from '@/types/process';

export type ProcessArchiveFilter = 'active' | 'archived' | '';
export type ProcessDisplayStatus = 'active' | 'archived';

export const PROCESS_CONTROLLED_CODES = {
    preliminary_criticality: ['low', 'medium', 'high', 'critical'],
    cif_override: ['yes', 'no'],
    licensed_activity: ['non_life_insurance', 'support_functions'],
    bcm_link: ['yes', 'no', 'not_assessed', 'not_applicable'],
    dr_test_result: ['successful', 'qualified', 'unsuccessful', 'not_tested'],
    interruption_impact: ['low', 'medium', 'high', 'not_assessed'],
} as const;

export type ProcessControlledField = keyof typeof PROCESS_CONTROLLED_CODES;

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export function processControlledValueLabel(
    t: TranslateFn,
    field: ProcessControlledField,
    value: string | null | undefined,
): string | null {
    if (!value) {
        return null;
    }
    if (!(PROCESS_CONTROLLED_CODES[field] as readonly string[]).includes(value)) {
        return t('processes:values.unknown');
    }
    return t(`processes:values.${field}.${value}`);
}

const DERIVED_CRITICALITY_CODES = PROCESS_CONTROLLED_CODES.preliminary_criticality;

export function processDerivedCriticalityLabel(
    t: TranslateFn,
    value: string | null | undefined,
): string | null {
    if (!value) {
        return null;
    }
    return (DERIVED_CRITICALITY_CODES as readonly string[]).includes(value)
        ? t(`processes:values.preliminary_criticality.${value}`)
        : t('processes:values.unknown');
}

export function processDerivedCifLabel(
    t: TranslateFn,
    value: string | null | undefined,
): string | null {
    if (!value) {
        return null;
    }
    if (value === 'yes') {
        return t('processes:values.cif_override.yes');
    }
    if (value === 'no') {
        return t('processes:values.cif_override.no');
    }
    return t('processes:values.unknown');
}

type ProcessOwnershipDisplay = Pick<
    Process,
    'process_owner' | 'owning_department' | 'ownership_status'
>;

export function processOwnerDisplayLabel(
    t: TranslateFn,
    process: ProcessOwnershipDisplay,
): string {
    const ownerName = process.process_owner?.name.trim();
    if (ownerName) {
        return ownerName;
    }
    if (process.ownership_status === 'legacy_unassigned') {
        return t('processes:ownership_display.owner_legacy_unassigned');
    }
    if (process.ownership_status === 'pending_governance') {
        return t('processes:ownership_display.owner_pending_governance');
    }
    if (process.ownership_status === 'invalid_assignment') {
        return t('processes:ownership_display.owner_invalid_assignment');
    }
    return t('processes:ownership_display.unknown_user');
}

export function processOwnerContextDisplayLabel(
    t: TranslateFn,
    process: ProcessOwnershipDisplay,
): string {
    const context = [
        process.process_owner?.department_name?.trim(),
        process.process_owner?.role_name?.trim(),
    ].filter((value): value is string => Boolean(value));
    return context.length > 0
        ? context.join(' · ')
        : t('processes:ownership_display.owner_context_unknown');
}

export function processDepartmentDisplayLabel(
    t: TranslateFn,
    process: ProcessOwnershipDisplay,
): string {
    const departmentName = process.owning_department?.name.trim();
    if (departmentName) {
        const departmentCode = process.owning_department?.code.trim();
        return departmentCode ? `${departmentName} (${departmentCode})` : departmentName;
    }
    if (process.ownership_status === 'legacy_unassigned') {
        return t('processes:ownership_display.department_legacy_unassigned');
    }
    if (process.ownership_status === 'pending_governance') {
        return t('processes:ownership_display.department_pending_governance');
    }
    if (process.ownership_status === 'invalid_assignment') {
        return t('processes:ownership_display.department_invalid_assignment');
    }
    return t('processes:ownership_display.unknown_department');
}

export function processDerivedCheckLabel(
    t: TranslateFn,
    value: 'ok' | 'rto_exceeds_mtpd' | 'cif_without_bcm' | null | undefined,
): string | null {
    if (!value) {
        return null;
    }
    return t(`processes:derived.checks.${value}`);
}

export function getProcessDisplayStatus(process: Pick<Process, 'is_archived'>): ProcessDisplayStatus {
    return process.is_archived ? 'archived' : 'active';
}

/**
 * FR-P5-5 (S10): distinguish a genuinely empty register ("no data") from a
 * search that matched nothing ("no search results"). Keyed on the live search
 * box (not the status filter) so an unmatched query gets the "no results" copy.
 */
export function processesEmptyStateKey(hasActiveSearch: boolean): string {
    return hasActiveSearch ? 'empty.no_results' : 'empty.no_processes';
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
