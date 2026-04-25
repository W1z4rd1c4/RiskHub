import { AlertCircle, Shield, ShieldAlert, Target, TrendingDown, Users } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import { HIGH_RISK_MIN_NET_SCORE, type TabView } from '@/hooks/useDepartmentDetail';
import type { KRIMonitoringStatus } from '@/types/kri';
import type { DepartmentDetail } from '@/services/departmentApi';

interface DepartmentStatsGridProps {
    activeTab: TabView;
    department: DepartmentDetail;
    kriFilter: 'all' | KRIMonitoringStatus;
    riskFilter: 'all' | 'high';
    onSelectControls: () => void;
    onSelectHighRisks: () => void;
    onSelectKriBreach: () => void;
    onSelectKris: () => void;
    onSelectRisks: () => void;
    onSelectUsers: () => void;
}

export function DepartmentStatsGrid({
    activeTab,
    department,
    kriFilter,
    riskFilter,
    onSelectControls,
    onSelectHighRisks,
    onSelectKriBreach,
    onSelectKris,
    onSelectRisks,
    onSelectUsers,
}: DepartmentStatsGridProps) {
    const { t } = useTranslation(['common', 'dashboard']);
    const breachCount = department.kri_monitoring_counts?.breach ?? 0;
    const highRiskCount = department.risk_distribution.critical + department.risk_distribution.high;

    return (
        <div className="grid grid-cols-6 gap-4">
            <button
                type="button"
                onClick={onSelectRisks}
                className={`glass-card cursor-pointer text-left hover:bg-white/5 transition-all group ${
                    activeTab === 'risks' && riskFilter === 'all' ? 'border-accent/50 bg-accent/5' : ''
                }`}
            >
                <div className="flex items-center gap-3 mb-2">
                    <ShieldAlert className="h-5 w-5 text-amber-400 group-hover:scale-110 transition-transform" />
                    <p className="text-xs text-slate-500 uppercase tracking-wider">{t('common:labels.risk')}</p>
                </div>
                <p className="text-3xl font-black text-white">{department.risk_count}</p>
            </button>
            <button
                type="button"
                onClick={onSelectControls}
                className={`glass-card cursor-pointer text-left hover:bg-white/5 transition-all group ${
                    activeTab === 'controls' ? 'border-accent/50 bg-accent/5' : ''
                }`}
            >
                <div className="flex items-center gap-3 mb-2">
                    <Shield className="h-5 w-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                    <p className="text-xs text-slate-500 uppercase tracking-wider">{t('common:labels.control')}</p>
                </div>
                <p className="text-3xl font-black text-white">{department.control_count}</p>
            </button>
            <button
                type="button"
                onClick={onSelectKris}
                className={`glass-card cursor-pointer text-left hover:bg-white/5 transition-all group ${
                    activeTab === 'kris' && kriFilter === 'all' ? 'border-accent/50 bg-accent/5' : ''
                }`}
            >
                <div className="flex items-center gap-3 mb-2">
                    <Target className="h-5 w-5 text-accent group-hover:scale-110 transition-transform" />
                    <p className="text-xs text-slate-500 uppercase tracking-wider">KRIs</p>
                </div>
                <p className="text-3xl font-black text-white">{department.kri_count}</p>
            </button>
            <button
                type="button"
                onClick={onSelectKriBreach}
                className={`glass-card cursor-pointer text-left hover:bg-white/5 transition-all group ${
                    activeTab === 'kris' && kriFilter === 'breach' ? 'border-rose-500/50 bg-rose-500/5' : ''
                }`}
                title={t('dashboard:kri_breaches')}
            >
                <div className="flex items-center gap-3 mb-2">
                    <TrendingDown className="h-5 w-5 text-rose-400 group-hover:scale-110 transition-transform" />
                    <p className="text-xs text-slate-500 uppercase tracking-wider">{t('dashboard:kri_breaches')}</p>
                </div>
                <p className="text-3xl font-black text-rose-400">{breachCount}</p>
            </button>
            <button
                type="button"
                onClick={onSelectUsers}
                className={`glass-card cursor-pointer text-left hover:bg-white/5 transition-all group ${
                    activeTab === 'users' ? 'border-accent/50 bg-accent/5' : ''
                }`}
            >
                <div className="flex items-center gap-3 mb-2">
                    <Users className="h-5 w-5 text-blue-400 group-hover:scale-110 transition-transform" />
                    <p className="text-xs text-slate-500 uppercase tracking-wider">{t('dashboard:active_users')}</p>
                </div>
                <p className="text-3xl font-black text-white">{department.user_count}</p>
            </button>
            <button
                type="button"
                onClick={onSelectHighRisks}
                className={`glass-card cursor-pointer text-left hover:bg-white/5 transition-all group ${
                    activeTab === 'risks' && riskFilter === 'high' ? 'border-rose-500/50 bg-rose-500/5' : ''
                }`}
                title={`Net score >= ${HIGH_RISK_MIN_NET_SCORE}`}
            >
                <div className="flex items-center gap-3 mb-2">
                    <AlertCircle className="h-5 w-5 text-rose-400 group-hover:scale-110 transition-transform" />
                    <p className="text-xs text-slate-500 uppercase tracking-wider">{t('dashboard:high_risk')}</p>
                </div>
                <p className="text-3xl font-black text-rose-400">{highRiskCount}</p>
            </button>
        </div>
    );
}
