import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
    resolveTableErrorContract,
    useTableErrorContract,
} from '@/components/tables/tableError';

describe('resolveTableErrorContract (stale-data contract)', () => {
    it('renders data normally when there is no error', () => {
        expect(resolveTableErrorContract({ isError: false, hasData: true })).toEqual({
            mode: 'ok',
            showData: true,
            showErrorBlock: false,
            showErrorBanner: false,
        });
    });

    it('replaces the table (not empty) on a first-load failure with no last-good data', () => {
        // N17: a failed fetch MUST NOT render as "empty".
        expect(resolveTableErrorContract({ isError: true, hasData: false })).toEqual({
            mode: 'error-replace',
            showData: false,
            showErrorBlock: true,
            showErrorBanner: false,
        });
    });

    it('keeps stale last-good data and shows a non-blocking banner when a refetch fails', () => {
        expect(resolveTableErrorContract({ isError: true, hasData: true })).toEqual({
            mode: 'error-overlay',
            showData: true,
            showErrorBlock: false,
            showErrorBanner: true,
        });
    });

    it('defers an errorless empty result to the consumer empty state (no error surface)', () => {
        expect(resolveTableErrorContract({ isError: false, hasData: false })).toEqual({
            mode: 'ok',
            showData: true,
            showErrorBlock: false,
            showErrorBanner: false,
        });
    });
});

describe('useTableErrorContract', () => {
    it('mirrors the pure resolver', () => {
        const { result } = renderHook(() =>
            useTableErrorContract({ isError: true, hasData: true }),
        );

        expect(result.current).toEqual(
            resolveTableErrorContract({ isError: true, hasData: true }),
        );
    });

    it('returns a stable reference across renders while inputs are unchanged', () => {
        const { result, rerender } = renderHook(
            (props: { isError: boolean; hasData: boolean }) => useTableErrorContract(props),
            { initialProps: { isError: true, hasData: false } },
        );

        const first = result.current;
        rerender({ isError: true, hasData: false });
        expect(result.current).toBe(first);
    });
});
