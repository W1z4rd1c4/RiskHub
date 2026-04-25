import { Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Pagination, SortableTable } from '@/components/tables';
import { formatDateValue } from '@/i18n/formatters';
import { useTranslation } from '@/i18n/hooks';
import { DEPARTMENT_PAGE_SIZE, type DeptUser, type TabView } from '@/hooks/useDepartmentDetail';
import { KRI_MONITORING_FILTER_VALUES } from '@/lib/monitoringStatus';
import type { ControlSummary } from '@/types/control';
import type { KeyRiskIndicator, KRIMonitoringStatus } from '@/types/kri';
import type { RiskSummary } from '@/types/risk';
import type { DepartmentDetail } from '@/services/departmentApi';

import {
    getControlColumns,
    getKriColumns,
    getResultIcon,
    getRiskColumns,
    getUserColumns,
} from './departmentDetailColumns';

interface DepartmentTabContentProps {
    activeTab: TabView;
    controls: ControlSummary[];
    controlPage: number;
    controlTotalPages: number;
    department: DepartmentDetail;
    getRiskCount: () => number;
    kris: KeyRiskIndicator[];
    kriFilter: 'all' | KRIMonitoringStatus;
    kriPage: number;
    kriTotalPages: number;
    riskFilter: 'all' | 'high';
    riskPage: number;
    risks: RiskSummary[];
    riskTotalPages: number;
    setControlPage: (page: number) => void;
    setKriFilter: (filter: 'all' | KRIMonitoringStatus) => void;
    setKriPage: (page: number) => void;
    setRiskPage: (page: number) => void;
    setUserPage: (page: number) => void;
    users: DeptUser[];
    userPage: number;
    userTotalPages: number;
}

function KriFilterBar({
    kriFilter,
    setKriFilter,
    setKriPage,
}: Pick<DepartmentTabContentProps, 'kriFilter' | 'setKriFilter' | 'setKriPage'>) {
    const { t } = useTranslation(['common', 'kris']);

    return (
        <div className="flex gap-2 flex-wrap items-center">
            {(['all', ...KRI_MONITORING_FILTER_VALUES] as Array<'all' | KRIMonitoringStatus>).map((filter) => (
                <button
                    key={filter}
                    onClick={() => {
                        setKriFilter(filter);
                        setKriPage(1);
                    }}
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
    );
}

function resultBadgeClassName(result: string) {
    switch (result) {
        case 'passed':
            return 'bg-emerald-500/20 text-emerald-400';
        case 'failed':
            return 'bg-rose-500/20 text-rose-400';
        case 'warning':
            return 'bg-amber-500/20 text-amber-400';
        default:
            return 'bg-slate-500/20 text-slate-400';
    }
}

function RecentActivityTab({ department }: { department: DepartmentDetail }) {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation(['common']);

    return (
        <div className="glass-card !p-0 overflow-hidden">
            {department.recent_executions.length === 0 ? (
                <div className="p-12 text-center">
                    <Calendar className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-500">{t('common:empty.no_recent_executions')}</p>
                </div>
            ) : (
                <div className="divide-y divide-white/5">
                    {department.recent_executions.map((execution) => (
                        <button
                            key={execution.id}
                            type="button"
                            className="w-full px-6 py-4 hover:bg-white/5 cursor-pointer flex items-center justify-between text-left"
                            onClick={() => navigate(`/controls/${execution.control_id}`)}
                        >
                            <div className="flex items-center gap-4">
                                {getResultIcon(execution.result)}
                                <div>
                                    <p className="text-sm font-bold text-white">{execution.control_name}</p>
                                    <p className="text-xs text-slate-500">
                                        {t('common:labels.by')} {execution.executed_by} •{' '}
                                        {formatDateValue(execution.executed_at, i18n.language)}
                                    </p>
                                </div>
                            </div>
                            <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${resultBadgeClassName(
                                    execution.result,
                                )}`}
                            >
                                {execution.result === 'not_applicable' ? 'N/A' : execution.result}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export function DepartmentTabContent(props: DepartmentTabContentProps) {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation(['common']);
    const {
        activeTab,
        controls,
        controlPage,
        controlTotalPages,
        department,
        getRiskCount,
        kris,
        kriFilter,
        kriPage,
        kriTotalPages,
        riskFilter,
        riskPage,
        risks,
        riskTotalPages,
        setControlPage,
        setKriFilter,
        setKriPage,
        setRiskPage,
        setUserPage,
        users,
        userPage,
        userTotalPages,
    } = props;

    if (activeTab === 'risks') {
        return (
            <div className="space-y-4">
                <SortableTable
                    data={risks}
                    columns={getRiskColumns(t)}
                    keyExtractor={(risk) => risk.id}
                    onRowClick={(risk) => navigate(`/risks/${risk.id}`)}
                    emptyMessage={
                        riskFilter === 'high' ? t('common:empty.no_high_risk_items') : t('common:empty.no_risks_found')
                    }
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
    }

    if (activeTab === 'controls') {
        return (
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
    }

    if (activeTab === 'kris') {
        return (
            <div className="space-y-4">
                <KriFilterBar kriFilter={kriFilter} setKriFilter={setKriFilter} setKriPage={setKriPage} />
                <SortableTable
                    data={kris}
                    columns={getKriColumns(t, i18n.language)}
                    keyExtractor={(kri) => kri.id}
                    onRowClick={(kri) => navigate(`/kris/${kri.id}`)}
                    emptyMessage={
                        kriFilter === 'breach'
                            ? t('common:empty.no_kris_breach')
                            : t('common:empty.no_kris_department')
                    }
                />
                {kriTotalPages > 1 && (
                    <Pagination
                        currentPage={kriPage}
                        totalPages={kriTotalPages}
                        totalItems={kriFilter === 'all' ? department.kri_count : department.kri_monitoring_counts?.[kriFilter] ?? 0}
                        itemsPerPage={DEPARTMENT_PAGE_SIZE}
                        onPageChange={setKriPage}
                    />
                )}
            </div>
        );
    }

    if (activeTab === 'users') {
        return (
            <div className="space-y-4">
                <SortableTable
                    data={users}
                    columns={getUserColumns(t)}
                    keyExtractor={(user) => user.id}
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
    }

    return <RecentActivityTab department={department} />;
}
