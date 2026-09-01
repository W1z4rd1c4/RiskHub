import { useTranslation } from '@/i18n/hooks';
import { Command, Palette, Settings2, ShieldCheck, Shield, Building } from 'lucide-react';
import { useAuthz } from '@/authz/useAuthz';
import { RolesPanel, DepartmentsPanel, RiskTypesPanel, SystemSettingsPanel, ApprovalScenariosPanel, RiskQuestionnairesPanel } from '@/components/riskhub';
import { cn } from '@/lib/utils';
import { useContentTabQuery } from '@/hooks/useContentTabQuery';
import { useContentTabs } from '@/hooks/useContentTabs';
import { ReadAccessDeniedState } from '@/pages/shared/ReadAccessDeniedState';

const tabs = [
    { id: 'risk-types', labelKey: 'riskhub.tabs.risk_types', icon: Palette },
    { id: 'settings', labelKey: 'riskhub.tabs.system_settings', icon: Settings2 },
    { id: 'approvals', labelKey: 'riskhub.tabs.approval_rules', icon: ShieldCheck },
    { id: 'roles', labelKey: 'riskhub.tabs.roles', icon: Shield },
    { id: 'departments', labelKey: 'riskhub.tabs.departments', icon: Building },
    { id: 'questionnaires', labelKey: 'riskhub.tabs.questionnaires', icon: Command },
] as const;

type TabId = typeof tabs[number]['id'];
const tabIds = tabs.map((tab) => tab.id);

export function RiskHubPage() {
    const { t } = useTranslation('admin');
    const authz = useAuthz();
    const [activeTab, setActiveTab] = useContentTabQuery<TabId>({
        tabs: tabIds,
        defaultTab: 'risk-types',
    });
    const { getPanelProps, getTabProps } = useContentTabs({
        tabs: tabIds,
        activeTab,
        onChange: setActiveTab,
        idPrefix: 'risk-hub',
    });

    // Tab labels with translations
    const tabLabels: Record<TabId, string> = {
        'risk-types': t('riskhub.tabs.risk_types'),
        'settings': t('riskhub.tabs.system_settings'),
        'approvals': t('riskhub.tabs.approval_rules'),
        'roles': t('riskhub.tabs.roles'),
        'departments': t('riskhub.tabs.departments'),
        'questionnaires': t('riskhub.tabs.questionnaires'),
    };

    // Only CRO can access Risk Hub
    if (!authz.canViewRiskHub) {
        return <ReadAccessDeniedState />;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <header className="glass-card p-6">
                <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-br from-accent to-purple-600 p-3 rounded-xl shadow-lg shadow-accent/20">
                        <Command className="h-8 w-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white font-heading">{t('riskhub.title')}</h1>
                        <p className="text-slate-400">
                            {t('riskhub.subtitle')}
                        </p>
                    </div>
                </div>
            </header>

            {/* Tab Navigation */}
            <div className="glass-card p-2 flex gap-2 overflow-x-auto" role="tablist" aria-label={t('riskhub.title')}>
                {tabs.map((tab, index) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            {...getTabProps(tab.id, index)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap",
                                isActive
                                    ? "bg-accent text-accent-foreground shadow-lg shadow-accent/20"
                                    : "text-slate-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <tab.icon className="h-4 w-4" />
                            <span className="font-medium">{tabLabels[tab.id]}</span>
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            {tabIds.map((tab) => (
                <div key={tab} className="glass-card p-6" {...getPanelProps(tab)}>
                    {activeTab === tab && tab === 'risk-types' ? <RiskTypesPanel /> : null}
                    {activeTab === tab && tab === 'settings' ? <SystemSettingsPanel /> : null}
                    {activeTab === tab && tab === 'approvals' ? <ApprovalScenariosPanel /> : null}
                    {activeTab === tab && tab === 'roles' ? <RolesPanel /> : null}
                    {activeTab === tab && tab === 'departments' ? <DepartmentsPanel /> : null}
                    {activeTab === tab && tab === 'questionnaires' ? <RiskQuestionnairesPanel /> : null}
                </div>
            ))}

            {/* Footer Note */}
            <div className="text-center text-sm text-muted-foreground">
                {t('riskhub.footer')}
            </div>
        </div>
    );
}

export default RiskHubPage;
