import { useMemo } from 'react';

import { useTranslation } from '@/i18n/hooks';
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
import { formatWorkflowDate } from './remediationPresentation';

interface WorkflowSummarySectionProps {
    errorKey: string | null;
    issue: Issue;
}

export function WorkflowSummarySection({ errorKey, issue }: WorkflowSummarySectionProps) {
    const { t, i18n } = useTranslation('issues');
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
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                    {errorKey.startsWith('errorKeys.')
                        ? t(errorKey.replace('errorKeys.', ''), { ns: 'errorKeys' })
                        : t(errorKey)}
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
                    value={formatWorkflowDate(issue.due_at, i18n.language, t('fallbacks.not_set'))}
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
                    value={formatWorkflowDate(remediation?.target_date, i18n.language, t('fallbacks.not_set'))}
                />
                <SummaryField
                    label={t('workflow.fields.completed_at')}
                    value={formatWorkflowDate(remediation?.completed_at, i18n.language, t('fallbacks.not_set'))}
                />
            </div>
            <p className="text-sm text-slate-400">{nextStepLabel}</p>
        </section>
    );
}
