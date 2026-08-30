import { User, Palette, Globe, BookOpen, Bell } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { ProfileSettings, AppearanceSettings, LocalizationSettings, DocumentationSettings, NotificationSettings } from '@/components/settings';
import { useContentTabQuery } from '@/hooks/useContentTabQuery';
import { useContentTabs } from '@/hooks/useContentTabs';

const settingsTabs = ['profile', 'appearance', 'localization', 'notifications', 'documentation'] as const;
type TabId = (typeof settingsTabs)[number];

export function SettingsPage() {
    const { t } = useTranslation('settings');
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useContentTabQuery<TabId>({
        tabs: settingsTabs,
        defaultTab: 'profile',
    });
    const { getPanelProps, getTabProps } = useContentTabs({
        tabs: settingsTabs,
        activeTab,
        onChange: setActiveTab,
        idPrefix: 'settings',
    });

    const tabs = [
        { id: 'profile' as TabId, label: t('tabs.profile'), icon: User },
        { id: 'appearance' as TabId, label: t('tabs.appearance'), icon: Palette },
        { id: 'localization' as TabId, label: t('tabs.localization'), icon: Globe },
        { id: 'notifications' as TabId, label: t('tabs.notifications'), icon: Bell },
        { id: 'documentation' as TabId, label: t('tabs.documentation'), icon: BookOpen },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <header className="glass-card p-6">
                <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-br from-accent to-purple-600 p-3 rounded-xl shadow-lg shadow-accent/20">
                        <User className="h-8 w-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white font-heading">{t('title')}</h1>
                        <p className="text-muted-foreground">
                            {t('page_subtitle')}
                        </p>
                    </div>
                </div>
            </header>

            {/* Tab Navigation */}
            <div className="glass-card p-2 flex gap-2 overflow-x-auto" role="tablist" aria-label={t('title')}>
                {tabs.map((tab, index) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            {...getTabProps(tab.id, index)}
                            data-testid={`settings-tab-${tab.id}`}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap",
                                isActive
                                    ? "bg-accent text-accent-foreground shadow-lg shadow-accent/20"
                                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                            )}
                        >
                            <tab.icon className="h-4 w-4" />
                            <span className="font-medium">{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            {settingsTabs.map((tab) => (
                <div key={tab} className="glass-card p-6" {...getPanelProps(tab)}>
                    {activeTab === tab && tab === 'profile' && user ? <ProfileSettings user={user} /> : null}
                    {activeTab === tab && tab === 'appearance' ? <AppearanceSettings /> : null}
                    {activeTab === tab && tab === 'localization' ? <LocalizationSettings /> : null}
                    {activeTab === tab && tab === 'notifications' ? <NotificationSettings /> : null}
                    {activeTab === tab && tab === 'documentation' ? <DocumentationSettings /> : null}
                </div>
            ))}
        </div>
    );
}

export default SettingsPage;
