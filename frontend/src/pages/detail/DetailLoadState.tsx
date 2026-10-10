import { AlertTriangle, RefreshCw } from 'lucide-react';

import { PAGE_TITLE_CLASS } from '@/components/layout/PageHeader';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/state';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useTranslation } from '@/i18n/hooks';

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
    // D7 / NAV-01: this state replaces the whole detail route, so it carries
    // the route's `h1` (focused by the layout after navigation) and title.
    usePageTitle(t('detail_load.unavailable_title'));

    return (
        <div
            className="glass-card flex flex-col items-center justify-center gap-4 p-16 text-center"
            data-testid="detail-load-unavailable"
            role="alert"
        >
            <div className="rounded-full bg-warning/15 p-4 text-warning-text">
                <AlertTriangle className="h-8 w-8" aria-hidden="true" />
            </div>
            <div>
                <h1 tabIndex={-1} data-page-title="" className={PAGE_TITLE_CLASS}>{t('detail_load.unavailable_title')}</h1>
                <p className="mt-2 max-w-lg text-sm font-medium text-muted-foreground">
                    {t('detail_load.unavailable_description')}
                </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
                {onRetry ? (
                    <Button variant="accent" onClick={onRetry} isLoading={isRetrying}>
                        {isRetrying ? null : <RefreshCw aria-hidden="true" />}
                        {t('actions.retry')}
                    </Button>
                ) : null}
                <BackButton label={backLabel} onClick={onBack} />
            </div>
        </div>
    );
}

export function DetailStaleWarning({ isRetrying = false, onRetry }: DetailStaleWarningProps) {
    const { t } = useTranslation('common');

    // §4.15: a refetch error over stale data is the shared ErrorState banner.
    return (
        <ErrorState
            variant="banner"
            title={t('detail_load.stale_title')}
            message={t('detail_load.stale_description')}
            onRetry={onRetry}
            isRetrying={isRetrying}
        />
    );
}
