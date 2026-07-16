import { apiClient } from './apiClient';
import { buildCollectionParams, normalizeCollectionResponse } from './collectionApi';
import {
    issueDepartmentLookupArraySchema,
    issueExceptionSchema,
    issueLinkSchema,
    issueListResponseSchema,
    issueOwnerLookupArraySchema,
    issueSchema,
    voidSchema,
} from '@/services/api/schemas';
import type { RequestOptions } from '@/services/apiClient';
import type {
    Issue,
    IssueApproveExceptionPayload,
    IssueAssignPayload,
    IssueClosePayload,
    IssueContextCreatePayload,
    IssueCreatePayload,
    IssueDepartmentLookup,
    IssueException,
    IssueLink,
    IssueLinkPayload,
    IssueListResponse,
    IssueListFilters,
    IssueOwnerLookup,
    IssueProgressPayload,
    IssueRequestExceptionPayload,
    IssueStartRemediationPayload,
    IssueUpdatePayload,
} from '@/types/issue';

function compactIssueFilters(filters: IssueListFilters): Record<string, string | number | boolean | undefined> {
    return {
        status: filters.status,
        severity: filters.severity,
        severity_group: filters.severity_group,
        owner_user_id: filters.owner_user_id,
        department_id: filters.department_id,
        overdue: filters.overdue,
        exclude_active_exceptions: filters.exclude_active_exceptions,
        has_active_exception: filters.has_active_exception,
        remediation_status: filters.remediation_status,
        linked_risk_id: filters.linked_risk_id,
        linked_control_id: filters.linked_control_id,
        linked_vendor_id: filters.linked_vendor_id,
        search: filters.search,
        include_closed: filters.include_closed,
    };
}

export function buildIssueCollectionQuery(filters: IssueListFilters = {}): URLSearchParams {
    const built = buildCollectionParams({
        offset: filters.offset,
        limit: filters.limit,
        filters: compactIssueFilters(filters),
        sort: filters.sort ?? (filters.sort_by
            ? { field: filters.sort_by, direction: filters.sort_order ?? 'asc' }
            : null),
        groupBy: filters.group_by,
        groupValue: filters.group_value,
    });
    const query = new URLSearchParams();
    Object.entries(built).forEach(([key, value]) => query.set(key, String(value)));
    return query;
}

async function downloadIssueExport(filters: IssueListFilters, locale: 'en' | 'cs'): Promise<void> {
    const query = buildIssueCollectionQuery(filters);
    query.delete('offset');
    query.delete('limit');
    query.set('format', 'csv');
    query.set('locale', locale);
    const { blob, headers } = await apiClient.getBlob(`/issues/export?${query.toString()}`, { timeoutMs: null });
    const match = headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = match?.[1] ?? 'issues.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}

export const issuesApi = {
    async listDepartments(): Promise<IssueDepartmentLookup[]> {
        return apiClient.get('/issues/lookups/departments', {
            schema: issueDepartmentLookupArraySchema,
        });
    },

    async listAssignableOwners(departmentId: number): Promise<IssueOwnerLookup[]> {
        return apiClient.get('/issues/lookups/owners', {
            params: { department_id: departmentId },
            schema: issueOwnerLookupArraySchema,
        });
    },

    async list(filters: IssueListFilters = {}): Promise<IssueListResponse> {
        const response = await apiClient.get('/issues', {
            params: buildIssueCollectionQuery(filters),
            schema: issueListResponseSchema,
        });
        return normalizeCollectionResponse(response);
    },

    downloadExport: downloadIssueExport,

    async get(issueId: number, options?: RequestOptions): Promise<Issue> {
        return apiClient.get(`/issues/${issueId}`, {
            ...options,
            schema: issueSchema,
        });
    },

    async create(payload: IssueCreatePayload): Promise<Issue> {
        return apiClient.post('/issues', payload, { schema: issueSchema });
    },

    async createContextual(payload: IssueContextCreatePayload): Promise<Issue> {
        return apiClient.post('/issues/contextual', payload, { schema: issueSchema });
    },

    async update(issueId: number, payload: IssueUpdatePayload): Promise<Issue> {
        return apiClient.patch(`/issues/${issueId}`, payload, { schema: issueSchema });
    },

    async addLink(issueId: number, payload: IssueLinkPayload): Promise<IssueLink> {
        return apiClient.post(`/issues/${issueId}/links`, payload, { schema: issueLinkSchema });
    },

    async deleteLink(issueId: number, linkId: number): Promise<void> {
        await apiClient.delete(`/issues/${issueId}/links/${linkId}`, { schema: voidSchema });
    },

    async assign(issueId: number, payload: IssueAssignPayload): Promise<Issue> {
        return apiClient.post(`/issues/${issueId}/assign`, payload, { schema: issueSchema });
    },

    async startRemediation(issueId: number, payload: IssueStartRemediationPayload): Promise<Issue> {
        return apiClient.post(`/issues/${issueId}/start-remediation`, payload, { schema: issueSchema });
    },

    async updateProgress(issueId: number, payload: IssueProgressPayload): Promise<Issue> {
        return apiClient.post(`/issues/${issueId}/update-progress`, payload, { schema: issueSchema });
    },

    async requestException(issueId: number, payload: IssueRequestExceptionPayload): Promise<IssueException> {
        return apiClient.post(`/issues/${issueId}/request-exception`, payload, {
            schema: issueExceptionSchema,
        });
    },

    async approveException(issueId: number, payload: IssueApproveExceptionPayload): Promise<IssueException> {
        return apiClient.post(`/issues/${issueId}/approve-exception`, payload, {
            schema: issueExceptionSchema,
        });
    },

    async close(issueId: number, payload: IssueClosePayload): Promise<Issue> {
        return apiClient.post(`/issues/${issueId}/close`, payload, { schema: issueSchema });
    },
};
