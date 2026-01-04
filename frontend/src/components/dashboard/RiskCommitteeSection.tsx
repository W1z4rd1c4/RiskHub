import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Building2, Clock, Star, Activity } from 'lucide-react';
import { dashboardApi } from '@/services/dashboardApi';
import { QuarterlyComparisonWidget } from './QuarterlyComparisonWidget';

interface CommitteeSummary {
    critical_risks: Array<{
        id: number;
        risk_id_code: string;
        name: string;
        process: string;
        description: string;
        net_score: number;
        is_priority: boolean;
        owner_name: string;
        department_name: string;
    }>;
    recent_activity: Array<{
        id: number;
        action: string;
        entity_type: string;
        entity_name: string;
        description: string;
        created_at: string;
    }>;
    department_exposure: Array<{
        id: number;
        name: string;
        total_exposure: number;
        risk_count: number;
    }>;
}

const ACTION_COLORS: Record<string, string> = {
    create: 'bg-emerald-500/20 text-emerald-400',
    delete: 'bg-rose-500/20 text-rose-400',
    archive: 'bg-slate-500/20 text-slate-400',
    approve: 'bg-blue-500/20 text-blue-400',
    reject: 'bg-amber-500/20 text-amber-400',
};

function formatTimeAgo(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
}

function getRiskScoreColor(score: number): string {
    if (score >= 15) return 'text-rose-400';
    if (score >= 10) return 'text-orange-400';
    if (score >= 5) return 'text-amber-400';
    return 'text-emerald-400';
}

export function RiskCommitteeSection() {
    const [summary, setSummary] = useState<CommitteeSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        dashboardApi.fetchCommitteeSummary()
            .then(setSummary)
            .catch((err) => {
                console.error('Failed to fetch committee summary:', err);
                setError('Failed to load committee data');
            })
            .finally(() => setIsLoading(false));
    }, []);

    if (isLoading) {
        return (
            <div className="space-y-6">
                <QuarterlyComparisonWidget />
                <div className="grid gap-6 lg:grid-cols-3">
                    {Array(3).fill(0).map((_, i) => (
                        <div key={i} className="glass-card animate-pulse">
                            <div className="h-8 bg-white/5 rounded mb-4 w-1/3" />
                            <div className="space-y-3">
                                {Array(3).fill(0).map((_, j) => (
                                    <div key={j} className="h-16 bg-white/5 rounded" />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (error || !summary) {
        return (
            <div className="space-y-6">
                <QuarterlyComparisonWidget />
                <div className="glass-card">
                    <p className="text-slate-500 text-sm">{error || 'No summary data available'}</p>
                </div>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
        >
            {/* Quarterly Comparison */}
            <QuarterlyComparisonWidget />

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Critical Risks */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="glass-card"
                >
                    <div className="flex items-center gap-2 mb-6">
                        <AlertTriangle className="h-5 w-5 text-rose-400" />
                        <h3 className="text-lg font-bold text-white">Critical Risks</h3>
                    </div>

                    {summary.critical_risks.length === 0 ? (
                        <p className="text-slate-500 text-sm">No critical risks at this time</p>
                    ) : (
                        <div className="space-y-3">
                            {summary.critical_risks.map((risk) => (
                                <div
                                    key={risk.id}
                                    className="bg-white/5 rounded-xl p-4 border border-white/5 hover:border-white/10 transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold text-white leading-tight">
                                                    {risk.name}
                                                </span>
                                                {risk.is_priority && (
                                                    <Star className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0" />
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                                <span>{risk.process}</span>
                                            </div>
                                        </div>
                                        <span className={`text-sm font-black shrink-0 ${getRiskScoreColor(risk.net_score)}`}>
                                            {risk.net_score}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 mb-3 text-[10px] text-slate-400 font-medium bg-white/5 w-fit px-2 py-1 rounded-lg border border-white/5">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-accent/50" />
                                            <span>{risk.owner_name}</span>
                                        </div>
                                        <span className="w-px h-2 bg-white/10" />
                                        <span>{risk.department_name}</span>
                                    </div>
                                    <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                                        {risk.description}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </motion.div>

                {/* Department Exposure */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="glass-card"
                >
                    <div className="flex items-center gap-2 mb-6">
                        <Building2 className="h-5 w-5 text-purple-400" />
                        <h3 className="text-lg font-bold text-white">Risk Exposure by Dept</h3>
                    </div>

                    {summary.department_exposure.length === 0 ? (
                        <p className="text-slate-500 text-sm">No department exposure data</p>
                    ) : (
                        <div className="space-y-3">
                            {summary.department_exposure.map((dept, index) => {
                                const maxExposure = summary.department_exposure[0]?.total_exposure || 1;
                                const barWidth = (dept.total_exposure / maxExposure) * 100;

                                return (
                                    <div
                                        key={dept.id}
                                        className="bg-white/5 rounded-xl p-4 border border-white/5"
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-bold text-white">{dept.name}</span>
                                            <span className={`text-sm font-black ${getRiskScoreColor(dept.total_exposure)}`}>
                                                {dept.total_exposure}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${barWidth}%` }}
                                                    transition={{ delay: 0.3 + index * 0.1, duration: 0.5 }}
                                                    className="h-full bg-gradient-to-r from-purple-500 to-rose-500 rounded-full"
                                                />
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                                            {dept.risk_count} risk{dept.risk_count !== 1 ? 's' : ''}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </motion.div>

                {/* Recent Activity */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="glass-card"
                >
                    <div className="flex items-center gap-2 mb-6">
                        <Activity className="h-5 w-5 text-accent" />
                        <h3 className="text-lg font-bold text-white">Recent Activity</h3>
                    </div>

                    {summary.recent_activity.length === 0 ? (
                        <p className="text-slate-500 text-sm">No recent significant activity</p>
                    ) : (
                        <div className="space-y-3 max-h-80 overflow-y-auto">
                            {summary.recent_activity.map((activity) => (
                                <div
                                    key={activity.id}
                                    className="bg-white/5 rounded-xl p-3 border border-white/5"
                                >
                                    <div className="flex items-start gap-2">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${ACTION_COLORS[activity.action] || 'bg-slate-500/20 text-slate-400'}`}>
                                            {activity.action}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-white font-medium truncate">
                                                {activity.entity_name}
                                            </p>
                                            <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-1">
                                                <Clock className="h-3 w-3" />
                                                {formatTimeAgo(activity.created_at)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </motion.div>
            </div>
        </motion.div>
    );
}
