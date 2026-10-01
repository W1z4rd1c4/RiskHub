import { useMemo } from 'react';

import { translateUiMessage, useFormat, useTranslation } from '@/i18n/hooks';
import type { Issue, IssueStatus } from '@/types/issue';

import {
    ISSUE_SECTION_CARD,
    ISSUE_SECTION_HEADER,
    ISSUE_SECTION_SUBTITLE,
    ISSUE_SECTION_TITLE,
    issuePill,
    issueStatusClass,
} from '../issueUi';
import { SummaryField } from './SummaryField';

interface WorkflowSummarySectionProps {
    errorKey: string | null;
    issue: Issue;
}

export function WorkflowSummarySection({ errorKey, issue }: WorkflowSummarySectionProps) {
    const { t } = useTranslation('issues');
    const format = useFormat();
    const formatDateTime = (value: string | null | undefined) => format.dateTime(value) || t('fallbacks.not_set');
    const remediation = issue.remediation_plan;
    const issueStatusLabel = (status: IssueStatus): string => t(`status.${status}`, status.replaceAll('_', ' '));
    const nextStepLabel = useMemo(() => {
        if (issue.status === 'open' || issue.status === 'triaged') {
            return t('workflow.next_step.assignment');
        }
        if (issue.status === 'in_progress') {
            return t('workflow.next_step.progress');
        }
        if (issue.status === 'ready_for_validation') {
            return t('workflow.next_step.close');
        }
        if (issue.status === 'closed') {
            return t('workflow.next_step.closed');
        }
        return '';
    }, [issue.status, t]);

    return (
        <section className={ISSUE_SECTION_CARD} data-testid="workflow-summary-card">
            <div className={ISSUE_SECTION_HEADER}>
                <div>
                    <h3 className={ISSUE_SECTION_TITLE}>{t('workflow.sections.workflow_summary')}</h3>
                    <p className={ISSUE_SECTION_SUBTITLE}>{t('workflow.title')}</p>
                </div>
                <span className={issuePill(issueStatusClass(issue.status))}>{issueStatusLabel(issue.status)}</span>
            </div>

            {errorKey && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {translateUiMessage(t, errorKey)}
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <SummaryField
                    label={t('workflow.fields.owner')}
                    value={
                        issue.owner_user_name ||
                        (issue.owner_user_id ? t('fallbacks.unknown_user') : t('fallbacks.unassigned'))
                    }
                />
                <SummaryField
                    label={t('workflow.fields.due_at')}
                    value={formatDateTime(issue.due_at)}
                />
                <SummaryField
                    label={t('workflow.fields.remediation_status')}
                    value={
                        remediation
                            ? t(`remediation_status.${remediation.status}`, remediation.status)
                            : t('workflow.messages.not_created')
                    }
                />
                <SummaryField label={t('workflow.fields.progress')} value={`${remediation?.progress_percent ?? 0}%`} />
                <SummaryField
                    label={t('workflow.fields.target_date')}
                    value={formatDateTime(remediation?.target_date)}
                />
                <SummaryField
                    label={t('workflow.fields.completed_at')}
                    value={formatDateTime(remediation?.completed_at)}
                />
            </div>
            <p className="text-sm text-muted-foreground">{nextStepLabel}</p>
        </section>
    );
}
