import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { formatDateValue } from '@/i18n/formatters';
import {
    ArrowLeft,
    Building2,
    Users,
    ShieldAlert,
    Shield,
    AlertCircle,
    RefreshCw,
    Calendar,
    Target,
    TrendingDown,
} from 'lucide-react';
import { SortableTable, Pagination } from '@/components/tables';
import { KRI_MONITORING_FILTER_VALUES } from '@/lib/monitoringStatus';
import {
    useDepartmentDetail,
    DEPARTMENT_PAGE_SIZE,
    HIGH_RISK_MIN_NET_SCORE,
    type TabView,
} from '@/hooks/useDepartmentDetail';
import {
    getControlColumns,
    getKriColumns,
    getResultIcon,
    getRiskColumns,
    getUserColumns,
} from '@/pages/departments/departmentDetailColumns';
import type { KRIMonitoringStatus } from '@/types/kri';

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function DepartmentDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const { t, i18n } = useTranslation(['common', 'dashboard', 'kris']);

    // UI state (kept in page for tab/pagination control)
    const [activeTab, setActiveTab] = useState<TabView>('risks');
    const [riskFilter, setRiskFilter] = useState<'all' | 'high'>('all');
    const [kriFilter, setKriFilter] = useState<'all' | KRIMonitoringStatus>('all');
    const [riskPage, setRiskPage] = useState(1);
    const [controlPage, setControlPage] = useState(1);
    const [kriPage, setKriPage] = useState(1);
    const [userPage, setUserPage] = useState(1);

    // Reset all pagination when department changes.
    useEffect(() => {
        setRiskPage(1);
        setControlPage(1);
        setKriPage(1);
        setUserPage(1);
    }, [id]);

    // Reset risk page when risk filter changes.
    useEffect(() => {
        setRiskPage(1);
    }, [riskFilter]);

    // Reset KRI page when KRI filter changes.
    useEffect(() => {
        setKriPage(1);
    }, [kriFilter]);

    const departmentId = id ? Number(id) : undefined;

    // Data fetching via custom hook
    const {
        department,
        isLoading,
        error,
        risks,
        controls,
        kris,
        users,
        riskTotalPages,
        controlTotalPages,
        kriTotalPages,
        userTotalPages,
        getRiskCount,
        refresh,
    } = useDepartmentDetail({
        departmentId,
        activeTab,
        riskFilter,
        kriFilter,
        riskPage,
        controlPage,
        kriPage,
        userPage,
    });

    // Refresh handler that also resets pagination
    const handleRefresh = () => {
        refresh();
        setRiskPage(1);
        setControlPage(1);
        setKriPage(1);
        setUserPage(1);
        setKriFilter('all');
        setRiskFilter('all');
    };

    const getKriStatusCount = (status: KRIMonitoringStatus) => {
        if (!department) return 0;
        return department.kri_monitoring_counts?.[status] ?? 0;
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Render: Loading State
    // ─────────────────────────────────────────────────────────────────────────

    if (isLoading) {
        return (
            <div className="space-y-8">
                <div className="glass-card animate-pulse">
                    <div className="h-8 w-64 bg-white/10 rounded mb-4" />
                    <div className="h-4 w-96 bg-white/10 rounded" />
                </div>
                <div className="grid grid-cols-4 gap-6">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="glass-card animate-pulse">
                            <div className="h-12 w-full bg-white/10 rounded" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Render: Error State
    // ─────────────────────────────────────────────────────────────────────────

    if (error || !department) {
        return (
            <div className="glass-card border-rose-500/50 bg-rose-500/10">
                <div className="flex items-center gap-3 text-rose-400">
                    <AlertCircle className="h-5 w-5" />
                    <p className="font-medium">{error ? t(error, { ns: 'common' }) : t('not_found', { ns: 'errorKeys' })}</p>
                </div>
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Tab Panel Render Functions
    // ─────────────────────────────────────────────────────────────────────────

    const renderRisksTab = () => (
        <div className="space-y-4">
            <SortableTable
                data={risks}
                columns={getRiskColumns(t)}
                keyExtractor={(risk) => risk.id}
                onRowClick={(risk) => navigate(`/risks/${risk.id}`)}
                emptyMessage={riskFilter === 'high' ? t('common:empty.no_high_risk_items') : t('common:empty.no_risks_found')}
            />
            {riskTotalPages > 1 && (
                <Pagination
                    currentPage={riskPage}
                    totalPages={riskTotalPages}
                    totalItems={getRiskCount()}
                    itemsPerPage={DEPARTMENT_PAGE_SIZE}
                    onPageChange={setRiskPage}
                />
            )}
        </div>
    );

    const renderControlsTab = () => (
        <div className="space-y-4">
            <SortableTable
                data={controls}
                columns={getControlColumns(t)}
                keyExtractor={(control) => control.id}
                onRowClick={(control) => navigate(`/controls/${control.id}`)}
                emptyMessage={t('common:empty.no_controls_department')}
            />
            {controlTotalPages > 1 && (
                <Pagination
                    currentPage={controlPage}
                    totalPages={controlTotalPages}
                    totalItems={department.control_count}
                    itemsPerPage={DEPARTMENT_PAGE_SIZE}
                    onPageChange={setControlPage}
                />
            )}
        </div>
    );

    const renderKrisTab = () => (
        <div className="space-y-4">
            <div className="flex gap-2 flex-wrap items-center">
                {(['all', ...KRI_MONITORING_FILTER_VALUES] as Array<'all' | KRIMonitoringStatus>).map((filter) => (
                    <button
                        key={filter}
                        onClick={() => { setKriFilter(filter); setKriPage(1); }}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${
                            kriFilter === filter
                                ? 'bg-accent text-white shadow-lg shadow-accent/20'
                                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                        }`}
                    >
                        {filter === 'all' ? t('common:filters.all') : t(`kris:monitoring.${filter}`)}
                    </button>
                ))}
            </div>
            <SortableTable
                data={kris}
                columns={getKriColumns(t, i18n.language)}
                keyExtractor={(kri) => kri.id}
                onRowClick={(kri) => navigate(`/kris/${kri.id}`)}
                emptyMessage={kriFilter === 'breach'
                    ? t('common:empty.no_kris_breach')
                    : t('common:empty.no_kris_department')}
            />
            {kriTotalPages > 1 && (
                <Pagination
                    currentPage={kriPage}
                    totalPages={kriTotalPages}
                    totalItems={kriFilter === 'all' ? department.kri_count : getKriStatusCount(kriFilter)}
                    itemsPerPage={DEPARTMENT_PAGE_SIZE}
                    onPageChange={setKriPage}
                />
            )}
        </div>
    );

    const renderUsersTab = () => (
        <div className="space-y-4">
            <SortableTable
                data={users}
                columns={getUserColumns(t)}
                keyExtractor={(u) => u.id}
                emptyMessage={t('common:empty.no_users_department')}
            />
            {userTotalPages > 1 && (
                <Pagination
                    currentPage={userPage}
                    totalPages={userTotalPages}
                    totalItems={department.user_count}
                    itemsPerPage={DEPARTMENT_PAGE_SIZE}
                    onPageChange={setUserPage}
                />
            )}
        </div>
    );

    const renderActivityTab = () => (
        <div className="glass-card !p-0 overflow-hidden">
            {department.recent_executions.length === 0 ? (
                <div className="p-12 text-center">
                    <Calendar className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-500">{t('common:empty.no_recent_executions')}</p>
                </div>
            ) : (
                <div className="divide-y divide-white/5">
                    {department.recent_executions.map((execution) => (
                        <div
                            key={execution.id}
                            className="px-6 py-4 hover:bg-white/5 cursor-pointer flex items-center justify-between"
                            onClick={() => navigate(`/controls/${execution.control_id}`)}
                        >
                            <div className="flex items-center gap-4">
                                {getResultIcon(execution.result)}
                                <div>
                                    <p className="text-sm font-bold text-white">{execution.control_name}</p>
                                    <p className="text-xs text-slate-500">
                                        {t('common:labels.by')} {execution.executed_by} • {formatDateValue(execution.executed_at, i18n.language)}
                                    </p>
                                </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${execution.result === 'passed' ? 'bg-emerald-500/20 text-emerald-400' :
                                execution.result === 'failed' ? 'bg-rose-500/20 text-rose-400' :
                                    execution.result === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                                        'bg-slate-500/20 text-slate-400'
                                }`}>
                                {execution.result === 'not_applicable' ? 'N/A' : execution.result}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Main Render
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/departments')}
                        className="px-4 py-2 glass rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <Building2 className="h-8 w-8 text-accent" />
                            <h2 className="text-3xl font-black text-white">{department.name}</h2>
                            <span className="px-3 py-1 rounded-full bg-white/10 text-slate-400 text-xs font-mono">
                                {department.code}
                            </span>
                        </div>
                        {department.description && (
                            <p className="text-slate-500 font-medium">{department.description}</p>
                        )}
                    </div>
                </div>
                <button
                    onClick={handleRefresh}
                    className="px-4 py-2 glass rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                >
                    <RefreshCw className="h-5 w-5" />
                </button>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-6 gap-4">
                <div
                    onClick={() => { setActiveTab('risks'); setRiskFilter('all'); }}
                    className={`glass-card cursor-pointer hover:bg-white/5 transition-all group ${activeTab === 'risks' && riskFilter === 'all' ? 'border-accent/50 bg-accent/5' : ''}`}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <ShieldAlert className="h-5 w-5 text-amber-400 group-hover:scale-110 transition-transform" />
                        <p className="text-xs text-slate-500 uppercase tracking-wider">{t('common:labels.risk')}</p>
                    </div>
                    <p className="text-3xl font-black text-white">{department.risk_count}</p>
                </div>
                <div
                    onClick={() => setActiveTab('controls')}
                    className={`glass-card cursor-pointer hover:bg-white/5 transition-all group ${activeTab === 'controls' ? 'border-accent/50 bg-accent/5' : ''}`}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <Shield className="h-5 w-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                        <p className="text-xs text-slate-500 uppercase tracking-wider">{t('common:labels.control')}</p>
                    </div>
                    <p className="text-3xl font-black text-white">{department.control_count}</p>
                </div>
                <div
                    onClick={() => { setActiveTab('kris'); setKriFilter('all'); }}
                    className={`glass-card cursor-pointer hover:bg-white/5 transition-all group ${activeTab === 'kris' && kriFilter === 'all' ? 'border-accent/50 bg-accent/5' : ''}`}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <Target className="h-5 w-5 text-accent group-hover:scale-110 transition-transform" />
                        <p className="text-xs text-slate-500 uppercase tracking-wider">KRIs</p>
                    </div>
                    <p className="text-3xl font-black text-white">{department.kri_count}</p>
                </div>
                <div
                    onClick={() => { setActiveTab('kris'); setKriFilter('breach'); }}
                    className={`glass-card cursor-pointer hover:bg-white/5 transition-all group ${activeTab === 'kris' && kriFilter === 'breach' ? 'border-rose-500/50 bg-rose-500/5' : ''}`}
                    title={t('dashboard:kri_breaches')}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <TrendingDown className="h-5 w-5 text-rose-400 group-hover:scale-110 transition-transform" />
                        <p className="text-xs text-slate-500 uppercase tracking-wider">{t('dashboard:kri_breaches')}</p>
                    </div>
                    <p className="text-3xl font-black text-rose-400">{getKriStatusCount('breach')}</p>
                </div>
                <div
                    onClick={() => setActiveTab('users')}
                    className={`glass-card cursor-pointer hover:bg-white/5 transition-all group ${activeTab === 'users' ? 'border-accent/50 bg-accent/5' : ''}`}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <Users className="h-5 w-5 text-blue-400 group-hover:scale-110 transition-transform" />
                        <p className="text-xs text-slate-500 uppercase tracking-wider">{t('dashboard:active_users')}</p>
                    </div>
                    <p className="text-3xl font-black text-white">{department.user_count}</p>
                </div>
                <div
                    onClick={() => { setActiveTab('risks'); setRiskFilter('high'); }}
                    className={`glass-card cursor-pointer hover:bg-white/5 transition-all group ${activeTab === 'risks' && riskFilter === 'high' ? 'border-rose-500/50 bg-rose-500/5' : ''}`}
                    title={`Net score >= ${HIGH_RISK_MIN_NET_SCORE}`}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <AlertCircle className="h-5 w-5 text-rose-400 group-hover:scale-110 transition-transform" />
                        <p className="text-xs text-slate-500 uppercase tracking-wider">{t('dashboard:high_risk')}</p>
                    </div>
                    <p className="text-3xl font-black text-rose-400">{department.risk_distribution.critical + department.risk_distribution.high}</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 border-b border-white/10">
                <button
                    onClick={() => setActiveTab('risks')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'risks'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    {t('department_detail.tabs.risks', { count: getRiskCount() })}
                </button>
                <button
                    onClick={() => setActiveTab('users')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'users'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    {t('department_detail.tabs.users', { count: department.user_count })}
                </button>
                <button
                    onClick={() => setActiveTab('controls')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'controls'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    {t('department_detail.tabs.controls', { count: department.control_count })}
                </button>
                <button
                    onClick={() => setActiveTab('kris')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'kris'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    {t('department_detail.tabs.kris', { count: department.kri_count })}
                </button>
                <button
                    onClick={() => setActiveTab('activity')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'activity'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    {t('department_detail.tabs.recent_activity', { count: department.recent_executions.length })}
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'risks' && renderRisksTab()}
            {activeTab === 'controls' && renderControlsTab()}
            {activeTab === 'kris' && renderKrisTab()}
            {activeTab === 'users' && renderUsersTab()}
            {activeTab === 'activity' && renderActivityTab()}
        </div>
    );
}

export default DepartmentDetailPage;
