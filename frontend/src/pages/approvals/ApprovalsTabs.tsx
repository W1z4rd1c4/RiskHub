import type { ReactNode } from 'react';

import { useContentTabs } from '@/hooks/useContentTabs';
import type { SafeTFunction } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

import { APPROVAL_TABS, type ApprovalsFilter } from './approvalsPresentation';

interface ApprovalsTabsProps {
    filter: ApprovalsFilter;
    onChange: (filter: ApprovalsFilter) => void;
    t: SafeTFunction;
    label: string;
    children: ReactNode;
}

const approvalTabValues = APPROVAL_TABS.map((tab) => tab.value);

export function ApprovalsTabs({ filter, onChange, t, label, children }: ApprovalsTabsProps) {
    const { getTabProps, getPanelProps } = useContentTabs({
        tabs: approvalTabValues,
        activeTab: filter,
        onChange,
        idPrefix: 'workflow',
    });

    return (
        <>
            <div
                role="tablist"
                aria-label={label}
                className="flex items-center gap-4 border-b border-white/5 pb-4"
            >
                {APPROVAL_TABS.map((tab, index) => (
                    <button
                        key={tab.value}
                        {...getTabProps(tab.value, index)}
                        className={cn(
                            'px-4 py-2 text-sm font-bold rounded-xl transition-colors',
                            filter === tab.value
                                ? 'bg-accent text-accent-foreground shadow-lg shadow-accent/20'
                                : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
                        )}
                    >
                        {t(tab.labelKey)}
                    </button>
                ))}
            </div>
            {APPROVAL_TABS.map((tab) => (
                <div key={tab.value} {...getPanelProps(tab.value)}>
                    {filter === tab.value ? children : null}
                </div>
            ))}
        </>
    );
}
