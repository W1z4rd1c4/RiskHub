/**
 * Reusable table error contract — resolver + hook (issue #70, N17 / C3 / C4).
 *
 * Stale-data contract (the pick documented by #70):
 *   - On a fetch error with NO last-good data → replace the table with the
 *     error block (`error-replace`). A failed fetch MUST NOT render as "empty".
 *   - On a fetch error WHILE last-good data is held → keep showing the stale
 *     rows and surface a non-blocking retry banner (`error-overlay`). We favour
 *     "show stale + affordance" over "replace" so context is never lost.
 *   - Otherwise → render normally (`ok`); an errorless-but-empty result is the
 *     consumer's own empty state, not an error.
 */
import { useMemo } from 'react';

import type { TableErrorContract, TableErrorContractInput } from './types';

/**
 * Pure resolver for the table error contract. Single source of truth for the
 * stale-data decision so `SortableTable` (#61) and the DQ / Committee screens
 * (#62) branch identically.
 */
export function resolveTableErrorContract({
    isError,
    hasData,
}: TableErrorContractInput): TableErrorContract {
    if (isError && !hasData) {
        return {
            mode: 'error-replace',
            showData: false,
            showErrorBlock: true,
            showErrorBanner: false,
        };
    }

    if (isError && hasData) {
        return {
            mode: 'error-overlay',
            showData: true,
            showErrorBlock: false,
            showErrorBanner: true,
        };
    }

    return {
        mode: 'ok',
        showData: true,
        showErrorBlock: false,
        showErrorBanner: false,
    };
}

/**
 * Memoized hook wrapper around {@link resolveTableErrorContract} for consumers
 * that want a stable contract reference across renders.
 */
export function useTableErrorContract({
    isError,
    hasData,
}: TableErrorContractInput): TableErrorContract {
    return useMemo(
        () => resolveTableErrorContract({ isError, hasData }),
        [isError, hasData],
    );
}
