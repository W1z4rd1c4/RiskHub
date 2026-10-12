import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
    buildRegisterUrlParams,
    normalizeRegisterUrlParams,
    parseRegisterUrlState,
    type RegisterFilters,
    type RegisterSortState,
} from './registerListQuery';

interface RegisterUrlOptions<Filters, View extends string> {
    allowedSortFields: readonly string[];
    allowedViews: readonly View[];
    parseFilters: (raw: RegisterFilters) => Filters;
    serializeFilters: (filters: Filters) => RegisterFilters;
    readFilters?: (raw: RegisterFilters, params: URLSearchParams) => Filters;
    readLegacySort?: (params: URLSearchParams) => RegisterSortState | null;
    cleanWriteParams?: (params: URLSearchParams) => void;
}

interface RegisterUrlPatch<Filters, View extends string> {
    filters?: Filters;
    group?: string | null;
    search?: string;
    sort?: RegisterSortState | null;
    view?: View;
}

/** Owns URL mechanics only. Domain translation, scope, fetching and row actions stay in adapters. */
export function useRegisterUrlWorkingSet<Filters, View extends string>({
    allowedSortFields, allowedViews, parseFilters, serializeFilters,
    readFilters, readLegacySort, cleanWriteParams,
}: RegisterUrlOptions<Filters, View>) {
    const [searchParams, setSearchParams] = useSearchParams();
    const serializedParams = searchParams.toString();
    const urlState = useMemo(() => parseRegisterUrlState(new URLSearchParams(serializedParams), {
        defaultView: 'all', allowedViews,
    }), [allowedViews, serializedParams]);
    const filters = useMemo(() => readFilters
        ? readFilters(urlState.filters, new URLSearchParams(serializedParams))
        : parseFilters(urlState.filters), [parseFilters, readFilters, serializedParams, urlState.filters]);
    const sort = useMemo(() => {
        const current = urlState.sort && allowedSortFields.includes(urlState.sort.field) ? urlState.sort : null;
        const legacy = current ? null : readLegacySort?.(new URLSearchParams(serializedParams));
        return current ?? (legacy && allowedSortFields.includes(legacy.field) ? legacy : null);
    }, [allowedSortFields, readLegacySort, serializedParams, urlState.sort]);
    const viewMode = urlState.view as View;
    const debouncedSearch = useDebouncedValue(urlState.search, 300);

    useEffect(() => {
        const params = new URLSearchParams(serializedParams);
        if (normalizeRegisterUrlParams(params, {
            allowedSortFields, allowedViews, defaultView: 'all',
            canonicalizeFilters: (raw) => serializeFilters(parseFilters(raw)),
        })) setSearchParams(params, { replace: true });
    }, [allowedSortFields, allowedViews, parseFilters, serializeFilters, serializedParams, setSearchParams]);

    const writeUrl = useCallback((next: RegisterUrlPatch<Filters, View>, replace = false) => {
        const existing = new URLSearchParams(serializedParams);
        cleanWriteParams?.(existing);
        const params = buildRegisterUrlParams({
            filters: serializeFilters(next.filters ?? filters), page: 1,
            search: next.search ?? urlState.search,
            selectedGroupValue: next.group === undefined ? urlState.selectedGroupValue : next.group,
            sort: next.sort === undefined ? sort : next.sort,
            view: next.view ?? viewMode,
        }, existing);
        setSearchParams(params, { replace });
    }, [cleanWriteParams, filters, serializeFilters, serializedParams, setSearchParams, sort, urlState.search, urlState.selectedGroupValue, viewMode]);
    const setCurrentPage = useCallback((page: number) => {
        const params = new URLSearchParams(serializedParams);
        if (page > 1) params.set('page', String(page));
        else params.delete('page');
        setSearchParams(params);
    }, [serializedParams, setSearchParams]);
    const updateSearch = useCallback((search: string) => writeUrl({ search, group: null }, true), [writeUrl]);
    const updateSort = useCallback((field: string | null, direction: 'asc' | 'desc' | null) =>
        writeUrl({ sort: field && direction ? { field, direction } : null }), [writeUrl]);
    const updateViewMode = useCallback((view: View) => writeUrl({ view, group: null }), [writeUrl]);
    const selectGroup = useCallback((group: string, _label?: string) => writeUrl({ group }), [writeUrl]);
    const clearSelectedGroup = useCallback(() => writeUrl({ group: null }), [writeUrl]);

    return {
        currentPage: urlState.page, search: urlState.search, selectedGroupValue: urlState.selectedGroupValue,
        sortField: sort?.field ?? null, sortDirection: sort?.direction ?? null,
        filters, sort, viewMode, debouncedSearch, writeUrl, setCurrentPage,
        updateSearch, updateSort, updateViewMode, selectGroup, clearSelectedGroup,
    };
}

/** Commit the rendered list identity before async continuations; exports use that exact snapshot. */
export function useCommittedRegisterQuery<Params extends { offset?: number; limit?: number }>(
    listParams: Params,
    commitQueryIdentity: (identity: string) => void,
    identityContext?: unknown,
) {
    const queryIdentity = JSON.stringify(identityContext === undefined ? listParams : [listParams, identityContext]);
    const committedParams = useRef(listParams);
    useLayoutEffect(() => {
        committedParams.current = listParams;
        commitQueryIdentity(queryIdentity);
    }, [commitQueryIdentity, listParams, queryIdentity]);
    const getExportParams = useCallback(() => {
        const { offset: _offset, limit: _limit, ...params } = committedParams.current;
        return params;
    }, []);
    return { queryIdentity, getExportParams };
}
