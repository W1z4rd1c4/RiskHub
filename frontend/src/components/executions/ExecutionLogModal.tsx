import React, { useId, useState } from 'react';
import { controlApi } from '@/services/controlApi';
import { apiClient } from '@/services/apiClient';
import { useTranslation } from '@/i18n/hooks';
import type { ControlExecutionCreate } from '@/types/execution';
import { ExecutionResult } from '@/types/execution';
import { getExecutionResultMeta } from '@/lib/executionResult';
import { DialogBody, DialogFooter, DialogHeader, DialogShell } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { InlineMessage } from '@/components/ui/inline-message';
import { Input } from '@/components/ui/input';
import { RadioGroup } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';

interface ExecutionLogModalProps {
    isOpen: boolean;
    onClose: () => void;
    controlId: number;
    controlName: string;
    onSuccess?: () => void;
}

const RESULTS: ExecutionResult[] = [
    ExecutionResult.PASSED,
    ExecutionResult.FAILED,
    ExecutionResult.WARNING,
    ExecutionResult.NA,
];

export function ExecutionLogModal({ isOpen, onClose, controlId, controlName, onSuccess }: ExecutionLogModalProps) {
    const { t } = useTranslation(['controls', 'common', 'errorKeys']);
    const titleId = useId();
    const descriptionId = useId();
    const formId = useId();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [formData, setFormData] = useState<ControlExecutionCreate>({
        result: 'passed',
        findings: '',
        evidence_reference: '',
        notes: '',
        next_scheduled: '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setErrorKey(null);

        try {
            await controlApi.logExecution(controlId, {
                ...formData,
                next_scheduled: formData.next_scheduled || undefined,
            });
            onSuccess?.();
            onClose();
        } catch (err: unknown) {
            setErrorKey(apiClient.toUiMessageKey(err));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <DialogShell
            isOpen={isOpen}
            onClose={onClose}
            titleId={titleId}
            descriptionIds={[descriptionId]}
            isBusy={isSubmitting}
            size="md"
            className="max-w-lg"
        >
            <DialogHeader
                title={t('executions.log_execution')}
                descriptionId={descriptionId}
                description={(
                    <>
                        {t('executions.recording_performance_for')}: <span className="font-medium text-accent-text">{controlName}</span>
                    </>
                )}
                closeLabel={t('actions.close', { ns: 'common' })}
            />

            <DialogBody>
                <form id={formId} onSubmit={handleSubmit} className="space-y-6">
                    {errorKey && (
                        <InlineMessage tone="danger">
                            {t(errorKey, { ns: 'errorKeys' })}
                        </InlineMessage>
                    )}

                    {/* Result selection: one choice from four, so a radiogroup (GAP-D-13 pattern). */}
                    <Field label={t('executions.execution_result')} group>
                        {(field) => (
                            <RadioGroup
                                {...field}
                                variant="card"
                                value={formData.result}
                                onValueChange={(result) => setFormData({ ...formData, result })}
                                className="grid grid-cols-2 gap-3 space-y-0"
                                options={RESULTS.map((res) => {
                                    const meta = getExecutionResultMeta(res);
                                    const ResultIcon = meta.icon;
                                    return {
                                        value: res,
                                        label: (
                                            <span className="flex items-center gap-3">
                                                <ResultIcon aria-hidden="true" className={`h-5 w-5 ${meta.iconClassName}`} />
                                                <span className="text-sm font-bold">{t(meta.labelKey)}</span>
                                            </span>
                                        ),
                                    };
                                })}
                            />
                        )}
                    </Field>

                    <Field label={t('executions.findings_observations')}>
                        {(field) => (
                            <Textarea
                                {...field}
                                value={formData.findings}
                                onChange={(e) => setFormData({ ...formData, findings: e.target.value })}
                                placeholder={t('form.placeholders.verification_notes')}
                                className="min-h-[100px]"
                            />
                        )}
                    </Field>

                    <Field label={t('executions.evidence_reference')}>
                        {(field) => (
                            <Input
                                {...field}
                                type="text"
                                value={formData.evidence_reference}
                                onChange={(e) => setFormData({ ...formData, evidence_reference: e.target.value })}
                                placeholder={t('form.placeholders.evidence_reference')}
                            />
                        )}
                    </Field>

                    <Field label={t('executions.next_scheduled_optional')}>
                        {(field) => (
                            <Input
                                {...field}
                                type="date"
                                value={formData.next_scheduled}
                                onChange={(e) => setFormData({ ...formData, next_scheduled: e.target.value })}
                            />
                        )}
                    </Field>

                    <Field label={t('executions.additional_notes')}>
                        {(field) => (
                            <Textarea
                                {...field}
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                placeholder={t('form.placeholders.additional_notes')}
                            />
                        )}
                    </Field>
                </form>
            </DialogBody>

            <DialogFooter
                cancelLabel={t('actions.cancel', { ns: 'common' })}
                submitForm={formId}
                submitLabel={isSubmitting ? t('executions.logging') : t('executions.log_execution')}
            />
        </DialogShell>
    );
}
