import { Users } from 'lucide-react';

interface DashboardViewTabsProps {
    activeView: 'overview' | 'committee';
    canViewCommittee: boolean;
    onChange: (view: 'overview' | 'committee') => void;
    overviewLabel: string;
    committeeLabel: string;
}

export function DashboardViewTabs({
    activeView,
    canViewCommittee,
    onChange,
    overviewLabel,
    committeeLabel,
}: DashboardViewTabsProps) {
    if (!canViewCommittee) {
        return null;
    }

    return (
        <div className="flex items-center gap-2">
            <button
                onClick={() => onChange('overview')}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${
                    activeView === 'overview'
                        ? 'bg-accent text-white'
                        : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                }`}
            >
                {overviewLabel}
            </button>
            <button
                onClick={() => onChange('committee')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${
                    activeView === 'committee'
                        ? 'bg-accent text-white'
                        : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                }`}
            >
                <Users className="h-4 w-4" />
                {committeeLabel}
            </button>
        </div>
    );
}
