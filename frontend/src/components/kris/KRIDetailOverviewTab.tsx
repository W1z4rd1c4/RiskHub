import { motion } from 'framer-motion';
import { Target, Calendar, User, Shield, ExternalLink } from 'lucide-react';
import type { KeyRiskIndicator } from '@/types/kri';
import type { Risk } from '@/types/risk';

interface KRIDetailOverviewTabProps {
    kri: KeyRiskIndicator;
    linkedRisk: Risk | null;
    isBreaching: boolean;
    dueDate: Date | null;
    isOverdue: boolean;
    formatNumber: (val: number) => string;
    onNavigateToRisk: (riskId: number) => void;
}

export function KRIDetailOverviewTab({
    kri,
    linkedRisk,
    isBreaching,
    dueDate,
    isOverdue,
    formatNumber,
    onNavigateToRisk,
}: KRIDetailOverviewTabProps) {
    return (
        <div className="grid gap-6 lg:grid-cols-3">
            {/* Current Value Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card lg:col-span-2"
            >
                <h3 className="text-xs font-black text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Target className="h-4 w-4 text-accent" /> Current Value
                </h3>
                <div className="text-center py-8">
                    <div className={`text-5xl font-black mb-2 ${isBreaching ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {formatNumber(kri.current_value)}
                        <span className="text-lg text-slate-400 ml-2 font-bold">{kri.unit}</span>
                    </div>
                    <div className="text-sm text-slate-500">
                        Limits: <span className="text-white font-bold">{formatNumber(kri.lower_limit)}</span> – <span className="text-white font-bold">{formatNumber(kri.upper_limit)}</span> {kri.unit}
                    </div>
                </div>

                {/* Visual Gauge */}
                <div className="relative h-4 bg-white/5 rounded-full overflow-hidden mt-6">
                    <div
                        className="absolute h-full bg-emerald-500/20"
                        style={{
                            left: `${Math.max(0, (kri.lower_limit / kri.upper_limit) * 50)}%`,
                            width: `${Math.min(100, ((kri.upper_limit - kri.lower_limit) / kri.upper_limit) * 100)}%`
                        }}
                    />
                    <motion.div
                        initial={{ left: 0 }}
                        animate={{ left: `${Math.min(100, Math.max(0, (kri.current_value / kri.upper_limit) * 80))}%` }}
                        className={`absolute w-4 h-4 rounded-full -top-0 ${isBreaching ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    />
                </div>
            </motion.div>

            {/* Reporting Info Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="glass-card"
            >
                <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-accent" /> Reporting
                </h3>
                <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                        <span className="text-xs text-slate-500">Frequency</span>
                        <span className="text-sm font-bold text-white capitalize">{kri.frequency || 'Quarterly'}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                        <span className="text-xs text-slate-500 flex items-center gap-1"><User className="h-3 w-3" /> Owner</span>
                        <span className="text-sm font-bold text-white">{kri.reporting_owner_name || linkedRisk?.owner?.name || '—'}</span>
                    </div>
                    {kri.last_period_end && (
                        <div className="flex items-center justify-between py-2 border-b border-white/5">
                            <span className="text-xs text-slate-500">Last Period End</span>
                            <span className="text-sm font-bold text-white">{new Date(kri.last_period_end).toLocaleDateString()}</span>
                        </div>
                    )}
                    {dueDate && (
                        <div className="flex items-center justify-between py-2">
                            <span className="text-xs text-slate-500">Due Date</span>
                            <span className={`text-sm font-bold ${isOverdue ? 'text-amber-400' : 'text-white'}`}>
                                {dueDate.toLocaleDateString()}
                            </span>
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Linked Risk Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card lg:col-span-3 group/risk"
            >
                <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                        <Shield className="h-4 w-4 text-accent" />
                        Linked Risk
                    </h3>
                </div>

                {linkedRisk ? (
                    <div
                        onClick={() => onNavigateToRisk(linkedRisk.id)}
                        className="relative overflow-hidden cursor-pointer rounded-2xl border border-white/5 bg-white/[0.02] p-8 hover:bg-white/[0.04] hover:border-accent/20 transition-all duration-500 group"
                    >
                        {/* Decorative elements */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 blur-3xl rounded-full -mr-32 -mt-32 pointer-events-none group-hover:bg-accent/10 transition-colors duration-500" />

                        <div className="relative grid gap-12 lg:grid-cols-[1.5fr_1fr]">
                            <div className="space-y-8">
                                <div>
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3">Risk Name</span>
                                    <h4 className="text-xl font-bold text-white group-hover:text-accent transition-colors duration-500 leading-tight">
                                        {linkedRisk.name}
                                    </h4>
                                    <p className="text-sm text-slate-500 mt-1">{linkedRisk.process}</p>
                                </div>

                                <div>
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3">Description</span>
                                    <p className="text-sm text-slate-400 font-medium leading-relaxed max-w-2xl">
                                        {linkedRisk.description}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-8 lg:border-l lg:border-white/5 lg:pl-12">
                                <div className="grid grid-cols-2 lg:grid-cols-1 gap-8">
                                    <div>
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3">Department</span>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                                                <Target className="h-4 w-4 text-emerald-400" />
                                            </div>
                                            <span className="text-sm font-bold text-white">{linkedRisk.department?.name || 'Central Systems'}</span>
                                        </div>
                                    </div>

                                    <div>
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3">Risk Owner</span>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                                                <User className="h-4 w-4 text-accent" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-white leading-none">{linkedRisk.owner?.name || 'Unassigned'}</p>
                                                {linkedRisk.owner?.email && <p className="text-[10px] text-slate-500 mt-1">{linkedRisk.owner.email}</p>}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-8 border-t border-white/5">
                                    <div className="flex items-center gap-2 text-xs font-black text-accent uppercase tracking-widest opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-500">
                                        View Complete Risk Analysis
                                        <ExternalLink className="h-3.5 w-3.5" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="p-12 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                        <span className="text-sm text-slate-500 italic">No detailed risk information available</span>
                    </div>
                )}
            </motion.div>

            {/* Metadata */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="glass-card lg:col-span-3"
            >
                <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4">Metadata</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest">KRI ID</span>
                        <p className="text-sm font-bold text-white">{kri.id}</p>
                    </div>
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest">Unit</span>
                        <p className="text-sm font-bold text-white">{kri.unit || '—'}</p>
                    </div>
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest">Last Updated</span>
                        <p className="text-sm font-bold text-white">{kri.last_updated ? new Date(kri.last_updated).toLocaleDateString('cs-CZ') : '—'}</p>
                    </div>
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest">Status</span>
                        <p className="text-sm font-bold text-white">{kri.breach_status === 'within' ? 'OK' : 'BREACH'}</p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
