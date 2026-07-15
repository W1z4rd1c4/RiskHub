import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { presentSemanticFilters } from './ictRegisterSemanticFilters';

type SemanticFilterValue = string | number | boolean | undefined;
type SemanticFilters = Record<string, SemanticFilterValue>;

export function useIctRegisterSemanticPageState<TFilters extends SemanticFilters>(
    parse: (params: URLSearchParams) => TFilters,
) {
    const [searchParams, setSearchParams] = useSearchParams();
    const serializedSearchParams = searchParams.toString();
    const semanticFilters = useMemo(
        () => parse(new URLSearchParams(serializedSearchParams)),
        [parse, serializedSearchParams],
    );

    const removeSemanticFilter = useCallback(
        (key: string) => {
            const next = new URLSearchParams(serializedSearchParams);
            next.delete(key);
            setSearchParams(next);
        },
        [serializedSearchParams, setSearchParams],
    );

    const presentedSemanticFilters = useMemo(
        () => presentSemanticFilters(semanticFilters),
        [semanticFilters],
    );

    return {
        semanticFilters,
        presentedSemanticFilters,
        removeSemanticFilter,
    };
}
