import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Command, Palette, Settings2, ShieldCheck, Shield, Building } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { RolesPanel, DepartmentsPanel, RiskTypesPanel, SystemSettingsPanel, ApprovalScenariosPanel, RiskQuestionnairesPanel } from '@/components/riskhub';
import { cn } from '@/lib/utils';

const tabs = [
    { id: 'risk-types', label: 'Risk Types', icon: Palette },
    { id: 'settings', label: 'System Settings', icon: Settings2 },
    { id: 'approvals', label: 'Approval Rules', icon: ShieldCheck },
    { id: 'roles', label: 'Roles', icon: Shield },
    { id: 'departments', label: 'Departments', icon: Building },
    { id: 'questionnaires', label: 'Questionnaires', icon: Command },
] as const;

type TabId = typeof tabs[number]['id'];

export function RiskHubPage() {
    const { t } = useTranslation('admin');
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<TabId>('risk-types');

    // Tab labels with translations
    const tabLabels: Record<TabId, string> = {
        'risk-types': t('riskhub.tabs.risk_types', 'Risk Types'),
        'settings': t('riskhub.tabs.system_settings', 'System Settings'),
        'approvals': t('riskhub.tabs.approval_rules', 'Approval Rules'),
        'roles': t('riskhub.tabs.roles', 'Roles'),
        'departments': t('riskhub.tabs.departments', 'Departments'),
        'questionnaires': t('riskhub.tabs.questionnaires', 'Questionnaires'),
    };

    // Only CRO can access Risk Hub
    if (user?.role !== 'cro') {
        return <Navigate to="/" replace />;
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
                        <h1 className="text-2xl font-bold text-white font-heading">{t('riskhub.title', 'Risk Hub')}</h1>
                        <p className="text-slate-400">
                            {t('riskhub.subtitle', 'Configure risk management policies, thresholds, and approval workflows')}
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
                            <span className="font-medium">{tabLabels[tab.id]}</span>
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <div className="glass-card p-6">
                {activeTab === 'risk-types' && <RiskTypesPanel />}
                {activeTab === 'settings' && <SystemSettingsPanel />}
                {activeTab === 'approvals' && <ApprovalScenariosPanel />}
                {activeTab === 'roles' && <RolesPanel />}
                {activeTab === 'departments' && <DepartmentsPanel />}
                {activeTab === 'questionnaires' && <RiskQuestionnairesPanel />}
            </div>

            {/* Footer Note */}
            <div className="text-center text-sm text-slate-500">
                {t('riskhub.footer', 'Changes are logged and auditable. All modifications take effect immediately.')}
            </div>
        </div>
    );
}
