import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { departmentApi, type DepartmentDetail } from '@/services/departmentApi';
import { userApi } from '@/services/userApi';
import { SortableTable, type Column } from '@/components/tables';
import type { RiskSummary } from '@/types/risk';
import type { ControlSummary } from '@/types/control';
import type { KeyRiskIndicator } from '@/types/kri';

// Simplified user type for scoped lookup
interface DeptUser {
    id: number;
    name: string;
    email: string;
    role_name?: string;
    department_id?: number;
}

type TabView = 'risks' | 'controls' | 'kris' | 'activity' | 'users';

export function DepartmentDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [department, setDepartment] = useState<DepartmentDetail | null>(null);
    const [risks, setRisks] = useState<RiskSummary[]>([]);
    const [controls, setControls] = useState<ControlSummary[]>([]);
    const [kris, setKris] = useState<KeyRiskIndicator[]>([]);
    const [users, setUsers] = useState<DeptUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabView>('risks');
    const [riskFilter, setRiskFilter] = useState<'all' | 'high'>('all');

    const fetchDepartmentData = async () => {
        if (!id) return;

        try {
            setIsLoading(true);
            setError(null);

            const deptId = parseInt(id);
            const pageSize = 500; // Larger batches for efficiency

            // Helper to fetch all pages
            const fetchAllPages = async <T,>(
                fetcher: (skip: number, limit: number) => Promise<T[]>
            ): Promise<T[]> => {
                const allItems: T[] = [];
                let skip = 0;
                while (true) {
                    const batch = await fetcher(skip, pageSize);
                    allItems.push(...batch);
                    if (batch.length < pageSize) break;
                    skip += pageSize;
                }
                return allItems;
            };

            const [deptData, risksData, controlsData, krisData, usersData] = await Promise.all([
                departmentApi.getDepartment(deptId),
                fetchAllPages<RiskSummary>((skip, limit) => departmentApi.getDepartmentRisks(deptId, { skip, limit })),
                fetchAllPages<ControlSummary>((skip, limit) => departmentApi.getDepartmentControls(deptId, { skip, limit })),
                fetchAllPages<KeyRiskIndicator>((skip, limit) => departmentApi.getDepartmentKRIs(deptId, { skip, limit })),
                fetchAllPages<DeptUser>((skip, limit) => userApi.listVisibleUsers({ skip, limit })),
            ]);
            setDepartment(deptData);
            setRisks(risksData);
            setControls(controlsData);
            setKris(krisData);
            // Filter users by department client-side (listVisibleUsers returns scoped data)
            setUsers(usersData.filter(u => u.department_id === deptId));
        } catch (err) {
            setError('Failed to load department details');
            console.error('Error fetching department:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchDepartmentData();
    }, [id]);

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

    const riskColumns: Column<RiskSummary>[] = [
        { key: 'process', label: 'Process', sortable: true },
        { key: 'category', label: 'Category', sortable: true },
        {
            key: 'status',
            label: 'Status',
            sortable: true,
            render: (risk) => (
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${risk.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                    risk.status === 'monitoring' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-slate-500/20 text-slate-400'
                    }`}>
                    {risk.status}
                </span>
            ),
        },
        {
            key: 'gross_score',
            label: 'Gross',
            sortable: true,
            render: (risk) => (
                <div className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${risk.gross_score >= 16 ? 'border-rose-500 text-rose-400' :
                    risk.gross_score >= 10 ? 'border-orange-500 text-orange-400' :
                        risk.gross_score >= 5 ? 'border-amber-500 text-amber-400' :
                            'border-emerald-500 text-emerald-400'
                    }`}>
                    {risk.gross_score}
                </div>
            ),
        },
        {
            key: 'net_score',
            label: 'Net',
            sortable: true,
            render: (risk) => (
                <div className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${risk.net_score >= 16 ? 'border-rose-500 text-rose-400' :
                    risk.net_score >= 10 ? 'border-orange-500 text-orange-400' :
                        risk.net_score >= 5 ? 'border-amber-500 text-amber-400' :
                            'border-emerald-500 text-emerald-400'
                    }`}>
                    {risk.net_score}
                </div>
            ),
        },
    ];

    const controlColumns: Column<ControlSummary>[] = [
        { key: 'name', label: 'Control Name', sortable: true },
        { key: 'control_form', label: 'Form', sortable: true },
        { key: 'frequency', label: 'Frequency', sortable: true },
        {
            key: 'status',
            label: 'Status',
            sortable: true,
            render: (control) => (
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${control.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                    'bg-slate-500/20 text-slate-400'
                    }`}>
                    {control.status}
                </span>
            ),
        },
        {
            key: 'risk_level',
            label: 'Risk Level',
            sortable: true,
            render: (control) => (
                <div className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${control.risk_level >= 4 ? 'border-rose-500 text-rose-400' :
                    control.risk_level >= 3 ? 'border-amber-500 text-amber-400' :
                        'border-emerald-500 text-emerald-400'
                    }`}>
                    {control.risk_level}/5
                </div>
            ),
        },
    ];

    const kriColumns: Column<KeyRiskIndicator>[] = [
        {
            key: 'metric_name',
            label: 'Metric',
            sortable: true,
            render: (kri) => <span className="font-medium text-white">{kri.metric_name}</span>,
        },
        {
            key: 'current_value',
            label: 'Value',
            sortable: true,
            render: (kri) => (
                <span className={`font-black ${kri.breach_status !== 'within' ? 'text-rose-400' : 'text-white'}`}>
                    {kri.current_value.toLocaleString('cs-CZ')} <span className="text-slate-500 font-normal text-xs">{kri.unit}</span>
                </span>
            ),
        },
        {
            key: 'breach_status',
            label: 'Status',
            sortable: true,
            render: (kri) => (
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${kri.breach_status === 'within' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                    }`}>
                    {kri.breach_status === 'within' ? 'OK' : 'Breach'}
                </span>
            ),
        },
    ];

    const userColumns: Column<DeptUser>[] = [
        { key: 'name', label: 'Name', sortable: true, render: (u) => <span className="text-white font-medium">{u.name}</span> },
        { key: 'email', label: 'Email', sortable: true },
        {
            key: 'role_name',
            label: 'Role',
            sortable: true,
            render: (u) => <span className="px-2 py-0.5 rounded-md bg-white/10 text-slate-300 text-[10px] uppercase font-bold">{u.role_name || 'Unknown'}</span>
        },
    ];

    const getResultIcon = (result: string) => {
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
    };

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
                    onClick={fetchDepartmentData}
                    className="px-4 py-2 glass rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                >
                    <RefreshCw className="h-5 w-5" />
                </button>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-5 gap-6">
                <div
                    onClick={() => { setActiveTab('risks'); setRiskFilter('all'); }}
                    className={`glass-card cursor-pointer hover:bg-white/5 transition-all group ${activeTab === 'risks' && riskFilter === 'all' ? 'border-accent/50 bg-accent/5' : ''}`}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <ShieldAlert className="h-5 w-5 text-amber-400 group-hover:scale-110 transition-transform" />
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Total Risks</p>
                    </div>
                    <p className="text-3xl font-black text-white">{department.risk_count}</p>
                </div>
                <div
                    onClick={() => setActiveTab('controls')}
                    className="glass-card cursor-pointer hover:bg-white/5 transition-all group"
                >
                    <div className="flex items-center gap-3 mb-2">
                        <Shield className="h-5 w-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Total Controls</p>
                    </div>
                    <p className="text-3xl font-black text-white">{department.control_count}</p>
                </div>
                <div
                    onClick={() => setActiveTab('kris')}
                    className="glass-card cursor-pointer hover:bg-white/5 transition-all group"
                >
                    <div className="flex items-center gap-3 mb-2">
                        <Target className="h-5 w-5 text-accent group-hover:scale-110 transition-transform" />
                        <p className="text-xs text-slate-500 uppercase tracking-wider">KRIs</p>
                    </div>
                    <p className="text-3xl font-black text-white">{department.kri_count}</p>
                </div>
                <div
                    onClick={() => setActiveTab('users')}
                    className="glass-card cursor-pointer hover:bg-white/5 transition-all group"
                >
                    <div className="flex items-center gap-3 mb-2">
                        <Users className="h-5 w-5 text-blue-400 group-hover:scale-110 transition-transform" />
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Active Users</p>
                    </div>
                    <p className="text-3xl font-black text-white">{department.user_count}</p>
                </div>
                <div
                    onClick={() => { setActiveTab('risks'); setRiskFilter('high'); }}
                    className={`glass-card cursor-pointer hover:bg-white/5 transition-all group ${activeTab === 'risks' && riskFilter === 'high' ? 'border-rose-500/50 bg-rose-500/5' : ''}`}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <AlertCircle className="h-5 w-5 text-rose-400 group-hover:scale-110 transition-transform" />
                        <p className="text-xs text-slate-500 uppercase tracking-wider">High Risk</p>
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
                    Risks ({riskFilter === 'high' ? risks.filter(r => r.gross_score >= 10 || r.net_score >= 10).length : risks.length})
                </button>
                <button
                    onClick={() => setActiveTab('users')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'users'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    Users ({users.length})
                </button>
                <button
                    onClick={() => setActiveTab('controls')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'controls'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    Controls ({controls.length})
                </button>
                <button
                    onClick={() => setActiveTab('kris')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'kris'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    KRIs ({kris.length})
                </button>
                <button
                    onClick={() => setActiveTab('activity')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'activity'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    Recent Activity ({department.recent_executions.length})
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'risks' && (
                <SortableTable
                    data={riskFilter === 'high' ? risks.filter(r => r.gross_score >= 10 || r.net_score >= 10) : risks}
                    columns={riskColumns}
                    keyExtractor={(risk) => risk.id}
                    onRowClick={(risk) => navigate(`/risks/${risk.id}`)}
                    emptyMessage="No risks found for this department."
                />
            )}

            {activeTab === 'controls' && (
                <SortableTable
                    data={controls}
                    columns={controlColumns}
                    keyExtractor={(control) => control.id}
                    onRowClick={(control) => navigate(`/controls/${control.id}`)}
                    emptyMessage="No controls found for this department."
                />
            )}

            {activeTab === 'kris' && (
                <SortableTable
                    data={kris}
                    columns={kriColumns}
                    keyExtractor={(kri) => kri.id}
                    onRowClick={(kri) => navigate(`/kris/${kri.id}`)}
                    emptyMessage="No KRIs found for this department."
                />
            )}

            {activeTab === 'users' && (
                <SortableTable
                    data={users}
                    columns={userColumns}
                    keyExtractor={(u) => u.id}
                    onRowClick={(u) => navigate(`/users/${u.id}`)}
                    emptyMessage="No users found for this department."
                />
            )}

            {activeTab === 'activity' && (
                <div className="glass-card !p-0 overflow-hidden">
                    {department.recent_executions.length === 0 ? (
                        <div className="p-12 text-center">
                            <Calendar className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                            <p className="text-slate-500">No recent control executions</p>
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
            )}
        </div>
    );
}
