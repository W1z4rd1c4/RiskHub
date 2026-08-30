import { motion } from 'framer-motion';
import { ClipboardList, TrendingUp } from 'lucide-react';

import { CategoryBreakdownCharts } from '@/components/dashboard/CategoryBreakdownCharts';
import { IssueAgingChart } from '@/components/dashboard/IssueAgingChart';
import { IssuesSummaryCard } from '@/components/dashboard/IssuesSummaryCard';
import { OpenIssuesBySeverityChart } from '@/components/dashboard/OpenIssuesBySeverityChart';
import type {
    DashboardOverview,
    DashboardSummary,
} from '@/types/dashboard';

import type { DashboardStat } from './dashboardStats';

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1,
        },
    },
};

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
};

interface DashboardSummarySectionsProps {
    canReadIssues: boolean;
    categoryAnalyticsTitle: string;
    issueAging: DashboardOverview['issue_aging'];
    issueAgingTitle: string;
    issueSeverity: DashboardOverview['issue_severity'];
    issueSeverityTitle: string;
    issueSummary: DashboardOverview['issue_summary'];
    onStatSelect: (path: string) => void;
    stats: DashboardStat[];
    summary: DashboardSummary | null;
}

export function DashboardSummarySections({
    canReadIssues,
    categoryAnalyticsTitle,
    issueAging,
    issueAgingTitle,
    issueSeverity,
    issueSeverityTitle,
    issueSummary,
    onStatSelect,
    stats,
    summary,
}: DashboardSummarySectionsProps) {
    return (
        <>
            <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="grid gap-6 md:grid-cols-2 lg:grid-cols-6"
            >
                {stats.map((stat) => (
                    <motion.button
                        type="button"
                        key={stat.title}
                        variants={item}
                        className="glass-card interactive-card group flex flex-col justify-between text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => onStatSelect(stat.path)}
                    >
                        <div className="flex justify-between items-start mb-6">
                            <div className={`${stat.bg} p-3 rounded-xl`}>
                                <stat.icon className={`h-6 w-6 ${stat.color}`} />
                            </div>
                            <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                                <TrendingUp className="h-3 w-3" />
                                {stat.trend}
                            </div>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-muted-foreground mb-1">{stat.title}</p>
                            <h3 className="text-4xl font-black text-foreground tracking-tighter">{stat.value}</h3>
                        </div>
                    </motion.button>
                ))}
            </motion.div>

            {canReadIssues && issueSummary && issueAging && issueSeverity ? (
                <div className="grid gap-6 lg:grid-cols-3">
                    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="h-full">
                        <IssuesSummaryCard issueSummary={issueSummary} />
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card">
                        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-foreground">
                            {issueAgingTitle}
                        </h3>
                        <IssueAgingChart buckets={issueAging.buckets} />
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card">
                        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-foreground">
                            {issueSeverityTitle}
                        </h3>
                        <OpenIssuesBySeverityChart items={issueSeverity.items} />
                    </motion.div>
                </div>
            ) : null}

            {summary && summary.controls_by_status && Object.keys(summary.controls_by_status).length > 0 ? (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="glass-card"
                >
                    <h3 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
                        <ClipboardList className="h-5 w-5 text-accent" />
                        {categoryAnalyticsTitle}
                    </h3>
                    <CategoryBreakdownCharts
                        controlsByStatus={summary.controls_by_status}
                        controlsByForm={summary.controls_by_form}
                        controlsByFrequency={summary.controls_by_frequency}
                    />
                </motion.div>
            ) : null}
        </>
    );
}
