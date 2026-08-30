import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { presentSemanticFilters } from './ictRegisterSemanticFilters';

type SemanticFilterValue = string | number | boolean | undefined;
type SemanticFilters = Record<string, SemanticFilterValue>;

export function useIctRegisterSemanticPageState<TFilters extends SemanticFilters>(
    parse: (params: URLSearchParams) => TFilters,
) {
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();
    const serializedSearchParams = searchParams.toString();
    const semanticFilters = useMemo(
        () => parse(new URLSearchParams(serializedSearchParams)),
        [parse, serializedSearchParams],
    );

    const removeSemanticFilter = useCallback(
        (key: string) => {
            const next = new URLSearchParams(serializedSearchParams);
            next.delete(key);
            next.delete('page');
            const query = next.toString();
            void navigate({
                pathname: location.pathname,
                search: query ? `?${query}` : '',
                hash: location.hash,
            });
        },
        [location.hash, location.pathname, navigate, serializedSearchParams],
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
