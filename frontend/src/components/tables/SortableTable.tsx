/**
 * SortableTable - Generic table with sortable column headers.
 *
 * Centralizes the accessible table contract (issue #61, spec §4 Phase 3, N16–N18):
 *   - FR-P3-1 keyboard access: sort headers are real `<button>`s inside
 *     `<th scope="col" aria-sort>`; an optional trailing chevron is a focusable
 *     `<Link aria-label="View …">` (the keyboard path to detail); row `onClick`
 *     is retained purely as a mouse convenience.
 *   - FR-P3-2 column-aware `isLoading` skeleton (renders the header + placeholder
 *     rows so a load never flashes the empty state).
 *   - FR-P3-3 `isError` branch consuming the reusable table-error contract from
 *     #70 (`useTableErrorContract` + `<TableErrorState>`): a failed fetch with no
 *     data replaces the table; a failed refetch that still holds data keeps the
 *     stale rows and surfaces a non-blocking retry banner.
 */
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/hooks';
import { TableErrorState, useTableErrorContract } from '@/components/tables/tableError';

export type SortDirection = 'asc' | 'desc' | null;

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
}: SortableTableProps<T>) {
    const { t } = useTranslation('common');
    const [internalSortKey, setInternalSortKey] = useState<string | null>(null);
    const [internalSortDirection, setInternalSortDirection] = useState<SortDirection>(null);
    const resolvedEmptyMessage = emptyMessage ?? t('empty.no_data_available');

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

    const getSortIcon = (key: string) => {
        if (currentSortKey !== key) {
            return <ChevronsUpDown className="h-4 w-4 text-slate-500" aria-hidden="true" />;
        }
        if (currentSortDirection === 'asc') {
            return <ChevronUp className="h-4 w-4 text-accent" aria-hidden="true" />;
        }
        if (currentSortDirection === 'desc') {
            return <ChevronDown className="h-4 w-4 text-accent" aria-hidden="true" />;
        }
        return <ChevronsUpDown className="h-4 w-4 text-slate-500" aria-hidden="true" />;
    };

    const getAriaSort = (col: Column<T>, key: string): React.AriaAttributes['aria-sort'] => {
        if (!col.sortable) return undefined;
        if (currentSortKey !== key) return 'none';
        if (currentSortDirection === 'asc') return 'ascending';
        if (currentSortDirection === 'desc') return 'descending';
        return 'none';
    };

    const renderHeader = () => (
        <thead>
            <tr className="border-b border-white/10">
                {columns.map((col) => {
                    const key = String(col.key);
                    return (
                        <th
                            key={key}
                            scope="col"
                            aria-sort={getAriaSort(col, key)}
                            className={cn(
                                'px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-400',
                                col.headerClassName
                            )}
                        >
                            {col.sortable ? (
                                <button
                                    type="button"
                                    onClick={() => handleSort(key)}
                                    className="group inline-flex items-center gap-2 uppercase tracking-wider transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                                >
                                    {col.label}
                                    {getSortIcon(key)}
                                </button>
                            ) : (
                                <span className="inline-flex items-center gap-2">{col.label}</span>
                            )}
                        </th>
                    );
                })}
                {rowHref ? (
                    <th scope="col" className="px-6 py-4 w-[40px]">
                        <span className="sr-only">{t('tables.row_actions')}</span>
                    </th>
                ) : null}
            </tr>
        </thead>
    );

    // FR-P3-3 — a failed fetch with no last-good data replaces the table entirely
    // (never renders as "empty"). Consumes #70's resolved contract.
    if (errorContract.showErrorBlock) {
        return <TableErrorState variant="block" onRetry={onRetry} message={errorMessage} className={className} />;
    }

    // FR-P3-2 — column-aware skeleton while the first load is in flight, so the
    // list never flashes a false "no data" / zero state (C3).
    if (isLoading && !hasData) {
        const skeletonColumnCount = columns.length + (rowHref ? 1 : 0);
        return (
            <div
                className={cn('glass-card !p-0 overflow-hidden', className)}
                aria-busy="true"
                data-testid="sortable-table-skeleton"
            >
                <table className="w-full">
                    {renderHeader()}
                    <tbody className="divide-y divide-white/5">
                        {Array.from({ length: skeletonRowCount }, (_, rowIndex) => (
                            <tr key={`sortable-skeleton-${rowIndex}`} className="animate-pulse" aria-hidden="true">
                                {Array.from({ length: skeletonColumnCount }, (_, colIndex) => (
                                    <td key={colIndex} className="px-6 py-4" aria-hidden="true">
                                        <div className="h-4 w-full max-w-[120px] rounded bg-white/5" />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    if (!hasData) {
        return (
            <div className="glass-card text-center py-12">
                <p className="text-slate-400">{resolvedEmptyMessage}</p>
            </div>
        );
    }

    const table = (
        <div className={cn('glass-card !p-0 overflow-hidden', className)}>
            <table className="w-full">
                {renderHeader()}
                <tbody className="divide-y divide-white/5">
                    {sortedData.map((item, index) => (
                        <tr
                            key={keyExtractor(item)}
                            className={cn(
                                'hover:bg-white/5 transition-colors',
                                onRowClick && 'cursor-pointer'
                            )}
                            onClick={onRowClick ? () => onRowClick(item) : undefined}
                        >
                            {columns.map((col) => (
                                <td
                                    key={String(col.key)}
                                    className={cn('px-6 py-4', col.className)}
                                >
                                    {col.render
                                        ? col.render(item, index)
                                        : String(getItemValue(item, String(col.key)) ?? '')}
                                </td>
                            ))}
                            {rowHref ? (
                                <td className="px-6 py-4 w-[40px] text-right">
                                    <Link
                                        to={rowHref(item)}
                                        onClick={(event) => event.stopPropagation()}
                                        aria-label={
                                            rowLabel
                                                ? t('tables.view_entity', { entity: rowLabel(item) })
                                                : t('tables.view_row')
                                        }
                                        className="inline-flex items-center justify-center rounded text-slate-500 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                    >
                                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                    </Link>
                                </td>
                            ) : null}
                        </tr>
                    ))}
                </tbody>
            </table>
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
