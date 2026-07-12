import { describe, expect, it } from 'vitest';

import {
    resolveRegisterTablePresentation,
    type RegisterTablePresentationInput,
} from '@/pages/shared/resolveRegisterTablePresentation';

function resolve(overrides: Partial<RegisterTablePresentationInput> = {}) {
    return resolveRegisterTablePresentation({
        viewMode: 'department',
        isError: false,
        isLoading: false,
        hasLoadedOnce: true,
        groupsLength: 0,
        rowsLength: 0,
        ...overrides,
    });
}

describe('resolveRegisterTablePresentation', () => {
    describe('flat (viewMode === "all") surface', () => {
        it('paginates a settled empty success and surfaces no error', () => {
            const result = resolve({ viewMode: 'all', rowsLength: 0 });
            expect(result.mode).toBe('all');
            expect(result.showPagination).toBe(true);
            expect(result.showBanner).toBe(false);
            expect(result.resolvedErrorMessage).toBeUndefined();
        });

        it('paginates when rows are present, even under a stale error, and passes the message', () => {
            const result = resolve({
                viewMode: 'all',
                isError: true,
                rowsLength: 3,
                errorMessage: 'boom',
            });
            expect(result.mode).toBe('all');
            expect(result.showPagination).toBe(true);
            expect(result.resolvedErrorMessage).toBe('boom');
        });

        it('hides pagination on a first-load error with no rows', () => {
            const result = resolve({ viewMode: 'all', isError: true, rowsLength: 0, errorMessage: 'boom' });
            expect(result.mode).toBe('all');
            expect(result.showPagination).toBe(false);
            expect(result.resolvedErrorMessage).toBe('boom');
        });

        it('hides pagination while a first load is in flight with no rows', () => {
            const result = resolve({ viewMode: 'all', isLoading: true, rowsLength: 0 });
            expect(result.mode).toBe('all');
            expect(result.showPagination).toBe(false);
        });

        it('stays in "all" mode even when isError and there are no groups (all wins over error-page)', () => {
            const result = resolve({ viewMode: 'all', isError: true, groupsLength: 0, rowsLength: 0 });
            expect(result.mode).toBe('all');
        });
    });

    describe('grouped surface', () => {
        it('replaces the surface (error-page) on a first-load error with no groups', () => {
            const result = resolve({ isError: true, groupsLength: 0, errorMessage: 'boom' });
            expect(result.mode).toBe('error-page');
            expect(result.showBanner).toBe(false);
            expect(result.showPagination).toBe(false);
            expect(result.resolvedErrorMessage).toBe('boom');
        });

        it('renders a skeleton on the first grouped load in flight', () => {
            const result = resolve({ hasLoadedOnce: false, isLoading: true, groupsLength: 0 });
            expect(result.mode).toBe('skeleton');
            expect(result.showBanner).toBe(false);
        });

        it('keeps grouped data and surfaces one banner on a stale refetch error', () => {
            const result = resolve({ isError: true, groupsLength: 2, errorMessage: 'boom' });
            expect(result.mode).toBe('grouped');
            expect(result.showBanner).toBe(true);
            expect(result.resolvedErrorMessage).toBe('boom');
        });

        it('renders grouped data with no banner when settled and error-free', () => {
            const result = resolve({ groupsLength: 2 });
            expect(result.mode).toBe('grouped');
            expect(result.showBanner).toBe(false);
            expect(result.resolvedErrorMessage).toBeUndefined();
        });

        it('prefers error-page over the skeleton when a first load errors with no groups', () => {
            const result = resolve({ isError: true, hasLoadedOnce: false, isLoading: true, groupsLength: 0 });
            expect(result.mode).toBe('error-page');
        });

        it('prefers the skeleton while first-loading with groups already present under an error', () => {
            const result = resolve({ isError: true, hasLoadedOnce: false, isLoading: true, groupsLength: 2 });
            expect(result.mode).toBe('skeleton');
        });
    });

    it('never leaks an error message while isError is false', () => {
        const result = resolve({ isError: false, errorMessage: 'stale-message' });
        expect(result.resolvedErrorMessage).toBeUndefined();
    });
});
