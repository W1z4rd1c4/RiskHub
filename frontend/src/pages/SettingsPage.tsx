import { Link } from 'react-router-dom';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { User, Palette, Globe, BookOpen, Bell, Settings } from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { useTranslation } from '@/i18n/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { ProfileSettings, AppearanceSettings, LocalizationSettings, DocumentationSettings, NotificationSettings } from '@/components/settings';
import { useContentTabQuery } from '@/hooks/useContentTabQuery';
import { TabList, TabPanel } from '@/components/ui/tabs';

const settingsTabs = ['profile', 'appearance', 'localization', 'notifications', 'documentation'] as const;
type TabId = (typeof settingsTabs)[number];
const TABS_ID_PREFIX = 'settings';

export function SettingsPage() {
    const { t } = useTranslation(['settings', 'auth']);
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useContentTabQuery<TabId>({
        tabs: settingsTabs,
        defaultTab: 'profile',
    });

    const tabs = [
        { id: 'profile' as TabId, label: t('tabs.profile'), icon: User },
        { id: 'appearance' as TabId, label: t('tabs.appearance'), icon: Palette },
        { id: 'localization' as TabId, label: t('tabs.localization'), icon: Globe },
        { id: 'notifications' as TabId, label: t('tabs.notifications'), icon: Bell },
        { id: 'documentation' as TabId, label: t('tabs.documentation'), icon: BookOpen },
    ];

    return (
        <PageContainer>
            <PageHeader icon={Settings} title={t('title')} description={t('page_subtitle')} />

            {resolveCapabilityFlag(user?.me_capabilities?.identity, 'can_manage_own_credentials') && (
                <Link className="inline-flex rounded-lg border px-4 py-2 text-foreground underline" to="/auth/local/security">{t('auth:native.security_title')}</Link>
            )}

            <TabList
                tabs={tabs.map((tab) => ({ ...tab, testId: `settings-tab-${tab.id}` }))}
                activeTab={activeTab}
                onChange={setActiveTab}
                idPrefix={TABS_ID_PREFIX}
                variant="pill"
                ariaLabel={t('title')}
            />

            {settingsTabs.map((tab) => (
                <TabPanel key={tab} tab={tab} activeTab={activeTab} idPrefix={TABS_ID_PREFIX} className="glass-card p-6">
                    {activeTab === tab && tab === 'profile' && user ? <ProfileSettings user={user} nativeAccount={resolveCapabilityFlag(user.me_capabilities?.identity, 'can_manage_own_credentials')} /> : null}
                    {activeTab === tab && tab === 'appearance' ? <AppearanceSettings /> : null}
                    {activeTab === tab && tab === 'localization' ? <LocalizationSettings /> : null}
                    {activeTab === tab && tab === 'notifications' ? <NotificationSettings /> : null}
                    {activeTab === tab && tab === 'documentation' ? <DocumentationSettings /> : null}
                </TabPanel>
            ))}
        </PageContainer>
    );
}

export default SettingsPage;
