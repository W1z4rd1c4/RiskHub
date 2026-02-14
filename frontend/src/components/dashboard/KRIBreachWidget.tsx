import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDashboardFilters } from '@/contexts/DashboardFilterContext';
import { kriApi } from '@/services/kriApi';
import { useTranslation } from '@/i18n/hooks';
import type { KeyRiskIndicator } from '@/types/kri';

export function KRIBreachWidget() {
    const { t } = useTranslation('dashboard');
    const navigate = useNavigate();
    const { filters } = useDashboardFilters();
    const [breaches, setBreaches] = useState<KeyRiskIndicator[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchBreaches = async () => {
            try {
                const params = filters.departmentId ? { department_id: filters.departmentId } : undefined;
                const data = await kriApi.getBreaches(params);
                setBreaches(data.slice(0, 5)); // Show top 5
            } catch (err) {
                console.error('Failed to fetch breaches:', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchBreaches();
    }, [filters.departmentId]);

    if (isLoading) return (
        <div className="glass-card animate-pulse h-[300px] flex items-center justify-center">
            <Activity className="h-6 w-6 text-slate-700 animate-spin" />
        </div>
    );

    if (breaches.length === 0) return (
        <div className="glass-card flex flex-col items-center justify-center p-8 text-center h-full">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4">
                <Activity className="h-6 w-6 text-emerald-500" />
            </div>
            <h4 className="text-white font-bold mb-1">{t('kri.appetite_maintained')}</h4>
            <p className="text-xs text-slate-500">{t('kri.no_breaches_org')}</p>
        </div>
    );

    return (
        <div className="glass-card flex flex-col h-full !p-0 overflow-hidden">
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-500" />
                    <h3 className="text-xs font-black text-white uppercase tracking-widest">{t('kri.active_breaches')}</h3>
                </div>
                <span className="px-2 py-0.5 bg-rose-500/10 text-rose-500 text-[10px] font-black rounded-full border border-rose-500/20">
                    {breaches.length}+
                </span>
            </div>

            <div className="flex-1 overflow-auto divide-y divide-white/5">
                {breaches.map((kri) => (
                    <motion.div
                        key={kri.id}
                        className="p-4 cursor-pointer group flex items-center justify-between hover:bg-white/5 transition-colors"
                        onClick={() => navigate(`/risks/${kri.risk_id}`)}
                    >
                        <div className="flex-1 min-w-0 mr-4">
                            <h4 className="text-xs font-bold text-white truncate mb-0.5 group-hover:text-accent transition-colors">
                                {kri.metric_name}
                            </h4>
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] text-slate-500 font-black uppercase tracking-tighter">
                                    Current: <span className="text-rose-400">{kri.current_value}{kri.unit}</span>
                                </span>
                                <span className="w-1 h-1 rounded-full bg-slate-700" />
                                <span className="text-[9px] text-slate-500 font-black uppercase tracking-tighter">
                                    Limit: {kri.upper_limit}{kri.unit}
                                </span>
                            </div>
                        </div>
                        <ArrowRight className="h-3 w-3 text-slate-600 group-hover:text-white group-hover:translate-x-1 transition-all" />
                    </motion.div>
                ))}
            </div>

            <button
                onClick={() => navigate('/risks?breached=true')}
                className="w-full py-3 bg-white/[0.01] hover:bg-white/5 text-[10px] font-black text-slate-500 uppercase tracking-widest border-t border-white/5 transition-all"
            >
                {t('kri.view_risk_register')}
            </button>
        </div>
    );
}
