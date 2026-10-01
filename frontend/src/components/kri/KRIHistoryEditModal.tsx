import { useState, useId } from 'react';
import { Edit3 } from 'lucide-react';
import { DialogBody, DialogFooter, DialogHeader, DialogShell } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { InlineMessage } from '@/components/ui/inline-message';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { kriApi } from '@/services/kriApi';
import { apiClient } from '@/services/apiClient';
import type { KRIHistoryEntry, KRIHistoryEdit } from '@/types/kri';
import { useTranslation } from '@/i18n/hooks';
import { formatKriPeriodDate } from '@/lib/kriHistory';

interface KRIHistoryEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    kriId: number;
    entry: KRIHistoryEntry;
    onSuccess: () => void;
    onError?: () => void;
}

export function KRIHistoryEditModal({ isOpen, onClose, kriId, entry, onSuccess, onError }: KRIHistoryEditModalProps) {
    const { t, i18n } = useTranslation(['kris', 'common', 'errorKeys']);
    const [newValue, setNewValue] = useState(entry.value.toString());
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState<{ type: 'success' | 'approval'; messageKey: string } | null>(null);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const titleId = useId();
    const descriptionId = useId();
    const formId = useId();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setErrorKey(null);
        setResult(null);

        try {
            const data: KRIHistoryEdit = {
                value: parseFloat(newValue),
                reason: reason.trim(),
            };
            const response = await kriApi.requestHistoryEdit(kriId, entry.id, data);

            if ('approval_id' in response) {
                // 202 - Approval required
                setResult({ type: 'approval', messageKey: 'errorKeys:approval_submitted' });
            } else {
                // 200 - Immediate update
                setResult({ type: 'success', messageKey: 'correction.success' });
            }

            setTimeout(() => {
                onSuccess();
                onClose();
            }, 1500);
        } catch (err: unknown) {
            setErrorKey(apiClient.toUiMessageKey(err));
            onError?.();
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
        >
            <DialogHeader
                title={t('history_edit.request_correction', { ns: 'kris' })}
                description={`${t('history_edit.period', { ns: 'kris' })}: ${formatKriPeriodDate(entry.period_end, i18n.language)}`}
                descriptionId={descriptionId}
                icon={Edit3}
                tone="warning"
                closeLabel={t('common:actions.close')}
            />

            <DialogBody>
                <form id={formId} onSubmit={handleSubmit} className="space-y-6">
                    {/* CRO Approval Warning */}
                    <InlineMessage tone="warning" live="off" className="p-3 text-xs font-medium">
                        {t('correction.warning')}
                    </InlineMessage>
                    {result && (
                        <InlineMessage tone={result.type === 'success' ? 'success' : 'warning'}>
                            {t(result.messageKey)}
                        </InlineMessage>
                    )}

                    {errorKey && (
                        <InlineMessage tone="danger">
                            {t(errorKey, { ns: 'errorKeys' })}
                        </InlineMessage>
                    )}

                    <div className="space-y-1.5">
                        <span className="block text-eyebrow">
                            {t('values.original_value', { ns: 'kris' })}
                        </span>
                        <div className="px-4 py-3 bg-tint/5 rounded-lg text-foreground font-mono">
                            {entry.value} {entry.unit}
                        </div>
                    </div>

                    <Field label={t('history_edit.corrected_value_required', { ns: 'kris' })}>
                        {(field) => (
                            <Input
                                {...field}
                                type="number"
                                step="any"
                                value={newValue}
                                onChange={(e) => setNewValue(e.target.value)}
                                required
                            />
                        )}
                    </Field>

                    <Field label={t('history_edit.reason_required', { ns: 'kris' })}>
                        {(field) => (
                            <Textarea
                                {...field}
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                required
                                rows={3}
                                placeholder={t('form.placeholders.correction_reason')}
                            />
                        )}
                    </Field>
                </form>
            </DialogBody>

            <DialogFooter
                cancelLabel={t('actions.cancel', { ns: 'common' })}
                submitForm={formId}
                submitDisabled={!reason.trim()}
                submitLabel={isSubmitting ? t('history_edit.submitting', { ns: 'kris' }) : t('correction.submit', { ns: 'kris' })}
            />
        </DialogShell>
    );
}
