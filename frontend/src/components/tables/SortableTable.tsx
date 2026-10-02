/**
 * SortableTable - Generic table with sortable column headers.
 *
 * Centralizes the accessible table contract (issue #61, spec §4 Phase 3, N16–N18;
 * audit 2026-09-30 §4.13, D14):
 *   - FR-P3-1 keyboard access: sort headers are real buttons inside
 *     `<th scope="col" aria-sort>` (`ui/table` `TH`); an optional trailing chevron
 *     is a focusable `<Link aria-label="View …">` (the keyboard path to detail).
 *   - D14 / AX-02 row activation: `onRowActivate` (in-page selection) renders a
 *     named button in the first cell (native Enter/Space); a row click
 *     delegates to it as a mouse convenience. `onRowClick` is the deprecated,
 *     mouse-only predecessor.
 *   - `getRowActions` renders named `RowActionButton`s in a trailing cell.
 *   - FR-P3-2 column-aware `isLoading` skeleton (renders the header + placeholder
 *     rows so a load never flashes the empty state).
 *   - FR-P3-3 `isError` branch consuming the reusable table-error contract from
 *     #70 (`useTableErrorContract` + `<TableErrorState>`): a failed fetch with no
 *     data replaces the table; a failed refetch that still holds data keeps the
 *     stale rows and surfaces a non-blocking retry banner.
 *
 * The markup comes from the presentational `components/ui/table.tsx` primitives
 * (scroll container, header recipe, row dividers).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/hooks';
import { TableErrorState, useTableErrorContract } from '@/components/tables/tableError';
import {
    TBody,
    TD,
    TH,
    THead,
    TR,
    Table,
    TableRowButton,
    type TableDensity,
    type TableSortDirection,
} from '@/components/ui/table';

export type SortDirection = TableSortDirection;

export interface Column<T> {
    key: keyof T | string;
    label: string;
    sortable?: boolean;
    render?: (item: T, index: number) => React.ReactNode;
    className?: string;
    headerClassName?: string;
}

interface SortableTableProps<T> {
    data: T[];
    columns: Column<T>[];
    keyExtractor: (item: T) => string | number;
    /** @deprecated Mouse-only. Use `rowHref` (navigation) or `onRowActivate` (in-page selection). */
    onRowClick?: (item: T) => void;
    className?: string;
    emptyMessage?: string;
    // Controlled sorting props
    sortKey?: string | null;
    sortDirection?: SortDirection;
    onSort?: (key: string, direction: SortDirection) => void;
    // Loading / error contract (FR-P3-2 / FR-P3-3, N16–N17).
    /** When `true` and no data is held yet, render a column-aware skeleton. */
    isLoading?: boolean;
    /** When `true`, branch through the reusable table-error contract (#70). */
    isError?: boolean;
    /** Retry callback surfaced by the error block / banner. */
    onRetry?: () => void;
    /** Localized error-message override; defaults to `common.tables.error.message`. */
    errorMessage?: string;
    /** Placeholder row count for the loading skeleton (default 5). */
    skeletonRowCount?: number;
    // Keyboard detail path (FR-P3-1, N18).
    /** Detail-route builder; when set, a focusable trailing `<Link>` chevron is rendered per row. */
    rowHref?: (item: T) => string;
    /** Accessible entity name for the `View …` link label (used with `rowHref`). */
    rowLabel?: (item: T) => string;
    /** Optional accessible name when multiple table regions share one view. */
    horizontalRegionLabel?: string;
    // Row activation and actions (audit §4.13, D14, AX-02).
    /**
     * In-page selection (open a drawer / dialog, select a row). Renders the first
     * column's content inside a named button (Enter/Space); a click anywhere
     * else on the row (outside interactive content) activates it too. The first
     * column must not render interactive content when this is set.
     */
    onRowActivate?: (item: T) => void;
    /** Visually hidden text appended to the activation button's name (e.g. "Open questionnaire sent 5 Jan"). */
    rowActivateLabel?: (item: T) => string;
    /** Trailing per-row actions, normally `RowActionButton`s. */
    getRowActions?: (item: T) => React.ReactNode;
    /**
     * `card` (default) wraps the table in the glass card; `none` renders it bare
     * for tables that already sit inside a card (never nest glass in glass).
     */
    surface?: 'card' | 'none';
    /** Cell padding: `default` px-6 py-4 · `compact` px-4 py-3. */
    density?: TableDensity;
}

