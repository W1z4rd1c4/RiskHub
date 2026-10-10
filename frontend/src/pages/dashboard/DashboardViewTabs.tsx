import { LayoutDashboard, Landmark, Users } from 'lucide-react';

import { TabList, type TabItem } from '@/components/ui/tabs';

// The URL-addressable dashboard views (issue #64). `overview` is the canonical
// default and carries no `?view=` query param; the two committee views are
// deep-linkable at `/?view=risk-committee` and `/?view=ict-committee`.
export type DashboardView = 'overview' | 'risk-committee' | 'ict-committee';

/** Tab / panel id prefix shared with the view panel in `DashboardPage`. */
export const DASHBOARD_VIEW_TABS_ID_PREFIX = 'dashboard-view';

interface DashboardViewTabsProps {
    activeView: DashboardView;
    canViewRiskCommittee: boolean;
    canViewIctCommittee: boolean;
    onChange: (view: DashboardView) => void;
    /** Accessible name of the tablist. */
    label: string;
    overviewLabel: string;
    riskCommitteeLabel: string;
    ictCommitteeLabel: string;
}

/**
 * Page-level dashboard views on the shared `pill` tabs (D8, DS-12): arrow keys,
 * Home / End and a roving tab stop come from `TabList`. The retired uppercase
 * pill style is gone.
 */
export function DashboardViewTabs({
    activeView,
    canViewRiskCommittee,
    canViewIctCommittee,
    onChange,
    label,
    overviewLabel,
    riskCommitteeLabel,
    ictCommitteeLabel,
}: DashboardViewTabsProps) {
    // No committee is reachable → the dashboard is single-view, so no tab bar.
    if (!canViewRiskCommittee && !canViewIctCommittee) {
        return null;
    }

    const tabs: Array<TabItem<DashboardView>> = [
        { id: 'overview', label: overviewLabel, icon: LayoutDashboard },
    ];
    if (canViewRiskCommittee) tabs.push({ id: 'risk-committee', label: riskCommitteeLabel, icon: Users });
    if (canViewIctCommittee) tabs.push({ id: 'ict-committee', label: ictCommitteeLabel, icon: Landmark });

    return (
        <TabList
            tabs={tabs}
            activeTab={activeView}
            onChange={onChange}
            idPrefix={DASHBOARD_VIEW_TABS_ID_PREFIX}
            variant="pill"
            ariaLabel={label}
        />
    );
}
