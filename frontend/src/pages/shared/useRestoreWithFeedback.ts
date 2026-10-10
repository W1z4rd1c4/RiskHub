import { useCallback } from 'react';

import { useFeedback } from '@/hooks/useFeedback';
import { useTranslation } from '@/i18n/hooks';
import { apiClient } from '@/services/apiClient';

interface RestoreWithFeedbackOptions {
    restore: () => Promise<unknown>;
    /** Display name of the restored record, for the toast title. */
    name?: string | null;
    /** Refreshes the register or detail record after a successful restore. */
    refresh: () => unknown;
}

/**
 * Restore with toast feedback (D9 / FB-01, audit §4.16), for register rows and
 * detail pages. A row failure never flips the register into its error state,
 * so the rows stay usable, and the user is told even after moving to another
 * page. Resolves `true` when the restore succeeded.
 */
export function useRestoreWithFeedback() {
    const feedback = useFeedback();
    const { t } = useTranslation('common');

    return useCallback(async ({ name, refresh, restore }: RestoreWithFeedbackOptions): Promise<boolean> => {
        try {
            await restore();
        } catch (error) {
            feedback.error({ title: t('outcome.restore_failed'), messageKey: apiClient.toUiMessageKey(error) });
            return false;
        }
        feedback.success({ title: name ? t('outcome.restored', { name }) : t('outcome.restored_generic') });
        await refresh();
        return true;
    }, [feedback, t]);
}
