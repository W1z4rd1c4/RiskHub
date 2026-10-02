import { Calendar, User } from 'lucide-react';

import { ENTITY_ICON_BY_TYPE, ENTITY_ICON_FALLBACK } from '@/constants/entityIcons';
import { formatRelativeDateValue } from '@/i18n/formatters';
import { useTranslation } from '@/i18n/hooks';
import type { OrphanedItem } from '@/types/orphanedItem';

interface ResolveOrphanSummaryProps {
    language: string;
    orphan: OrphanedItem;
}

export function ResolveOrphanSummary({ language, orphan }: ResolveOrphanSummaryProps) {
    const { t } = useTranslation('admin');
    const Icon = ENTITY_ICON_BY_TYPE[orphan.item_type] ?? ENTITY_ICON_FALLBACK;
    const typeColor = orphan.item_type === 'risk' ? 'text-destructive' : 'text-accent-text';
    const typeBg = orphan.item_type === 'risk' ? 'bg-destructive/10' : 'bg-accent/10';

    return (
        <div className="p-5 rounded-2xl bg-tint/5 border border-border flex items-start gap-5">
            <div className={`p-3 rounded-xl ${typeBg} border border-border shrink-0`}>
                <Icon aria-hidden="true" className={`h-6 w-6 ${typeColor}`} />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 mb-1">
                    <span className={`text-eyebrow px-2 py-0.5 rounded-md ${typeBg} ${typeColor}`}>
                        {t(`governance.type_${orphan.item_type}`)}
                    </span>
                </div>
                <h3 className="text-lg font-bold text-foreground mb-3 truncate">
                    {orphan.item_name}
                </h3>
                {(orphan.item_type === 'asset' || orphan.item_type === 'vendor') && orphan.responsibility_role ? (
                    <p className="mb-3 text-xs font-bold text-warning-text">{t(`governance.responsibility_role.${orphan.responsibility_role}`)}</p>
                ) : null}
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <User aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground font-medium">{orphan.previous_owner_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Calendar aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground font-medium">
                            {formatRelativeDateValue(orphan.orphaned_at, language)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
