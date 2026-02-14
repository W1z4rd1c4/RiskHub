/**
 * CategoryDrillDown - Shows category cards, click to drill into items.
 */
import { useState, useMemo } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/hooks';

interface CategoryStats {
    total: number;
    activeCount?: number;
    highRiskCount?: number;
}

interface CategoryDrillDownProps<T> {
    data: T[];
    groupBy: keyof T;
    groupLabel?: (value: string) => string;
    getStats?: (items: T[]) => CategoryStats;
    renderItem: (item: T, index: number) => React.ReactNode;
    renderTable?: (items: T[]) => React.ReactNode;
    renderGroupExtra?: (items: T[]) => React.ReactNode;
    keyExtractor: (item: T) => string | number;
    className?: string;
    categoryIcon?: React.ReactNode;
    hideTotal?: boolean;
    hideHighRisk?: boolean;
    renderBody?: (items: T[]) => React.ReactNode;
}

interface GroupData<T> {
    key: string;
    items: T[];
    stats: CategoryStats;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CategoryDrillDown<T extends Record<string, any>>({
    data,
    groupBy,
    groupLabel,
    getStats,
    renderItem,
    renderTable,
    renderGroupExtra,
    keyExtractor,
    className,
    hideTotal,
    hideHighRisk,
    renderBody,
}: CategoryDrillDownProps<T>) {
    const { t } = useTranslation('common');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    // Group the data with stats
    const groups: GroupData<T>[] = useMemo(() => {
        const grouped = data.reduce((acc, item) => {
            const key = String(item[groupBy] ?? 'Uncategorized');
            const existing = acc.find(g => g.key === key);
            if (existing) {
                existing.items.push(item);
            } else {
                acc.push({ key, items: [item], stats: { total: 0 } });
            }
            return acc;
        }, [] as GroupData<T>[]);

        // Calculate stats for each group
        grouped.forEach(group => {
            group.stats = getStats ? getStats(group.items) : { total: group.items.length };
        });

        // Sort alphabetically
        grouped.sort((a, b) => a.key.localeCompare(b.key));
        return grouped;
    }, [data, groupBy, getStats]);

    const selectedGroup = groups.find(g => g.key === selectedCategory);

    // Drill-down view - show only selected category items
    if (selectedCategory && selectedGroup) {
        const label = groupLabel ? groupLabel(selectedGroup.key) : selectedGroup.key;

        return (
            <div className={cn('space-y-4', className)}>
                {/* Back button header */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setSelectedCategory(null)}
                        className="flex items-center gap-2 px-4 py-2 glass rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        {t('actions.back')}
                    </button>
                    <div className="flex items-center gap-3">
                        <h3 className="text-xl font-bold text-white">{label}</h3>
                        <span className="px-2 py-1 rounded-full bg-accent/20 text-accent text-xs font-bold">
                            {t('tables.items_count', { count: selectedGroup.stats.total })}
                        </span>
                    </div>
                </div>

                {/* Items table/list */}
                {renderTable ? (
                    renderTable(selectedGroup.items)
                ) : (
                    <div className="glass-card !p-0 overflow-hidden divide-y divide-white/5">
                        {selectedGroup.items.map((item, index) => (
                            <div key={keyExtractor(item)}>
                                {renderItem(item, index)}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // Category grid view
    if (groups.length === 0) {
        return (
            <div className="glass-card text-center py-12">
                <p className="text-slate-400">{t('empty.no_data_available')}</p>
            </div>
        );
    }

    return (
        <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4', className)}>
            {groups.map((group) => {
                const label = groupLabel ? groupLabel(group.key) : group.key;

                return (
                    <button
                        key={group.key}
                        onClick={() => setSelectedCategory(group.key)}
                        className="glass-card group text-left hover:border-accent/30 hover:shadow-lg hover:shadow-accent/5 transition-all duration-300"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-white group-hover:text-accent transition-colors">
                                {label}
                            </h3>
                            <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-accent group-hover:translate-x-1 transition-all" />
                        </div>

                        {renderBody && (
                            <div className="mb-4">
                                {renderBody(group.items)}
                            </div>
                        )}

                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-6">
                                {!hideTotal && (
                                    <div>
                                        <p className="text-3xl font-black text-white">{group.stats.total}</p>
                                        <p className="text-xs text-slate-500 uppercase tracking-wider">Items</p>
                                    </div>
                                )}
                                {group.stats.activeCount !== undefined && (
                                    <div>
                                        <p className={cn(hideTotal ? "text-3xl font-black" : "text-xl font-bold", "text-emerald-400")}>
                                            {group.stats.activeCount}
                                        </p>
                                        <p className="text-xs text-slate-500 uppercase tracking-wider">Active</p>
                                    </div>
                                )}
                                {!hideHighRisk && group.stats.highRiskCount !== undefined && group.stats.highRiskCount > 0 && (
                                    <div>
                                        <p className="text-xl font-bold text-rose-400">{group.stats.highRiskCount}</p>
                                        <p className="text-xs text-slate-500 uppercase tracking-wider">{t('tables.high_risk')}</p>
                                    </div>
                                )}
                            </div>

                            {renderGroupExtra && (
                                <div className="flex-shrink-0">
                                    {renderGroupExtra(group.items)}
                                </div>
                            )}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
