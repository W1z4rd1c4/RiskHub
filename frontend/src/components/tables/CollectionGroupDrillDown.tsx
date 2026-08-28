import { ArrowLeft, ChevronRight } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import type { CollectionGroup } from '@/types/collection';

import { Pagination } from './Pagination';
import { buildRegisterGroupCards } from './registerGroupPresentation';

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
    const groupCards = buildRegisterGroupCards(groups, {
        fallbackLabel: t('empty.unknown_group', { defaultValue: 'Unknown group' }),
        groupLabel,
        hideActive,
        hideHighlighted,
    });
    const selectedGroup = groupCards.find((group) => group.value === selectedGroupValue);

    if (selectedGroupValue) {
        const label = selectedGroup?.label || selectedGroupLabel || t('empty.unknown_group', { defaultValue: 'Unknown group' });

        return (
            <div className={cn('space-y-4', className)}>
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={onBack}
                        className="flex items-center gap-2 px-4 py-2 glass rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        {t('actions.back')}
                    </button>
                    <div className="flex items-center gap-3">
                        <h3 className="text-xl font-bold text-foreground">{label}</h3>
                        <span className="px-2 py-1 rounded-full bg-accent/20 text-accent-text text-xs font-bold">
                            {t('tables.items_count', { count: totalCount })}
                        </span>
                    </div>
                </div>

                {items.length > 0 ? (
                    renderTable(items)
                ) : (
                    <div className="glass-card text-center py-12">
                        <p className="text-muted-foreground">{emptyMessage ?? t('empty.no_data_available')}</p>
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
                <p className="text-muted-foreground">{emptyMessage ?? t('empty.no_data_available')}</p>
            </div>
        );
    }

    return (
        <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4', className)}>
            {groupCards.map((card) => {
                return (
                    <button
                        key={card.value}
                        type="button"
                        data-testid="register-group-card"
                        data-group-value={card.value}
                        onClick={() => onSelectGroup(card.value, card.label)}
                        className="glass-card interactive-card group text-left"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-foreground group-hover:text-accent-text transition-colors">
                                {card.label}
                            </h3>
                            <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-accent-text group-hover:translate-x-1 transition-[color,transform]" />
                        </div>

                        {renderGroupBody && <div className="mb-4">{renderGroupBody(card.group)}</div>}

                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-6">
                                <div>
                                    <p className="text-3xl font-black text-foreground">{card.count}</p>
                                    <p className="text-xs text-slate-500 uppercase tracking-wider">{t('tables.items')}</p>
                                </div>
                                {card.showActive && (
                                    <div>
                                        <p className="text-xl font-bold text-emerald-400">{card.activeCount}</p>
                                        <p className="text-xs text-slate-500 uppercase tracking-wider">{t('tables.active')}</p>
                                    </div>
                                )}
                                {card.showHighlighted && (
                                    <div>
                                        <p className="text-xl font-bold text-rose-400">{card.highlightedCount}</p>
                                        <p className="text-xs text-slate-500 uppercase tracking-wider">
                                            {t('tables.high_risk')}
                                        </p>
                                    </div>
                                )}
                            </div>
                            {renderGroupExtra && <div className="flex-shrink-0">{renderGroupExtra(card.group)}</div>}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
