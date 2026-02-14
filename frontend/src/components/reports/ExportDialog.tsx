import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, FileDown, X } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

export type ExportFormat = 'xlsx' | 'csv';

export interface ExportDialogSubmitPayload {
    format: ExportFormat;
    asOfDate: string;
}

interface ExportDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (payload: ExportDialogSubmitPayload) => Promise<void>;
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
    isOpen,
    onClose,
    onSubmit,
    isSubmitting = false,
    title,
    dataTestId = 'export-dialog',
}: ExportDialogProps) {
    const { t } = useTranslation('common');
    const [format, setFormat] = useState<ExportFormat>('xlsx');
    const [asOfDate, setAsOfDate] = useState<string>(getTodayLocalDate());

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        setFormat('xlsx');
        setAsOfDate(getTodayLocalDate());
    }, [isOpen]);

    const formatOptions = useMemo(
        () => [
            { value: 'xlsx', label: t('export.formats.xlsx') },
            { value: 'csv', label: t('export.formats.csv') },
        ],
        [t],
    );

    const handleSubmit = async () => {
        if (!asOfDate || isSubmitting) {
            return;
        }
        await onSubmit({ format, asOfDate });
    };

    if (!isOpen || typeof document === 'undefined') {
        return null;
    }

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={isSubmitting ? undefined : onClose}
                        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        role="dialog"
                        aria-modal="true"
                        data-testid={dataTestId}
                        className="relative w-full max-w-lg glass-card !p-0 overflow-hidden shadow-2xl border border-white/10"
                    >
                        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-accent/10 rounded-lg">
                                    <FileDown className="h-5 w-5 text-accent" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white">
                                        {title ?? t('export.title')}
                                    </h3>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isSubmitting}
                                className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-60"
                            >
                                <X className="h-5 w-5 text-slate-300" />
                            </button>
                        </div>

                        <div className="p-6 space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                                    {t('export.fields.format')}
                                </label>
                                <ThemedSelect
                                    value={format}
                                    onValueChange={(value) => setFormat(value as ExportFormat)}
                                    options={formatOptions}
                                    triggerTestId="export-format-trigger"
                                    contentTestId="export-format-content"
                                    optionTestIdPrefix="export-format-option"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                                    {t('export.fields.date')}
                                </label>
                                <input
                                    type="date"
                                    value={asOfDate}
                                    onChange={(e) => setAsOfDate(e.target.value)}
                                    data-testid="export-date-input"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                />
                            </div>
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
                                type="button"
                                onClick={handleSubmit}
                                disabled={isSubmitting || !asOfDate}
                                data-testid="export-submit-button"
                                className="px-5 py-2.5 rounded-xl bg-accent text-white font-bold hover:bg-accent/90 transition-all flex items-center gap-2 disabled:opacity-60"
                            >
                                <Download className="h-4 w-4" />
                                {t('export.actions.submit')}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body,
    );
}
