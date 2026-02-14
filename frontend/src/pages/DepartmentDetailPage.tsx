import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import {
    ArrowLeft,
    Building2,
    Users,
    ShieldAlert,
    Shield,
    AlertCircle,
    RefreshCw,
    Calendar,
    CheckCircle,
    XCircle,
    MinusCircle,
    Target,
    TrendingDown,
} from 'lucide-react';
import { SortableTable, Pagination, type Column } from '@/components/tables';
import {
    useDepartmentDetail,
    DEPARTMENT_PAGE_SIZE,
    HIGH_RISK_MIN_NET_SCORE,
    type TabView,
    type DeptUser,
} from '@/hooks/useDepartmentDetail';
import type { RiskSummary } from '@/types/risk';
import type { ControlSummary } from '@/types/control';
import type { KeyRiskIndicator } from '@/types/kri';

// ─────────────────────────────────────────────────────────────────────────────
// Column Definitions
// ─────────────────────────────────────────────────────────────────────────────

const getRiskColumns = (t: (key: string, fallback?: string) => string): Column<RiskSummary>[] => [
    {
        key: 'name',
        label: t('common:labels.risk_name', 'Risk Name'),
        sortable: true,
        render: (risk) => <span className="font-medium text-white">{risk.name}</span>,
    },
    {
        key: 'description',
        label: t('common:labels.description', 'Description'),
        sortable: false,
        render: (risk) => (
            <span className="text-slate-400 text-xs line-clamp-2 max-w-xs">
                {risk.description || '—'}
            </span>
        ),
    },
    { key: 'process', label: t('common:labels.process', 'Process'), sortable: true },
    { key: 'category', label: t('common:labels.category', 'Category'), sortable: true },
    {
        key: 'risk_type',
        label: t('common:labels.type', 'Type'),
        sortable: true,
        render: (risk) => (
            <span className="text-slate-400 capitalize">{risk.risk_type || '—'}</span>
        ),
    },
    {
        key: 'status',
        label: t('common:labels.status', 'Status'),
        sortable: true,
        render: (risk) => (
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${risk.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                risk.status === 'emerging' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-slate-500/20 text-slate-400'
                }`}>
                {risk.status}
            </span>
        ),
    },
    {
        key: 'gross_score',
        label: t('common:labels.gross', 'Gross'),
        sortable: true,
        render: (risk) => (
            <span className={`text-sm font-black ${risk.gross_score >= 16 ? 'text-rose-400' :
                risk.gross_score >= 10 ? 'text-orange-400' :
                    risk.gross_score >= 5 ? 'text-amber-400' :
                        'text-emerald-400'
                }`}>
                {risk.gross_score}
            </span>
        ),
    },
    {
        key: 'net_score',
        label: t('common:labels.net', 'Net'),
        sortable: true,
        render: (risk) => (
            <span className={`text-sm font-black ${risk.net_score >= 16 ? 'text-rose-400' :
                risk.net_score >= 10 ? 'text-orange-400' :
                    risk.net_score >= 5 ? 'text-amber-400' :
                        'text-emerald-400'
                }`}>
                {risk.net_score}
            </span>
        ),
    },
];

const getControlColumns = (t: (key: string, fallback?: string) => string): Column<ControlSummary>[] => [
    {
        key: 'name',
        label: t('common:labels.name', 'Name'),
        sortable: true,
        render: (control) => <span className="font-medium text-white">{control.name}</span>,
    },
    {
        key: 'description',
        label: t('common:labels.description', 'Description'),
        sortable: false,
        render: (control) => (
            <span className="text-slate-400 text-xs line-clamp-2 max-w-xs">
                {control.description || '—'}
            </span>
        ),
    },
    {
        key: 'control_owner_name',
        label: t('common:labels.owner', 'Owner'),
        sortable: true,
        render: (control) => (
            <span className="text-slate-300">{control.control_owner_name || '—'}</span>
        ),
    },
    { key: 'control_form', label: t('common:labels.form', 'Form'), sortable: true },
    { key: 'frequency', label: t('common:labels.frequency', 'Frequency'), sortable: true },
    {
        key: 'status',
        label: t('common:labels.status', 'Status'),
        sortable: true,
        render: (control) => (
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${control.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                'bg-slate-500/20 text-slate-400'
                }`}>
                {control.status}
            </span>
        ),
    },
];

