import { Users, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ENTITY_ICONS } from '@/constants/entityIcons';
import { useTranslation } from '@/i18n/hooks';
import type { DepartmentDetail } from '@/services/departmentApi';
import type { TabView } from '@/hooks/useDepartmentDetail';
import type { RegisterFilters } from '@/pages/shared/registerListQuery';

interface DepartmentStatsGridProps {
    department: DepartmentDetail;
    onSelectTab: (tab: TabView, filters?: RegisterFilters) => void;
}

interface HealthAction {
    key: string;
    count: number | null | undefined;
    labelKey: string;
    filters?: RegisterFilters;
}

export function DepartmentStatsGrid({ department, onSelectTab }: DepartmentStatsGridProps) {
    const { t } = useTranslation('common');
    const cards: Array<{
        key: Exclude<TabView, 'overview' | 'activity'>;
        count: number | null | undefined;
        health: HealthAction[];
        icon: LucideIcon;
    }> = [
        {
            key: 'risks',
            count: department.risk_count,
            health: [
                { key: 'high', count: department.risk_distribution?.high, labelKey: 'department_detail.health.high_risks', filters: { net_band: 'high' } },
                { key: 'critical', count: department.risk_distribution?.critical, labelKey: 'department_detail.health.critical_risks', filters: { net_band: 'critical' } },
            ],
            icon: ENTITY_ICONS.risk,
        },
        {
            key: 'controls',
            count: department.control_count,
            health: [{ key: 'attention', count: department.attention_control_count, labelKey: 'department_detail.health.attention_controls', filters: { monitoring_status: 'needs_review' } }],
            icon: ENTITY_ICONS.control,
        },
        {
            key: 'kris',
            count: department.kri_count,
            health: [
                { key: 'breach', count: department.kri_monitoring_counts?.breach, labelKey: 'department_detail.health.kri_breaches', filters: { monitoring_status: 'breach' } },
                { key: 'overdue', count: department.kri_monitoring_counts?.not_submitted, labelKey: 'department_detail.health.kri_overdue', filters: { monitoring_status: 'not_submitted' } },
            ],
            icon: ENTITY_ICONS.kri,
        },
        {
            key: 'issues',
            count: department.issue_count,
            health: [
                { key: 'open', count: department.open_issue_count, labelKey: 'department_detail.health.open_issues', filters: { status: 'open' } },
                { key: 'overdue', count: department.overdue_issue_count, labelKey: 'department_detail.health.overdue_issues', filters: { overdue: true } },
            ],
            icon: ENTITY_ICONS.issue,
        },
        {
            key: 'processes',
            count: department.process_count,
            health: [
                { key: 'critical', count: department.critical_process_count, labelKey: 'department_detail.health.critical_processes', filters: { criticality: ['critical'] } },
                { key: 'cif', count: department.cif_process_count, labelKey: 'department_detail.health.cif_processes', filters: { cif: true } },
            ],
            icon: ENTITY_ICONS.process,
        },
        {
            key: 'assets',
            count: department.asset_count,
            health: [
                { key: 'critical', count: department.critical_asset_count, labelKey: 'department_detail.health.critical_assets', filters: { criticality: ['critical'] } },
                { key: 'legacy', count: department.legacy_asset_count, labelKey: 'department_detail.health.legacy_assets', filters: { legacy: true } },
            ],
            icon: ENTITY_ICONS.asset,
        },
        {
            key: 'vendors',
            count: department.vendor_count,
            health: [
                { key: 'critical', count: department.critical_vendor_count, labelKey: 'department_detail.health.critical_vendors', filters: { tiers: ['critical'] } },
                { key: 'dora', count: department.dora_vendor_count, labelKey: 'department_detail.health.dora_vendors', filters: { dora_relevant: true } },
            ],
            icon: ENTITY_ICONS.vendor,
        },
        {
            key: 'users',
            count: department.user_count,
            health: [{ key: 'active', count: department.user_count, labelKey: 'department_detail.health.active_users' }],
            icon: Users,
        },
    ];

    // i18next skips plural selection for a string `count`, so an unavailable metric renders the `_other` form directly.
    const healthLabel = (action: HealthAction) =>
        action.count == null
            ? t(`${action.labelKey}_other`, { count: t('fallbacks.not_available') })
            : t(action.labelKey, { count: action.count });

    return (
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="department-stats-grid">
            {cards.map(({ key, count, health, icon: Icon }) => (
                <article
                    key={key}
                    data-testid={`department-overview-card-${key}`}
                    className="glass-card group flex min-w-0 flex-col text-left"
                >
                    <Button
                        variant="ghost"
                        data-testid={`department-overview-card-${key}-total`}
                        aria-label={`${t(`department_detail.tabs.${key}`)} ${count ?? t('fallbacks.not_available')}`}
                        onClick={() => onSelectTab(key)}
                        className="h-auto w-full min-w-0 flex-col items-start justify-start gap-0 whitespace-normal p-0 text-left font-normal hover:bg-transparent"
                    >
                        <span className="mb-2 flex items-center gap-3">
                            <Icon className="!size-5 text-accent-text transition-transform group-hover:scale-110" aria-hidden="true" />
                            <span className="min-w-0 break-words text-xs uppercase tracking-wider text-muted-foreground [overflow-wrap:anywhere]">
                                {t(`department_detail.tabs.${key}`)}
                            </span>
                        </span>
                        <span className="block text-3xl font-bold text-foreground">
                            {count ?? t('fallbacks.not_available')}
                        </span>
                    </Button>
                    <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                        {health.map((action) => (
                            <Button
                                key={action.key}
                                variant="outline"
                                size="compact"
                                data-testid={`department-overview-card-${key}-${action.key}`}
                                aria-label={`${t(`department_detail.tabs.${key}`)} ${healthLabel(action)}`}
                                onClick={() => onSelectTab(key, action.filters)}
                                className="h-auto max-w-full whitespace-normal break-words rounded-full py-1 text-left font-normal text-muted-foreground [overflow-wrap:anywhere] hover:border-accent/40"
                            >
                                {healthLabel(action)}
                            </Button>
                        ))}
                    </div>
                </article>
            ))}
        </div>
    );
}
