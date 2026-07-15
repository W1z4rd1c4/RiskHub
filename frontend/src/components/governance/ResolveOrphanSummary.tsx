import { Calendar, ClipboardList, ShieldAlert, User, Workflow } from 'lucide-react';

import { formatRelativeDateValue } from '@/i18n/formatters';
import { useTranslation } from '@/i18n/hooks';
import type { OrphanedItem } from '@/types/orphanedItem';

interface ResolveOrphanSummaryProps {
    language: string;
    orphan: OrphanedItem;
}

export function ResolveOrphanSummary({ language, orphan }: ResolveOrphanSummaryProps) {
    const { t } = useTranslation('admin');
    const Icon = orphan.item_type === 'risk'
        ? ShieldAlert
        : orphan.item_type === 'process'
            ? Workflow
            : ClipboardList;
    const typeColor = orphan.item_type === 'risk' ? 'text-rose-400' : 'text-accent';
    const typeBg = orphan.item_type === 'risk' ? 'bg-rose-500/10' : 'bg-accent/10';

    return (
        <div className="p-5 rounded-2xl bg-white/5 border border-white/5 flex items-start gap-5">
            <div className={`p-3 rounded-xl ${typeBg} border border-white/5 shrink-0`}>
                <Icon className={`h-6 w-6 ${typeColor}`} />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 mb-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${typeBg} ${typeColor}`}>
                        {t(`governance.type_${orphan.item_type}`)}
                    </span>
                </div>
                <h4 className="text-lg font-bold text-white mb-3 truncate">
                    {orphan.item_name}
                </h4>
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-slate-500" />
                        <span className="text-xs text-slate-400 font-medium">{orphan.previous_owner_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-slate-500" />
                        <span className="text-xs text-slate-400 font-medium">
                            {formatRelativeDateValue(orphan.orphaned_at, language)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
