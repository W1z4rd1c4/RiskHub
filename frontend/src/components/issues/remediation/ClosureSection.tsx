import { Button } from '@/components/ui/button';
import { Card, CardFooter, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { InlineMessage } from '@/components/ui/inline-message';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/i18n/hooks';
import type { Issue } from '@/types/issue';

import { SummaryField } from './SummaryField';

interface ClosedSectionProps {
    issue: Issue;
}

interface ClosureSectionProps {
    canWrite: boolean;
    isReadyForValidation: boolean;
    isSubmitting: boolean;
    onCloseIssue: () => void;
    onValidationNoteChange: (value: string) => void;
    validationNote: string;
}

export function ClosedSection({ issue }: ClosedSectionProps) {
    const { t } = useTranslation('issues');

    return (
        <Card as="section" className="space-y-5" data-testid="workflow-closed-card">
            <CardHeader title={t('workflow.sections.closure')} />
            <InlineMessage tone="success">{t('workflow.closed_notice')}</InlineMessage>
            <dl>
                <SummaryField
                    label={t('workflow.fields.validation_note')}
                    value={issue.validation_note || t('common:fallbacks.not_set')}
                />
            </dl>
        </Card>
    );
}

export function ClosureSection({
    canWrite,
    isReadyForValidation,
    isSubmitting,
    onCloseIssue,
    onValidationNoteChange,
    validationNote,
}: ClosureSectionProps) {
    const { t } = useTranslation('issues');

    return (
        <Card as="section" className="space-y-5" data-testid="workflow-closure-card">
            <CardHeader title={t('workflow.sections.closure')} />
            <Field label={t('workflow.fields.validation_note')}>
                {(field) => (
                    <Textarea
                        {...field}
                        value={validationNote}
                        onChange={(event) => onValidationNoteChange(event.target.value)}
                        disabled={!canWrite || isSubmitting}
                    />
                )}
            </Field>
            {canWrite && (
                <CardFooter className="justify-start">
                    <Button
                        variant={isReadyForValidation ? 'success' : 'secondary'}
                        onClick={onCloseIssue}
                        disabled={isSubmitting}
                    >
                        {t('actions.close_issue')}
                    </Button>
                </CardFooter>
            )}
        </Card>
    );
}
