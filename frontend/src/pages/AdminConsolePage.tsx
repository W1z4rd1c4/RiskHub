import { Activity, Server, Shield, Terminal, Users } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useAuthz } from '@/authz/useAuthz';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { TabList, TabPanel } from '@/components/ui/tabs';
import { useContentTabQuery } from '@/hooks/useContentTabQuery';
import { useTranslation } from '@/i18n/hooks';
import { ReadAccessDeniedState } from '@/pages/shared/ReadAccessDeniedState';

import { AuditLogsPanel } from './admin-console/sections/AdminConsoleAuditPanels';
import { HealthPanel, LogsPanel, SessionsPanel } from './admin-console/sections/AdminConsoleOpsPanels';
import './admin-console/adminConsoleRoute.css';
import { LoadingState } from '@/components/ui/state';

const tabDefs = [
    { id: 'health', labelKey: 'tabs.health', icon: Activity },
    { id: 'logs', labelKey: 'tabs.application_logs', icon: Terminal },
    { id: 'audit', labelKey: 'tabs.audit_logs', icon: Shield },
    { id: 'sessions', labelKey: 'tabs.sessions', icon: Users },
] as const;

type TabId = (typeof tabDefs)[number]['id'];
const tabIds = tabDefs.map((tab) => tab.id);
const TABS_ID_PREFIX = 'admin-console';

export function AdminConsolePage() {
    const { t } = useTranslation('admin');
    const { isLoading } = useAuth();
    const authz = useAuthz();
    const [activeTab, setActiveTab] = useContentTabQuery<TabId>({
        tabs: tabIds,
        defaultTab: 'health',
    });

    const pageHeader = <PageHeader title={t('console.title')} description={t('console.subtitle')} icon={Server} />;

    if (isLoading) {
        return (
            <PageContainer className="admin-console-route">
                {pageHeader}
                <LoadingState layout="page" label={t('console.loading')} />
            </PageContainer>
        );
    }

    if (!authz.canViewAdminConsole) {
        return (
            <PageContainer>
                {pageHeader}
                <ReadAccessDeniedState />
            </PageContainer>
        );
    }

    return (
        <PageContainer className="admin-console-route">
            {pageHeader}

            <TabList
                tabs={tabDefs.map((tab) => ({ id: tab.id, label: t(tab.labelKey), icon: tab.icon }))}
                activeTab={activeTab}
                onChange={setActiveTab}
                idPrefix={TABS_ID_PREFIX}
                variant="pill"
                ariaLabel={t('console.title')}
            />

            {tabDefs.map((tab) => (
                <TabPanel key={tab.id} tab={tab.id} activeTab={activeTab} idPrefix={TABS_ID_PREFIX} className="glass-card p-6">
                    {activeTab === tab.id ? (
                        <>
                            {tab.id === 'health' && <HealthPanel />}
                            {tab.id === 'logs' && <LogsPanel />}
                            {tab.id === 'audit' && <AuditLogsPanel />}
                            {tab.id === 'sessions' && <SessionsPanel />}
                        </>
                    ) : null}
                </TabPanel>
            ))}
        </PageContainer>
    );
}

export default AdminConsolePage;
