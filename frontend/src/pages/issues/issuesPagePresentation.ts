import type { SortDirection, ViewMode } from '@/components/tables';
import type { CollectionGroup } from '@/types/collection';
import type {
    IssueListFilters,
    IssueSummary,
    IssueSeverity,
    IssueSeverityFilter,
    IssueSeverityGroup,
    IssueStatus,
} from '@/types/issue';

export const ISSUE_STATUSES: IssueStatus[] = [
    'open',
    'triaged',
    'in_progress',
    'ready_for_validation',
    'closed',
];
export const ISSUE_SEVERITIES: IssueSeverity[] = ['low', 'medium', 'high', 'critical'];
export const ISSUE_SEVERITY_GROUPS: IssueSeverityGroup[] = ['high_critical'];
export const ISSUE_SORT_FIELDS: NonNullable<IssueListFilters['sort_by']>[] = [
    'title',
    'severity',
    'status',
    'opened_at',
    'due_at',
    'updated_at',
    'created_at',
];

export interface IssuesPageInitialState {
    excludeActiveExceptions: boolean;
    includeClosed: boolean;
    overdueOnly: boolean;
    severityFilter: IssueSeverityFilter | '';
    sortDirection: SortDirection;
    sortField: IssueListFilters['sort_by'] | null;
    statusFilter: IssueStatus | '';
}

interface BuildIssueListFiltersOptions {
    currentPage: number;
    debouncedSearch: string;
    excludeActiveExceptions: boolean;
    includeClosed: boolean;
    limit: number;
    overdueOnly: boolean;
    severityFilter: IssueSeverityFilter | '';
    sortDirection: SortDirection;
    sortField: IssueListFilters['sort_by'] | null;
    statusFilter: IssueStatus | '';
    groupBy?: string | null;
    groupValue?: string | null;
}

interface BuildIssueExportFiltersOptions {
    excludeActiveExceptions: boolean;
    overdueOnly: boolean;
    severityFilter: IssueSeverityFilter | '';
    statusFilter: IssueStatus | '';
}

interface IssueExportFilters {
    excludeActiveExceptions: boolean | null;
    overdueOnly: boolean | null;
    severity: IssueSeverity | null;
    severityGroup: IssueSeverityGroup | null;
    status: IssueStatus | null;
}

export const ISSUE_GROUP_UNLINKED_VENDOR = '__unlinked_vendor__';
export const ISSUE_GROUP_UNCATEGORIZED = '__uncategorized__';
export const ISSUE_GROUP_UNKNOWN_DEPARTMENT = '__unknown_department__';
export const ISSUE_GROUP_NO_PROCESS = '__no_process__';
export const ISSUE_GROUP_UNKNOWN_RISK_TYPE = '__unknown_risk_type__';

function parseBooleanQueryParam(value: string | null): boolean | null {
    if (value === 'true') {
        return true;
    }
    if (value === 'false') {
        return false;
    }
    return null;
}

function parseIssueStatus(value: string | null): IssueStatus | null {
    if (!value) {
        return null;
    }
    return ISSUE_STATUSES.includes(value as IssueStatus) ? (value as IssueStatus) : null;
}

function parseIssueSeverity(value: string | null): IssueSeverity | null {
    if (!value) {
        return null;
    }
    return ISSUE_SEVERITIES.includes(value as IssueSeverity) ? (value as IssueSeverity) : null;
}

function parseIssueSeverityGroup(value: string | null): IssueSeverityGroup | null {
    if (!value) {
        return null;
    }
    return ISSUE_SEVERITY_GROUPS.includes(value as IssueSeverityGroup)
        ? (value as IssueSeverityGroup)
        : null;
}

function parseIssueSortField(value: string | null): IssueListFilters['sort_by'] | null {
    if (!value) {
        return null;
    }
    return ISSUE_SORT_FIELDS.includes(value as NonNullable<IssueListFilters['sort_by']>)
        ? (value as NonNullable<IssueListFilters['sort_by']>)
        : null;
}

function parseIssueSortOrder(value: string | null): SortDirection {
    if (value === 'asc' || value === 'desc') {
        return value;
    }
    return null;
}

