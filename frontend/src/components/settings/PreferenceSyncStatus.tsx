import { Button } from '@/components/ui/button';
import type { PreferenceSyncStatus as SyncStatus } from '@/hooks/useLatestPreferenceSync';
import { useTranslation } from '@/i18n/hooks';

interface PreferenceSyncStatusProps {
    status: SyncStatus;
    onRetry: () => void;
    onRevert: () => void;
}

export function PreferenceSyncStatus({
    status,
    onRetry,
    onRevert,
}: PreferenceSyncStatusProps) {
    const { t } = useTranslation('settings');

    if (status === 'idle') return null;

    return (
        <div className="flex items-center gap-3 text-sm" role="status" aria-live="polite">
            <span>{t(`sync.${status}`)}</span>
            {status === 'unsynced' ? (
                <>
                    <Button type="button" variant="outline" size="compact" onClick={onRetry}>
                        {t('sync.retry')}
                    </Button>
                    <Button type="button" variant="ghost" size="compact" onClick={onRevert}>
                        {t('sync.revert')}
                    </Button>
                </>
            ) : null}
        </div>
    );
}
