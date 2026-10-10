import { useState, useId, useRef } from 'react';
import { Save, Activity, Calendar } from 'lucide-react';
import { DialogBody, DialogFooter, DialogHeader, DialogShell } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { InlineMessage } from '@/components/ui/inline-message';
import { Input } from '@/components/ui/input';
import { kriApi } from '@/services/kriApi';
import { apiClient } from '@/services/apiClient';
import type { KeyRiskIndicator, KRIRecordValue } from '@/types/kri';
import { isApprovalCreatedResponse } from '@/types/approval';
import { translateUiMessage, useFormat, useTranslation } from '@/i18n/hooks';
import { formatKriUnit } from '@/lib/kriUnits';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { logError } from '@/services/logger';
import { useDirtyTaskGuard } from '@/hooks/useDirtyTaskGuard';

interface KRIValueModalProps {
    kri: KeyRiskIndicator;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function KRIValueModal({ kri, isOpen, onClose, onSuccess }: KRIValueModalProps) {
    const { t } = useTranslation(['kris', 'common', 'errorKeys']);
    const format = useFormat();
    const [isSaving, setIsSaving] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [submitResult, setSubmitResult] = useState<'success' | 'pending_approval' | null>(null);

    const [formData, setFormData] = useState<KRIRecordValue>({
        value: kri.current_value,
    });

    // PG-22: a typed value is never discarded silently (Escape, backdrop, close or Cancel).
    const { acceptCurrentSnapshot, confirmationDialog, requestLocalLeave } = useDirtyTaskGuard({
        busy: isSaving,
        currentSnapshot: JSON.stringify(formData),
        enabled: isOpen,
    });

    const titleId = useId();
    const subtitleId = useId();
    const valueInputRef = useRef<HTMLInputElement>(null);

    const canSubmitBackdatedValue = resolveCapabilityFlag(kri.capabilities, 'can_submit_backdated_value');
    const canRequestValueSubmissionApproval = resolveCapabilityFlag(
        kri.capabilities,
        'can_request_value_submission_approval',
    );

    const handleSave = async () => {
        try {
            setIsSaving(true);
            setErrorKey(null);
            setSubmitResult(null);

            const response = await kriApi.recordValue(kri.id, formData);
            acceptCurrentSnapshot();

            if (isApprovalCreatedResponse(response)) {
                setSubmitResult('pending_approval');
            } else {
                setSubmitResult('success');
                // For immediate success, trigger refresh and close
                setTimeout(() => {
                    onSuccess();
                    onClose();
                }, 1500);
            }
        } catch (err: unknown) {
            logError('Record value failed:', err);
            setErrorKey(apiClient.toUiMessageKey(err));
        } finally {
            setIsSaving(false);
        }
    };

    const handleClose = () => {
        if (submitResult === 'pending_approval') {
            onSuccess(); // Refresh parent to update UI
        }
        setSubmitResult(null);
        setErrorKey(null);
        onClose();
    };

    return (
        <DialogShell
            isOpen={isOpen}
            onClose={handleClose}
            titleId={titleId}
            descriptionIds={[subtitleId]}
            initialFocusRef={valueInputRef}
            isBusy={isSaving}
            dirtyGuard={{ requestLocalLeave, confirmationDialog }}
            size="md"
        >
            <DialogHeader
                title={t('value_modal.title', { ns: 'kris' })}
                description={kri.metric_name}
                descriptionId={subtitleId}
                icon={Activity}
                closeLabel={t('common:actions.close')}
            />

            <DialogBody className="space-y-6 p-8">
                {/* Success State */}
                {submitResult === 'success' && (
                    <InlineMessage tone="success">
                        {t('value_modal.success_recorded', { ns: 'kris' })}
                    </InlineMessage>
                )}

                {/* Pending Approval State */}
                {submitResult === 'pending_approval' && (
                    <InlineMessage tone="warning" title={t('value_modal.submitted_for_approval', { ns: 'kris' })}>
                        {t('value_modal.submitted_for_approval_help', { ns: 'kris' })}
                    </InlineMessage>
                )}

                {errorKey && (
                    <InlineMessage tone="danger">
                        {translateUiMessage(t, errorKey)}
                    </InlineMessage>
                )}

                {/* Only show form if not submitted yet */}
                {!submitResult && (
                    <>
                        {canRequestValueSubmissionApproval && (
                            <InlineMessage tone="warning" live="off" className="p-3 text-xs">
                                {t('value_modal.approval_notice', { ns: 'kris' })}
                            </InlineMessage>
                        )}

                        {/* Current Context */}
                        <div className="px-4 py-3 bg-tint/[0.03] border border-border rounded-xl">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{t('value_modal.current_value', { ns: 'kris' })}</span>
                                <span className="font-bold text-foreground">{format.metric(kri.current_value)} {formatKriUnit(kri.unit, t, kri.current_value)}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                                <span>{t('common:labels.limits')}</span>
                                <span className="font-bold text-foreground">{format.metric(kri.lower_limit)} – {format.metric(kri.upper_limit)}</span>
                            </div>
                            {kri.last_period_end && (
                                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                                    <span>{t('value_modal.last_period_end', { ns: 'kris' })}</span>
                                    <span className="font-bold text-foreground">{format.date(kri.last_period_end)}</span>
                                </div>
                            )}
                        </div>

                        {/* Value Input */}
                        <Field label={t('value_modal.new_value_required', { ns: 'kris' })}>
                            {(field) => (
                                <Input
                                    {...field}
                                    ref={valueInputRef}
                                    type="number"
                                    step="0.01"
                                    value={formData.value}
                                    onChange={e => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
                                    className="font-mono text-lg"
                                />
                            )}
                        </Field>

                        {canSubmitBackdatedValue && (
                            <Field
                                className="border-t border-border pt-4"
                                label={(
                                    <span className="inline-flex items-center gap-1">
                                        <Calendar aria-hidden="true" className="h-3 w-3" />
                                        {t('value_modal.backdate_optional', { ns: 'kris' })}
                                    </span>
                                )}
                                help={t('value_modal.backdate_hint', { ns: 'kris' })}
                            >
                                {(field) => (
                                    <Input
                                        {...field}
                                        type="date"
                                        value={formData.period_end || ''}
                                        onChange={e => setFormData({ ...formData, period_end: e.target.value || undefined })}
                                    />
                                )}
                            </Field>
                        )}
                    </>
                )}
            </DialogBody>

            <DialogFooter
                onCancel={() => requestLocalLeave(handleClose)}
                cancelLabel={submitResult ? t('common:actions.close') : t('common:actions.cancel')}
                submitLabel={submitResult ? undefined : (isSaving ? t('common:loading.generic') : t('value_modal.title', { ns: 'kris' }))}
                submitIcon={<Save aria-hidden="true" />}
                onSubmit={() => void handleSave()}
            />
        </DialogShell>
    );
}
