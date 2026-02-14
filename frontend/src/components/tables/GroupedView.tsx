/**
 * GroupedView - Display data grouped by a field with collapsible sections.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/hooks';

interface GroupedViewProps<T> {
    data: T[];
    groupBy: keyof T;
    groupLabel?: (value: string) => string;
    renderItem: (item: T, index: number) => React.ReactNode;
    keyExtractor: (item: T) => string | number;
    className?: string;
    defaultExpanded?: boolean;
}

interface GroupData<T> {
    key: string;
    items: T[];
}

export function GroupedView<T extends Record<string, unknown>>({
    data,
    groupBy,
    groupLabel,
    renderItem,
    keyExtractor,
    className,
    defaultExpanded = true,
}: GroupedViewProps<T>) {
    const { t } = useTranslation('common');
    // Group the data
    const groups: GroupData<T>[] = data.reduce((acc, item) => {
        const key = String(item[groupBy] ?? 'Uncategorized');
        const existing = acc.find(g => g.key === key);
        if (existing) {
            existing.items.push(item);
        } else {
            acc.push({ key, items: [item] });
        }
        return acc;
    }, [] as GroupData<T>[]);

    // Sort groups alphabetically
    groups.sort((a, b) => a.key.localeCompare(b.key));

    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
        defaultExpanded ? new Set(groups.map(g => g.key)) : new Set()
    );

    const toggleGroup = (key: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    if (groups.length === 0) {
        return (
            <div className="glass-card text-center py-12">
                <p className="text-slate-400">{t('empty.no_data_available')}</p>
            </div>
        );
    }

    return (
        <div className={cn('space-y-4', className)}>
            {groups.map((group) => {
                const isExpanded = expandedGroups.has(group.key);
                const label = groupLabel ? groupLabel(group.key) : group.key;

                return (
                    <div key={group.key} className="glass-card !p-0 overflow-hidden">
                        <button
                            onClick={() => toggleGroup(group.key)}
                            className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                {isExpanded ? (
                                    <ChevronDown className="h-5 w-5 text-accent" />
                                ) : (
                                    <ChevronRight className="h-5 w-5 text-slate-400" />
                                )}
                                <span className="font-semibold text-white">{label}</span>
                            </div>
                            <span className="px-2 py-1 rounded-full bg-accent/20 text-accent text-xs font-bold">
                                {group.items.length}
                            </span>
                        </button>

                        {isExpanded && (
                            <div className="border-t border-white/10 divide-y divide-white/5">
                                {group.items.map((item, index) => (
                                    <div key={keyExtractor(item)}>
                                        {renderItem(item, index)}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
