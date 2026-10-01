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
    let dotClass = 'bg-success';
    if (isUpdating) {
        freshnessLabel = updatingLabel;
        dotClass = 'bg-warning animate-pulse';
    } else if (updateFailed) {
        freshnessLabel = updateFailedLabel;
        dotClass = 'bg-destructive';
    }
    const generatedAtLabel = formatDateTimeValue(generatedAt, locale);

    return (
        <div className="flex flex-wrap justify-between items-end gap-4">
            <div>
                <h2 className="text-3xl font-black text-foreground mb-2">{title}</h2>
                <p className="text-muted-foreground font-medium">{subtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                {canExport ? (
                    <button
                        onClick={onExport}
                        disabled={isExporting}
                        aria-busy={isExporting}
                        type="button"
                        className="inline-flex items-center gap-2 p-2.5 glass rounded-xl text-foreground hover:text-accent-text hover:bg-accent/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title={exportLabel}
                    >
                        <FileText aria-hidden="true" className="h-5 w-5 shrink-0" />
                        <span className="text-sm font-medium">{exportLabel}</span>
                    </button>
                ) : null}
                {showFreshness && (generatedAt || isUpdating) ? (
                    <div
                        aria-live="polite"
                        className="flex items-center gap-2 text-[10px] font-black text-muted-foreground uppercase tracking-widest bg-tint/5 px-3 py-1.5 rounded-full border border-border"
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
