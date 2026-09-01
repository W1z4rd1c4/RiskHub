import type { LucideIcon } from 'lucide-react';
import {
    AlertCircle,
    AlertTriangle,
    Building2,
    CheckCircle,
    ClipboardList,
    Handshake,
} from 'lucide-react';

import type { DashboardOverview, DashboardSummary } from '@/types/dashboard';
import { classifyRiskScore, riskScoreClass } from '@/lib/riskScoreTheme';

export type DashboardStat = {
    bg: string;
    color: string;
    icon: LucideIcon;
    path: string;
    title: string;
    context?: string;
    value: number;
};

interface BuildDashboardStatsOptions {
    canReadControls: boolean;
    canReadIssues: boolean;
    canReadVendors: boolean;
    departmentMetrics: DashboardOverview['department_metrics'];
    issueSummary: DashboardOverview['issue_summary'] | null | undefined;
    summary: DashboardSummary | null | undefined;
    t: (key: string) => string;
}

export function buildDashboardStats({
    canReadControls,
    canReadIssues,
    canReadVendors,
    departmentMetrics,
    issueSummary,
    summary,
    t,
}: BuildDashboardStatsOptions): DashboardStat[] {
    const averageBand = summary && summary.total_risks > 0
        ? classifyRiskScore(summary.average_net_risk_score, summary.risk_thresholds)
        : null;
    const stats: DashboardStat[] = [];

    if (canReadControls) {
        stats.push({
            title: t('stats.total_controls'),
            value: summary?.total_controls ?? 0,
            icon: ClipboardList,
            color: 'text-accent',
            bg: 'bg-accent/10',
            path: '/controls',
        });
    }

    stats.push(
        {
            title: t('stats.active_depts'),
            value: departmentMetrics.filter((metric) => metric.risk_count > 0 || metric.control_count > 0).length,
            icon: Building2,
            color: 'text-purple-400',
            bg: 'bg-purple-400/10',
            path: '/departments',
        },
        {
            title: t('stats.critical_risks'),
            value: summary?.critical_risks_count ?? 0,
            icon: AlertTriangle,
            color: 'text-rose-400',
            bg: 'bg-rose-400/10',
            path: '/risks?critical=true',
        },
        {
            title: t('stats.avg_risk_score'),
            value: summary?.average_net_risk_score ?? 0,
            icon: CheckCircle,
            color: averageBand ? riskScoreClass('text', averageBand) : 'text-slate-400',
            bg: averageBand ? riskScoreClass('card', averageBand) : 'bg-white/5',
            context: averageBand ? t(`risk_levels.${averageBand}`) : undefined,
            path: '/risks',
        },
    );

    if (canReadVendors) {
        stats.push({
            title: t('stats.vendors'),
            value: summary?.total_vendors ?? 0,
            icon: Handshake,
            color: 'text-blue-400',
            bg: 'bg-blue-400/10',
            path: '/vendors',
        });
    }

    if (canReadIssues) {
        stats.push({
            title: t('issues.summary.open_issues'),
            value: issueSummary?.open_issues ?? 0,
            icon: AlertCircle,
            color: 'text-amber-300',
            bg: 'bg-amber-500/10',
            path: '/issues',
        });
    }

    return stats;
}
