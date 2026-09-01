import { FileText } from 'lucide-react';
import { formatDateTimeValue } from '@/i18n/formatters';

interface DashboardHeaderProps {
    canExport: boolean;
    isExporting: boolean;
    onExport: () => void;
    subtitle: string;
    title: string;
    exportLabel: string;
    generatedAt?: string;
    isUpdating: boolean;
    locale: string;
    showFreshness: boolean;
    updateFailed: boolean;
    updatedLabel: string;
    updatingLabel: string;
    updateFailedLabel: string;
}

export function DashboardHeader({
    canExport,
    isExporting,
    onExport,
    subtitle,
    title,
    exportLabel,
    generatedAt,
    isUpdating,
    locale,
    showFreshness,
    updateFailed,
    updatedLabel,
    updatingLabel,
    updateFailedLabel,
}: DashboardHeaderProps) {
    let freshnessLabel = updatedLabel;
    let dotClass = 'bg-emerald-500';
    if (isUpdating) {
        freshnessLabel = updatingLabel;
        dotClass = 'bg-amber-400 animate-pulse';
    } else if (updateFailed) {
        freshnessLabel = updateFailedLabel;
        dotClass = 'bg-rose-400';
    }
    const generatedAtLabel = formatDateTimeValue(generatedAt, locale);

    return (
        <div className="flex flex-wrap justify-between items-end gap-4">
            <div>
                <h2 className="text-3xl font-black text-foreground mb-2">{title}</h2>
                <p className="text-muted-foreground font-medium">{subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
                {canExport ? (
                    <button
                        onClick={onExport}
                        disabled={isExporting}
                        aria-busy={isExporting}
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-accent hover:bg-accent/10 transition-colors"
                        title={exportLabel}
                    >
                        <FileText className="h-5 w-5" />
                    </button>
                ) : null}
                {showFreshness && (generatedAt || isUpdating) ? (
                    <div
                        aria-live="polite"
                        className="flex items-center gap-2 text-[10px] font-black text-muted-foreground uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-full border border-white/5"
                        role="status"
                    >
                        <div aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                        <span>{freshnessLabel}</span>
                        {!isUpdating && generatedAt ? <time dateTime={generatedAt}>{generatedAtLabel}</time> : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
