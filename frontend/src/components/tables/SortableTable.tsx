/**
 * SortableTable - Generic table with sortable column headers.
 */
import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function SortableTable<T extends Record<string, any>>({
    data,
    columns,
    keyExtractor,
    onRowClick,
    className,
    emptyMessage = 'No data available',
}: SortableTableProps<T>) {
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>(null);

    const handleSort = (key: string) => {
        if (sortKey === key) {
            // Toggle direction: asc -> desc -> null
            if (sortDirection === 'asc') {
                setSortDirection('desc');
            } else if (sortDirection === 'desc') {
                setSortDirection(null);
                setSortKey(null);
            } else {
                setSortDirection('asc');
            }
        } else {
            setSortKey(key);
            setSortDirection('asc');
        }
    };

    const sortedData = useMemo(() => {
        if (!sortKey || !sortDirection) return data;

        return [...data].sort((a, b) => {
            const aVal = a[sortKey];
            const bVal = b[sortKey];

            if (aVal == null) return 1;
            if (bVal == null) return -1;

            let comparison = 0;
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                comparison = aVal.localeCompare(bVal);
            } else if (typeof aVal === 'number' && typeof bVal === 'number') {
                comparison = aVal - bVal;
            } else {
                comparison = String(aVal).localeCompare(String(bVal));
            }

            return sortDirection === 'desc' ? -comparison : comparison;
        });
    }, [data, sortKey, sortDirection]);

    const getSortIcon = (key: string) => {
        if (sortKey !== key) {
            return <ChevronsUpDown className="h-4 w-4 text-slate-500" />;
        }
        if (sortDirection === 'asc') {
            return <ChevronUp className="h-4 w-4 text-accent" />;
        }
        if (sortDirection === 'desc') {
            return <ChevronDown className="h-4 w-4 text-accent" />;
        }
        return <ChevronsUpDown className="h-4 w-4 text-slate-500" />;
    };

    if (data.length === 0) {
        return (
            <div className="glass-card text-center py-12">
                <p className="text-slate-400">{emptyMessage}</p>
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
                                        : String(item[col.key as keyof T] ?? '')}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
