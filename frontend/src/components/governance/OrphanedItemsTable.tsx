import { useState, useEffect } from 'react';
import { AlertTriangle, Building2, CheckCircle2, Eye, UserCheck } from 'lucide-react';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { ENTITY_ICON_BY_TYPE } from '@/constants/entityIcons';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { cn } from '@/lib/utils';
import type { OrphanedItem } from '@/types/orphanedItem';
import { RowActionButton } from '@/components/tables/RowActionButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/state';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { isUncategorisedDepartment } from './resolveOrphanHelpers';

interface OrphanedItemsTableProps {
    /**
     * Rows to list. The page's stat cards are the one type filter (SM-11), so the
     * table renders exactly what it is given and carries no filter of its own.
     */
    items: OrphanedItem[];
    onResolve: (item: OrphanedItem) => void;
    onView?: (item: OrphanedItem) => void;
}

export function OrphanedItemsTable({ items, onResolve, onView }: OrphanedItemsTableProps) {
    const { t } = useTranslation('admin');
    const format = useFormat();
    const [now, setNow] = useState(() => Date.now());

    // Type labels with translations
    const typeLabels: Record<string, string> = {
        risk: t('governance.type_risk'),
        control: t('governance.type_control'),
        kri: t('governance.type_kri'),
        threat: t('governance.type_threat'),
        process: t('governance.type_process'),
        asset: t('governance.type_asset'),
        vendor: t('governance.type_vendor'),
    };

    useEffect(() => {
        setNow(Date.now());
    }, [items]);

    const isOld = (dateStr: string) => {
        const date = new Date(dateStr);
        const daysDiff = (now - date.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff > 7;
    };

    if (items.length === 0) {
        return (
            <EmptyState
                icon={CheckCircle2}
                title={t('governance.all_clear')}
                description={t('governance.no_orphans')}
                className="glass-card py-16"
            />
        );
    }

    return (
        <Card data-testid="governance-orphaned-table" padding="none" className="overflow-hidden">
            <div className="p-4 border-b border-border">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-warning-text" aria-hidden="true" />
                    {t('governance.orphaned_items')} ({items.length})
                </h3>
            </div>

            <Table density="compact" regionLabel={t('governance.orphaned_items')}>
                <THead>
                    <TR>
                        <TH>{t('governance.col_type')}</TH>
                        <TH>{t('governance.col_name')}</TH>
                        <TH>{t('governance.col_description')}</TH>
                        <TH>{t('governance.col_department')}</TH>
                        <TH>{t('governance.col_previous_owner')}</TH>
                        <TH>{t('governance.col_orphaned')}</TH>
                        <TH align="right">{t('governance.col_actions')}</TH>
                    </TR>
                </THead>
                <TBody>
                    {items.map((item) => {
                        const Icon = ENTITY_ICON_BY_TYPE[item.item_type] ?? AlertTriangle;
                        const old = isOld(item.orphaned_at);
                        const canResolve = resolveCapabilityFlag(item.capabilities, 'can_resolve');
                        const canView = resolveCapabilityFlag(item.capabilities, 'can_view_detail');

                        return (
                            <TR key={item.id} className={cn('group', old && 'bg-warning/5')}>
                                <TD>
                                    <div className="flex items-center gap-2">
                                        <div className={cn(
                                            'p-1.5 rounded-lg transition-transform group-hover:scale-110',
                                            item.item_type === 'risk' ? 'bg-destructive/10 text-destructive' : 'bg-accent/10 text-accent-text',
                                        )}>
                                            <Icon className="h-4 w-4" aria-hidden="true" />
                                        </div>
                                        <span className="text-sm font-medium text-foreground">
                                            {typeLabels[item.item_type] || item.item_type}
                                        </span>
                                    </div>
                                </TD>
                                <TD>
                                    <div>
                                        <p className="text-sm font-bold text-foreground group-hover:text-accent-text transition-colors">{item.item_name}</p>
                                        {(item.item_type === 'asset' || item.item_type === 'vendor') && item.responsibility_role ? <p className="text-xs font-bold uppercase text-muted-foreground">{t(`governance.responsibility_role.${item.responsibility_role}`)}</p> : null}
                                    </div>
                                </TD>
                                <TD>
                                    <p className="text-xs text-muted-foreground line-clamp-2 max-w-md">{item.item_description || '-'}</p>
                                </TD>
                                <TD>
                                    {isUncategorisedDepartment(item.department_name) ? (
                                        <Badge tone="warning" icon={Building2} className="uppercase tracking-wider">
                                            {t('governance.uncategorised')}
                                        </Badge>
                                    ) : (
                                        <span className="text-sm text-muted-foreground font-medium">
                                            {item.department_name || t('common:fallbacks.not_available')}
                                        </span>
                                    )}
                                </TD>
                                <TD>
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-tint/5 flex items-center justify-center border border-border">
                                            <UserCheck className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-foreground">{item.previous_owner_name}</p>
                                            <p className="text-xs text-muted-foreground">{item.previous_owner_email}</p>
                                        </div>
                                    </div>
                                </TD>
                                <TD>
                                    <span className={cn('text-xs font-bold uppercase tracking-wide', old ? 'text-foreground' : 'text-muted-foreground')}>
                                        {format.relative(item.orphaned_at)}
                                    </span>
                                </TD>
                                <TD align="right">
                                    <div className="flex items-center justify-end gap-2">
                                        {canView && onView && (
                                            <RowActionButton
                                                icon={Eye}
                                                label={`${t('common:actions.view')} ${item.item_name}`}
                                                onClick={() => onView(item)}
                                            />
                                        )}
                                        {canResolve && (
                                            <Button variant="outline" size="compact" onClick={() => onResolve(item)}>
                                                <UserCheck aria-hidden="true" />
                                                {t('governance.resolve')}
                                            </Button>
                                        )}
                                    </div>
                                </TD>
                            </TR>
                        );
                    })}
                </TBody>
            </Table>
        </Card>
    );
}