export function parseIssuesPageQueryParams(searchParams: URLSearchParams): IssuesPageInitialState {
    const statusFilter = parseIssueStatus(searchParams.get('status')) ?? '';
    const severityGroup = parseIssueSeverityGroup(searchParams.get('severity_group'));
    const severityFilter = severityGroup ?? parseIssueSeverity(searchParams.get('severity')) ?? '';
    const overdueOnly = parseBooleanQueryParam(searchParams.get('overdue')) ?? false;
    const excludeActiveExceptions =
        parseBooleanQueryParam(searchParams.get('exclude_active_exceptions')) ?? false;
    const parsedIncludeClosed = parseBooleanQueryParam(searchParams.get('include_closed'));
    const includeClosed = statusFilter === 'closed' ? true : (parsedIncludeClosed ?? false);
    const sortField = parseIssueSortField(searchParams.get('sort_by'));
    const sortDirection = sortField ? parseIssueSortOrder(searchParams.get('sort_order')) : null;

    return {
        statusFilter,
        severityFilter,
        overdueOnly,
        excludeActiveExceptions,
        includeClosed,
        sortField,
        sortDirection,
    };
}

export function buildIssueListFilters({
    currentPage,
    debouncedSearch,
    excludeActiveExceptions,
    includeClosed,
    limit,
    overdueOnly,
    severityFilter,
    sortDirection,
    sortField,
    statusFilter,
    groupBy,
    groupValue,
}: BuildIssueListFiltersOptions): IssueListFilters {
    const filters: IssueListFilters = {
        offset: (currentPage - 1) * limit,
        limit,
        include_closed: statusFilter === 'closed' ? true : includeClosed,
    };

    if (statusFilter) {
        filters.status = statusFilter;
    }
    if (severityFilter) {
        if (severityFilter === 'high_critical') {
            filters.severity_group = 'high_critical';
        } else {
            filters.severity = severityFilter;
        }
    }
    if (overdueOnly) {
        filters.overdue = true;
    }
    if (excludeActiveExceptions) {
        filters.exclude_active_exceptions = true;
    }
    if (debouncedSearch.trim()) {
        filters.search = debouncedSearch.trim();
    }
    if (sortField && sortDirection) {
        filters.sort_by = sortField;
        filters.sort_order = sortDirection;
    }
    if (groupBy) {
        filters.group_by = groupBy;
    }
    if (groupValue) {
        filters.group_value = groupValue;
    }

    return filters;
}

export function buildIssueExportFilters({
    excludeActiveExceptions,
    overdueOnly,
    severityFilter,
    statusFilter,
}: BuildIssueExportFiltersOptions): IssueExportFilters {
    return {
        status: statusFilter || null,
        severity: severityFilter && severityFilter !== 'high_critical' ? severityFilter : null,
        severityGroup: severityFilter === 'high_critical' ? 'high_critical' : null,
        overdueOnly: overdueOnly ? true : null,
        excludeActiveExceptions: excludeActiveExceptions ? true : null,
    };
}

export function getIssueGroupBy(viewMode: ViewMode): string | null {
    switch (viewMode) {
        case 'all':
        case 'risk':
        case 'flag':
        case 'type':
            return null;
        case 'category':
            return 'category';
        case 'department':
            return 'department';
        case 'process':
            return 'process';
        case 'risk_type':
            return 'risk_type';
        case 'vendor':
            return 'vendor';
    }
}

export function formatIssueGroupLabel(
    group: CollectionGroup,
    labels: {
        unlinkedVendor: string;
        uncategorized: string;
        unknownDepartment: string;
        noProcess: string;
        unknownRiskType: string;
    },
): string {
    switch (group.value) {
        case ISSUE_GROUP_UNLINKED_VENDOR:
            return labels.unlinkedVendor;
        case ISSUE_GROUP_UNCATEGORIZED:
            return labels.uncategorized;
        case ISSUE_GROUP_UNKNOWN_DEPARTMENT:
            return labels.unknownDepartment;
        case ISSUE_GROUP_NO_PROCESS:
            return labels.noProcess;
        case ISSUE_GROUP_UNKNOWN_RISK_TYPE:
            return labels.unknownRiskType;
        default:
            return group.label;
    }
}

export function formatIssueDateTime(
    value: string | null,
    locale: string,
    notSetLabel: string,
): string {
    if (!value) {
        return notSetLabel;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(parsed);
}
