import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';

import {
    useDepartmentScopedPluralFilter,
    useDepartmentScopedScalarFilter,
} from '@/pages/departments/useDepartmentRegisterScope';
import { DepartmentRegisterScopeProvider } from '@/pages/departments/DepartmentRegisterScope';

function wrapper({ children }: { children: ReactNode }) {
    return (
        <DepartmentRegisterScopeProvider value={{ departmentId: 7, departmentName: 'Compliance' }}>
            {children}
        </DepartmentRegisterScopeProvider>
    );
}

describe('DepartmentRegisterScope locked filter merge', () => {
    it('wins over conflicting scalar and plural URL filters', () => {
        const scalar = renderHook(() => useDepartmentScopedScalarFilter(999), { wrapper });
        const plural = renderHook(() => useDepartmentScopedPluralFilter([999, 1000]), { wrapper });

        expect(scalar.result.current).toBe(7);
        expect(plural.result.current).toEqual([7]);
    });

    it('preserves ordinary top-level register filters without a Department context', () => {
        const scalar = renderHook(() => useDepartmentScopedScalarFilter(999));
        const plural = renderHook(() => useDepartmentScopedPluralFilter([999, 1000]));

        expect(scalar.result.current).toBe(999);
        expect(plural.result.current).toEqual([999, 1000]);
    });
});
