import {
    Boxes,
    Building2,
    CircleGauge,
    ClipboardCheck,
    PackageSearch,
    ShieldAlert,
    Target,
    Users,
} from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import type { DepartmentDetail } from '@/services/departmentApi';
import type { TabView } from '@/hooks/useDepartmentDetail';
import type { RegisterFilters } from '@/pages/shared/registerListQuery';

interface DepartmentStatsGridProps {
    department: DepartmentDetail;
    onSelectTab: (tab: TabView, filters?: RegisterFilters) => void;
}

export function DepartmentStatsGrid({ department, onSelectTab }: DepartmentStatsGridProps) {
    const { t } = useTranslation('common');
    const cards: Array<{
        key: Exclude<TabView, 'overview' | 'activity'>;
        count: number | null | undefined;
        secondary?: number | null;
        secondaryKey?: string;
        filters?: RegisterFilters;
        icon: typeof ShieldAlert;
    }> = [
        { key: 'risks', count: department.risk_count, secondary: department.high_risk_count, secondaryKey: 'department_detail.health.high_risk', icon: ShieldAlert },
        { key: 'controls', count: department.control_count, secondary: department.control_stats?.inactive, secondaryKey: 'department_detail.health.inactive_controls', filters: { status: 'inactive' }, icon: ClipboardCheck },
        { key: 'kris', count: department.kri_count, secondary: department.kri_monitoring_counts?.breach, secondaryKey: 'department_detail.health.kri_breaches', filters: { monitoring_status: 'breach' }, icon: Target },
        { key: 'issues', count: department.issue_count, secondary: department.overdue_issue_count, secondaryKey: 'department_detail.health.overdue_issues', filters: { overdue: true }, icon: CircleGauge },
        { key: 'processes', count: department.process_count, secondary: department.process_accountability_gap_count, secondaryKey: 'department_detail.health.accountability_gaps', icon: Boxes },
        { key: 'assets', count: department.asset_count, secondary: department.asset_accountability_gap_count, secondaryKey: 'department_detail.health.accountability_gaps', icon: PackageSearch },
        { key: 'vendors', count: department.vendor_count, secondary: department.significant_vendor_count, secondaryKey: 'department_detail.health.significant_vendors', filters: { is_significant_vendor: true }, icon: Building2 },
        { key: 'users', count: department.user_count, icon: Users },
    ];

    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map(({ key, count, secondary, secondaryKey, filters, icon: Icon }) => (
                <button
                    key={key}
                    type="button"
                    data-testid={`department-overview-card-${key}`}
                    onClick={() => onSelectTab(key, filters)}
                    className="glass-card group cursor-pointer text-left transition-all hover:bg-white/5"
                >
                    <div className="mb-2 flex items-center gap-3">
                        <Icon className="h-5 w-5 text-accent transition-transform group-hover:scale-110" aria-hidden="true" />
                        <p className="text-xs uppercase tracking-wider text-slate-500">
                            {t(`department_detail.tabs.${key}`)}
                        </p>
                    </div>
                    <p className="text-3xl font-black text-white">
                        {count ?? t('fallbacks.not_available')}
                    </p>
                    {secondary != null && secondaryKey ? (
                        <p className="mt-1 text-xs text-slate-400">
                            {t(secondaryKey, { count: secondary })}
                        </p>
                    ) : null}
                </button>
            ))}
        </div>
    );
}
