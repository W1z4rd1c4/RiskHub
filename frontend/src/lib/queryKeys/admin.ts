export const adminKeys = {
    sessions: () => ['adminSessions'] as const,
    capabilities: () => ['adminCapabilities'] as const,
    auditLogs: (lines: number, eventFilter: string) => ['adminAuditLogs', lines, eventFilter] as const,
    auditLogUsers: (auditUserIds: readonly number[]) => ['adminAuditLogUsers', auditUserIds] as const,
    health: () => ['adminHealth'] as const,
    schedulerStatus: () => ['adminSchedulerStatus'] as const,
    outboxStatus: () => ['adminOutboxStatus'] as const,
    stats: () => ['adminStats'] as const,
    logs: (eventFilter: string) => ['adminLogs', eventFilter] as const,
    logConfig: () => ['logConfig'] as const,
};
