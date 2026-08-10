/**
 * Reusable table error contract — shared types (issue #70, N17 / C3 / C4).
 *
 * This is the additive, dormant home for the table error contract that both
 * `SortableTable` (#61) and the DQ / Committee screens (#62) consume. Nothing
 * imports it until those tickets land, so it can be reverted independently
 * beforehand.
 */

/**
 * Visual treatment for {@link TableErrorState}.
 *
 * - `block`  — full-width replacement state used when a fetch fails and there is
 *   no last-good data to fall back to (first-load failure). Replaces the table.
 * - `banner` — compact, non-blocking affordance rendered ABOVE stale last-good
 *   data when a refetch fails but previous rows are still shown.
 */
export type TableErrorVariant = 'block' | 'banner';

/**
 * Props for the shared `TableErrorState` component.
 *
 * All user-facing copy is localized. `message` / `retryLabel` default to the
 * shared `common.tables.error.*` keys; consumers may override them (e.g. a
 * screen-specific message) without forking the component.
 */
export interface TableErrorStateProps {
    /**
     * Retry affordance. When provided, a retry button is rendered that invokes
     * this callback. When omitted, no button is shown (read-only error surface).
     */
    onRetry?: () => void;
    /** Localized message override. Defaults to `common.tables.error.message`. */
    message?: string;
    /** Localized retry-button label override. Defaults to `common.tables.error.retry`. */
    retryLabel?: string;
    /** Visual treatment. Defaults to `'block'`. */
    variant?: TableErrorVariant;
    /** When `true`, the retry button is disabled and its icon spins. */
    isRetrying?: boolean;
    /** Extra class names merged onto the root element. */
    className?: string;
    /** `data-testid` forwarded to the root element for test/query hooks. */
    testId?: string;
}

/**
 * The three mutually-exclusive states the table error contract resolves to.
 *
 * - `ok`            — no error; render data (or the consumer's own empty state).
 * - `error-replace` — fetch failed with no last-good data; replace the table
 *   with the error block. A failed fetch MUST NOT render as "empty" (N17).
 * - `error-overlay` — refetch failed while last-good data is still held; keep
 *   the stale rows and surface a non-blocking error banner (N17 stale-data).
 */
export type TableErrorMode = 'ok' | 'error-replace' | 'error-overlay';

/** Inputs the contract needs to pick a {@link TableErrorMode}. */
export interface TableErrorContractInput {
    /** Whether the current fetch is in an error state (e.g. React Query `isError`). */
    isError: boolean;
    /** Whether last-good data is currently available to render. */
    hasData: boolean;
}

/** Resolved contract: the mode plus the derived render flags for a consumer. */
export interface TableErrorContract {
    /** The resolved mode. */
    mode: TableErrorMode;
    /** Render the (fresh or stale) data body. */
    showData: boolean;
    /** Render the full-width replacement error block ({@link TableErrorVariant} `block`). */
    showErrorBlock: boolean;
    /** Render the non-blocking error banner above stale data ({@link TableErrorVariant} `banner`). */
    showErrorBanner: boolean;
}
