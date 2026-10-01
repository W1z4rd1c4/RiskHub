import { motion } from 'framer-motion';
import type { NavigateFunction } from 'react-router-dom';
import { Activity, AlertTriangle, Building2, Clock, Handshake, Star } from 'lucide-react';
import type { DashboardCommitteeSummary } from '@/services/dashboardApi';
import { useFormat, type SafeTFunction } from '@/i18n/hooks';
import { buildVendorDetailPath } from '@/pages/vendors/vendorDetailPresentation';
import { useRiskThresholds } from '@/hooks/useRiskHubConfig';
import { ordinalSeverityBand, riskScoreVariantClass, severityClass } from '@/lib/severity';
import { EmptyState, ErrorState, LoadingState, Skeleton } from '@/components/ui/state';
import { QuarterlyComparisonWidget } from './QuarterlyComparisonWidget';

const ACTION_COLORS: Record<string, string> = {
    create: 'bg-success/10 text-success-text',
    delete: 'bg-destructive/10 text-destructive',
    archive: 'bg-muted text-muted-foreground',
    approve: 'bg-info/10 text-accent-text',
    reject: 'bg-warning/10 text-warning-text',
};

export function RiskCommitteeLoadingState() {
    return (
        <div className="space-y-6">
            <QuarterlyComparisonWidget />
            <LoadingState
                skeleton={(
                    <div className="grid gap-6 lg:grid-cols-3">
                        {Array(3).fill(0).map((_, i) => (
                            <div key={i} className="glass-card">
                                <Skeleton className="mb-4 h-8 w-1/3" />
                                <div className="space-y-3">
                                    {Array(3).fill(0).map((_, j) => (
                                        <Skeleton key={j} className="h-16" />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            />
        </div>
    );
}

export function RiskCommitteeErrorState({ message, t }: { message: string | null; t: SafeTFunction }) {
    return (
        <div className="space-y-6">
            <QuarterlyComparisonWidget />
            {message ? (
                <ErrorState layout="section" message={message} className="glass-card" />
            ) : (
                <EmptyState layout="section" title={t('risk_committee.no_summary_data')} className="glass-card" />
            )}
        </div>
    );
}

function CriticalRisksCard({
    summary,
    navigate,
    t,
}: {
    summary: DashboardCommitteeSummary;
    navigate: NavigateFunction;
    t: SafeTFunction;
}) {
    const { thresholds } = useRiskThresholds();

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-card"
        >
            <div className="flex items-start justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <h3 className="text-lg font-bold text-foreground">{t('risk_committee.critical_risks')}</h3>
                </div>
                {summary.critical_risks_total > 0 ? (
                    <button
                        type="button"
                        className="text-xs font-bold text-accent-text hover:underline"
                        onClick={() => navigate('/risks?net_band=Kritick%C3%A9')}
                    >
                        {t('risk_committee.view_all_critical_risks', { ns: 'dashboard' })}
                    </button>
                ) : null}
            </div>

            {summary.critical_risks.length === 0 ? (
                <EmptyState layout="section" title={t('risk_committee.no_critical_risks')} className="py-6" />
            ) : (
                <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground">
                        {t('risk_committee.top_of_total', {
                            ns: 'dashboard',
                            shown: summary.critical_risks.length,
                            total: summary.critical_risks_total,
                        })}
                    </p>
                    {summary.critical_risks.map((risk) => (
                        <div
                            key={risk.id}
                            className="bg-tint/5 rounded-xl p-4 border border-border hover:border-border transition-colors"
                        >
                            <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-foreground leading-tight">
                                            {risk.name}
                                        </span>
                                        {risk.is_priority && (
                                            <Star className="h-3 w-3 text-warning-text fill-warning-text shrink-0" />
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-bold uppercase tracking-widest">
                                        <span>{risk.process}</span>
                                    </div>
                                </div>
                                <span
                                    className={`text-sm font-black shrink-0 ${riskScoreVariantClass('text', risk.net_score, thresholds)}`}
                                >
                                    {risk.net_score}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 mb-3 text-xs text-muted-foreground font-medium bg-nested w-fit px-2 py-1 rounded-lg border border-border">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-accent/50" />
                                    <span>{risk.owner_name}</span>
                                </div>
                                <span className="w-px h-2 bg-tint/10" />
                                <span>{risk.department_name}</span>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                                {risk.description}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </motion.div>
    );
}

function CriticalVendorsCard({
    summary,
    navigate,
    t,
}: {
    summary: DashboardCommitteeSummary;
    navigate: NavigateFunction;
    t: SafeTFunction;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="glass-card"
        >
            <div className="flex items-start justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                    <Handshake className="h-5 w-5 text-accent-text" />
                    <h3 className="text-lg font-bold text-foreground">
                        {t('risk_committee.high_risk_vendors', { ns: 'dashboard' })}
                    </h3>
                </div>
                {summary.can_view_vendors && (summary.critical_vendors_total ?? 0) > 0 ? (
                    <button
                        type="button"
                        className="text-xs font-bold text-accent-text hover:underline"
                        onClick={() => navigate('/vendors?risk_scores=4&risk_scores=5')}
                    >
                        {t('risk_committee.view_all_high_risk_vendors', { ns: 'dashboard' })}
                    </button>
                ) : null}
            </div>

            {!summary.can_view_vendors ? (
                <p className="text-muted-foreground text-sm">
                    {t('risk_committee.restricted_by_access_scope', { ns: 'dashboard' })}
                </p>
            ) : summary.critical_vendors.length === 0 ? (
                <EmptyState layout="section" title={t('risk_committee.no_vendors_in_scope')} className="py-6" />
            ) : (
                <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground">
                        {t('risk_committee.top_of_total', {
                            ns: 'dashboard',
                            shown: summary.critical_vendors.length,
                            total: summary.critical_vendors_total ?? 0,
                        })}
                    </p>
                    {summary.critical_vendors.map((v) => (
                        <button
                            key={v.id}
                            onClick={() => navigate(buildVendorDetailPath(v.id, 'assessments', 'schedule'))}
                            className="w-full text-left bg-tint/5 rounded-xl p-4 border border-border hover:border-border transition-colors"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-bold text-foreground truncate">{v.name}</p>
                                <span className={`text-sm font-black ${severityClass('text', ordinalSeverityBand(v.risk_score_1_5))}`}>
                                    {v.risk_score_1_5}/5
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground uppercase tracking-widest">
                                {v.department_name} · {v.process}{v.subprocess ? ` / ${v.subprocess}` : ''}
                            </p>
                        </button>
                    ))}
                </div>
            )}
        </motion.div>
    );
}

function DepartmentExposureCard({ summary, t }: { summary: DashboardCommitteeSummary; t: SafeTFunction }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="glass-card"
        >
            <div className="flex items-center gap-2 mb-6">
                <Building2 className="h-5 w-5 text-chart-2" />
                <h3 className="text-lg font-bold text-foreground">{t('sections.risk_exposure_by_dept')}</h3>
            </div>

            {summary.department_exposure.length === 0 ? (
                <EmptyState layout="section" title={t('risk_committee.no_department_exposure_data')} className="py-6" />
            ) : (
                <div className="space-y-3">
                    {summary.department_exposure.map((dept, index) => {
                        const maxExposure = summary.department_exposure[0]?.total_exposure || 1;
                        const barWidth = (dept.total_exposure / maxExposure) * 100;
                        const riskCountLabel = t('risk_committee.risk_count', {
                            count: dept.risk_count,
                            ns: 'dashboard',
                        });

                        return (
                            <div
                                key={dept.id}
                                className="bg-tint/5 rounded-xl p-4 border border-border"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-bold text-foreground">{dept.name}</span>
                                    <span className="text-sm font-black text-foreground">
                                        {dept.total_exposure}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="flex-1 h-1.5 bg-tint/5 rounded-full overflow-hidden">
                                        <motion.div
                                            aria-label={`${dept.name}: ${dept.total_exposure}; ${riskCountLabel}`}
                                            aria-valuemax={maxExposure}
                                            aria-valuemin={0}
                                            aria-valuenow={dept.total_exposure}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${barWidth}%` }}
                                            transition={{ delay: 0.3 + index * 0.1, duration: 0.5 }}
                                            className="h-full bg-chart-2 rounded-full"
                                            role="progressbar"
                                        />
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground uppercase tracking-widest">
                                    {riskCountLabel}
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}
        </motion.div>
    );
}

function RecentActivityCard({ summary, t }: { summary: DashboardCommitteeSummary; t: SafeTFunction }) {
    // PG-39: relative dates come from the shared locale-aware formatter.
    const format = useFormat();
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-card"
        >
            <div className="flex items-center gap-2 mb-6">
                <Activity className="h-5 w-5 text-accent" />
                <h3 className="text-lg font-bold text-foreground">{t('sections.recent_activity')}</h3>
            </div>

            {summary.recent_activity.length === 0 ? (
                <EmptyState layout="section" title={t('risk_committee.no_recent_significant_activity')} className="py-6" />
            ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                    {summary.recent_activity.map((activity) => (
                        <div
                            key={activity.id}
                            className="bg-tint/5 rounded-xl p-3 border border-border"
                        >
                            <div className="flex items-start gap-2">
                                <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${ACTION_COLORS[activity.action] || 'bg-muted text-muted-foreground'}`}>
                                    {t(`risk_committee.actions.${activity.action}`, activity.action)}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-foreground font-medium truncate">
                                        {activity.entity_name}
                                    </p>
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                        <Clock className="h-3 w-3" />
                                        {format.relative(activity.created_at)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </motion.div>
    );
}

export function RiskCommitteeSummaryContent({
    navigate,
    summary,
    t,
}: {
    navigate: NavigateFunction;
    summary: DashboardCommitteeSummary;
    t: SafeTFunction;
}) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
        >
            <QuarterlyComparisonWidget />

            <div className="grid gap-6 lg:grid-cols-2">
                <CriticalRisksCard summary={summary} navigate={navigate} t={t} />
                <CriticalVendorsCard summary={summary} navigate={navigate} t={t} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <DepartmentExposureCard summary={summary} t={t} />
                <RecentActivityCard summary={summary} t={t} />
            </div>
        </motion.div>
    );
}
