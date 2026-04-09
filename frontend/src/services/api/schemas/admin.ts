import type {
    ActiveSession,
    DirectoryCheckAllResponse,
    DirectoryCheckResult,
    DocumentationEntry,
    DocumentationResponse,
    LogConfig,
    OutboxFailureSummary,
    OutboxStatus,
    RecentLogEntry,
    RecentLogsResponse,
    SchedulerJobRunSummary,
    SchedulerStatus,
    SystemHealth,
    SystemStats,
    TechnicalLogEntry,
} from '@/services/admin/adminTypes';

import { passthroughObject, stringArraySchema, unknownRecordSchema, z } from './common';

export const systemHealthSchema: z.ZodType<SystemHealth> = passthroughObject({
    database_status: z.string(),
    database_latency_ms: z.number(),
    uptime_seconds: z.number(),
    memory_usage_mb: z.number(),
    last_check: z.string(),
});
export const systemStatsSchema: z.ZodType<SystemStats> = passthroughObject({
    total_users: z.number(),
    active_users_24h: z.number(),
    total_risks: z.number(),
    total_controls: z.number(),
    total_kris: z.number(),
    pending_approvals: z.number(),
});
export const schedulerJobRunSummarySchema: z.ZodType<SchedulerJobRunSummary> =
    passthroughObject({
        job_name: z.string(),
        run_id: z.string(),
        status: z.string(),
        trigger_type: z.string(),
        instance_id: z.string(),
        scheduled_for: z.string().nullable(),
        started_at: z.string(),
        finished_at: z.string().nullable(),
        duration_ms: z.number().nullable(),
        result_json: unknownRecordSchema.nullable(),
        error_message: z.string().nullable(),
    });
export const schedulerStatusSchema: z.ZodType<SchedulerStatus> = passthroughObject({
    process_role: z.string(),
    instance_id: z.string(),
    process_started_at: z.string(),
    scheduler_enabled: z.boolean(),
    scheduler_running: z.boolean(),
    lock_provider: z.string().nullable(),
    lock_acquired: z.boolean(),
    current_owner_instance_id: z.string().nullable(),
    latest_runs: z.array(schedulerJobRunSummarySchema),
    running_jobs: z.array(schedulerJobRunSummarySchema),
});
export const outboxFailureSummarySchema: z.ZodType<OutboxFailureSummary> = passthroughObject({
    id: z.string(),
    event_type: z.string(),
    status: z.string(),
    attempt_count: z.number(),
    available_at: z.string(),
    created_at: z.string(),
    locked_by: z.string().nullable(),
    last_error: z.string().nullable(),
});
export const outboxStatusSchema: z.ZodType<OutboxStatus> = passthroughObject({
    pending_count: z.number(),
    processing_count: z.number(),
    dead_letter_count: z.number(),
    oldest_pending_age_seconds: z.number().nullable(),
    last_dispatch_started_at: z.string().nullable(),
    last_dispatch_finished_at: z.string().nullable(),
    last_dispatch_status: z.string().nullable(),
    last_dispatch_processed: z.number().nullable(),
    last_dispatch_error: z.string().nullable(),
    recent_failures: z.array(outboxFailureSummarySchema),
});
export const technicalLogEntrySchema: z.ZodType<TechnicalLogEntry> = passthroughObject({
    id: z.number(),
    timestamp: z.string(),
    level: z.enum(['INFO', 'WARNING', 'ERROR']),
    event_type: z.string(),
    user_name: z.string().nullable(),
    user_email: z.string().nullable(),
    entity_type: z.string().nullable(),
    description: z.string().nullable(),
});
export const technicalLogEntryArraySchema = z.array(technicalLogEntrySchema);
export const recentLogEntrySchema: z.ZodType<RecentLogEntry> = passthroughObject({
    timestamp: z.string().nullable(),
    level: z.string().nullable(),
    event: z.string().nullable(),
    logger_name: z.string().nullable(),
    request_id: z.string().nullable(),
    user_id: z.number().nullable(),
    client_ip: z.string().nullable(),
    feature: z.string().nullable(),
    extra: unknownRecordSchema,
});
export const recentLogsResponseSchema: z.ZodType<RecentLogsResponse> = passthroughObject({
    entries: z.array(recentLogEntrySchema),
    total_lines: z.number(),
    file_path: z.string(),
});
export const logConfigSchema: z.ZodType<LogConfig> = passthroughObject({
    app_log_rotation_size_mb: z.number(),
    app_log_retention_count: z.number(),
    audit_log_rotation_size_mb: z.number(),
    audit_log_retention_count: z.number(),
});
export const documentationEntrySchema: z.ZodType<DocumentationEntry> = passthroughObject({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    summary: z.string().nullable(),
    version: z.string().nullable(),
    last_updated: z.string().nullable(),
    source_of_truth: z.string().nullable(),
    content: z.string(),
    audience: z.enum(['admin', 'user']),
    tags: stringArraySchema,
});
export const documentationResponseSchema: z.ZodType<DocumentationResponse> = passthroughObject({
    documents: z.array(documentationEntrySchema),
});
export const activeSessionSchema: z.ZodType<ActiveSession> = passthroughObject({
    user_id: z.number(),
    user_name: z.string(),
    user_email: z.string(),
    role: z.string(),
    department: z.string().nullable(),
    last_activity: z.string(),
    is_active: z.boolean(),
    active_sessions: z.number(),
    last_login: z.string().nullable(),
});
export const activeSessionArraySchema = z.array(activeSessionSchema);
export const directoryCheckResultSchema: z.ZodType<DirectoryCheckResult> = passthroughObject({
    user_id: z.number(),
    email: z.string(),
    status: z.enum(['active', 'deprovisioned', 'error', 'skipped']),
    reason: z.string().nullable(),
    revoked_sessions: z.number(),
    orphaned_items_flagged: z.number(),
});
export const directoryCheckAllResponseSchema: z.ZodType<DirectoryCheckAllResponse> =
    passthroughObject({
        checked: z.number(),
        deprovisioned: z.number(),
        active: z.number(),
        errors: z.number(),
        skipped: z.number(),
        results: z.array(directoryCheckResultSchema),
    });
