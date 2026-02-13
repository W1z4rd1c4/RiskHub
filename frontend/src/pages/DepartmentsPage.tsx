import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Users, ShieldAlert, AlertCircle, RefreshCw, ClipboardList, Activity, TrendingUp } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { departmentApi, type DepartmentSummary } from '@/services/departmentApi';

export function DepartmentsPage() {
    const navigate = useNavigate();
    const { t } = useTranslation(['common', 'dashboard', 'errorKeys']);
    const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);

    const fetchDepartments = async () => {
        try {
            setIsLoading(true);
            setErrorKey(null);
            const data = await departmentApi.getDepartments();
            setDepartments(data);
        } catch (err) {
            setErrorKey('errorKeys.load_departments_failed');
            console.error('Error fetching departments:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchDepartments();
    }, []);

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-black text-white mb-2">{t('dashboard:department_exposure.title', 'Departments')}</h2>
                    <p className="text-slate-500 font-medium">{t('dashboard:department_exposure.subtitle', 'Organizational units and their risk/control landscape.')}</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchDepartments}
                        className="px-4 py-2 glass rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                        disabled={isLoading}
                        title={t('common:actions.refresh')}
                    >
                        <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {errorKey && (
                <div className="glass-card border-rose-500/50 bg-rose-500/10">
                    <div className="flex items-center gap-3 text-rose-400">
                        <AlertCircle className="h-5 w-5" />
                        <p className="font-medium">{t(errorKey, { ns: 'errorKeys' })}</p>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="glass-card animate-pulse">
                            <div className="h-6 w-32 bg-white/10 rounded mb-6" />
                            <div className="flex items-center gap-6">
                                <div className="h-12 w-12 bg-white/10 rounded" />
                                <div className="h-12 w-12 bg-white/10 rounded" />
                                <div className="h-12 w-12 bg-white/10 rounded" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : departments.length === 0 ? (
                <div className="glass-card p-12 flex flex-col items-center justify-center text-center">
                    <Building2 className="h-12 w-12 text-slate-600 mb-4" />
                    <p className="text-sm font-medium text-slate-500 max-w-sm">
                        {t('dashboard:department_exposure.empty', 'No departments found. Create your first department to get started.')}
                    </p>
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {departments.map((dept) => (
                        <button
                            key={dept.id}
                            onClick={() => navigate(`/departments/${dept.id}`)}
                            className="glass-card hover:border-accent/40 group cursor-pointer text-left"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="bg-white/5 p-3 rounded-xl group-hover:bg-accent/10 transition-colors">
                                        <Building2 className="h-6 w-6 text-slate-500 group-hover:text-accent" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white group-hover:text-accent transition-colors">
                                            {dept.name}
                                        </h3>
                                        <p className="text-xs text-slate-500 font-mono">{dept.code}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {dept.breaching_kri_count > 0 && (
                                        <div className="px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-black">
                                            {dept.breaching_kri_count} {t('kris:status.breached').toUpperCase()}
                                        </div>
                                    )}
                                    {dept.high_risk_count > 0 && (
                                        <div className="px-2 py-1 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-black">
                                            {dept.high_risk_count} {t('dashboard:risk_levels.critical', 'Critical').toUpperCase()}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Metrics Grid */}
                            <div className="grid grid-cols-5 gap-2 text-center">
                                <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-white/5">
                                    <Users className="h-4 w-4 text-blue-400" />
                                    <span className="text-lg font-black text-white">{dept.user_count}</span>
                                    <span className="text-[9px] font-bold text-slate-500 uppercase">{t('dashboard:department_exposure.people', 'People')}</span>
                                </div>
                                <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-white/5">
                                    <ShieldAlert className="h-4 w-4 text-orange-400" />
                                    <span className="text-lg font-black text-white">{dept.risk_count}</span>
                                    <span className="text-[9px] font-bold text-slate-500 uppercase">{t('risks:title')}</span>
                                </div>
                                <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-white/5">
                                    <ClipboardList className="h-4 w-4 text-purple-400" />
                                    <span className="text-lg font-black text-white">{dept.control_count}</span>
                                    <span className="text-[9px] font-bold text-slate-500 uppercase">{t('controls:title')}</span>
                                </div>
                                <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-white/5">
                                    <Activity className="h-4 w-4 text-emerald-400" />
                                    <span className="text-lg font-black text-white">{dept.kri_count}</span>
                                    <span className="text-[9px] font-bold text-slate-500 uppercase">{t('kris:title')}</span>
                                </div>
                                <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-white/5">
                                    <TrendingUp className="h-4 w-4 text-rose-400" />
                                    <span className="text-lg font-black text-white">{dept.total_net_score}</span>
                                    <span className="text-[9px] font-bold text-slate-500 uppercase">{t('dashboard:department_exposure.risk_sum', 'Risk Σ')}</span>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
