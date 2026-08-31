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
                    <button type="button" className="font-medium text-accent hover:underline" onClick={onRetry}>
                        {t('sync.retry')}
                    </button>
                    <button type="button" className="font-medium text-muted-foreground hover:underline" onClick={onRevert}>
                        {t('sync.revert')}
                    </button>
                </>
            ) : null}
        </div>
    );
}
