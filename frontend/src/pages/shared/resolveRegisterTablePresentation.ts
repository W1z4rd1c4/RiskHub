/**
 * Pure presentation resolver for the register table sections (R3c).
 *
 * The Controls / Issues / KRIs / Risks / Vendors table sections all repeat the same
 * all/grouped/error/skeleton decision plus the "keep pagination / show a stale-refetch
 * banner" flags. This resolver is the single source of truth for that decision, mirroring
 * the pure {@link resolveTableErrorContract} in `@/components/tables/tableError`. It owns
 * ONLY the branching facts — each section keeps its own JSX, columns, rowHref and i18n
 * namespace handling.
 *
 * Modes:
 *   - `all`        — the flat (`viewMode === 'all'`) surface. The SortableTable itself
 *     owns loading/error/empty; this resolver only decides whether pagination shows.
 *   - `error-page` — grouped surface, first-load error with no groups: replace the whole
 *     surface with the error block (never an empty state).
 *   - `skeleton`   — grouped surface, first load still in flight: column-aware skeleton.
 *   - `grouped`    — grouped surface with last-good data; a stale refetch error surfaces
 *     one non-blocking banner (`showBanner`) above the retained groups.
 */
import type { ViewMode } from '@/components/tables';

export type RegisterTablePresentationMode = 'all' | 'grouped' | 'error-page' | 'skeleton';

export interface RegisterTablePresentationInput {
    /** Active view surface; `'all'` is the flat table, anything else is grouped. */
    viewMode: ViewMode;
    /** Whether the owning query is in an error state (e.g. `errorKey !== null`). */
    isError: boolean;
    /** Whether a fetch is currently in flight. */
    isLoading: boolean;
    /** Whether at least one load has settled (guards the first-load skeleton). */
    hasLoadedOnce: boolean;
    /** Number of grouped cards/rows currently held. */
    groupsLength: number;
    /** Number of flat rows currently held (drives pagination visibility). */
    rowsLength: number;
    /**
     * Section-resolved localized error message (namespaces differ per section, so the
     * i18n lookup stays in the component). Passed through as `resolvedErrorMessage`
     * only while `isError` holds.
     */
    errorMessage?: string;
}

export interface RegisterTablePresentation {
    /** Which surface to render. */
    mode: RegisterTablePresentationMode;
    /** Render the non-blocking stale-refetch banner above the grouped surface. */
    showBanner: boolean;
    /** Render the pagination control (only meaningful for the `all` surface). */
    showPagination: boolean;
    /** The localized error message to surface, or `undefined` when there is no error. */
    resolvedErrorMessage: string | undefined;
}

/**
 * Resolve the register table presentation from the raw async/view facts. Pure and
 * side-effect free so it can be unit-tested exhaustively and shared across sections.
 */
export function resolveRegisterTablePresentation({
    viewMode,
    isError,
    isLoading,
    hasLoadedOnce,
    groupsLength,
    rowsLength,
    errorMessage,
}: RegisterTablePresentationInput): RegisterTablePresentation {
    const resolvedErrorMessage = isError ? errorMessage : undefined;

    // Flat surface: the SortableTable owns loading/error/empty; we only decide whether
    // pagination shows. Keep it while rows are present, or whenever the surface is in a
    // settled (non-error, non-loading) state — so an empty success still paginates but a
    // first-load skeleton / error does not.
    if (viewMode === 'all') {
        return {
            mode: 'all',
            showBanner: false,
            showPagination: rowsLength > 0 || (!isError && !isLoading),
            resolvedErrorMessage,
        };
    }

    // Grouped parent guard: a first-load error with no groups replaces the whole surface.
    if (isError && groupsLength === 0) {
        return { mode: 'error-page', showBanner: false, showPagination: false, resolvedErrorMessage };
    }

    // First grouped load in flight: column-aware skeleton, never a false empty state.
    if (!hasLoadedOnce && isLoading) {
        return { mode: 'skeleton', showBanner: false, showPagination: false, resolvedErrorMessage };
    }

    // Grouped surface with last-good data: a stale refetch error surfaces one banner
    // above the retained groups (`isError` here implies groups are present).
    return { mode: 'grouped', showBanner: isError, showPagination: false, resolvedErrorMessage };
}
