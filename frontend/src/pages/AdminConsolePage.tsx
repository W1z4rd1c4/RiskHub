import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Activity, Server, Shield, Terminal, Users } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useAuthz } from '@/authz/useAuthz';
import { useContentTabs } from '@/hooks/useContentTabs';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

import { AuditLogsPanel } from './admin-console/sections/AdminConsoleAuditPanels';
import { HealthPanel, LogsPanel, SessionsPanel } from './admin-console/sections/AdminConsoleOpsPanels';
import './admin-console/adminConsoleRoute.css';

const tabDefs = [
    { id: 'health', labelKey: 'tabs.health', icon: Activity },
    { id: 'logs', labelKey: 'tabs.application_logs', icon: Terminal },
    { id: 'audit', labelKey: 'tabs.audit_logs', icon: Shield },
    { id: 'sessions', labelKey: 'tabs.sessions', icon: Users },
] as const;

type TabId = (typeof tabDefs)[number]['id'];
const tabIds = tabDefs.map((tab) => tab.id);

export function AdminConsolePage() {
    const { t } = useTranslation('admin');
    const { isLoading } = useAuth();
    const authz = useAuthz();
    const [activeTab, setActiveTab] = useState<TabId>('health');
    const { getTabProps, getPanelProps } = useContentTabs({
        tabs: tabIds,
        activeTab,
        onChange: setActiveTab,
        idPrefix: 'admin-console',
    });

    if (isLoading) {
        return <div className="admin-console-route flex items-center justify-center min-h-screen admin-muted">{t('console.loading')}</div>;
    }

    if (!authz.canViewAdminConsole) {
        return <Navigate to="/" replace />;
    }

    return (
        <div className="admin-console-route space-y-6">
            <header className="glass-card p-6">
                <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-br from-slate-600 to-slate-800 p-3 rounded-xl shadow-lg">
                        <Server className="h-8 w-8 text-white" />
                    </div>
                    <div>
                        <h1 className="admin-title text-2xl font-bold font-heading">{t('console.title')}</h1>
                        <p className="admin-text">{t('console.subtitle')}</p>
                    </div>
                </div>
            </header>

            <div
                role="tablist"
                aria-label={t('console.title')}
                className="glass-card p-2 flex gap-2 overflow-x-auto"
            >
                {tabDefs.map((tab, index) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            {...getTabProps(tab.id, index)}
                            className={cn(
                                'flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap',
                                isActive ? 'bg-slate-700 text-slate-50 shadow-lg' : 'admin-tab-inactive hover:bg-white/10',
                            )}
                        >
                            <tab.icon className="h-4 w-4" aria-hidden="true" />
                            <span className="font-medium">{t(tab.labelKey)}</span>
                        </button>
                    );
                })}
            </div>

            {tabDefs.map((tab) => (
                <div key={tab.id} className="glass-card p-6" {...getPanelProps(tab.id)}>
                    {activeTab === tab.id ? (
                        <>
                            {tab.id === 'health' && <HealthPanel />}
                            {tab.id === 'logs' && <LogsPanel />}
                            {tab.id === 'audit' && <AuditLogsPanel />}
                            {tab.id === 'sessions' && <SessionsPanel />}
                        </>
                    ) : null}
                </div>
            ))}
        </div>
    );
}

export default AdminConsolePage;
