import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';

import { useFeedback } from '@/hooks/useFeedback';
import { useSessionMutationOwner } from '@/hooks/useMutationOwner';
import { useTranslation } from '@/i18n/hooks';
import { apiClient } from '@/services/apiClient';

interface RestoreWithFeedbackOptions {
    restore: () => Promise<unknown>;
    /** Display name captured from the restored record. */
    name?: string | null;
    /** Refreshes only the captured register query or detail record. */
    refresh: () => unknown;
    isCurrent?: () => boolean;
    failureTitle?: string;
    successTitle?: string;
}

/** A restore failure remains an action error; Retry repeats that captured restore. */
export function useRestoreWithFeedback(queryIdentity?: string) {
    const feedback = useFeedback();
    const { t } = useTranslation('common');
    const location = useLocation();
    const owner = useSessionMutationOwner(JSON.stringify([
        location.pathname, queryIdentity === undefined ? location.search : null, location.hash, queryIdentity,
    ]));

    return useCallback(async ({ name, refresh, restore, isCurrent = () => true, failureTitle, successTitle }: RestoreWithFeedbackOptions): Promise<boolean> => {
        const ownsRoute = owner.capture();
        const ownsAction = () => ownsRoute() && isCurrent();
        // Each retry keeps the original target and blocks duplicate clicks synchronously.
        let running = false;
        const run = async (): Promise<boolean> => {
            if (running || !ownsAction()) return false;
            running = true;
            try {
                try {
                    await restore();
                } catch (error) {
                    if (ownsAction()) feedback.error({
                        title: failureTitle ?? t('outcome.restore_failed'),
                        messageKey: apiClient.toUiMessageKey(error),
                        action: { label: t('actions.retry'), onClick: () => { void run(); } },
                    });
                    return false;
                }
                if (!ownsAction()) return false;
                feedback.success({ title: successTitle ?? (name ? t('outcome.restored', { name }) : t('outcome.restored_generic')) });
                await refresh();
                return true;
            } finally {
                running = false;
            }
        };
        return run();
    }, [feedback, owner, t]);
}
