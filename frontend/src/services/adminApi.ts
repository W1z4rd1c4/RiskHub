import { apiClient } from './apiClient';

// ============================================================================
// Types
// ============================================================================

export interface SystemHealth {
    database_status: string;
    database_latency_ms: number;
    uptime_seconds: number;
    memory_usage_mb: number;
    last_check: string;
}

export interface SystemStats {
    total_users: number;
    active_users_24h: number;
    total_risks: number;
    total_controls: number;
    total_kris: number;
    pending_approvals: number;
}

export interface TechnicalLogEntry {
    id: number;
    timestamp: string;
    level: 'INFO' | 'WARNING' | 'ERROR';
    event_type: string;
    user_name: string | null;
    user_email: string | null;
    entity_type: string | null;
    details: string | null;
}

export interface RecentLogEntry {
    timestamp: string | null;
    level: string | null;
    event: string | null;
    logger_name: string | null;
    request_id: string | null;
    user_id: number | null;
    client_ip: string | null;
    feature: string | null;
    extra: Record<string, unknown>;
}

export interface RecentLogsResponse {
    entries: RecentLogEntry[];
    total_lines: number;
    file_path: string;
}

export interface LogConfig {
    app_log_rotation_size_mb: number;
    app_log_retention_count: number;
    audit_log_rotation_size_mb: number;
    audit_log_retention_count: number;
}

export interface DocumentationEntry {
    id: string;
    slug: string;
    title: string;
    summary: string | null;
    version: string | null;
    last_updated: string | null;
    source_of_truth: string | null;
    content: string;
    audience: 'admin' | 'user';
    tags: string[];
}

export interface DocumentationResponse {
    documents: DocumentationEntry[];
}

export interface ActiveSession {
    user_id: number;
    user_name: string;
    user_email: string;
    role: string;
    department: string | null;
    last_activity: string;
    is_active: boolean;
    last_login: string | null;
}

// ============================================================================
// API Client
// ============================================================================

export const adminApi = {
    // System Health
    getSystemHealth: () =>
        apiClient.get<SystemHealth>('/admin/health'),

    // System Stats
    getSystemStats: () =>
        apiClient.get<SystemStats>('/admin/stats'),

    // Technical Logs (Database-based)
    getTechnicalLogs: (params?: { event_type?: string; limit?: number }) =>
        apiClient.get<TechnicalLogEntry[]>('/admin/logs', { params }),

    // Recent Logs (File-based App Logs)
    getRecentLogs: (params?: { lines?: number; level?: string }) =>
        apiClient.get<RecentLogsResponse>('/admin/logs/recent', { params }),

    // Audit Logs (File-based Audit Logs)
    getAuditLogs: (params?: { lines?: number; event_type?: string }) =>
        apiClient.get<RecentLogsResponse>('/admin/logs/audit', { params }),

    // Log Configuration
    getLogConfig: () =>
        apiClient.get<LogConfig>('/admin/logs/config'),

    updateLogConfig: (config: LogConfig) =>
        apiClient.post<LogConfig>('/admin/logs/config', config),

    // Documentation (with locale support)
    getDocs: (locale: string = 'en') =>
        apiClient.get<DocumentationResponse>('/admin/docs', { params: { locale } }),

    // Active Sessions
    getActiveSessions: () =>
        apiClient.get<ActiveSession[]>('/admin/sessions'),

    // Revoke Session
    revokeSession: (userId: number) =>
        apiClient.post<{ status: string; message: string }>(`/admin/sessions/${userId}/revoke`, {}),
};
