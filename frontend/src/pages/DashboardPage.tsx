import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
    ClipboardList,
    Building2,
    AlertTriangle,
    CheckCircle,
    TrendingUp,
    RefreshCw,
    ShieldAlert,
    FileText,
    Users,
    Handshake
} from 'lucide-react';
import { useDashboardFilters } from '@/contexts/DashboardFilterContext';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardApi } from '@/services/dashboardApi';
import { reportApi } from '@/services/reportApi';
import type {
    DashboardSummary,
    DepartmentMetrics,
    RiskDistribution,
    ControlTrend,
    RiskTrendPoint,
    KRIBreachTrendPoint
} from '@/types/dashboard';

import { FilterBar } from '@/components/dashboard/FilterBar';
import { RiskDistributionMatrix } from '@/components/dashboard/RiskDistributionMatrix';
import { RiskDrilldownModal } from '@/components/dashboard/RiskDrilldownModal';
import { ControlTrendChart } from '@/components/dashboard/ControlTrendChart';
import { DepartmentTable } from '@/components/dashboard/DepartmentTable';
import { CategoryBreakdownCharts } from '@/components/dashboard/CategoryBreakdownCharts';
import { KRIBreachWidget } from '@/components/dashboard/KRIBreachWidget';
import { KRIStatusWidget } from '@/components/dashboard/KRIStatusWidget';
import { RiskTrendChart } from '@/components/dashboard/RiskTrendChart';
import { KRIBreachHistoryChart } from '@/components/dashboard/KRIBreachHistoryChart';
import { RiskCommitteeSection } from '@/components/dashboard/RiskCommitteeSection';

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
};

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
};

