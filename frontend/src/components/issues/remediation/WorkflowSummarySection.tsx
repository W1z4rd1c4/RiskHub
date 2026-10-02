import { useMemo } from 'react';

import { Card, CardHeader } from '@/components/ui/card';
import { InlineMessage } from '@/components/ui/inline-message';
import { translateUiMessage, useFormat, useTranslation } from '@/i18n/hooks';
import type { Issue } from '@/types/issue';

import { IssueStatusBadge } from '../IssueBadges';
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
        <Card as="section" className="space-y-5" data-testid="workflow-summary-card">
            <CardHeader
                title={t('workflow.sections.workflow_summary')}
                description={t('workflow.title')}
                actions={<IssueStatusBadge status={issue.status} />}
            />

            {errorKey && (
                <InlineMessage tone="danger">{translateUiMessage(t, errorKey)}</InlineMessage>
            )}

            <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <SummaryField
                    label={t('workflow.fields.owner')}
                    value={
                        issue.owner_user_name ||
                        (issue.owner_user_id ? t('common:fallbacks.unknown_user') : t('common:fallbacks.unassigned'))
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
                <SummaryField label={t('workflow.fields.progress')} value={format.percent((remediation?.progress_percent ?? 0) / 100)} />
                <SummaryField
                    label={t('workflow.fields.target_date')}
                    value={formatDateTime(remediation?.target_date)}
                />
                <SummaryField
                    label={t('workflow.fields.completed_at')}
                    value={formatDateTime(remediation?.completed_at)}
                />
            </dl>
            <p className="text-sm text-muted-foreground">{nextStepLabel}</p>
        </Card>
    );
}
