import { apiClient } from './apiClient';
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
    IssueListFilters,
    IssueListResponse,
    IssueOwnerLookup,
    IssueProgressPayload,
    IssueRequestExceptionPayload,
    IssueStartRemediationPayload,
    IssueUpdatePayload,
} from '@/types/issue';

type IssueQueryParams = Record<string, string | number | boolean | null | undefined>;

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
        return apiClient.get('/issues', {
            params: filters as IssueQueryParams,
            schema: issueListResponseSchema,
        });
    },

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
