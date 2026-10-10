import { useTranslation } from '@/i18n/hooks';
import { Command, Palette, Settings2, ShieldCheck, Shield, Building } from 'lucide-react';
import { useAuthz } from '@/authz/useAuthz';
import { RolesPanel, DepartmentsPanel, RiskTypesPanel, SystemSettingsPanel, ApprovalScenariosPanel, RiskQuestionnairesPanel } from '@/components/riskhub';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { TabList, TabPanel } from '@/components/ui/tabs';
import { useContentTabQuery } from '@/hooks/useContentTabQuery';
import { ReadAccessDeniedState } from '@/pages/shared/ReadAccessDeniedState';

const TABS_ID_PREFIX = 'risk-hub';

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
        return (
            <PageContainer>
                <PageHeader title={t('riskhub.title')} icon={Command} />
                <ReadAccessDeniedState />
            </PageContainer>
        );
    }

    return (
        <PageContainer>
            <PageHeader title={t('riskhub.title')} description={t('riskhub.subtitle')} icon={Command} />

            <TabList
                tabs={tabs.map((tab) => ({ id: tab.id, label: tabLabels[tab.id], icon: tab.icon }))}
                activeTab={activeTab}
                onChange={setActiveTab}
                idPrefix={TABS_ID_PREFIX}
                variant="pill"
                ariaLabel={t('riskhub.title')}
            />

            {tabIds.map((tab) => (
                <TabPanel key={tab} tab={tab} activeTab={activeTab} idPrefix={TABS_ID_PREFIX} className="glass-card p-6">
                    {activeTab === tab && tab === 'risk-types' ? <RiskTypesPanel /> : null}
                    {activeTab === tab && tab === 'settings' ? <SystemSettingsPanel /> : null}
                    {activeTab === tab && tab === 'approvals' ? <ApprovalScenariosPanel /> : null}
                    {activeTab === tab && tab === 'roles' ? <RolesPanel /> : null}
                    {activeTab === tab && tab === 'departments' ? <DepartmentsPanel /> : null}
                    {activeTab === tab && tab === 'questionnaires' ? <RiskQuestionnairesPanel /> : null}
                </TabPanel>
            ))}

            {/* Footer Note */}
            <div className="text-center text-sm text-muted-foreground">
                {t('riskhub.footer')}
            </div>
        </PageContainer>
    );
}

export default RiskHubPage;
