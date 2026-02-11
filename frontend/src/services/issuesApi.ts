import { apiClient } from './apiClient';
import type {
    Issue,
    IssueApproveExceptionPayload,
    IssueAssignPayload,
    IssueClosePayload,
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

export const issuesApi = {
    async listDepartments(): Promise<IssueDepartmentLookup[]> {
        return apiClient.get<IssueDepartmentLookup[]>('/issues/lookups/departments');
    },

    async listAssignableOwners(departmentId: number): Promise<IssueOwnerLookup[]> {
        return apiClient.get<IssueOwnerLookup[]>('/issues/lookups/owners', {
            params: { department_id: departmentId },
        });
    },

    async list(filters: IssueListFilters = {}): Promise<IssueListResponse> {
        return apiClient.get<IssueListResponse>('/issues', { params: filters });
    },

    async get(issueId: number): Promise<Issue> {
        return apiClient.get<Issue>(`/issues/${issueId}`);
    },

    async create(payload: IssueCreatePayload): Promise<Issue> {
        return apiClient.post<Issue>('/issues', payload);
    },

    async update(issueId: number, payload: IssueUpdatePayload): Promise<Issue> {
        return apiClient.patch<Issue>(`/issues/${issueId}`, payload);
    },

    async addLink(issueId: number, payload: IssueLinkPayload): Promise<IssueLink> {
        return apiClient.post<IssueLink>(`/issues/${issueId}/links`, payload);
    },

    async deleteLink(issueId: number, linkId: number): Promise<void> {
        await apiClient.delete(`/issues/${issueId}/links/${linkId}`);
    },

    async assign(issueId: number, payload: IssueAssignPayload): Promise<Issue> {
        return apiClient.post<Issue>(`/issues/${issueId}/assign`, payload);
    },

    async startRemediation(issueId: number, payload: IssueStartRemediationPayload): Promise<Issue> {
        return apiClient.post<Issue>(`/issues/${issueId}/start-remediation`, payload);
    },

    async updateProgress(issueId: number, payload: IssueProgressPayload): Promise<Issue> {
        return apiClient.post<Issue>(`/issues/${issueId}/update-progress`, payload);
    },

    async requestException(issueId: number, payload: IssueRequestExceptionPayload): Promise<IssueException> {
        return apiClient.post<IssueException>(`/issues/${issueId}/request-exception`, payload);
    },

    async approveException(issueId: number, payload: IssueApproveExceptionPayload): Promise<IssueException> {
        return apiClient.post<IssueException>(`/issues/${issueId}/approve-exception`, payload);
    },

    async close(issueId: number, payload: IssueClosePayload): Promise<Issue> {
        return apiClient.post<Issue>(`/issues/${issueId}/close`, payload);
    },
};
