import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, ArrowRight, Activity, CalendarClock, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { useDashboardFilters } from '@/contexts/DashboardFilterContext';
import { kriApi } from '@/services/kriApi';
import type { OverdueKRI, DueSoonKRI } from '@/types/kri';

type TabType = 'upcoming' | 'overdue';

export function KRIStatusWidget() {
    const { t } = useTranslation('dashboard');
    const navigate = useNavigate();
    const { filters } = useDashboardFilters();
    const [activeTab, setActiveTab] = useState<TabType>('upcoming');
    const [overdueKRIs, setOverdueKRIs] = useState<OverdueKRI[]>([]);
    const [dueSoonKRIs, setDueSoonKRIs] = useState<DueSoonKRI[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const params = filters.departmentId ? { department_id: filters.departmentId } : undefined;
                const [overdue, dueSoon] = await Promise.all([
                    kriApi.getOverdue(params),
                    kriApi.getDueSoon(params),
                ]);
                setOverdueKRIs(overdue.slice(0, 5));
                setDueSoonKRIs(dueSoon.slice(0, 5));
            } catch (err) {
                console.error('Failed to fetch KRI status:', err);
            } finally {
                setIsLoading(false);
            }
        };
        void fetchData();
    }, [filters.departmentId]);

    const getUrgencyColor = (days: number, isOverdue: boolean) => {
        if (isOverdue) {
            return days > 7 ? 'text-red-500' : 'text-amber-400';
        } else {
            if (days <= 1) return 'text-red-500';
            if (days <= 4) return 'text-amber-400';
            return 'text-slate-400';
        }
    };

    if (isLoading) return (
        <div className="glass-card animate-pulse h-[300px] flex items-center justify-center">
            <Activity className="h-6 w-6 text-slate-700 animate-spin" />
        </div>
    );

    const hasNoItems = overdueKRIs.length === 0 && dueSoonKRIs.length === 0;

    if (hasNoItems) return (
        <div className="glass-card flex flex-col items-center justify-center p-8 text-center h-full">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4">
                <Clock className="h-6 w-6 text-emerald-500" />
            </div>
            <h4 className="text-white font-bold mb-1">{t('kri.all_current')}</h4>
            <p className="text-xs text-slate-500">{t('kri.no_due_soon')}</p>
        </div>
    );

    const currentItems = activeTab === 'upcoming' ? dueSoonKRIs : overdueKRIs;
    const showUpcomingEmpty = activeTab === 'upcoming' && dueSoonKRIs.length === 0;
    const showOverdueEmpty = activeTab === 'overdue' && overdueKRIs.length === 0;

    return (
        <div className="glass-card flex flex-col h-full !p-0 overflow-hidden">
            {/* Header with tabs */}
            <div className="p-3 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-accent" />
                        <h3 className="text-xs font-black text-white uppercase tracking-widest">{t('kri.status_title')}</h3>
                    </div>
                    <div className="flex gap-1">
                        {dueSoonKRIs.length > 0 && (
                            <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-black rounded-full border border-blue-500/20">
                                {t('kri.upcoming_count', { count: dueSoonKRIs.length })}
                            </span>
                        )}
                        {overdueKRIs.length > 0 && (
                            <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[10px] font-black rounded-full border border-amber-500/20">
                                {t('kri.overdue_count', { count: overdueKRIs.length })}
                            </span>
                        )}
                    </div>
                </div>

                {/* Tab buttons */}
                <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
                    <button
                        onClick={() => setActiveTab('upcoming')}
                        className={`flex-1 py-1.5 px-3 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${activeTab === 'upcoming'
                            ? 'bg-accent text-white'
                            : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        <CalendarClock className="h-3 w-3 inline mr-1" />
                        {t('kri.upcoming')}
                    </button>
                    <button
                        onClick={() => setActiveTab('overdue')}
                        className={`flex-1 py-1.5 px-3 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${activeTab === 'overdue'
                            ? 'bg-amber-500 text-white'
                            : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        <AlertTriangle className="h-3 w-3 inline mr-1" />
                        {t('kri.overdue')}
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto divide-y divide-white/5">
                {showUpcomingEmpty && (
                    <div className="p-6 text-center">
                        <p className="text-xs text-slate-500">{t('kri.no_due_next_7')}</p>
                    </div>
                )}
                {showOverdueEmpty && (
                    <div className="p-6 text-center">
                        <p className="text-xs text-emerald-400">{t('kri.no_overdue_short')}</p>
                    </div>
                )}
                {currentItems.map((kri) => {
                    const isOverdue = activeTab === 'overdue';
                    const days = isOverdue
                        ? (kri as OverdueKRI).days_overdue
                        : (kri as DueSoonKRI).days_until_due;

                    return (
                        <motion.div
                            key={kri.kri_id}
                            className="p-4 cursor-pointer group flex items-center justify-between hover:bg-white/5 transition-colors"
                            onClick={() => navigate(`/kris/${kri.kri_id}`)}
                        >
                            <div className="flex-1 min-w-0 mr-4">
                                <h4 className="text-xs font-bold text-white truncate mb-0.5 group-hover:text-accent transition-colors">
                                    {kri.metric_name}
                                </h4>
                                <div className="flex items-center gap-2">
                                    <span className={`text-[9px] font-black uppercase tracking-tighter ${getUrgencyColor(days, isOverdue)}`}>
                                        {isOverdue
                                            ? t('kri.days_overdue', { count: days })
                                            : t('kri.days_until_due', { count: days })
                                        }
                                    </span>
                                    <span className="w-1 h-1 rounded-full bg-slate-700" />
                                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-tighter">
                                        {kri.frequency}
                                    </span>
                                </div>
                            </div>
                            <ArrowRight className="h-3 w-3 text-slate-600 group-hover:text-white group-hover:translate-x-1 transition-all" />
                        </motion.div>
                    );
                })}
            </div>

            <button
                onClick={() => navigate(activeTab === 'overdue'
                    ? '/kris?monitoring_status=not_submitted'
                    : '/kris?timeliness_status=due_soon')}
                className="w-full py-3 bg-white/[0.01] hover:bg-white/5 text-[10px] font-black text-slate-500 uppercase tracking-widest border-t border-white/5 transition-all"
            >
                {activeTab === 'overdue' ? t('kri.view_all_overdue') : t('kri.view_all')}
            </button>
        </div>
    );
}
