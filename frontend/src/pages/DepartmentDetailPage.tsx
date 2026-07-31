import { AlertCircle } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useTranslation } from '@/i18n/hooks';
import { useDepartmentDetail, type TabView } from '@/hooks/useDepartmentDetail';
import type { RegisterFilters } from './shared/registerListQuery';

import { DepartmentDetailHeader } from './departments/DepartmentDetailHeader';
import { DepartmentDetailTabs } from './departments/DepartmentDetailTabs';
import { DepartmentTabContent } from './departments/DepartmentTabContent';
import { ReadAccessDeniedState } from './shared/ReadAccessDeniedState';

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
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { t } = useTranslation(['common']);
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
        if (filters) next.set('filters', JSON.stringify(filters));
        setSearchParams(next);
    };

    if (isLoading) {
        return <div className="glass-card animate-pulse h-40" aria-label={t('loading.data')} />;
    }
    if (isAccessDenied) return <ReadAccessDeniedState />;
    if (error || !department) {
        return (
            <div className="glass-card border-rose-500/50 bg-rose-500/10">
                <div className="flex items-center gap-3 text-rose-400">
                    <AlertCircle className="h-5 w-5" aria-hidden="true" />
                    <p className="font-medium">
                        {error ? t(error, { ns: 'common' }) : t('not_found', { ns: 'errorKeys' })}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <DepartmentDetailHeader
                department={department}
                onBack={() => navigate('/departments')}
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
