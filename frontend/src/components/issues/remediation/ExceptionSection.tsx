import { Button } from '@/components/ui/button';
import { Card, CardFooter, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/i18n/hooks';

interface ExceptionSectionProps {
    canApprove: boolean;
    canWrite: boolean;
    exceptionExpiresAt: string;
    exceptionReason: string;
    isInProgress: boolean;
    isSubmitting: boolean;
    onApproveException: () => void;
    onExceptionExpiresAtChange: (value: string) => void;
    onExceptionReasonChange: (value: string) => void;
    onRequestException: () => void;
    requestedExceptionId: number | undefined;
}

export function ExceptionSection({
    canApprove,
    canWrite,
    exceptionExpiresAt,
    exceptionReason,
    isInProgress,
    isSubmitting,
    onApproveException,
    onExceptionExpiresAtChange,
    onExceptionReasonChange,
    onRequestException,
    requestedExceptionId,
}: ExceptionSectionProps) {
    const { t } = useTranslation('issues');
    const canApproveRequested = canApprove && Boolean(requestedExceptionId);

    return (
        <Card as="section" className="space-y-5" data-testid="workflow-exception-card">
            <CardHeader title={t('workflow.sections.exception_handling')} />
            <div className="grid gap-4 md:grid-cols-2">
                <Field label={t('workflow.fields.exception_reason')} className="md:col-span-2">
                    {(field) => (
                        <Textarea
                            {...field}
                            value={exceptionReason}
                            onChange={(event) => onExceptionReasonChange(event.target.value)}
                            disabled={!canWrite || isSubmitting}
                        />
                    )}
                </Field>
                {canApproveRequested && (
                    <Field label={t('workflow.fields.approve_until')}>
                        {(field) => (
                            <Input
                                {...field}
                                type="datetime-local"
                                value={exceptionExpiresAt}
                                onChange={(event) => onExceptionExpiresAtChange(event.target.value)}
                                disabled={isSubmitting}
                            />
                        )}
                    </Field>
                )}
            </div>
            {(canWrite || canApproveRequested) && (
                <CardFooter className="justify-start">
                    {canWrite && (
                        <Button
                            variant={isInProgress ? 'warning' : 'secondary'}
                            onClick={onRequestException}
                            disabled={isSubmitting}
                        >
                            {t('actions.request_exception')}
                        </Button>
                    )}
                    {canApproveRequested && (
                        <Button variant="secondary" onClick={onApproveException} disabled={isSubmitting}>
                            {t('actions.approve_exception')}
                        </Button>
                    )}
                </CardFooter>
            )}
            {canApprove && !requestedExceptionId && (
                <p className="text-sm text-muted-foreground">{t('workflow.messages.no_requested_exception')}</p>
            )}
        </Card>
    );
}
