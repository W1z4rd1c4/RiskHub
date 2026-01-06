import { useState } from 'react';
import { User, Palette, Globe, BookOpen } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { ProfileSettings, AppearanceSettings, LocalizationSettings, DocumentationSettings } from '@/components/settings';

const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'localization', label: 'Localization', icon: Globe },
    { id: 'documentation', label: 'Help & Docs', icon: BookOpen },
] as const;

type TabId = typeof tabs[number]['id'];

export function SettingsPage() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<TabId>('profile');

    return (
        <div className="space-y-6">
            {/* Header */}
            <header className="glass-card p-6">
                <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-br from-accent to-purple-600 p-3 rounded-xl shadow-lg shadow-accent/20">
                        <User className="h-8 w-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white font-heading">Platform Settings</h1>
                        <p className="text-slate-400">
                            Manage your profile and personalize your experience
                        </p>
                    </div>
                </div>
            </header>

            {/* Tab Navigation */}
            <div className="glass-card p-2 flex gap-2 overflow-x-auto">
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap",
                                isActive
                                    ? "bg-accent text-white shadow-lg shadow-accent/20"
                                    : "text-slate-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <tab.icon className="h-4 w-4" />
                            <span className="font-medium">{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <div className="glass-card p-6">
                {activeTab === 'profile' && user && (
                    <ProfileSettings user={user} />
                )}
                {activeTab === 'appearance' && (
                    <AppearanceSettings />
                )}
                {activeTab === 'localization' && (
                    <LocalizationSettings />
                )}
                {activeTab === 'documentation' && (
                    <DocumentationSettings />
                )}
            </div>
        </div>
    );
}
