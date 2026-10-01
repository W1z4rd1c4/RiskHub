import { TabList, type TabItem } from '@/components/ui/tabs';
import { useTranslation } from '@/i18n/hooks';
import type { TabView } from '@/hooks/useDepartmentDetail';

interface DepartmentDetailTabsProps {
    activeTab: TabView;
    onSelectTab: (tab: TabView) => void;
}

/** Tab / panel id prefix shared with `DepartmentTabContent`. */
export const DEPARTMENT_TABS_ID_PREFIX = 'department';

export function DepartmentDetailTabs({
    activeTab,
    onSelectTab,
}: DepartmentDetailTabsProps) {
    const { t } = useTranslation(['common']);

    const tabs: Array<TabItem<TabView>> = [
        { id: 'overview', label: t('department_detail.tabs.overview') },
        { id: 'risks', label: t('department_detail.tabs.risks') },
        { id: 'controls', label: t('department_detail.tabs.controls') },
        { id: 'kris', label: t('department_detail.tabs.kris') },
        { id: 'issues', label: t('department_detail.tabs.issues') },
        { id: 'processes', label: t('department_detail.tabs.processes') },
        { id: 'assets', label: t('department_detail.tabs.assets') },
        { id: 'vendors', label: t('department_detail.tabs.vendors') },
        { id: 'users', label: t('department_detail.tabs.users') },
        { id: 'activity', label: t('department_detail.tabs.activity') },
    ];

    return (
        <TabList
            data-testid="department-detail-tabs"
            tabs={tabs}
            activeTab={activeTab}
            onChange={onSelectTab}
            idPrefix={DEPARTMENT_TABS_ID_PREFIX}
            ariaLabel={t('department_detail.tabs.label')}
        />
    );
}
