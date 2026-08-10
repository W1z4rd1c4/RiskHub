import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { SetURLSearchParams } from 'react-router-dom';

import { useDepartmentRegisterScope } from './useDepartmentRegisterScope';

function readPage(params: URLSearchParams): number {
    const value = Number(params.get('page'));
    return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

export function useDepartmentScopedPagination({
    localPage,
    searchParams,
    setLocalPage,
    setSearchParams,
}: {
    localPage: number;
    searchParams: URLSearchParams;
    setLocalPage: Dispatch<SetStateAction<number>>;
    setSearchParams: SetURLSearchParams;
}) {
    const scope = useDepartmentRegisterScope();
    const currentPage = scope ? readPage(searchParams) : localPage;

    const setCurrentPage = useCallback<Dispatch<SetStateAction<number>>>((nextValue) => {
        const nextPage = typeof nextValue === 'function' ? nextValue(currentPage) : nextValue;
        if (!scope) {
            setLocalPage(nextPage);
            return;
        }
        setSearchParams((current) => {
            const next = new URLSearchParams(current);
            if (nextPage > 1) next.set('page', String(nextPage));
            else next.delete('page');
            return next;
        });
    }, [currentPage, scope, setLocalPage, setSearchParams]);

    return {
        currentPage,
        isDepartmentScoped: scope !== null,
        setCurrentPage,
    };
}

export function resetDepartmentScopedPage(params: URLSearchParams, isDepartmentScoped: boolean): URLSearchParams {
    if (isDepartmentScoped) params.delete('page');
    return params;
}
