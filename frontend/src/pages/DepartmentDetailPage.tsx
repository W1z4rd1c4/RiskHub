import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { useTranslation } from '@/i18n/hooks';
import {
    useDepartmentDetail,
    type TabView,
} from '@/hooks/useDepartmentDetail';
import type { KRIMonitoringStatus } from '@/types/kri';

import { DepartmentDetailHeader } from './departments/DepartmentDetailHeader';
import { DepartmentDetailTabs } from './departments/DepartmentDetailTabs';
import { DepartmentStatsGrid } from './departments/DepartmentStatsGrid';
import { DepartmentTabContent } from './departments/DepartmentTabContent';

export function DepartmentDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation(['common']);

    const [activeTab, setActiveTab] = useState<TabView>('risks');
    const [riskFilter, setRiskFilter] = useState<'all' | 'high'>('all');
    const [kriFilter, setKriFilter] = useState<'all' | KRIMonitoringStatus>('all');
    const [riskPage, setRiskPage] = useState(1);
    const [controlPage, setControlPage] = useState(1);
    const [kriPage, setKriPage] = useState(1);
    const [userPage, setUserPage] = useState(1);

    useEffect(() => {
        setRiskPage(1);
        setControlPage(1);
        setKriPage(1);
        setUserPage(1);
    }, [id]);

    useEffect(() => {
        setRiskPage(1);
    }, [riskFilter]);

    useEffect(() => {
        setKriPage(1);
    }, [kriFilter]);

    const departmentId = id ? Number(id) : undefined;
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
        kriFilter,
        riskPage,
        controlPage,
        kriPage,
        userPage,
    });

    const resetPagination = () => {
        setRiskPage(1);
        setControlPage(1);
        setKriPage(1);
        setUserPage(1);
    };

    const handleRefresh = () => {
        refresh();
        resetPagination();
        setKriFilter('all');
        setRiskFilter('all');
    };

    if (isLoading) {
        return (
            <div className="space-y-8">
                <div className="glass-card animate-pulse">
                    <div className="h-8 w-64 bg-white/10 rounded mb-4" />
                    <div className="h-4 w-96 bg-white/10 rounded" />
                </div>
                <div className="grid grid-cols-4 gap-6">
                    {[1, 2, 3, 4].map((index) => (
                        <div key={index} className="glass-card animate-pulse">
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
                onRefresh={handleRefresh}
            />
            <DepartmentStatsGrid
                activeTab={activeTab}
                department={department}
                kriFilter={kriFilter}
                riskFilter={riskFilter}
                onSelectControls={() => setActiveTab('controls')}
                onSelectHighRisks={() => {
                    setActiveTab('risks');
                    setRiskFilter('high');
                }}
                onSelectKriBreach={() => {
                    setActiveTab('kris');
                    setKriFilter('breach');
                }}
                onSelectKris={() => {
                    setActiveTab('kris');
                    setKriFilter('all');
                }}
                onSelectRisks={() => {
                    setActiveTab('risks');
                    setRiskFilter('all');
                }}
                onSelectUsers={() => setActiveTab('users')}
            />
            <DepartmentDetailTabs
                activeTab={activeTab}
                department={department}
                riskCount={getRiskCount()}
                onSelectTab={setActiveTab}
            />
            <DepartmentTabContent
                activeTab={activeTab}
                controls={controls}
                controlPage={controlPage}
                controlTotalPages={controlTotalPages}
                department={department}
                getRiskCount={getRiskCount}
                kris={kris}
                kriFilter={kriFilter}
                kriPage={kriPage}
                kriTotalPages={kriTotalPages}
                riskFilter={riskFilter}
                riskPage={riskPage}
                risks={risks}
                riskTotalPages={riskTotalPages}
                setControlPage={setControlPage}
                setKriFilter={setKriFilter}
                setKriPage={setKriPage}
                setRiskPage={setRiskPage}
                setUserPage={setUserPage}
                users={users}
                userPage={userPage}
                userTotalPages={userTotalPages}
            />
        </div>
    );
}

export default DepartmentDetailPage;
