import type { ReactNode } from 'react';

import { TabList, TabPanel } from '@/components/ui/tabs';
import type { SafeTFunction } from '@/i18n/hooks';

import {
    APPROVAL_TAB_REGISTRY,
    type ApprovalWorkbenchTab,
} from './approvalWorkbenchQuery';

interface ApprovalsTabsProps {
    filter: ApprovalWorkbenchTab;
    onChange: (filter: ApprovalWorkbenchTab) => void;
    t: SafeTFunction;
    label: string;
    children: ReactNode;
}

const ID_PREFIX = 'workflow';

/** Approval workbench views (D8): page-level `pill` tabs; only the active panel renders its content. */
export function ApprovalsTabs({ filter, onChange, t, label, children }: ApprovalsTabsProps) {
    return (
        <>
            <TabList
                tabs={APPROVAL_TAB_REGISTRY.map((tab) => ({ id: tab.value, label: t(tab.labelKey) }))}
                activeTab={filter}
                onChange={onChange}
                idPrefix={ID_PREFIX}
                variant="pill"
                ariaLabel={label}
            />
            {APPROVAL_TAB_REGISTRY.map((tab) => (
                <TabPanel key={tab.value} tab={tab.value} activeTab={filter} idPrefix={ID_PREFIX}>
                    {filter === tab.value ? children : null}
                </TabPanel>
            ))}
        </>
    );
}
