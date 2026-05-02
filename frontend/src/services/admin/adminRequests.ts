import { apiClient } from '@/services/apiClient';
import {
    activeSessionArraySchema,
    adminConsoleCapabilitiesSchema,
    directoryBreakGlassResponseSchema,
    directoryCheckAllResponseSchema,
    directoryCheckResultSchema,
    documentationResponseSchema,
    logConfigSchema,
    outboxStatusSchema,
    recentLogsResponseSchema,
    schedulerStatusSchema,
    statusMessageSchema,
    systemHealthSchema,
    systemStatsSchema,
    technicalLogEntryArraySchema,
} from '@/services/api/schemas';

import type {
    LogConfig,
} from './adminTypes';

export const adminRequests = {
    getSystemHealth: (options?: { signal?: AbortSignal }) =>
        apiClient.get('/admin/health', { ...options, schema: systemHealthSchema }),

    getSystemStats: () =>
        apiClient.get('/admin/stats', { schema: systemStatsSchema }),

    getCapabilities: () =>
        apiClient.get('/admin/capabilities', { schema: adminConsoleCapabilitiesSchema }),

    getSchedulerStatus: (options?: { signal?: AbortSignal }) =>
        apiClient.get('/admin/jobs/status', { ...options, schema: schedulerStatusSchema }),

    getOutboxStatus: (options?: { signal?: AbortSignal }) =>
        apiClient.get('/admin/outbox/status', { ...options, schema: outboxStatusSchema }),

    getTechnicalLogs: (params?: { event_type?: string; limit?: number }) =>
        apiClient.get('/admin/logs', { params, schema: technicalLogEntryArraySchema }),

    getRecentLogs: (params?: { lines?: number; level?: string }) =>
        apiClient.get('/admin/logs/recent', { params, schema: recentLogsResponseSchema }),

    getAuditLogs: (params?: { lines?: number; event_type?: string }) =>
        apiClient.get('/admin/logs/audit', { params, schema: recentLogsResponseSchema }),

    getLogConfig: () =>
        apiClient.get('/admin/logs/config', { schema: logConfigSchema }),

    updateLogConfig: (config: LogConfig) =>
        apiClient.post('/admin/logs/config', config, { schema: logConfigSchema }),

    getDocs: (locale: string = 'en') =>
        apiClient.get('/admin/docs', { params: { locale }, schema: documentationResponseSchema }),

    getActiveSessions: () =>
        apiClient.get('/admin/sessions', { schema: activeSessionArraySchema }),

    revokeSession: (userId: number) =>
        apiClient.post(`/admin/sessions/${userId}/revoke`, {}, { schema: statusMessageSchema }),

    checkDirectoryUser: (userId: number) =>
        apiClient.post(`/admin/directory/check-user/${userId}`, {}, {
            schema: directoryCheckResultSchema,
        }),

    checkAllDirectoryUsers: () =>
        apiClient.post('/admin/directory/check-all', {}, {
            schema: directoryCheckAllResponseSchema,
        }),

    breakGlassEnableDirectoryUser: (userId: number, payload: { reason: string; expires_in_hours: number }) =>
        apiClient.post(`/admin/directory/break-glass-enable/${userId}`, payload, {
            schema: directoryBreakGlassResponseSchema,
        }),
};
