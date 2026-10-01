import { useEffect, useId, useRef, useState } from 'react';
import { Download, FileDown } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { Button } from '@/components/ui/button';
import { DialogBody, DialogFooter, DialogHeader, DialogShell } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { InlineMessage } from '@/components/ui/inline-message';
import { Input } from '@/components/ui/input';
import { RadioGroup } from '@/components/ui/radio-group';

export type ExportFormat = 'csv';
export type ExportPurpose = 'current_view' | 'evaluation' | 'point_in_time';

export interface ExportDialogSubmitPayload {
    format: ExportFormat;
    asOfDate: string;
}

interface ExportDialogProps {
    dateMode?: 'evaluation' | 'point_in_time';
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (payload: ExportDialogSubmitPayload) => Promise<void>;
    onCurrentViewSubmit?: () => Promise<void>;
    isSubmitting?: boolean;
    title?: string;
    dataTestId?: string;
}

function getTodayLocalDate(): string {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

export function ExportDialog({
    dateMode = 'point_in_time',
    isOpen,
    onClose,
    onSubmit,
    onCurrentViewSubmit,
    isSubmitting = false,
    title,
    dataTestId = 'export-dialog',
}: ExportDialogProps) {
    const { t } = useTranslation('common');
    const supportsCurrentView = Boolean(onCurrentViewSubmit);
    const titleId = useId();
    const purposeId = useId();
    const submitButtonRef = useRef<HTMLButtonElement>(null);
    const [asOfDate, setAsOfDate] = useState<string>(getTodayLocalDate());
    const datedPurpose: Exclude<ExportPurpose, 'current_view'> = dateMode;
    const [purpose, setPurpose] = useState<ExportPurpose>(
        supportsCurrentView ? 'current_view' : datedPurpose,
    );
    const [submitFailed, setSubmitFailed] = useState(false);
    const datePurposeKey = dateMode === 'evaluation' ? 'evaluation' : 'point_in_time';

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        setAsOfDate(getTodayLocalDate());
        setPurpose(supportsCurrentView ? 'current_view' : datedPurpose);
        setSubmitFailed(false);
    }, [datedPurpose, isOpen, supportsCurrentView]);

    useEffect(() => {
        if (submitFailed && !isSubmitting) {
            submitButtonRef.current?.focus();
        }
    }, [isSubmitting, submitFailed]);

    const handleSubmit = async () => {
        if ((purpose === datedPurpose && !asOfDate) || isSubmitting) {
            return;
        }
        setSubmitFailed(false);
        try {
            if (purpose === 'current_view' && onCurrentViewSubmit) {
                await onCurrentViewSubmit();
            } else {
                await onSubmit({ format: 'csv', asOfDate });
            }
        } catch {
            setSubmitFailed(true);
        }
    };

    return (
        <DialogShell
            isOpen={isOpen}
            onClose={onClose}
            titleId={titleId}
            isBusy={isSubmitting}
            dataTestId={dataTestId}
            size="md"
            className="max-w-lg"
        >
            <DialogHeader title={title ?? t('export.title')} icon={FileDown} closeLabel={t('actions.close')} />

            <DialogBody className="space-y-5">
                {supportsCurrentView && (
                    <RadioGroup<ExportPurpose>
                        variant="card"
                        name={`${purposeId}-purpose`}
                        legend={t('export.purpose.label')}
                        legendClassName="ml-1 text-eyebrow"
                        value={purpose}
                        onValueChange={(next) => { setPurpose(next); setSubmitFailed(false); }}
                        options={[
                            {
                                value: 'current_view',
                                label: t('export.purpose.current_view.title'),
                                description: t('export.purpose.current_view.description'),
                                testId: 'export-purpose-current-view',
                            },
                            {
                                value: datedPurpose,
                                label: t(`export.purpose.${datePurposeKey}.title`),
                                description: t(`export.purpose.${datePurposeKey}.description`),
                                testId: datedPurpose === 'evaluation'
                                    ? 'export-purpose-evaluation'
                                    : 'export-purpose-point-in-time',
                            },
                        ]}
                    />
                )}
                {purpose === datedPurpose && (
                    <Field label={t(dateMode === 'evaluation' ? 'export.fields.evaluation_date' : 'export.fields.date')}>
                        {(field) => (
                            <Input
                                {...field}
                                type="date"
                                value={asOfDate}
                                onChange={(e) => setAsOfDate(e.target.value)}
                                data-testid="export-date-input"
                            />
                        )}
                    </Field>
                )}
                {submitFailed && (
                    <InlineMessage tone="danger">
                        {t('export.errors.failed')}
                    </InlineMessage>
                )}
            </DialogBody>

            <DialogFooter>
                <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
                    {t('export.actions.cancel', t('actions.cancel'))}
                </Button>
                <Button
                    ref={submitButtonRef}
                    type="button"
                    variant="accent"
                    onClick={() => void handleSubmit()}
                    disabled={isSubmitting || (purpose === datedPurpose && !asOfDate)}
                    data-testid="export-submit-button"
                >
                    <Download aria-hidden="true" />
                    {purpose === 'current_view'
                        ? t('export.actions.submit_current')
                        : t(dateMode === 'evaluation' ? 'export.actions.submit_evaluation' : 'export.actions.submit_snapshot')}
                </Button>
            </DialogFooter>
        </DialogShell>
    );
}
