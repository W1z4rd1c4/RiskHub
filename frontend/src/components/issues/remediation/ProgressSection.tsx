import { Button } from '@/components/ui/button';
import { Card, CardFooter, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';

import { REMEDIATION_STATUSES } from './useRemediationPlanWorkflow';

interface ProgressSectionProps {
    blockerReason: string;
    canWrite: boolean;
    completionNotes: string;
    isInProgress: boolean;
    isSubmitting: boolean;
    onBlockerReasonChange: (value: string) => void;
    onCompletionNotesChange: (value: string) => void;
    onProgressPercentChange: (value: string) => void;
    onRemediationStatusChange: (value: string) => void;
    onUpdateProgress: () => void;
    progressPercent: string;
    remediationStatus: string;
}

export function ProgressSection({
    blockerReason,
    canWrite,
    completionNotes,
    isInProgress,
    isSubmitting,
    onBlockerReasonChange,
    onCompletionNotesChange,
    onProgressPercentChange,
    onRemediationStatusChange,
    onUpdateProgress,
    progressPercent,
    remediationStatus,
}: ProgressSectionProps) {
    const { t } = useTranslation('issues');
    const isReadOnly = !canWrite || isSubmitting;

    return (
        <Card as="section" className="space-y-5" data-testid="workflow-progress-card">
            <CardHeader title={t('workflow.sections.remediation_progress')} />
            <div className="grid gap-4 md:grid-cols-2">
                <Field label={t('workflow.fields.progress')}>
                    {(field) => (
                        <Input
                            {...field}
                            type="number"
                            min={0}
                            max={100}
                            value={progressPercent}
                            onChange={(event) => onProgressPercentChange(event.target.value)}
                            disabled={isReadOnly}
                        />
                    )}
                </Field>
                <Field label={t('workflow.fields.remediation_status')}>
                    {(field) => (
                        <ThemedSelect
                            {...field}
                            value={remediationStatus}
                            onValueChange={onRemediationStatusChange}
                            options={REMEDIATION_STATUSES.map((statusValue) => ({
                                value: statusValue,
                                label: t(`remediation_status.${statusValue}`, statusValue),
                            }))}
                            disabled={isReadOnly}
                            className="w-full"
                        />
                    )}
                </Field>
                <details className="rounded-xl border border-border bg-nested px-4 py-3 md:col-span-2">
                    <summary className="text-eyebrow cursor-pointer">
                        {t('workflow.sections.advanced_progress')}
                    </summary>
                    <div className="mt-3 space-y-3">
                        <Field label={t('workflow.fields.blocker_reason')}>
                            {(field) => (
                                <Input
                                    {...field}
                                    type="text"
                                    value={blockerReason}
                                    onChange={(event) => onBlockerReasonChange(event.target.value)}
                                    disabled={isReadOnly}
                                />
                            )}
                        </Field>
                        <Field label={t('workflow.fields.completion_notes')}>
                            {(field) => (
                                <Textarea
                                    {...field}
                                    value={completionNotes}
                                    onChange={(event) => onCompletionNotesChange(event.target.value)}
                                    disabled={isReadOnly}
                                />
                            )}
                        </Field>
                    </div>
                </details>
            </div>
            {canWrite && (
                <CardFooter className="justify-start">
                    <Button
                        variant={isInProgress ? 'accent' : 'secondary'}
                        onClick={onUpdateProgress}
                        disabled={isSubmitting}
                    >
                        {t('actions.update_progress')}
                    </Button>
                </CardFooter>
            )}
        </Card>
    );
}
