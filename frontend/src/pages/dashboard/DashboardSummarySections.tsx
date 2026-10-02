import { motion } from 'framer-motion';
import { ClipboardList } from 'lucide-react';
import { Link } from 'react-router-dom';

import { CategoryBreakdownCharts } from '@/components/dashboard/CategoryBreakdownCharts';
import { IssueAgingChart } from '@/components/dashboard/IssueAgingChart';
import { IssuesSummaryCard } from '@/components/dashboard/IssuesSummaryCard';
import { OpenIssuesBySeverityChart } from '@/components/dashboard/OpenIssuesBySeverityChart';
import { SeverityBadge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { useFormat } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import type {
    DashboardOverview,
    DashboardSummary,
} from '@/types/dashboard';

import type { DashboardStat } from './dashboardStats';

interface DashboardSummarySectionsProps {
    canReadIssues: boolean;
    categoryAnalyticsTitle: string;
    issueAging: DashboardOverview['issue_aging'];
    issueAgingTitle: string;
    issueSeverity: DashboardOverview['issue_severity'];
    issueSeverityTitle: string;
    issueSummary: DashboardOverview['issue_summary'];
    stats: DashboardStat[];
    summary: DashboardSummary | null;
}

/** RS-01: KPI cards wrap by a minimum width instead of a fixed 6-column grid at `lg`. */
const STAT_GRID_CLASS = 'grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]';

function StatCard({ stat }: { stat: DashboardStat }) {
    const format = useFormat();
    return (
        <Link
            to={stat.path}
            className="glass-card interactive-card group flex flex-col justify-between text-left focus-ring"
        >
            <div className="mb-6 flex items-start justify-between gap-2">
                <div className={cn(stat.bg, 'rounded-xl p-3')}>
                    <stat.icon aria-hidden="true" className={cn('size-6', stat.color)} />
                </div>
                {/* D1: a severity-coloured value always carries its band label. */}
                {stat.band && stat.context ? <SeverityBadge band={stat.band} label={stat.context} size="sm" /> : null}
            </div>
            <div>
                <p className="mb-1 text-sm font-bold text-muted-foreground">{stat.title}</p>
                <p className="font-heading text-4xl font-bold tracking-tight text-foreground">{format.number(stat.value)}</p>
            </div>
        </Link>
    );
}

export function DashboardSummarySections({
    canReadIssues,
    categoryAnalyticsTitle,
    issueAging,
    issueAgingTitle,
    issueSeverity,
    issueSeverityTitle,
    issueSummary,
    stats,
    summary,
}: DashboardSummarySectionsProps) {
    return (
        <>
            <div className={STAT_GRID_CLASS} data-testid="dashboard-stat-grid">
                {stats.map((stat) => (
                    <StatCard key={stat.title} stat={stat} />
                ))}
            </div>

            {canReadIssues && issueSummary && issueAging && issueSeverity ? (
                <div className="grid gap-6 lg:grid-cols-3">
                    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="h-full">
                        <IssuesSummaryCard issueSummary={issueSummary} />
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="h-full">
                        <Card as="section" className="h-full">
                            <CardHeader title={issueAgingTitle} />
                            <IssueAgingChart buckets={issueAging.buckets} />
                        </Card>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="h-full">
                        <Card as="section" className="h-full">
                            <CardHeader title={issueSeverityTitle} />
                            <OpenIssuesBySeverityChart items={issueSeverity.items} />
                        </Card>
                    </motion.div>
                </div>
            ) : null}

            {summary && summary.controls_by_status && Object.keys(summary.controls_by_status).length > 0 ? (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                >
                    <Card as="section">
                        <CardHeader title={categoryAnalyticsTitle} icon={ClipboardList} className="mb-6" />
                        <CategoryBreakdownCharts
                            controlsByStatus={summary.controls_by_status}
                            controlsByForm={summary.controls_by_form}
                            controlsByFrequency={summary.controls_by_frequency}
                        />
                    </Card>
                </motion.div>
            ) : null}
        </>
    );
}
