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

export interface SchedulerJobRunSummary {
    job_name: string;
    run_id: string;
    status: string;
    trigger_type: string;
    instance_id: string;
    scheduled_for: string | null;
    started_at: string;
    finished_at: string | null;
    duration_ms: number | null;
    result_json: Record<string, unknown> | null;
    error_message: string | null;
}

export interface SchedulerStatus {
    process_role: string;
    instance_id: string;
    process_started_at: string;
    scheduler_enabled: boolean;
    scheduler_running: boolean;
    lock_provider: string | null;
    lock_acquired: boolean;
    current_owner_instance_id: string | null;
    latest_runs: SchedulerJobRunSummary[];
    running_jobs: SchedulerJobRunSummary[];
}

export interface OutboxFailureSummary {
    id: string;
    event_type: string;
    status: string;
    attempt_count: number;
    available_at: string;
    created_at: string;
    locked_by: string | null;
    last_error: string | null;
}

export interface OutboxStatus {
    pending_count: number;
    processing_count: number;
    dead_letter_count: number;
    oldest_pending_age_seconds: number | null;
    last_dispatch_started_at: string | null;
    last_dispatch_finished_at: string | null;
    last_dispatch_status: string | null;
    last_dispatch_processed: number | null;
    last_dispatch_error: string | null;
    recent_failures: OutboxFailureSummary[];
}

export interface TechnicalLogEntry {
    id: number;
    timestamp: string;
    level: 'INFO' | 'WARNING' | 'ERROR';
    event_type: string;
    user_name: string | null;
    user_email: string | null;
    entity_type: string | null;
    description: string | null;
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
    active_sessions: number;
    last_login: string | null;
}

export interface DirectoryCheckResult {
    user_id: number;
    email: string;
    status: 'active' | 'deprovisioned' | 'error' | 'skipped';
    reason: string | null;
    revoked_sessions: number;
    orphaned_items_flagged: number;
}

export interface DirectoryCheckAllResponse {
    checked: number;
    deprovisioned: number;
    active: number;
    errors: number;
    skipped: number;
    results: DirectoryCheckResult[];
}

export interface DirectoryBreakGlassResponse {
    status: 'success';
    user_id: number;
}
