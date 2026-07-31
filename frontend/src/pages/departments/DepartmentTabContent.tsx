import { ActivityLogPage } from '@/pages/ActivityLogPage';
import { AssetsPage } from '@/pages/AssetsPage';
import { ControlsPage } from '@/pages/ControlsPage';
import { IssuesPage } from '@/pages/IssuesPage';
import { KRIsPage } from '@/pages/KRIsPage';
import { ProcessesPage } from '@/pages/ProcessesPage';
import { RisksPage } from '@/pages/RisksPage';
import { UsersPage } from '@/pages/UsersPage';
import { VendorsPage } from '@/pages/VendorsPage';
import type { TabView } from '@/hooks/useDepartmentDetail';
import { useTranslation } from '@/i18n/hooks';
import { formatDateValue } from '@/i18n/formatters';
import { useNavigate } from 'react-router-dom';
import type { DepartmentDetail } from '@/services/departmentApi';
import type { RegisterFilters } from '@/pages/shared/registerListQuery';

import { DepartmentRegisterScopeProvider } from './DepartmentRegisterScope';
import { DepartmentStatsGrid } from './DepartmentStatsGrid';

interface DepartmentTabContentProps {
    activeTab: TabView;
    department: DepartmentDetail;
    onSelectTab: (tab: TabView, filters?: RegisterFilters) => void;
}

const REGISTER_TABS: Partial<Record<TabView, () => JSX.Element>> = {
    risks: RisksPage,
    controls: ControlsPage,
    kris: KRIsPage,
    issues: IssuesPage,
    processes: ProcessesPage,
    assets: AssetsPage,
    vendors: VendorsPage,
    users: UsersPage,
    activity: ActivityLogPage,
};

export function DepartmentTabContent({
    activeTab,
    department,
    onSelectTab,
}: DepartmentTabContentProps) {
    const { t, i18n } = useTranslation('common');
    const navigate = useNavigate();
    const RegisterPage = REGISTER_TABS[activeTab];
    const recentExecutions = department.recent_executions;

    return (
        <section
            id={`department-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`department-tab-${activeTab}`}
            tabIndex={0}
        >
            {activeTab === 'overview' ? (
                <div className="space-y-6">
                    <DepartmentStatsGrid department={department} onSelectTab={onSelectTab} />
                    <div className="glass-card" data-testid="department-overview-activity">
                        <h2 className="mb-4 text-lg font-bold">{t('department_detail.recent_activity.title')}</h2>
                        {recentExecutions === null && (
                            <p className="text-sm text-slate-500">{t('fallbacks.not_available')}</p>
                        )}
                        {recentExecutions?.length === 0 && (
                            <p className="text-sm text-slate-500">{t('department_detail.recent_activity.empty')}</p>
                        )}
                        {recentExecutions && recentExecutions.length > 0 && (
                            <ul className="divide-y divide-white/5">
                                {recentExecutions.map((entry) => (
                                    <li key={entry.id}>
                                        <button
                                            type="button"
                                            className="flex w-full items-center justify-between py-3 text-left text-sm text-slate-300 hover:text-white"
                                            onClick={() => navigate(`/controls/${entry.control_id}`)}
                                        >
                                            <span>
                                                <strong>{entry.control_name}</strong>
                                                <span className="ml-2 text-xs text-slate-500">
                                                    {t('labels.by')} {entry.executed_by} · {formatDateValue(entry.executed_at, i18n.language)}
                                                </span>
                                            </span>
                                            <span className="text-xs uppercase text-slate-400">{entry.result}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            ) : RegisterPage ? (
                <DepartmentRegisterScopeProvider
                    value={{ departmentId: department.id, departmentName: department.name }}
                >
                    <RegisterPage />
                </DepartmentRegisterScopeProvider>
            ) : null}
        </section>
    );
}
