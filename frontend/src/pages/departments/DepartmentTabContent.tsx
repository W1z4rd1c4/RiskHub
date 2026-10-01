import type { ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';

import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { TabPanel } from '@/components/ui/tabs';
import { useFormat, useTranslation } from '@/i18n/hooks';
import type { TabView } from '@/hooks/useDepartmentDetail';
import { ActivityLogPage } from '@/pages/ActivityLogPage';
import { AssetsPage } from '@/pages/AssetsPage';
import { ControlsPage } from '@/pages/ControlsPage';
import { IssuesPage } from '@/pages/IssuesPage';
import { KRIsPage } from '@/pages/KRIsPage';
import { ProcessesPage } from '@/pages/ProcessesPage';
import { RisksPage } from '@/pages/RisksPage';
import { UsersPage } from '@/pages/UsersPage';
import { VendorsPage } from '@/pages/VendorsPage';
import type { RegisterFilters } from '@/pages/shared/registerListQuery';
import type { DepartmentDetail } from '@/services/departmentApi';

import { DEPARTMENT_TABS_ID_PREFIX } from './DepartmentDetailTabs';
import { DepartmentRegisterScopeProvider } from './DepartmentRegisterScope';
import { DepartmentStatsGrid } from './DepartmentStatsGrid';

interface DepartmentTabContentProps {
    activeTab: TabView;
    department: DepartmentDetail;
    onSelectTab: (tab: TabView, filters?: RegisterFilters) => void;
}

const REGISTER_TABS: Partial<Record<TabView, ComponentType>> = {
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
    const { t } = useTranslation('common');
    const format = useFormat();
    const navigate = useNavigate();
    const RegisterPage = REGISTER_TABS[activeTab];
    const recentExecutions = department.recent_executions;

    return (
        <TabPanel tab={activeTab} activeTab={activeTab} idPrefix={DEPARTMENT_TABS_ID_PREFIX}>
            {activeTab === 'overview' ? (
                <div className="space-y-6">
                    <DepartmentStatsGrid department={department} onSelectTab={onSelectTab} />
                    <Card data-testid="department-overview-activity">
                        <CardHeader title={t('department_detail.recent_activity.title')} />
                        <CardBody>
                            {recentExecutions === null && (
                                <p className="text-sm text-muted-foreground">{t('fallbacks.not_available')}</p>
                            )}
                            {recentExecutions?.length === 0 && (
                                <p className="text-sm text-muted-foreground">{t('department_detail.recent_activity.empty')}</p>
                            )}
                            {recentExecutions && recentExecutions.length > 0 && (
                                <ul className="divide-y divide-border">
                                    {recentExecutions.map((entry) => (
                                        <li key={entry.id}>
                                            <button
                                                type="button"
                                                className="flex w-full items-center justify-between py-3 text-left text-sm text-foreground"
                                                onClick={() => navigate(`/controls/${entry.control_id}`)}
                                            >
                                                <span>
                                                    <strong>{entry.control_name}</strong>
                                                    <span className="ml-2 text-xs text-muted-foreground">
                                                        {t('labels.by')} {entry.executed_by} · {format.date(entry.executed_at)}
                                                    </span>
                                                </span>
                                                <span className="text-xs uppercase text-muted-foreground">{entry.result}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardBody>
                    </Card>
                </div>
            ) : RegisterPage ? (
                <DepartmentRegisterScopeProvider
                    value={{ departmentId: department.id, departmentName: department.name }}
                >
                    <RegisterPage />
                </DepartmentRegisterScopeProvider>
            ) : null}
        </TabPanel>
    );
}
