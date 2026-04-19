import { motion } from 'framer-motion';
import { Target, Calendar, User, Shield, ExternalLink } from 'lucide-react';
import { MetricGaugeSvg } from '@/components/ui/MetricGaugeSvg';
import type { KeyRiskIndicator } from '@/types/kri';
import type { Risk } from '@/types/risk';
import { useTranslation } from '@/i18n/hooks';
import { formatDateValue } from '@/i18n/formatters';
import { getKriMonitoringMeta } from '@/lib/monitoringStatus';

interface KRIDetailOverviewTabProps {
    kri: KeyRiskIndicator;
    linkedRisk: Risk | null;
    dueDate: Date | null;
    formatNumber: (val: number) => string;
    onNavigateToRisk: (riskId: number) => void;
}

export function KRIDetailOverviewTab({
    kri,
    linkedRisk,
    dueDate,
    formatNumber,
    onNavigateToRisk,
}: KRIDetailOverviewTabProps) {
    const { t, i18n } = useTranslation(['kris', 'common', 'risks']);
    const monitoring = getKriMonitoringMeta(kri.monitoring_status);
    const gaugeMin = Math.min(kri.lower_limit, kri.current_value);
    const gaugeMax = Math.max(kri.upper_limit, kri.current_value, gaugeMin + 1);
    const gaugeRange = gaugeMax - gaugeMin || 1;
    const toPct = (value: number) => ((value - gaugeMin) / gaugeRange) * 100;
    const lowerPct = Math.max(0, Math.min(100, toPct(kri.lower_limit)));
    const upperPct = Math.max(lowerPct, Math.min(100, toPct(kri.upper_limit)));
    const valuePct = Math.max(0, Math.min(100, toPct(kri.current_value)));
    const pointerToneClass = `${monitoring.gaugeClassName.split(' ')[0].replace(/^bg-/, 'text-')} fill-current`;

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
                    <Target className="h-4 w-4 text-accent" /> {t('fields.current_value', { ns: 'kris' })}
                </h3>
                <div className="text-center py-8">
                    <div className={`text-5xl font-black mb-2 ${monitoring.textClassName}`}>
                        {formatNumber(kri.current_value)}
                        <span className="text-lg text-slate-400 ml-2 font-bold">{kri.unit}</span>
                    </div>
                    <div className="text-sm text-slate-500">
                        {t('common:labels.limits')}: <span className="text-white font-bold">{formatNumber(kri.lower_limit)}</span> – <span className="text-white font-bold">{formatNumber(kri.upper_limit)}</span> {kri.unit}
                    </div>
                </div>

                {/* Visual Gauge */}
                <MetricGaugeSvg
                    className="mt-6"
                    valuePct={valuePct}
                    pointerClassName={pointerToneClass}
                    zones={[{ startPct: lowerPct, endPct: upperPct, className: 'text-emerald-500/20' }]}
                />
            </motion.div>

            {/* Reporting Info Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="glass-card"
            >
                <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-accent" /> {t('overview.reporting', { ns: 'kris' })}
                </h3>
                <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                        <span className="text-xs text-slate-500">{t('common:labels.frequency')}</span>
                        <span className="text-sm font-bold text-white capitalize">{kri.frequency ? t(`frequencies.${kri.frequency}`, { ns: 'kris' }) : t('frequencies.quarterly', { ns: 'kris' })}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                        <span className="text-xs text-slate-500 flex items-center gap-1"><User className="h-3 w-3" /> {t('common:labels.owner')}</span>
                        <span className="text-sm font-bold text-white">{kri.reporting_owner_name || linkedRisk?.owner?.name || '—'}</span>
                    </div>
                    {kri.last_period_end && (
                        <div className="flex items-center justify-between py-2 border-b border-white/5">
                            <span className="text-xs text-slate-500">{t('overview.last_period_end', { ns: 'kris' })}</span>
                            <span className="text-sm font-bold text-white">{formatDateValue(kri.last_period_end, i18n.language)}</span>
                        </div>
                    )}
                    {dueDate && (
                        <div className="flex items-center justify-between py-2">
                            <span className="text-xs text-slate-500">{t('overview.due_date', { ns: 'kris' })}</span>
                            <span className={`text-sm font-bold ${kri.monitoring_status === 'not_submitted' ? 'text-amber-400' : 'text-white'}`}>
                                {formatDateValue(dueDate, i18n.language)}
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
                        {t('fields.linked_risk', { ns: 'kris' })}
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
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3">{t('common:labels.risk_name')}</span>
                                    <h4 className="text-xl font-bold text-white group-hover:text-accent transition-colors duration-500 leading-tight">
                                        {linkedRisk.name}
                                    </h4>
                                    <p className="text-sm text-slate-500 mt-1">{linkedRisk.process}</p>
                                </div>

                                <div>
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3">{t('common:labels.description')}</span>
                                    <p className="text-sm text-slate-400 font-medium leading-relaxed max-w-2xl">
                                        {linkedRisk.description}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-8 lg:border-l lg:border-white/5 lg:pl-12">
                                <div className="grid grid-cols-2 lg:grid-cols-1 gap-8">
                                    <div>
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3">{t('common:labels.department')}</span>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                                                <Target className="h-4 w-4 text-emerald-400" />
                                            </div>
                                            <span className="text-sm font-bold text-white">{linkedRisk.department?.name || t('overview.central_systems', { ns: 'kris' })}</span>
                                        </div>
                                    </div>

                                    <div>
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3">{t('risks:fields.owner')}</span>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                                                <User className="h-4 w-4 text-accent" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-white leading-none">{linkedRisk.owner?.name || t('overview.unassigned', { ns: 'kris' })}</p>
                                                {linkedRisk.owner?.email && <p className="text-[10px] text-slate-500 mt-1">{linkedRisk.owner.email}</p>}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-8 border-t border-white/5">
                                    <div className="flex items-center gap-2 text-xs font-black text-accent uppercase tracking-widest opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-500">
                                        {t('overview.view_complete_risk_analysis', { ns: 'kris' })}
                                        <ExternalLink className="h-3.5 w-3.5" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="p-12 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                        <span className="text-sm text-slate-500 italic">{t('common:empty.no_risk_info')}</span>
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
                <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4">{t('overview.metadata', { ns: 'kris' })}</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest">{t('fields.unit', { ns: 'kris' })}</span>
                        <p className="text-sm font-bold text-white">{kri.unit || '—'}</p>
                    </div>
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest">{t('overview.last_updated', { ns: 'kris' })}</span>
                        <p className="text-sm font-bold text-white">{kri.last_updated ? formatDateValue(kri.last_updated, i18n.language) : '—'}</p>
                    </div>
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest">{t('common:labels.status')}</span>
                        <p className={`text-sm font-bold ${monitoring.textClassName}`}>{t(monitoring.labelKey)}</p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
