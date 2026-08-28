import { Landmark, Users } from 'lucide-react';

// The URL-addressable dashboard views (issue #64). `overview` is the canonical
// default and carries no `?view=` query param; the two committee views are
// deep-linkable at `/?view=risk-committee` and `/?view=ict-committee`.
export type DashboardView = 'overview' | 'risk-committee' | 'ict-committee';

interface DashboardViewTabsProps {
    activeView: DashboardView;
    canViewRiskCommittee: boolean;
    canViewIctCommittee: boolean;
    onChange: (view: DashboardView) => void;
    overviewLabel: string;
    riskCommitteeLabel: string;
    ictCommitteeLabel: string;
}

const TAB_BASE =
    'flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all';

function tabClassName(isActive: boolean) {
    return `${TAB_BASE} ${
        isActive
            ? 'bg-accent text-accent-foreground'
            : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
    }`;
}

export function DashboardViewTabs({
    activeView,
    canViewRiskCommittee,
    canViewIctCommittee,
    onChange,
    overviewLabel,
    riskCommitteeLabel,
    ictCommitteeLabel,
}: DashboardViewTabsProps) {
    // No committee is reachable → the dashboard is single-view, so no tab bar.
    if (!canViewRiskCommittee && !canViewIctCommittee) {
        return null;
    }

    return (
        <div className="flex items-center gap-2">
            <button
                type="button"
                onClick={() => onChange('overview')}
                aria-current={activeView === 'overview' ? 'page' : undefined}
                className={tabClassName(activeView === 'overview')}
            >
                {overviewLabel}
            </button>
            {canViewRiskCommittee && (
                <button
                    type="button"
                    onClick={() => onChange('risk-committee')}
                    aria-current={activeView === 'risk-committee' ? 'page' : undefined}
                    className={tabClassName(activeView === 'risk-committee')}
                >
                    <Users className="h-4 w-4" />
                    {riskCommitteeLabel}
                </button>
            )}
            {canViewIctCommittee && (
                <button
                    type="button"
                    onClick={() => onChange('ict-committee')}
                    aria-current={activeView === 'ict-committee' ? 'page' : undefined}
                    className={tabClassName(activeView === 'ict-committee')}
                >
                    <Landmark className="h-4 w-4" />
                    {ictCommitteeLabel}
                </button>
            )}
        </div>
    );
}