const getKriColumns = (t: (key: string, fallback?: string) => string): Column<KeyRiskIndicator>[] => [
    {
        key: 'metric_name',
        label: t('common:labels.name', 'Name'),
        sortable: true,
        render: (kri) => <span className="font-medium text-white">{kri.metric_name}</span>,
    },
    {
        key: 'description',
        label: t('common:labels.description', 'Description'),
        sortable: false,
        render: (kri) => (
            <span className="text-slate-400 text-xs line-clamp-2 max-w-xs">
                {kri.description || '—'}
            </span>
        ),
    },
    {
        key: 'reporting_owner_name',
        label: t('common:labels.owner', 'Owner'),
        sortable: true,
        render: (kri) => (
            <span className="text-slate-300">{kri.reporting_owner_name || kri.risk_owner_name || '—'}</span>
        ),
    },
    {
        key: 'lower_limit',
        label: t('common:labels.limits', 'Limits'),
        sortable: false,
        render: (kri) => (
            <span className="text-slate-400 text-xs font-mono">
                {kri.lower_limit.toLocaleString()} – {kri.upper_limit.toLocaleString()} {kri.unit}
            </span>
        ),
    },
    {
        key: 'current_value',
        label: t('common:labels.value', 'Value'),
        sortable: true,
        render: (kri) => (
            <span className={`text-sm font-black ${kri.breach_status !== 'within' ? 'text-rose-400' : 'text-emerald-400'
                }`}>
                {kri.current_value.toLocaleString()} <span className="text-slate-500 font-normal text-xs">{kri.unit}</span>
            </span>
        ),
    },
    {
        key: 'breach_status',
        label: t('common:labels.status', 'Status'),
        sortable: true,
        render: (kri) => (
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${kri.breach_status === 'within' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                }`}>
                {kri.breach_status === 'within' ? 'OK' : 'Breach'}
            </span>
        ),
    },
    {
        key: 'frequency',
        label: t('common:labels.frequency', 'Frequency'),
        sortable: true,
        render: (kri) => (
            <span className="text-slate-400 capitalize">{kri.frequency || '—'}</span>
        ),
    },
];

const getUserColumns = (t: (key: string, fallback?: string) => string): Column<DeptUser>[] => [
    { key: 'name', label: t('common:labels.name', 'Name'), sortable: true, render: (u) => <span className="text-white font-medium">{u.name}</span> },
    { key: 'email', label: t('common:labels.email', 'Email'), sortable: true },
    {
        key: 'role_name',
        label: t('common:labels.role', 'Role'),
        sortable: true,
        render: (u) => <span className="px-2 py-0.5 rounded-md bg-white/10 text-slate-300 text-[10px] uppercase font-bold">{u.role_name || 'Unknown'}</span>
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function getResultIcon(result: string) {
    switch (result) {
        case 'passed':
            return <CheckCircle className="h-4 w-4 text-emerald-400" />;
        case 'failed':
            return <XCircle className="h-4 w-4 text-rose-400" />;
        case 'warning':
            return <AlertCircle className="h-4 w-4 text-amber-400" />;
        case 'not_applicable':
            return <MinusCircle className="h-4 w-4 text-slate-400" />;
        default:
            return <MinusCircle className="h-4 w-4 text-slate-400" />;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function DepartmentDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const { t } = useTranslation(['common', 'dashboard']);

    // UI state (kept in page for tab/pagination control)
    const [activeTab, setActiveTab] = useState<TabView>('risks');
    const [riskFilter, setRiskFilter] = useState<'all' | 'high'>('all');
    const [kriFilter, setKriFilter] = useState<'all' | 'breach'>('all');
    const [riskPage, setRiskPage] = useState(1);
    const [controlPage, setControlPage] = useState(1);
    const [kriPage, setKriPage] = useState(1);
    const [userPage, setUserPage] = useState(1);

    // Reset risk page when filter or department changes
    useEffect(() => {
        setRiskPage(1);
    }, [riskFilter, id]);

    // Reset KRI page when filter changes
    useEffect(() => {
        setKriPage(1);
    }, [kriFilter, id]);

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

    // Compute breach count from kris (or from department if available)
    const getKriBreachCount = () => {
        if (!department) return 0;
        // Use kris array if on kris tab, otherwise estimate from department
        return kris.filter(k => k.breach_status !== 'within').length;
    };

    // Filter KRIs based on kriFilter state
    const filteredKris = kriFilter === 'breach'
        ? kris.filter(k => k.breach_status !== 'within')
        : kris;

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
                    <p className="font-medium">{error || 'Department not found'}</p>
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
                emptyMessage={riskFilter === 'high' ? 'No high-risk items found.' : 'No risks found for this department.'}
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
                emptyMessage="No controls found for this department."
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
            <SortableTable
                data={filteredKris}
                columns={getKriColumns(t)}
                keyExtractor={(kri) => kri.id}
                onRowClick={(kri) => navigate(`/kris/${kri.id}`)}
                emptyMessage={kriFilter === 'breach'
                    ? t('common:empty.no_kris_breach', 'No KRIs are currently in breach.')
                    : t('common:empty.no_kris_department', 'No KRIs found for this department.')}
            />
            {kriTotalPages > 1 && (
                <Pagination
                    currentPage={kriPage}
                    totalPages={kriTotalPages}
                    totalItems={department.kri_count}
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
                onRowClick={(u) => navigate(`/users/${u.id}`)}
                emptyMessage="No users found for this department."
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
                                        by {execution.executed_by} • {new Date(execution.executed_at).toLocaleDateString()}
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
                        <p className="text-xs text-slate-500 uppercase tracking-wider">{t('common:labels.risk', 'Risks')}</p>
                    </div>
                    <p className="text-3xl font-black text-white">{department.risk_count}</p>
                </div>
                <div
                    onClick={() => setActiveTab('controls')}
                    className={`glass-card cursor-pointer hover:bg-white/5 transition-all group ${activeTab === 'controls' ? 'border-accent/50 bg-accent/5' : ''}`}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <Shield className="h-5 w-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                        <p className="text-xs text-slate-500 uppercase tracking-wider">{t('common:labels.control', 'Controls')}</p>
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
                    title={t('dashboard:kri_breaches', 'KRI Breaches')}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <TrendingDown className="h-5 w-5 text-rose-400 group-hover:scale-110 transition-transform" />
                        <p className="text-xs text-slate-500 uppercase tracking-wider">{t('dashboard:kri_breaches', 'KRI Breaches')}</p>
                    </div>
                    <p className="text-3xl font-black text-rose-400">{getKriBreachCount()}</p>
                </div>
                <div
                    onClick={() => setActiveTab('users')}
                    className={`glass-card cursor-pointer hover:bg-white/5 transition-all group ${activeTab === 'users' ? 'border-accent/50 bg-accent/5' : ''}`}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <Users className="h-5 w-5 text-blue-400 group-hover:scale-110 transition-transform" />
                        <p className="text-xs text-slate-500 uppercase tracking-wider">{t('dashboard:active_users', 'Active Users')}</p>
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
                        <p className="text-xs text-slate-500 uppercase tracking-wider">{t('dashboard:high_risk', 'High Risk')}</p>
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
