import type { SafeTFunction } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

import { APPROVAL_TABS, type ApprovalsFilter } from './approvalsPresentation';

interface ApprovalsTabsProps {
    filter: ApprovalsFilter;
    onChange: (filter: ApprovalsFilter) => void;
    t: SafeTFunction;
}

export function ApprovalsTabs({ filter, onChange, t }: ApprovalsTabsProps) {
    return (
        <div className="flex items-center gap-4 border-b border-white/5 pb-4">
            {APPROVAL_TABS.map((tab) => (
                <button
                    key={tab.value}
                    onClick={() => onChange(tab.value)}
                    className={cn(
                        'px-4 py-2 text-sm font-bold rounded-xl transition-all',
                        filter === tab.value
                            ? 'bg-accent text-white shadow-lg shadow-accent/20'
                            : 'text-slate-400 hover:text-white hover:bg-white/5',
                    )}
                >
                    {t(tab.labelKey)}
                </button>
            ))}
        </div>
    );
}
