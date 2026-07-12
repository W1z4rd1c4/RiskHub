import { useId } from 'react';

import { useTranslation } from '@/i18n/hooks';
import type { AccessUserRead } from '@/types/access';
import { DialogShell } from '@/components/DialogShell';

interface BreakGlassEnableDialogProps {
    breakGlassHours: number | '';
    breakGlassReason: string;
    breakGlassUser: AccessUserRead | null;
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
            closeDisabled={isBreakGlassSubmitting}
            backdropClassName="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            contentClassName="relative w-full max-w-md rounded-2xl border border-amber-500/20 bg-slate-900 p-6 shadow-2xl"
        >
                <h3 id={titleId} className="text-lg font-bold text-white">
                    {t('users.break_glass_enable', { ns: 'admin' })}
                </h3>
                <p id={descriptionId} className="mt-2 text-sm text-slate-300">
                    {t('users.break_glass_message', {
                        ns: 'admin',
                        name: breakGlassUser.name,
                    })}
                </p>
                <span
                    id="break-glass-reason-label"
                    className="mt-5 block text-xs font-bold uppercase tracking-widest text-slate-400"
                >
                    {t('users.break_glass_reason', { ns: 'admin' })}
                </span>
                <textarea
                    id="break-glass-reason"
                    aria-labelledby="break-glass-reason-label"
                    value={breakGlassReason}
                    onChange={(event) => onReasonChange(event.target.value)}
                    className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-400/70"
                    maxLength={255}
                />
                <span
                    id="break-glass-expires-in-hours-label"
                    className="mt-4 block text-xs font-bold uppercase tracking-widest text-slate-400"
                >
                    {t('users.break_glass_expires_in_hours', { ns: 'admin' })}
                </span>
                <input
                    id="break-glass-expires-in-hours"
                    aria-labelledby="break-glass-expires-in-hours-label"
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
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-400/70"
                />
                <div className="mt-6 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isBreakGlassSubmitting}
                        className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {t('actions.cancel', { ns: 'common' })}
                    </button>
                    <button
                        type="button"
                        onClick={onSubmit}
                        disabled={isBreakGlassSubmitting || !breakGlassReason.trim() || breakGlassHours === ''}
                        className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isBreakGlassSubmitting
                            ? t('users.break_glass_enabling', { ns: 'admin' })
                            : t('users.break_glass_enable', { ns: 'admin' })}
                    </button>
                </div>
        </DialogShell>
    );
}
