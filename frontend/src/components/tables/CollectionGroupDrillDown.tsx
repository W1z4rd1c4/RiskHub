import { ArrowLeft, ChevronRight } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import type { CollectionGroup } from '@/types/collection';

import { Pagination } from './Pagination';

interface CollectionGroupDrillDownProps<T> {
    className?: string;
    currentPage: number;
    emptyMessage?: string;
    groupLabel?: (group: CollectionGroup) => string;
    groups: CollectionGroup[];
    hideActive?: boolean;
    hideHighlighted?: boolean;
    items: T[];
    itemsPerPage: number;
    onBack: () => void;
    onPageChange: (page: number) => void;
    onSelectGroup: (value: string, label: string) => void;
    renderGroupBody?: (group: CollectionGroup) => React.ReactNode;
    renderGroupExtra?: (group: CollectionGroup) => React.ReactNode;
    renderTable: (items: T[]) => React.ReactNode;
    selectedGroupLabel: string | null;
    selectedGroupValue: string | null;
    totalCount: number;
    totalPages: number;
}

export function CollectionGroupDrillDown<T>({
    className,
    currentPage,
    emptyMessage,
    groupLabel,
    groups,
    hideActive = false,
    hideHighlighted = false,
    items,
    itemsPerPage,
    onBack,
    onPageChange,
    onSelectGroup,
    renderGroupBody,
    renderGroupExtra,
    renderTable,
    selectedGroupLabel,
    selectedGroupValue,
    totalCount,
    totalPages,
}: CollectionGroupDrillDownProps<T>) {
    const { t } = useTranslation('common');
    const selectedGroup = groups.find((group) => group.value === selectedGroupValue);

    if (selectedGroupValue) {
        const label = selectedGroupLabel || selectedGroup?.label || selectedGroupValue;

        return (
            <div className={cn('space-y-4', className)}>
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={onBack}
                        className="flex items-center gap-2 px-4 py-2 glass rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        {t('actions.back')}
                    </button>
                    <div className="flex items-center gap-3">
                        <h3 className="text-xl font-bold text-white">{label}</h3>
                        <span className="px-2 py-1 rounded-full bg-accent/20 text-accent text-xs font-bold">
                            {t('tables.items_count', { count: totalCount })}
                        </span>
                    </div>
                </div>

                {items.length > 0 ? (
                    renderTable(items)
                ) : (
                    <div className="glass-card text-center py-12">
                        <p className="text-slate-400">{emptyMessage ?? t('empty.no_data_available')}</p>
                    </div>
                )}

                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalCount}
                    itemsPerPage={itemsPerPage}
                    onPageChange={onPageChange}
                />
            </div>
        );
    }

    if (groups.length === 0) {
        return (
            <div className="glass-card text-center py-12">
                <p className="text-slate-400">{emptyMessage ?? t('empty.no_data_available')}</p>
            </div>
        );
    }

    return (
        <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4', className)}>
            {groups.map((group) => {
                const label = groupLabel ? groupLabel(group) : group.label;
                return (
                    <button
                        key={group.value}
                        type="button"
                        onClick={() => onSelectGroup(group.value, label)}
                        className="glass-card group text-left hover:border-accent/30 hover:shadow-lg hover:shadow-accent/5 transition-all duration-300"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-white group-hover:text-accent transition-colors">
                                {label}
                            </h3>
                            <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-accent group-hover:translate-x-1 transition-all" />
                        </div>

                        {renderGroupBody && <div className="mb-4">{renderGroupBody(group)}</div>}

                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-6">
                                <div>
                                    <p className="text-3xl font-black text-white">{group.count}</p>
                                    <p className="text-xs text-slate-500 uppercase tracking-wider">Items</p>
                                </div>
                                {!hideActive && group.active_count !== undefined && group.active_count !== null && (
                                    <div>
                                        <p className="text-xl font-bold text-emerald-400">{group.active_count}</p>
                                        <p className="text-xs text-slate-500 uppercase tracking-wider">Active</p>
                                    </div>
                                )}
                                {!hideHighlighted &&
                                    group.highlighted_count !== undefined &&
                                    group.highlighted_count !== null &&
                                    group.highlighted_count > 0 && (
                                        <div>
                                            <p className="text-xl font-bold text-rose-400">{group.highlighted_count}</p>
                                            <p className="text-xs text-slate-500 uppercase tracking-wider">
                                                {t('tables.high_risk')}
                                            </p>
                                        </div>
                                    )}
                            </div>
                            {renderGroupExtra && <div className="flex-shrink-0">{renderGroupExtra(group)}</div>}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
