import { useCallback, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { useFeedback } from '@/hooks/useFeedback';
import { useSessionMutationOwner } from '@/hooks/useMutationOwner';
import { useTranslation } from '@/i18n/hooks';
import { apiClient } from '@/services/apiClient';

interface RestoreWithFeedbackOptions {
    targetId: string | number;
    restore: () => Promise<unknown>;
    /** Display name captured from the restored record. */
    name?: string | null;
    /** Refreshes only the captured register query or detail record. */
    refresh: () => unknown;
    isCurrent?: () => boolean;
    failureTitle?: string;
    successTitle?: string;
}

interface RestoreAttempt { busy: boolean; errorToastId: string | null }

/** A restore failure remains an action error; Retry repeats that captured restore. */
export function useRestoreWithFeedback(queryIdentity?: string) {
    const feedback = useFeedback();
    const { t } = useTranslation('common');
    const location = useLocation();
    const owner = useSessionMutationOwner(JSON.stringify([
        location.pathname, queryIdentity === undefined ? location.search : null, location.hash, queryIdentity,
    ]));

    const attempts = useMemo(() => ({
        epoch: owner.epoch, byTarget: new Map<string | number, RestoreAttempt>(),
    }), [owner.epoch]);
    const dismiss = feedback.dismiss;
    useEffect(() => () => {
        for (const attempt of attempts.byTarget.values()) {
            if (attempt.errorToastId) dismiss(attempt.errorToastId);
        }
        attempts.byTarget.clear();
    }, [attempts, dismiss]);

    return useCallback(async ({ targetId, name, refresh, restore, isCurrent = () => true, failureTitle, successTitle }: RestoreWithFeedbackOptions): Promise<boolean> => {
        const ownsRoute = owner.capture();
        if (!ownsRoute() || !isCurrent()) return false;
        const previous = attempts.byTarget.get(targetId);
        if (previous?.busy) return false;
        if (previous?.errorToastId) feedback.dismiss(previous.errorToastId);
        // A newer attempt supersedes the old toast; different targets keep independent locks.
        const attempt: RestoreAttempt = { busy: false, errorToastId: null };
        attempts.byTarget.set(targetId, attempt);
        const ownsAction = () => ownsRoute() && isCurrent() && attempts.byTarget.get(targetId) === attempt;
        const run = async (): Promise<boolean> => {
            if (attempt.busy || !ownsAction()) return false;
            attempt.busy = true;
            if (attempt.errorToastId) {
                feedback.dismiss(attempt.errorToastId);
                attempt.errorToastId = null;
            }
            try {
                try {
                    await restore();
                } catch (error) {
                    if (ownsAction()) attempt.errorToastId = feedback.error({
                        title: failureTitle ?? t('outcome.restore_failed'),
                        messageKey: apiClient.toUiMessageKey(error),
                        action: { label: t('actions.retry'), onClick: () => { void run(); } },
                        onDismiss: () => {
                            if (!attempt.busy && attempts.byTarget.get(targetId) === attempt) attempts.byTarget.delete(targetId);
                        },
                    }) || null;
                    return false;
                }
                if (!ownsAction()) return false;
                feedback.success({ title: successTitle ?? (name ? t('outcome.restored', { name }) : t('outcome.restored_generic')) });
                await refresh();
                return true;
            } finally {
                attempt.busy = false;
                if (attempt.errorToastId === null && attempts.byTarget.get(targetId) === attempt) attempts.byTarget.delete(targetId);
            }
        };
        return run();
    }, [attempts, feedback, owner, t]);
}
