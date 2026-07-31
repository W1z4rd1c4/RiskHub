import type { ReactNode } from 'react';

import {
    DepartmentRegisterScopeContext,
    type DepartmentRegisterScope,
} from './useDepartmentRegisterScope';

export function DepartmentRegisterScopeProvider({
    children,
    value,
}: {
    children: ReactNode;
    value: DepartmentRegisterScope;
}) {
    return (
        <DepartmentRegisterScopeContext.Provider value={value}>
            {children}
        </DepartmentRegisterScopeContext.Provider>
    );
}