export function DashboardPage() {
    const navigate = useNavigate();
    const { filters } = useDashboardFilters();
    const { user } = useAuth();
    const { t } = useTranslation('dashboard');
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [deptMetrics, setDeptMetrics] = useState<DepartmentMetrics[]>([]);
    const [grossDistribution, setGrossDistribution] = useState<RiskDistribution | null>(null);
    const [netDistribution, setNetDistribution] = useState<RiskDistribution | null>(null);
    const [trends, setTrends] = useState<ControlTrend[]>([]);
    const [riskTrends, setRiskTrends] = useState<RiskTrendPoint[]>([]);
    const [breachTrends, setBreachTrends] = useState<KRIBreachTrendPoint[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Risk matrix drill-down state
    const [selectedCell, setSelectedCell] = useState<{ probability: number; impact: number; riskType: 'gross' | 'net' } | null>(null);

    // Risk Committee view state
    const [activeView, setActiveView] = useState<'overview' | 'committee'>('overview');

    const isPrivileged = user?.access_scope === 'global' && user?.role !== 'admin';
    const canViewCommittee = isPrivileged || user?.role === 'department_head';

    const fetchData = useCallback(async () => {
        try {
            setError(null);
            const [summaryData, deptData, grossDistData, netDistData, trendData, riskTrendData, breachTrendData] = await Promise.all([
                dashboardApi.fetchDashboardSummary(filters),
                dashboardApi.fetchDepartmentMetrics(filters),
                dashboardApi.fetchRiskDistribution(filters, 'gross'),
                dashboardApi.fetchRiskDistribution(filters, 'net'),
                dashboardApi.fetchControlTrends(filters),
                dashboardApi.fetchRiskTrends(filters),
                dashboardApi.fetchKriBreachTrends(filters)
            ]);

            setSummary(summaryData);
            setDeptMetrics(deptData);
            setGrossDistribution(grossDistData);
            setNetDistribution(netDistData);
            setTrends(trendData);
            setRiskTrends(riskTrendData);
            setBreachTrends(breachTrendData);
        } catch (err) {
            console.error('Dashboard fetch error:', err);
            setError('Failed to load dashboard data. Please check your connection.');
        } finally {
            setIsLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000); // Auto-refresh every 60s
        return () => clearInterval(interval);
    }, [fetchData]);

    if (isLoading && !summary) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <RefreshCw className="h-8 w-8 text-accent animate-spin" />
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">{t('loading')}</p>
                </div>
            </div>
        );
    }

    if (error && !summary) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="glass-card p-10 flex flex-col items-center text-center max-w-md">
                    <ShieldAlert className="h-12 w-12 text-rose-500 mb-4" />
                    <h3 className="text-xl font-bold text-white mb-2">{t('errors.connection_interrupted')}</h3>
                    <p className="text-slate-500 mb-6">{error}</p>
                    <button
                        onClick={() => { setIsLoading(true); fetchData(); }}
                        className="px-6 py-2 bg-accent text-white rounded-xl font-bold hover:bg-accent/80 transition-all"
                    >
                        {t('errors.retry')}
                    </button>
                </div>
            </div>
        );
    }

    const stats = [
        {
            title: t('stats.total_controls'),
            value: summary?.total_controls ?? 0,
            icon: ClipboardList,
            color: 'text-accent',
            bg: 'bg-accent/10',
            trend: t('stats.live'),
            path: '/controls',
        },
        {
            title: t('stats.active_depts'),
            // Only count departments with at least one risk or control
            value: deptMetrics.filter(d => d.risk_count > 0 || d.control_count > 0).length,
            icon: Building2,
            color: 'text-purple-400',
            bg: 'bg-purple-400/10',
            trend: t('stats.stable'),
            path: '/departments',
        },
        {
            title: t('stats.critical_risks'),
            value: summary?.critical_risks_count ?? 0,
            icon: AlertTriangle,
            color: 'text-rose-400',
            bg: 'bg-rose-400/10',
            trend: t('stats.urgent'),
            path: '/risks?critical=true',
        },
        {
            title: t('stats.avg_risk_score'),
            value: summary?.average_net_risk_score ?? 0,
            icon: CheckCircle,
            color: 'text-emerald-400',
            bg: 'bg-emerald-400/10',
            trend: t('stats.calculated'),
            path: '/risks',
        },
        {
            title: t('stats.vendors', 'Vendors'),
            value: summary?.total_vendors ?? 0,
            icon: Handshake,
            color: 'text-blue-400',
            bg: 'bg-blue-400/10',
            trend: t('stats.live'),
            path: '/vendors',
        },
    ];

    return (
        <div className="space-y-10">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-black text-white mb-2">{t('title')}</h2>
                    <p className="text-slate-500 font-medium">{t('page_subtitle')}</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => reportApi.downloadSummaryPdf({ departmentId: filters.departmentId })}
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-accent hover:bg-accent/10 transition-colors"
                        title="Export Summary PDF"
                    >
                        <FileText className="h-5 w-5" />
                    </button>
                    <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {t('live_data')}
                    </div>
                </div>
            </div>

            {/* View Tabs */}
            {canViewCommittee && (
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setActiveView('overview')}
                        className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${activeView === 'overview'
                            ? 'bg-accent text-white'
                            : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                            }`}
                    >
                        {t('views.overview')}
                    </button>
                    <button
                        onClick={() => setActiveView('committee')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${activeView === 'committee'
                            ? 'bg-accent text-white'
                            : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                            }`}
                    >
                        <Users className="h-4 w-4" />
                        {t('views.risk_committee')}
                    </button>
                </div>
            )}

            {/* Render based on active view */}
            {activeView === 'committee' && canViewCommittee ? (
                <RiskCommitteeSection />
            ) : (
                <>
                    <FilterBar />

                    <motion.div
                        variants={container}
                        initial="hidden"
                        animate="show"
                        className="grid gap-6 md:grid-cols-2 lg:grid-cols-5"
                    >
                        {stats.map((stat) => (
                            <motion.div
                                key={stat.title}
                                variants={item}
                                className="glass-card group flex flex-col justify-between cursor-pointer hover:ring-2 hover:ring-accent/50 transition-all"
                                onClick={() => navigate(stat.path)}
                            >
                                <div className="flex justify-between items-start mb-6">
                                    <div className={`${stat.bg} p-3 rounded-xl`}>
                                        <stat.icon className={`h-6 w-6 ${stat.color}`} />
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                        <TrendingUp className="h-3 w-3" />
                                        {stat.trend}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-500 mb-1">{stat.title}</p>
                                    <h3 className="text-4xl font-black text-white tracking-tighter">{stat.value}</h3>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>

                    {/* Category Breakdown Charts */}
                    {summary && (summary.controls_by_status && Object.keys(summary.controls_by_status).length > 0) && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 }}
                            className="glass-card"
                        >
                            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                                <ClipboardList className="h-5 w-5 text-accent" />
                                {t('sections.control_analytics')}
                            </h3>
                            <CategoryBreakdownCharts
                                controlsByStatus={summary.controls_by_status}
                                controlsByForm={summary.controls_by_form}
                                controlsByFrequency={summary.controls_by_frequency}
                            />
                        </motion.div>
                    )}

                    <div className="grid gap-8 lg:grid-cols-3">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.6 }}
                            className="glass-card flex flex-col lg:col-span-2"
                        >
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <TrendingUp className="h-5 w-5 text-accent" />
                                    Control Execution Trends
                                </h3>
                            </div>
                            <div className="flex-1 min-h-[300px]">
                                {trends.length > 0 ? (
                                    <ControlTrendChart data={trends} />
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-600 border-t border-white/5">
                                        <p className="text-sm font-medium">{t('sections.no_execution_history')}</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.65 }}
                            className="h-full"
                        >
                            <KRIBreachWidget />
                        </motion.div>
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.7 }}
                            className="h-full"
                        >
                            <KRIStatusWidget />
                        </motion.div>
                    </div>

                    <div className="grid gap-8 lg:grid-cols-2">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.7 }}
                            className="glass-card flex flex-col"
                        >
                            <h3 className="text-lg font-bold text-white mb-8 flex items-center gap-2">
                                <ShieldAlert className="h-5 w-5 text-orange-400" />
                                {t('sections.gross_risk_matrix')}
                            </h3>
                            <div className="flex-1 flex items-center justify-center pb-4">
                                <RiskDistributionMatrix
                                    distribution={grossDistribution?.distribution ?? []}
                                    onCellClick={(p, i) => setSelectedCell({ probability: p, impact: i, riskType: 'gross' })}
                                />
                            </div>
                        </motion.div>
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.75 }}
                            className="glass-card flex flex-col"
                        >
                            <h3 className="text-lg font-bold text-white mb-8 flex items-center gap-2">
                                <ShieldAlert className="h-5 w-5 text-purple-400" />
                                {t('sections.net_risk_matrix')}
                            </h3>
                            <div className="flex-1 flex items-center justify-center pb-4">
                                <RiskDistributionMatrix
                                    distribution={netDistribution?.distribution ?? []}
                                    onCellClick={(p, i) => setSelectedCell({ probability: p, impact: i, riskType: 'net' })}
                                />
                            </div>
                        </motion.div>
                    </div>

                    {/* Historical Trends Row */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 px-2">
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] whitespace-nowrap">{t('sections.time_series_analysis')}</h3>
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                        </div>

                        <div className="grid gap-8 lg:grid-cols-2">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.75 }}
                                className="glass-card group overflow-hidden"
                            >
                                <h3 className="text-xs font-black text-white mb-8 flex items-center gap-2 uppercase tracking-widest">
                                    <TrendingUp className="h-4 w-4 text-accent" />
                                    {t('sections.risk_creation_trends')}
                                </h3>
                                <RiskTrendChart data={riskTrends} />
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.8 }}
                                className="glass-card group overflow-hidden"
                            >
                                <h3 className="text-xs font-black text-white mb-8 flex items-center gap-2 uppercase tracking-widest">
                                    <AlertTriangle className="h-4 w-4 text-orange-400" />
                                    {t('sections.kri_breach_history')}
                                </h3>
                                <KRIBreachHistoryChart data={breachTrends} />
                            </motion.div>
                        </div>
                    </div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.85 }}
                        className="glass-card !p-0 overflow-hidden"
                    >
                        <div className="p-6 border-b border-white/5 bg-white/[0.01]">
                            <h3 className="text-xs font-black text-white flex items-center gap-2 uppercase tracking-widest">
                                <Building2 className="h-4 w-4 text-emerald-400" />
                                {t('sections.departmental_visibility')}
                            </h3>
                        </div>
                        <DepartmentTable metrics={deptMetrics.filter(d => d.risk_count > 0 || d.control_count > 0)} />
                    </motion.div>

                    {/* Risk Drill-down Modal */}
                    <RiskDrilldownModal
                        isOpen={selectedCell !== null}
                        onClose={() => setSelectedCell(null)}
                        probability={selectedCell?.probability ?? 0}
                        impact={selectedCell?.impact ?? 0}
                        riskType={selectedCell?.riskType ?? 'net'}
                    />
                </>
            )}
        </div>
    );
}
