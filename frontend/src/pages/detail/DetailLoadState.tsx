import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

interface DetailLoadUnavailableStateProps {
    backLabel: string;
    isRetrying?: boolean;
    onBack: () => void;
    onRetry?: () => void;
}

interface DetailStaleWarningProps {
    isRetrying?: boolean;
    onRetry: () => void;
}

export function DetailLoadUnavailableState({
    backLabel,
    isRetrying = false,
    onBack,
    onRetry,
}: DetailLoadUnavailableStateProps) {
    const { t } = useTranslation('common');

    return (
        <div
            className="glass-card flex flex-col items-center justify-center gap-4 p-16 text-center"
            data-testid="detail-load-unavailable"
            role="alert"
        >
            <div className="rounded-full bg-amber-500/15 p-4 text-amber-300">
                <AlertTriangle className="h-8 w-8" aria-hidden="true" />
            </div>
            <div>
                <h2 className="text-xl font-bold text-foreground">{t('detail_load.unavailable_title')}</h2>
                <p className="mt-2 max-w-lg text-sm font-medium text-muted-foreground">
                    {t('detail_load.unavailable_description')}
                </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
                {onRetry ? (
                    <Button type="button" onClick={onRetry} disabled={isRetrying}>
                        <RefreshCw className={cn('h-4 w-4', isRetrying && 'animate-spin')} aria-hidden="true" />
                        {t('actions.retry')}
                    </Button>
                ) : null}
                <Button type="button" variant="secondary" onClick={onBack}>
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    {backLabel}
                </Button>
            </div>
        </div>
    );
}

export function DetailStaleWarning({ isRetrying = false, onRetry }: DetailStaleWarningProps) {
    const { t } = useTranslation('common');

    return (
        <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
            role="alert"
        >
            <div>
                <p className="font-bold">{t('detail_load.stale_title')}</p>
                <p className="text-amber-100/80">{t('detail_load.stale_description')}</p>
            </div>
            <Button type="button" variant="secondary" onClick={onRetry} disabled={isRetrying}>
                <RefreshCw className={cn('h-4 w-4', isRetrying && 'animate-spin')} aria-hidden="true" />
                {t('actions.retry')}
            </Button>
        </div>
    );
}