const INTERACTIVE_TARGET_SELECTOR =
    'a, button, input, select, textarea, label, summary, [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="menuitem"], [contenteditable="true"]';

/** True when a click started on interactive content inside the row (it handles its own click). */
function isInteractiveTarget(event: React.MouseEvent<HTMLTableRowElement>): boolean {
    const target = event.target;
    if (!(target instanceof Element)) return false;
    const interactive = target.closest(INTERACTIVE_TARGET_SELECTOR);
    return interactive !== null && event.currentTarget.contains(interactive);
}

function getItemValue<T extends object>(item: T, key: string): unknown {
    return (item as Record<string, unknown>)[key];
}

export function SortableTable<T extends object>({
    data,
    columns,
    keyExtractor,
    onRowClick,
    className,
    emptyMessage,
    sortKey: controlledSortKey,
    sortDirection: controlledSortDirection,
    onSort,
    isLoading = false,
    isError = false,
    onRetry,
    errorMessage,
    skeletonRowCount = 5,
    rowHref,
    rowLabel,
    horizontalRegionLabel,
    onRowActivate,
    rowActivateLabel,
    getRowActions,
    surface = 'card',
    density = 'default',
}: SortableTableProps<T>) {
    const { t } = useTranslation('common');
    const [internalSortKey, setInternalSortKey] = useState<string | null>(null);
    const [internalSortDirection, setInternalSortDirection] = useState<SortDirection>(null);
    const resolvedEmptyMessage = emptyMessage ?? t('empty.no_data_available');
    const resolvedHorizontalRegionLabel = horizontalRegionLabel ?? t('tables.horizontal_scroll_region');

    const isControlled = onSort !== undefined;
    const currentSortKey = isControlled ? controlledSortKey : internalSortKey;
    const currentSortDirection = isControlled ? controlledSortDirection : internalSortDirection;

    const handleSort = (key: string) => {
        let newDirection: SortDirection = 'asc';

        if (currentSortKey === key) {
            // Toggle direction: asc -> desc -> null
            if (currentSortDirection === 'asc') {
                newDirection = 'desc';
            } else if (currentSortDirection === 'desc') {
                newDirection = null;
            }
        }

        if (isControlled && onSort) {
            onSort(newDirection === null ? key : key, newDirection);
        } else {
            setInternalSortKey(newDirection === null ? null : key);
            setInternalSortDirection(newDirection);
        }
    };

    const sortedData = useMemo(() => {
        if (isControlled) return data; // Server-side sorting, data is already sorted
        if (!internalSortKey || !internalSortDirection) return data;

        return [...data].sort((a, b) => {
            const aVal = getItemValue(a, internalSortKey);
            const bVal = getItemValue(b, internalSortKey);

            if (aVal == null) return 1;
            if (bVal == null) return -1;

            const comparison = typeof aVal === 'string' && typeof bVal === 'string'
                ? aVal.localeCompare(bVal)
                : typeof aVal === 'number' && typeof bVal === 'number'
                    ? aVal - bVal
                    : String(aVal).localeCompare(String(bVal));

            return internalSortDirection === 'desc' ? -comparison : comparison;
        });
    }, [data, internalSortKey, internalSortDirection, isControlled]);

    const hasData = data.length > 0;
    const errorContract = useTableErrorContract({ isError, hasData });

    const hasTrailingCell = Boolean(rowHref || getRowActions);
    // Link-only rows keep the 40px chevron column; row actions shrink-wrap their buttons.
    const trailingCellWidth = getRowActions ? 'w-px whitespace-nowrap' : 'w-[40px]';
    const surfaceClassName = surface === 'card' ? 'glass-card !p-0 overflow-hidden' : undefined;
    const rowActivationHandler = onRowActivate ?? onRowClick;

    const renderHeader = () => (
        <THead>
            <TR>
                {columns.map((col) => {
                    const key = String(col.key);
                    const isActiveSort = currentSortKey === key;
                    return (
                        <TH
                            key={key}
                            className={col.headerClassName}
                            onSort={col.sortable ? () => handleSort(key) : undefined}
                            sortDirection={isActiveSort ? currentSortDirection ?? null : null}
                        >
                            {col.sortable ? col.label : <span className="inline-flex items-center gap-2">{col.label}</span>}
                        </TH>
                    );
                })}
                {hasTrailingCell ? (
                    <TH className={trailingCellWidth}>
                        <span className="sr-only">{t('tables.row_actions')}</span>
                    </TH>
                ) : null}
            </TR>
        </THead>
    );

    // FR-P3-3 — a failed fetch with no last-good data replaces the table entirely
    // (never renders as "empty"). Consumes #70's resolved contract.
    if (errorContract.showErrorBlock) {
        return <TableErrorState variant="block" onRetry={onRetry} message={errorMessage} className={className} />;
    }

    // FR-P3-2 — column-aware skeleton while the first load is in flight, so the
    // list never flashes a false "no data" / zero state (C3).
    if (isLoading && !hasData) {
        const skeletonColumnCount = columns.length + (hasTrailingCell ? 1 : 0);
        return (
            <div
                className={cn(surfaceClassName, className)}
                aria-busy="true"
                data-testid="sortable-table-skeleton"
            >
                <Table density={density} regionLabel={resolvedHorizontalRegionLabel}>
                    {renderHeader()}
                    <TBody>
                        {Array.from({ length: skeletonRowCount }, (_, rowIndex) => (
                            <TR key={`sortable-skeleton-${rowIndex}`} className="animate-pulse" aria-hidden="true">
                                {Array.from({ length: skeletonColumnCount }, (_, colIndex) => (
                                    <TD key={colIndex} aria-hidden="true">
                                        <div className="h-4 w-full max-w-[120px] rounded bg-tint/5" />
                                    </TD>
                                ))}
                            </TR>
                        ))}
                    </TBody>
                </Table>
            </div>
        );
    }

    if (!hasData) {
        return (
            <div className={cn(surface === 'card' ? 'glass-card' : undefined, 'text-center py-12')}>
                <p className="text-muted-foreground">{resolvedEmptyMessage}</p>
            </div>
        );
    }

    const renderCell = (item: T, col: Column<T>, index: number, colIndex: number) => {
        const content = col.render
            ? col.render(item, index)
            : String(getItemValue(item, String(col.key)) ?? '');
        if (colIndex !== 0 || !onRowActivate) return content;
        return (
            <TableRowButton
                onClick={() => onRowActivate(item)}
                srLabel={rowActivateLabel?.(item)}
                data-row-activate=""
            >
                {content}
            </TableRowButton>
        );
    };

    const renderTrailingCell = (item: T) => {
        const link = rowHref ? (
            <Link
                to={rowHref(item)}
                onClick={(event) => event.stopPropagation()}
                aria-label={
                    rowLabel
                        ? t('tables.view_entity', { entity: rowLabel(item) })
                        : t('tables.view_row')
                }
                className="inline-flex items-center justify-center rounded text-muted-foreground transition-colors hover:text-accent-text focus-ring"
            >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
        ) : null;
        if (!getRowActions) {
            return <TD className={cn(trailingCellWidth, 'text-right')}>{link}</TD>;
        }
        return (
            <TD className={cn(trailingCellWidth, 'text-right')}>
                <div className="flex items-center justify-end gap-1">
                    {getRowActions(item)}
                    {link}
                </div>
            </TD>
        );
    };

    const table = (
        // FR-P5-3: the rounded card keeps `overflow-hidden` (corner clip); the inner
        // `Table` scroll container lets dense/wide columns scroll at `>= lg`
        // instead of being clipped.
        <div className={cn(surfaceClassName, className)}>
            <Table density={density} regionLabel={resolvedHorizontalRegionLabel}>
                {renderHeader()}
                <TBody>
                    {sortedData.map((item, index) => (
                        <TR
                            key={keyExtractor(item)}
                            className={cn(rowActivationHandler && 'cursor-pointer')}
                            onClick={
                                rowActivationHandler
                                    ? (event) => {
                                        if (isInteractiveTarget(event)) return;
                                        rowActivationHandler(item);
                                    }
                                    : undefined
                            }
                        >
                            {columns.map((col, colIndex) => (
                                <TD key={String(col.key)} className={col.className}>
                                    {renderCell(item, col, index, colIndex)}
                                </TD>
                            ))}
                            {hasTrailingCell ? renderTrailingCell(item) : null}
                        </TR>
                    ))}
                </TBody>
            </Table>
        </div>
    );

    // FR-P3-3 stale-data path — a refetch failed but last-good rows are still
    // shown: keep the rows and surface a non-blocking retry banner above them.
    if (errorContract.showErrorBanner) {
        return (
            <div className="space-y-3">
                <TableErrorState variant="banner" onRetry={onRetry} message={errorMessage} />
                {table}
            </div>
        );
    }

    return table;
}
