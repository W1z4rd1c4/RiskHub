/**
 * SortableTable - Generic table with sortable column headers.
 */
import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/hooks';

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

    const getSortIcon = (key: string) => {
        if (currentSortKey !== key) {
            return <ChevronsUpDown className="h-4 w-4 text-slate-500" />;
        }
        if (currentSortDirection === 'asc') {
            return <ChevronUp className="h-4 w-4 text-accent" />;
        }
        if (currentSortDirection === 'desc') {
            return <ChevronDown className="h-4 w-4 text-accent" />;
        }
        return <ChevronsUpDown className="h-4 w-4 text-slate-500" />;
    };

    if (data.length === 0) {
        return (
            <div className="glass-card text-center py-12">
                <p className="text-slate-400">{resolvedEmptyMessage}</p>
            </div>
        );
    }

    return (
        <div className={cn('glass-card !p-0 overflow-hidden', className)}>
            <table className="w-full">
                <thead>
                    <tr className="border-b border-white/10">
                        {columns.map((col) => (
                            <th
                                key={String(col.key)}
                                className={cn(
                                    'px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-400',
                                    col.sortable && 'cursor-pointer hover:text-white transition-colors select-none',
                                    col.headerClassName
                                )}
                                onClick={col.sortable ? () => handleSort(String(col.key)) : undefined}
                            >
                                <div className="flex items-center gap-2">
                                    {col.label}
                                    {col.sortable && getSortIcon(String(col.key))}
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
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
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
