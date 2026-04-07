import { apiClient } from '@/services/apiClient';

import type {
    ActiveSession,
    DirectoryCheckAllResponse,
    DirectoryCheckResult,
    DocumentationResponse,
    LogConfig,
    OutboxStatus,
    RecentLogsResponse,
    SchedulerStatus,
    SystemHealth,
    SystemStats,
    TechnicalLogEntry,
} from './adminTypes';

export const adminRequests = {
    getSystemHealth: (options?: { signal?: AbortSignal }) =>
        apiClient.get<SystemHealth>('/admin/health', options),

    getSystemStats: () =>
        apiClient.get<SystemStats>('/admin/stats'),

    getSchedulerStatus: (options?: { signal?: AbortSignal }) =>
        apiClient.get<SchedulerStatus>('/admin/jobs/status', options),

    getOutboxStatus: (options?: { signal?: AbortSignal }) =>
        apiClient.get<OutboxStatus>('/admin/outbox/status', options),

    getTechnicalLogs: (params?: { event_type?: string; limit?: number }) =>
        apiClient.get<TechnicalLogEntry[]>('/admin/logs', { params }),

    getRecentLogs: (params?: { lines?: number; level?: string }) =>
        apiClient.get<RecentLogsResponse>('/admin/logs/recent', { params }),

    getAuditLogs: (params?: { lines?: number; event_type?: string }) =>
        apiClient.get<RecentLogsResponse>('/admin/logs/audit', { params }),

    getLogConfig: () =>
        apiClient.get<LogConfig>('/admin/logs/config'),

    updateLogConfig: (config: LogConfig) =>
        apiClient.post<LogConfig>('/admin/logs/config', config),

    getDocs: (locale: string = 'en') =>
        apiClient.get<DocumentationResponse>('/admin/docs', { params: { locale } }),

    getActiveSessions: () =>
        apiClient.get<ActiveSession[]>('/admin/sessions'),

    revokeSession: (userId: number) =>
        apiClient.post<{ status: string; message: string }>(`/admin/sessions/${userId}/revoke`, {}),

    checkDirectoryUser: (userId: number) =>
        apiClient.post<DirectoryCheckResult>(`/admin/directory/check-user/${userId}`, {}),

    checkAllDirectoryUsers: () =>
        apiClient.post<DirectoryCheckAllResponse>('/admin/directory/check-all', {}),
};
