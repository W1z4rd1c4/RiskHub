import { describe, expect, it } from 'vitest';

import {
    applyCollectionStatePatch,
    createCollectionFailurePatch,
    createCollectionInitialState,
    createCollectionSuccessPatch,
    resolveCollectionLoadFailure,
} from '@/pages/shared/collectionPageState';
import {
    getCollectionGroupBy,
    resetCollectionGroupAndPage,
} from '@/pages/shared/collectionViewVocabulary';
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

describe('collection state patches', () => {
    it('creates a success patch with rows, groups, capabilities, and loaded state', () => {
        const patch = createCollectionSuccessPatch({
            items: [{ id: 1 }],
            groups: [{ value: 'group', label: 'Group', count: 1, active_count: 1, highlighted_count: 0 }],
            capabilities: { can_export: true },
            total: 7,
        });

        expect(patch).toEqual({
            items: [{ id: 1 }],
            groups: [{ value: 'group', label: 'Group', count: 1, active_count: 1, highlighted_count: 0 }],
            capabilities: { can_export: true },
            totalCount: 7,
            errorKey: null,
            isAccessDenied: false,
            hasLoadedOnce: true,
        });
    });

    it('creates a forbidden failure patch that clears stale collection data', () => {
        const patch = createCollectionFailurePatch(
            new ApiClientError({ status: 403, messageKey: 'errors.forbidden' }),
            { fallbackErrorKey: 'errors.load_failed' }
        );

        expect(patch).toEqual({
            items: [],
            groups: [],
            capabilities: null,
            totalCount: 0,
            errorKey: null,
            isAccessDenied: true,
            hasLoadedOnce: false,
        });
    });

    it('creates a non-forbidden failure patch without clearing by default', () => {
        const patch = createCollectionFailurePatch(
            new ApiClientError({ status: 500, messageKey: 'errors.server' }),
            { fallbackErrorKey: 'errors.load_failed' }
        );

        expect(patch).toEqual({
            errorKey: 'errors.load_failed',
            isAccessDenied: false,
        });
    });
});

describe('collection state model', () => {
    it('applies a success patch while preserving capabilities and loaded state in one place', () => {
        const state = createCollectionInitialState<{ id: number }>();
        const nextState = applyCollectionStatePatch(state, createCollectionSuccessPatch({
            items: [{ id: 7 }],
            groups: [{ value: 'open', label: 'Open', count: 1, active_count: 1, highlighted_count: 0 }],
            capabilities: { can_export: true },
            total: 1,
        }));

        expect(nextState).toEqual({
            items: [{ id: 7 }],
            groups: [{ value: 'open', label: 'Open', count: 1, active_count: 1, highlighted_count: 0 }],
            capabilities: { can_export: true },
            totalCount: 1,
            errorKey: null,
            isAccessDenied: false,
            hasLoadedOnce: true,
        });
    });

    it('clears stale rows on forbidden failures without scattering the rule across pages', () => {
        const state = {
            ...createCollectionInitialState<{ id: number }>(),
            items: [{ id: 1 }],
            groups: [{ value: 'old', label: 'Old', count: 1, active_count: 1, highlighted_count: 0 }],
            capabilities: { can_export: true },
            totalCount: 1,
            hasLoadedOnce: true,
        };
        const nextState = applyCollectionStatePatch(
            state,
            createCollectionFailurePatch(
                new ApiClientError({ status: 403, messageKey: 'errors.forbidden' })
            )
        );

        expect(nextState).toEqual({
            items: [],
            groups: [],
            capabilities: null,
            totalCount: 0,
            errorKey: null,
            isAccessDenied: true,
            hasLoadedOnce: false,
        });
    });
});

describe('collection view vocabulary', () => {
    it('maps register view modes to backend group values through one shared helper', () => {
        const groups = {
            department: 'department',
            risk_type: 'risk_type',
            vendor: 'vendor',
        };

        expect(getCollectionGroupBy('department', groups)).toBe('department');
        expect(getCollectionGroupBy('risk_type', groups)).toBe('risk_type');
        expect(getCollectionGroupBy('all', groups)).toBeNull();
    });

    it('resets group selection and paging through one shared helper', () => {
        const calls: string[] = [];

        resetCollectionGroupAndPage(
            () => calls.push('reset-group'),
            (page) => calls.push(`page:${page}`)
        );

        expect(calls).toEqual(['reset-group', 'page:1']);
    });
});
