import { FileText } from 'lucide-react';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
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

    const hasActions = canExport || (showFreshness && Boolean(generatedAt || isUpdating));

    return (
        <PageHeader
            title={title}
            description={subtitle}
            actions={hasActions ? (
                <>
                    {canExport ? (
                        <Button variant="outline" onClick={onExport} isLoading={isExporting} data-testid="dashboard-overview-export">
                            {!isExporting ? <FileText aria-hidden="true" /> : null}
                            {exportLabel}
                        </Button>
                    ) : null}
                    {showFreshness && (generatedAt || isUpdating) ? (
                        <div
                            aria-live="polite"
                            className="text-eyebrow flex items-center gap-2 rounded-full border border-border bg-tint/5 px-3 py-1.5"
                            role="status"
                        >
                            <span aria-hidden="true" className={`size-1.5 rounded-full ${dotClass}`} />
                            <span>{freshnessLabel}</span>
                            {!isUpdating && generatedAt ? <time dateTime={generatedAt}>{generatedAtLabel}</time> : null}
                        </div>
                    ) : null}
                </>
            ) : undefined}
        />
    );
}
