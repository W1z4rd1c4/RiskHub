import { createContext, useContext } from 'react';

export interface DepartmentRegisterScope {
    departmentId: number;
    departmentName: string;
}

export const DepartmentRegisterScopeContext = createContext<DepartmentRegisterScope | null>(null);

export function useDepartmentRegisterScope(): DepartmentRegisterScope | null {
    return useContext(DepartmentRegisterScopeContext);
}

export function useDepartmentScopedScalarFilter(current: number | null | undefined): number | null | undefined {
    const scope = useDepartmentRegisterScope();
    return scope?.departmentId ?? current;
}

export function useDepartmentScopedPluralFilter(current: number[]): number[] {
    const scope = useDepartmentRegisterScope();
    return scope ? [scope.departmentId] : current;
}
