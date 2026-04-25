import { useTranslation } from '@/i18n/hooks';
import type { AccessUserRead } from '@/types/access';

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

    if (!breakGlassUser) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <button
                type="button"
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
                onClick={onClose}
                aria-label={t('actions.cancel', { ns: 'common' })}
            />
            <div className="relative w-full max-w-md rounded-2xl border border-amber-500/20 bg-slate-900 p-6 shadow-2xl">
                <h3 className="text-lg font-bold text-white">
                    {t('users.break_glass_enable', { ns: 'admin', defaultValue: 'Break-glass enable' })}
                </h3>
                <p className="mt-2 text-sm text-slate-300">
                    {t('users.break_glass_message', {
                        ns: 'admin',
                        defaultValue: `Temporarily re-enable ${breakGlassUser.name} with an audited expiry.`,
                        name: breakGlassUser.name,
                    })}
                </p>
                <label
                    htmlFor="break-glass-reason"
                    className="mt-5 block text-xs font-bold uppercase tracking-widest text-slate-400"
                >
                    {t('users.break_glass_reason', { ns: 'admin', defaultValue: 'Reason' })}
                </label>
                <textarea
                    id="break-glass-reason"
                    value={breakGlassReason}
                    onChange={(event) => onReasonChange(event.target.value)}
                    className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-400/70"
                    maxLength={255}
                />
                <label
                    htmlFor="break-glass-expires-in-hours"
                    className="mt-4 block text-xs font-bold uppercase tracking-widest text-slate-400"
                >
                    {t('users.break_glass_expires_in_hours', { ns: 'admin', defaultValue: 'Expires in hours' })}
                </label>
                <input
                    id="break-glass-expires-in-hours"
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
                            ? t('users.break_glass_enabling', { ns: 'admin', defaultValue: 'Enabling...' })
                            : t('users.break_glass_enable', { ns: 'admin', defaultValue: 'Break-glass enable' })}
                    </button>
                </div>
            </div>
        </div>
    );
}
