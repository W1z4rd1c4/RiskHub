import { describe, expect, it } from 'vitest';

import { resolveCollectionLoadFailure } from '@/pages/shared/collectionPageState';
import { ApiClientError } from '@/services/apiClient';

describe('resolveCollectionLoadFailure', () => {
    it('classifies 403 failures as denied and clears stale collection state', () => {
        const result = resolveCollectionLoadFailure(
            new ApiClientError({ status: 403, messageKey: 'errors.forbidden' })
        );

        expect(result).toEqual({
            errorKey: null,
            isAccessDenied: true,
            shouldClearCollection: true,
            shouldMarkUnloaded: true,
        });
    });

    it('preserves non-403 collection state unless the caller opts into clearing', () => {
        const result = resolveCollectionLoadFailure(
            new ApiClientError({ status: 500, messageKey: 'errors.server' }),
            { fallbackErrorKey: 'errors.load_failed' }
        );

        expect(result).toEqual({
            errorKey: 'errors.load_failed',
            isAccessDenied: false,
            shouldClearCollection: false,
            shouldMarkUnloaded: false,
        });
    });

    it('allows callers to keep their existing non-403 clear-and-message behavior', () => {
        const error = new ApiClientError({ status: 500, messageKey: 'errors.server' });
        const result = resolveCollectionLoadFailure(error, {
            clearOnNonForbidden: true,
            toErrorKey: (loadError) => (loadError === error ? 'errors.server' : 'errors.load_failed'),
        });

        expect(result).toEqual({
            errorKey: 'errors.server',
            isAccessDenied: false,
            shouldClearCollection: true,
            shouldMarkUnloaded: false,
        });
    });
});
