import { useTranslation } from '@/i18n/hooks';
import type { TabView } from '@/hooks/useDepartmentDetail';

interface DepartmentDetailTabsProps {
    activeTab: TabView;
    onSelectTab: (tab: TabView) => void;
}

const tabClassName = (isActive: boolean) =>
    `px-6 py-3 font-bold transition-colors ${
        isActive ? 'text-accent-text border-b-2 border-accent' : 'text-muted-foreground hover:text-foreground'
    }`;

export function DepartmentDetailTabs({
    activeTab,
    onSelectTab,
}: DepartmentDetailTabsProps) {
    const { t } = useTranslation(['common']);

    const tabs: Array<{ key: TabView; label: string }> = [
        { key: 'overview', label: t('department_detail.tabs.overview') },
        { key: 'risks', label: t('department_detail.tabs.risks') },
        { key: 'controls', label: t('department_detail.tabs.controls') },
        { key: 'kris', label: t('department_detail.tabs.kris') },
        { key: 'issues', label: t('department_detail.tabs.issues') },
        { key: 'processes', label: t('department_detail.tabs.processes') },
        { key: 'assets', label: t('department_detail.tabs.assets') },
        { key: 'vendors', label: t('department_detail.tabs.vendors') },
        { key: 'users', label: t('department_detail.tabs.users') },
        { key: 'activity', label: t('department_detail.tabs.activity') },
    ];

    return (
        <div
            data-testid="department-detail-tabs"
            className="flex items-center gap-2 overflow-x-auto border-b border-white/10"
            role="tablist"
            aria-label={t('department_detail.tabs.label')}
        >
            {tabs.map((tab) => (
                <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    id={`department-tab-${tab.key}`}
                    aria-controls={`department-panel-${tab.key}`}
                    aria-selected={activeTab === tab.key}
                    data-department-tab={tab.key}
                    onClick={() => onSelectTab(tab.key)}
                    className={tabClassName(activeTab === tab.key)}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}
