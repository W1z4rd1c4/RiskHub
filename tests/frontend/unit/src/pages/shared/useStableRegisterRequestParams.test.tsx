import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useStableRegisterRequestParams } from '@/pages/shared/useStableRegisterRequestParams';

describe('useStableRegisterRequestParams', () => {
    it('reuses equal JSON requests despite nested object order and omitted optionals', () => {
        type Params = { search?: string; offset: number; sort: { field: string; direction: string }; ids: number[] };
        const initialProps: Params = { search: undefined, offset: 0, sort: { field: 'name', direction: 'asc' }, ids: [3, 7] };
        const { result, rerender } = renderHook(useStableRegisterRequestParams<Params>, { initialProps });
        const first = result.current;
        rerender({ ids: [3, 7], sort: { direction: 'asc', field: 'name' }, offset: 0 });
        expect(result.current).toBe(first);
        expect(result.current).toStrictEqual(initialProps);
        expect(Object.hasOwn(result.current, 'search')).toBe(true);
    });

    it('preserves false, zero, null and ordered arrays without mutating input', () => {
        const params = Object.freeze({ enabled: false, offset: 0, group: null, ids: Object.freeze([7, 3]) });
        const { result } = renderHook(() => useStableRegisterRequestParams(params));
        expect(result.current).toEqual(params);
        expect(result.current).toBe(params);
        expect(result.current.ids).toBe(params.ids);
    });

    it('retains explicit undefined request fields on initial and changed snapshots', () => {
        const initialProps = { status: undefined, critical: undefined, risk_level: undefined, department_id: undefined, offset: 0 };
        const { result, rerender } = renderHook(useStableRegisterRequestParams<typeof initialProps>, { initialProps });
        expect(result.current).toStrictEqual(initialProps);
        for (const key of ['status', 'critical', 'risk_level', 'department_id']) expect(Object.hasOwn(result.current, key)).toBe(true);

        const next = { ...initialProps, offset: 10 };
        rerender(next);
        expect(result.current).toBe(next);
        expect(result.current).toStrictEqual(next);
        rerender({ ...next });
        expect(result.current).toBe(next);
    });

    it('changes references for effective criteria and does not cache prior requests globally', () => {
        const { result, rerender } = renderHook(useStableRegisterRequestParams<{ search: string }>, { initialProps: { search: 'a' } });
        const first = result.current;
        rerender({ search: 'b' });
        expect(result.current).not.toBe(first);
        expect(result.current.search).toBe('b');
        rerender({ search: 'a' });
        expect(result.current).not.toBe(first);
        expect(result.current.search).toBe('a');
    });
});
