import { issuePill, issueSeverityClass, issueStatusClass } from '@/components/issues/issueUi';
import type { Column } from '@/components/tables';
import type { SafeTFunction } from '@/i18n/hooks';
import type { IssueSummary } from '@/types/issue';

import { formatIssueDateTime } from './issuesPagePresentation';

export function buildIssueColumns({
    language,
    t,
}: {
    language: string;
    t: SafeTFunction;
}): Column<IssueSummary>[] {
    return [
        {
            key: 'title',
            label: t('issues:columns.issue'),
            sortable: true,
            render: (issue) => <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">{issue.title}</p>
                <div className="flex flex-wrap items-center gap-2">
                    <span className={issuePill(issueStatusClass(issue.status))}>
                        {t(`issues:status.${issue.status}`, issue.status.replaceAll('_', ' '))}
                    </span>
                    <span className={issuePill(issueSeverityClass(issue.severity))}>
                        {t(`issues:severity.${issue.severity}`, issue.severity)}
                    </span>
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
            render: (issue) => <span className="text-sm text-foreground">{issue.owner_user_name || t('issues:fallbacks.unassigned')}</span>,
        },
        {
            key: 'source_type',
            label: t('issues:columns.source'),
            render: (issue) => <span className="text-sm text-foreground">
                {issue.source_display || t(`issues:source.${issue.source_type}`, issue.source_type.replaceAll('_', ' '))}
            </span>,
        },
        {
            key: 'due_at',
            label: t('issues:columns.due'),
            sortable: true,
            render: (issue) => <span className="text-sm text-foreground">{formatIssueDateTime(issue.due_at, language, t('issues:fallbacks.not_set'))}</span>,
        },
        {
            key: 'opened_at',
            label: t('issues:columns.opened'),
            sortable: true,
            render: (issue) => <span className="text-sm text-foreground">{formatIssueDateTime(issue.opened_at, language, t('issues:fallbacks.not_set'))}</span>,
        },
    ];
}
