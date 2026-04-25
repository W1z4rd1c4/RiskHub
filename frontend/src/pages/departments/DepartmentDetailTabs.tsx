import { useTranslation } from '@/i18n/hooks';
import type { TabView } from '@/hooks/useDepartmentDetail';
import type { DepartmentDetail } from '@/services/departmentApi';

interface DepartmentDetailTabsProps {
    activeTab: TabView;
    department: DepartmentDetail;
    riskCount: number;
    onSelectTab: (tab: TabView) => void;
}

const tabClassName = (isActive: boolean) =>
    `px-6 py-3 font-bold transition-all ${
        isActive ? 'text-accent border-b-2 border-accent' : 'text-slate-500 hover:text-white'
    }`;

export function DepartmentDetailTabs({
    activeTab,
    department,
    riskCount,
    onSelectTab,
}: DepartmentDetailTabsProps) {
    const { t } = useTranslation(['common']);

    const tabs: Array<{ key: TabView; label: string }> = [
        { key: 'risks', label: t('department_detail.tabs.risks', { count: riskCount }) },
        { key: 'users', label: t('department_detail.tabs.users', { count: department.user_count }) },
        { key: 'controls', label: t('department_detail.tabs.controls', { count: department.control_count }) },
        { key: 'kris', label: t('department_detail.tabs.kris', { count: department.kri_count }) },
        {
            key: 'activity',
            label: t('department_detail.tabs.recent_activity', { count: department.recent_executions.length }),
        },
    ];

    return (
        <div className="flex items-center gap-2 border-b border-white/10">
            {tabs.map((tab) => (
                <button
                    key={tab.key}
                    onClick={() => onSelectTab(tab.key)}
                    className={tabClassName(activeTab === tab.key)}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}
