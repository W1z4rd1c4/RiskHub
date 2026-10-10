import { useContext } from 'react';

import { FeedbackContext, type FeedbackApi } from '@/contexts/FeedbackContext';
import { logError } from '@/services/logger';

export type {
    FeedbackAction,
    FeedbackApi,
    FeedbackErrorOptions,
    FeedbackOptions,
    FeedbackTone,
} from '@/contexts/FeedbackContext';

let missingProviderReported = false;

function reportMissingProvider(): string {
    if (!missingProviderReported) {
        missingProviderReported = true;
        logError('useFeedback() was called outside <FeedbackProvider>; the message was not shown.', null);
    }
    return '';
}

/**
 * Outside the provider (isolated unit tests, e2e harness pages) feedback is
 * dropped and reported once through the logger instead of crashing the page;
 * the application root always mounts `FeedbackProvider`.
 */
const DETACHED_FEEDBACK: FeedbackApi = {
    success: reportMissingProvider,
    info: reportMissingProvider,
    warning: reportMissingProvider,
    error: reportMissingProvider,
    dismiss: () => undefined,
};

/**
 * Transient feedback channel (audit 2026-09-30 §4.16, D9).
 *
 * - `success` / `info` / `warning`: polite toast (5 s).
 * - `error`: assertive `danger` toast (8 s); pass `messageKey` with the
 *   `errorKeys.*` key from `apiClient.toUiMessageKey(error)`.
 * - Row-level failures in a list use `error` and never set the list's error
 *   state; blocking, region-scoped errors use `InlineMessage` instead.
 *
 * The returned object is stable, so it is safe in hook dependency arrays.
 */
export function useFeedback(): FeedbackApi {
    return useContext(FeedbackContext) ?? DETACHED_FEEDBACK;
}
