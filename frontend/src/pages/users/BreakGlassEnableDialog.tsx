import { useId } from 'react';
import { ShieldAlert } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import type { AccessUserRead } from '@/types/access';
import { Button } from '@/components/ui/button';
import { DialogBody, DialogFooter, DialogHeader, DialogShell } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface BreakGlassEnableDialogProps {
    breakGlassHours: number | '';
    breakGlassReason: string;
    breakGlassUser: AccessUserRead | null;
    errorMessage: string | null;
    isBreakGlassSubmitting: boolean;
    onClose: () => void;
    onReasonChange: (reason: string) => void;
    onSubmit: () => void;
    onHoursChange: (hours: number | '') => void;
}

export function BreakGlassEnableDialog({
    breakGlassHours,
    breakGlassReason,
    breakGlassUser,
    errorMessage,
    isBreakGlassSubmitting,
    onClose,
    onHoursChange,
    onReasonChange,
    onSubmit,
}: BreakGlassEnableDialogProps) {
    const { t } = useTranslation(['admin', 'common']);
    const titleId = useId();
    const descriptionId = useId();

    if (!breakGlassUser) {
        return null;
    }

    return (
        <DialogShell
            isOpen
            onClose={onClose}
            titleId={titleId}
            descriptionIds={[descriptionId]}
            isBusy={isBreakGlassSubmitting}
            size="md"
        >
            <DialogHeader
                title={t('users.break_glass_enable', { ns: 'admin' })}
                description={t('users.break_glass_message', {
                    ns: 'admin',
                    name: breakGlassUser.name,
                })}
                descriptionId={descriptionId}
                icon={ShieldAlert}
                tone="warning"
            />
            <DialogBody>
                <Field id="break-glass-reason" label={t('users.break_glass_reason', { ns: 'admin' })} required>
                    {(field) => (
                        <Textarea
                            {...field}
                            value={breakGlassReason}
                            onChange={(event) => onReasonChange(event.target.value)}
                            className="min-h-24"
                            maxLength={255}
                        />
                    )}
                </Field>
                <Field id="break-glass-expires-in-hours" label={t('users.break_glass_expires_in_hours', { ns: 'admin' })}>
                    {(field) => (
                        <Input
                            {...field}
                            type="number"
                            min={1}
                            max={24}
                            value={breakGlassHours}
                            onChange={(event) => {
                                if (event.target.value === '') {
                                    onHoursChange('');
                                    return;
                                }
                                const value = Number(event.target.value);
                                onHoursChange(Math.min(24, Math.max(1, Number.isFinite(value) ? value : 1)));
                            }}
                        />
                    )}
                </Field>
                {errorMessage && (
                    <p id="break-glass-submit-error" role="alert" className="text-sm text-destructive">
                        {errorMessage}
                    </p>
                )}
            </DialogBody>
            <DialogFooter>
                <Button type="button" variant="secondary" onClick={onClose} disabled={isBreakGlassSubmitting}>
                    {t('actions.cancel', { ns: 'common' })}
                </Button>
                {/* Stays focusable while submitting (aria-disabled, not disabled) so focus
                    never drops out of the dialog (UX-157). */}
                <Button
                    type="button"
                    variant="warning"
                    onClick={onSubmit}
                    disabled={!breakGlassReason.trim() || breakGlassHours === ''}
                    aria-busy={isBreakGlassSubmitting}
                    aria-disabled={isBreakGlassSubmitting || !breakGlassReason.trim() || breakGlassHours === ''}
                    aria-describedby={errorMessage ? 'break-glass-submit-error' : undefined}
                >
                    {isBreakGlassSubmitting
                        ? t('users.break_glass_enabling', { ns: 'admin' })
                        : t('users.break_glass_enable', { ns: 'admin' })}
                </Button>
            </DialogFooter>
        </DialogShell>
    );
}
