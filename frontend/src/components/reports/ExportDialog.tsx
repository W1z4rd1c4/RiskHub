import { useEffect, useId, useRef, useState } from 'react';
import { Download, FileDown, X } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { DialogShell } from '@/components/DialogShell';

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
    const dateLabelId = useId();
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
            closeDisabled={isSubmitting}
            dataTestId={dataTestId}
            backdropClassName="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            contentClassName="w-full max-w-lg glass-card !p-0 overflow-hidden shadow-2xl border border-white/10"
        >
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-accent/10 rounded-lg">
                        <FileDown className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                        <h3 id={titleId} className="text-xl font-black text-white">
                            {title ?? t('export.title')}
                        </h3>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={onClose}
                    disabled={isSubmitting}
                    aria-label={t('actions.close')}
                    className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-60"
                >
                    <X className="h-5 w-5 text-slate-300" />
                </button>
            </div>

            <div className="p-6 space-y-5">
                {supportsCurrentView && (
                    <fieldset className="space-y-2">
                        <legend className="ml-1 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            {t('export.purpose.label')}
                        </legend>
                        <label
                            htmlFor={`${purposeId}-current`}
                            aria-label={t('export.purpose.current_view.title')}
                            className="flex cursor-pointer gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 has-[:checked]:border-accent/50 has-[:checked]:bg-accent/10"
                        >
                            <input
                                id={`${purposeId}-current`}
                                type="radio"
                                name="export-purpose"
                                value="current_view"
                                checked={purpose === 'current_view'}
                                onChange={() => { setPurpose('current_view'); setSubmitFailed(false); }}
                                data-testid="export-purpose-current-view"
                                className="mt-1 accent-[var(--color-accent)]"
                            />
                            <span>
                                <span className="block font-bold text-white">{t('export.purpose.current_view.title')}</span>
                                <span className="block text-sm text-slate-400">{t('export.purpose.current_view.description')}</span>
                            </span>
                        </label>
                        <label
                            htmlFor={`${purposeId}-${datedPurpose}`}
                            aria-label={t(`export.purpose.${datePurposeKey}.title`)}
                            className="flex cursor-pointer gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 has-[:checked]:border-accent/50 has-[:checked]:bg-accent/10"
                        >
                            <input
                                id={`${purposeId}-${datedPurpose}`}
                                type="radio"
                                name="export-purpose"
                                value={datedPurpose}
                                checked={purpose === datedPurpose}
                                onChange={() => { setPurpose(datedPurpose); setSubmitFailed(false); }}
                                data-testid={datedPurpose === 'evaluation'
                                    ? 'export-purpose-evaluation'
                                    : 'export-purpose-point-in-time'}
                                className="mt-1 accent-[var(--color-accent)]"
                            />
                            <span>
                                <span className="block font-bold text-white">{t(`export.purpose.${datePurposeKey}.title`)}</span>
                                <span className="block text-sm text-slate-400">{t(`export.purpose.${datePurposeKey}.description`)}</span>
                            </span>
                        </label>
                    </fieldset>
                )}
                {purpose === datedPurpose && (
                    <div className="space-y-2">
                        <span id={dateLabelId} className="block text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                            {t(dateMode === 'evaluation' ? 'export.fields.evaluation_date' : 'export.fields.date')}
                        </span>
                        <input
                            type="date"
                            aria-labelledby={dateLabelId}
                            value={asOfDate}
                            onChange={(e) => setAsOfDate(e.target.value)}
                            data-testid="export-date-input"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                        />
                    </div>
                )}
                {submitFailed && (
                    <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                        {t('export.errors.failed')}
                    </p>
                )}
            </div>

            <div className="p-6 border-t border-white/5 flex items-center justify-end gap-3 bg-white/[0.02]">
                <button
                    type="button"
                    onClick={onClose}
                    disabled={isSubmitting}
                    className="px-5 py-2.5 rounded-xl text-slate-300 border border-white/10 hover:bg-white/5 transition-all disabled:opacity-60"
                >
                    {t('export.actions.cancel', t('actions.cancel'))}
                </button>
                <button
                    ref={submitButtonRef}
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSubmitting || (purpose === datedPurpose && !asOfDate)}
                    data-testid="export-submit-button"
                    className="px-5 py-2.5 rounded-xl bg-accent text-slate-950 font-bold hover:bg-accent/90 transition-all flex items-center gap-2 disabled:opacity-60"
                >
                    <Download className="h-4 w-4" />
                    {purpose === 'current_view'
                        ? t('export.actions.submit_current')
                        : t(dateMode === 'evaluation' ? 'export.actions.submit_evaluation' : 'export.actions.submit_snapshot')}
                </button>
            </div>
        </DialogShell>
    );
}
