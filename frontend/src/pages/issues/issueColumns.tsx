import { PendingChangeBadge } from '@/components/approvals/PendingChangeBadge';
import { IssueSeverityBadge, IssueStatusBadge } from '@/components/issues/IssueBadges';
import type { Column } from '@/components/tables';
import type { FormatApi, SafeTFunction } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { IssueSummary } from '@/types/issue';

export function buildIssueColumns({
    format,
    t,
}: {
    format: Pick<FormatApi, 'dateTime'>;
    t: SafeTFunction;
}): Column<IssueSummary>[] {
    const formatDateTime = (value: string | null) => format.dateTime(value) || t('issues:fallbacks.not_set');
    return [
        {
            key: 'title',
            label: t('issues:columns.issue'),
            sortable: true,
            render: (issue) => <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">{issue.title}</p>
                <div className="flex flex-wrap items-center gap-2">
                    <IssueStatusBadge status={issue.status} size="sm" />
                    <IssueSeverityBadge severity={issue.severity} size="sm" />
                    {/* PG-29: an exception request waiting for approval. */}
                    {resolveCapabilityFlag(issue.capabilities, 'has_pending_exception_request')
                        ? <PendingChangeBadge data-testid={`issue-pending-${issue.id}`} />
                        : null}
                </div>
            </div>,
        },
        {
            key: 'department_name',
            label: t('issues:columns.department'),
            render: (issue) => <span className="text-sm text-foreground">{issue.department_name || t('issues:fallbacks.unknown_department')}</span>,
        },
        {
            key: 'owner_user_name',
            label: t('issues:columns.owner'),
            render: (issue) => <span className="text-sm text-foreground">{issue.owner_user_name || t('common:fallbacks.unassigned')}</span>,
        },
        {
            key: 'source_type',
            label: t('issues:columns.source'),
            render: (issue) => <span className="text-sm text-foreground">
                {issue.source_display || t(`issues:source.${issue.source_type}`, t('common:fallbacks.unknown'))}
            </span>,
        },
        {
            key: 'due_at',
            label: t('issues:columns.due'),
            sortable: true,
            render: (issue) => <span className="text-sm text-foreground">{formatDateTime(issue.due_at)}</span>,
        },
        {
            key: 'opened_at',
            label: t('issues:columns.opened'),
            sortable: true,
            render: (issue) => <span className="text-sm text-foreground">{formatDateTime(issue.opened_at)}</span>,
        },
    ];
}
