import { useParams, useSearchParams } from 'react-router-dom';

import { BackButton } from '@/components/ui/BackButton';
import { AccessDeniedState, ErrorState, LoadingState, Skeleton } from '@/components/ui/state';
import { useTranslation } from '@/i18n/hooks';
import { useDepartmentDetail, type TabView } from '@/hooks/useDepartmentDetail';
import type { RegisterFilters } from './shared/registerListQuery';

import { DepartmentDetailHeader } from './departments/DepartmentDetailHeader';
import { DepartmentDetailTabs } from './departments/DepartmentDetailTabs';
import { DepartmentTabContent } from './departments/DepartmentTabContent';
import { resolveRegisterReturnTo } from './shared/registerReturnContext';

const DEPARTMENT_TABS: readonly TabView[] = [
    'overview',
    'risks',
    'controls',
    'kris',
    'issues',
    'processes',
    'assets',
    'vendors',
    'users',
    'activity',
];

function parseTab(value: string | null): TabView {
    return DEPARTMENT_TABS.includes(value as TabView) ? value as TabView : 'overview';
}

export function DepartmentDetailPage() {
    const { id } = useParams<{ id: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const { t } = useTranslation(['common']);
    const returnTo = resolveRegisterReturnTo(searchParams.get('return_to'), '/departments');
    const activeTab = parseTab(searchParams.get('tab'));
    const departmentId = id ? Number(id) : undefined;
    const {
        department,
        isLoading,
        isAccessDenied,
        error,
        refresh,
    } = useDepartmentDetail({
        departmentId,
        activeTab: 'overview',
        canViewUsers: false,
        riskFilter: 'all',
        kriFilter: 'all',
        riskPage: 1,
        controlPage: 1,
        kriPage: 1,
        userPage: 1,
    });

    const selectTab = (tab: TabView, filters?: RegisterFilters) => {
        const next = new URLSearchParams(searchParams);
        next.set('tab', tab);
        next.delete('page');
        next.delete('group');
        next.delete('filters');
        if (filters && Object.keys(filters).length > 0) {
            next.set('filters', JSON.stringify(filters));
        }
        setSearchParams(next);
    };

    if (isLoading) {
        return <LoadingState label={t('loading.data')} skeleton={<Skeleton className="h-40 rounded-2xl" />} />;
    }
    if (isAccessDenied) return <AccessDeniedState />;
    if (error || !department) {
        return (
            <ErrorState
                layout="page"
                message={error ? t(error, { ns: 'common' }) : t('not_found', { ns: 'errorKeys' })}
                onRetry={error ? refresh : undefined}
                actions={<BackButton label={t('department_detail.back_to_departments')} to={returnTo} />}
            />
        );
    }

    return (
        <div className="space-y-8">
            <DepartmentDetailHeader
                department={department}
                returnTo={returnTo}
                onRefresh={refresh}
            />
            <DepartmentDetailTabs
                activeTab={activeTab}
                onSelectTab={selectTab}
            />
            <DepartmentTabContent
                activeTab={activeTab}
                department={department}
                onSelectTab={selectTab}
            />
        </div>
    );
}

export default DepartmentDetailPage;
