import type {
    IssueListFilters,
    IssueRemediationStatus,
    IssueSeverityFilter,
    IssueStatus,
} from '@/types/issue';

import type { RegisterFilters, RegisterSortState } from '../shared/registerListQuery';

export type IssueRegisterView = 'all' | 'category' | 'department' | 'owner' | 'process' | 'risk_type' | 'severity' | 'status' | 'type' | 'vendor';

export interface IssueRegisterFilters {
    status: IssueStatus | '';
    severity: IssueSeverityFilter | '';
    overdue: boolean;
    exclude_active_exceptions: boolean;
    include_closed: boolean;
    department_id: number | null;
    owner_user_id: number | null;
    remediation_status: IssueRemediationStatus | '';
}

export const ISSUE_REGISTER_CONFIG = {
    views: [
        { value: 'all', labelKey: 'common:views.all', groupBy: null },
        { value: 'category', labelKey: 'common:views.by_category', groupBy: 'category' },
        { value: 'department', labelKey: 'common:views.by_department', groupBy: 'department' },
        { value: 'owner', labelKey: 'register.views.owner', groupBy: 'owner' },
        { value: 'process', labelKey: 'common:views.by_process', groupBy: 'process' },
        { value: 'risk_type', labelKey: 'common:views.by_risk_type', groupBy: 'risk_type' },
        { value: 'severity', labelKey: 'register.views.severity', groupBy: 'severity' },
        { value: 'status', labelKey: 'register.views.status', groupBy: 'status' },
        { value: 'type', labelKey: 'common:views.by_type', groupBy: 'type' },
        { value: 'vendor', labelKey: 'common:views.by_vendor', groupBy: 'vendor' },
    ] as const,
};

export const EMPTY_ISSUE_REGISTER_FILTERS: IssueRegisterFilters = {
    status: '',
    severity: '',
    overdue: false,
    exclude_active_exceptions: false,
    include_closed: false,
    department_id: null,
    owner_user_id: null,
    remediation_status: '',
};

const STATUSES = ['open', 'triaged', 'in_progress', 'ready_for_validation', 'closed'] as const;
const SEVERITIES = ['low', 'medium', 'high', 'critical', 'high_critical'] as const;
const REMEDIATION_STATUSES = ['draft', 'active', 'blocked', 'completed'] as const;

export function parseIssueRegisterFilters(filters: RegisterFilters): IssueRegisterFilters {
    const status = filters.status;
    const severity = filters.severity_group === 'high_critical'
        ? filters.severity_group
        : filters.severity;
    const parsedStatus = STATUSES.includes(status as typeof STATUSES[number]) ? status as IssueStatus : '';
    return {
        status: parsedStatus,
        severity: SEVERITIES.includes(severity as typeof SEVERITIES[number]) ? severity as IssueSeverityFilter : '',
        overdue: filters.overdue === true,
        exclude_active_exceptions: filters.exclude_active_exceptions === true,
        include_closed: parsedStatus === 'closed' || filters.include_closed === true,
        department_id: typeof filters.department_id === 'number' ? filters.department_id : null,
        owner_user_id: typeof filters.owner_user_id === 'number' ? filters.owner_user_id : null,
        remediation_status: REMEDIATION_STATUSES.includes(filters.remediation_status as typeof REMEDIATION_STATUSES[number])
            ? filters.remediation_status as IssueRemediationStatus
            : '',
    };
}

export function serializeIssueRegisterFilters(filters: IssueRegisterFilters): RegisterFilters {
    return {
        status: filters.status || undefined,
        severity: filters.severity && filters.severity !== 'high_critical' ? filters.severity : undefined,
        severity_group: filters.severity === 'high_critical' ? filters.severity : undefined,
        overdue: filters.overdue || undefined,
        exclude_active_exceptions: filters.exclude_active_exceptions || undefined,
        include_closed: filters.include_closed || undefined,
        department_id: filters.department_id,
        owner_user_id: filters.owner_user_id,
        remediation_status: filters.remediation_status || undefined,
    };
}

export function issueGroupBy(view: IssueRegisterView): string | undefined {
    return ISSUE_REGISTER_CONFIG.views.find((option) => option.value === view)?.groupBy ?? undefined;
}

export function buildIssueRegisterListParams({
    currentPage,
    filters,
    groupValue,
    limit,
    search,
    sort,
    view,
}: {
    currentPage: number;
    filters: IssueRegisterFilters;
    groupValue: string | null;
    limit: number;
    search: string;
    sort: RegisterSortState | null;
    view: IssueRegisterView;
}): IssueListFilters {
    return {
        offset: (currentPage - 1) * limit,
        limit,
        include_closed: filters.status === 'closed' || filters.include_closed,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.severity === 'high_critical' ? { severity_group: 'high_critical' as const } : filters.severity ? { severity: filters.severity } : {}),
        ...(filters.overdue ? { overdue: true } : {}),
        ...(filters.exclude_active_exceptions ? { exclude_active_exceptions: true } : {}),
        ...(filters.department_id !== null ? { department_id: filters.department_id } : {}),
        ...(filters.owner_user_id !== null ? { owner_user_id: filters.owner_user_id } : {}),
        ...(filters.remediation_status ? { remediation_status: filters.remediation_status } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(sort ? { sort, sort_by: sort.field as IssueListFilters['sort_by'], sort_order: sort.direction } : {}),
        ...(issueGroupBy(view) ? { group_by: issueGroupBy(view) } : {}),
        ...(groupValue ? { group_value: groupValue } : {}),
    };
}
