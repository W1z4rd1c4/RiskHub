import { useState, useEffect } from 'react';
import { Bell, AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { notificationsApi } from '@/services/notificationsApi';
import type { NotificationPreferences } from '@/types/notification';
import { cn } from '@/lib/utils';

interface ToggleItemProps {
    label: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    loading?: boolean;
}

function ToggleItem({ label, description, checked, onChange, loading }: ToggleItemProps) {
    return (
        <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
            <div className="flex-1 pr-4">
                <p className="text-slate-200 font-medium">{label}</p>
                <p className="text-slate-500 text-sm">{description}</p>
            </div>
            <button
                onClick={() => onChange(!checked)}
                disabled={loading}
                className={cn(
                    "relative w-12 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50",
                    checked ? "bg-accent" : "bg-slate-700",
                    loading && "opacity-50 cursor-not-allowed"
                )}
            >
                <span
                    className={cn(
                        "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                        checked && "translate-x-6"
                    )}
                />
            </button>
        </div>
    );
}

export function NotificationSettings() {
    const { t } = useTranslation('settings');
    const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadPreferences();
    }, []);

    const loadPreferences = async () => {
        try {
            setLoading(true);
            setError(null);
            const prefs = await notificationsApi.getPreferences();
            setPreferences(prefs);
        } catch (err) {
            setError('Failed to load preferences');
            console.error('Failed to load notification preferences:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = async (key: keyof NotificationPreferences, value: boolean) => {
        if (!preferences) return;

        // Optimistic update
        const previousValue = preferences[key];
        setPreferences({ ...preferences, [key]: value });
        setUpdating(key);

        try {
            const updatedPrefs = await notificationsApi.updatePreferences({ [key]: value });
            setPreferences(updatedPrefs);
        } catch (err) {
            // Rollback on error
            setPreferences({ ...preferences, [key]: previousValue });
            console.error('Failed to update preference:', err);
        } finally {
            setUpdating(null);
        }
    };

    if (loading) {
        return (
            <div className="space-y-8 animate-pulse">
                <div className="h-6 w-48 bg-white/10 rounded" />
                <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="flex justify-between items-center">
                            <div className="space-y-2 flex-1">
                                <div className="h-4 w-32 bg-white/10 rounded" />
                                <div className="h-3 w-64 bg-white/5 rounded" />
                            </div>
                            <div className="w-12 h-6 bg-white/10 rounded-full" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-8">
                <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
                <p className="text-slate-400 mb-4">{error}</p>
                <button
                    onClick={loadPreferences}
                    className="flex items-center gap-2 mx-auto px-4 py-2 bg-accent/20 text-accent rounded-lg hover:bg-accent/30 transition-colors"
                >
                    <RefreshCw className="h-4 w-4" />
                    Retry
                </button>
            </div>
        );
    }

    if (!preferences) return null;

    const approvalSettings: { key: keyof NotificationPreferences; labelKey: string; descKey: string }[] = [
        { key: 'approval_pending', labelKey: 'notifications.approval_pending', descKey: 'notifications.approval_pending_desc' },
        { key: 'approval_resolved', labelKey: 'notifications.approval_resolved', descKey: 'notifications.approval_resolved_desc' },
        { key: 'approval_cancelled', labelKey: 'notifications.approval_cancelled', descKey: 'notifications.approval_cancelled_desc' },
    ];

    const kriSettings: { key: keyof NotificationPreferences; labelKey: string; descKey: string }[] = [
        { key: 'kri_due_soon', labelKey: 'notifications.kri_due_soon', descKey: 'notifications.kri_due_soon_desc' },
        { key: 'kri_due_tomorrow', labelKey: 'notifications.kri_due_tomorrow', descKey: 'notifications.kri_due_tomorrow_desc' },
        { key: 'kri_overdue', labelKey: 'notifications.kri_overdue', descKey: 'notifications.kri_overdue_desc' },
        { key: 'kri_near_breach', labelKey: 'notifications.kri_near_breach', descKey: 'notifications.kri_near_breach_desc' },
        { key: 'kri_breach_detected', labelKey: 'notifications.kri_breach_detected', descKey: 'notifications.kri_breach_detected_desc' },
    ];

    const questionnaireSettings: { key: keyof NotificationPreferences; labelKey: string; descKey: string }[] = [
        { key: 'questionnaire_sent', labelKey: 'notifications.questionnaire_sent', descKey: 'notifications.questionnaire_sent_desc' },
        { key: 'questionnaire_due_soon', labelKey: 'notifications.questionnaire_due_soon', descKey: 'notifications.questionnaire_due_soon_desc' },
        { key: 'questionnaire_overdue', labelKey: 'notifications.questionnaire_overdue', descKey: 'notifications.questionnaire_overdue_desc' },
        { key: 'questionnaire_submitted', labelKey: 'notifications.questionnaire_submitted', descKey: 'notifications.questionnaire_submitted_desc' },
        { key: 'questionnaire_clarification_requested', labelKey: 'notifications.questionnaire_clarification_requested', descKey: 'notifications.questionnaire_clarification_requested_desc' },
    ];

    const vendorSettings: { key: keyof NotificationPreferences; labelKey: string; descKey: string }[] = [
        { key: 'vendor_assessment_submitted', labelKey: 'notifications.vendor_assessment_submitted', descKey: 'notifications.vendor_assessment_submitted_desc' },
        { key: 'vendor_assessment_committee_recommended', labelKey: 'notifications.vendor_assessment_committee_recommended', descKey: 'notifications.vendor_assessment_committee_recommended_desc' },
        { key: 'vendor_assessment_decided', labelKey: 'notifications.vendor_assessment_decided', descKey: 'notifications.vendor_assessment_decided_desc' },
        { key: 'vendor_reassessment_due_soon', labelKey: 'notifications.vendor_reassessment_due_soon', descKey: 'notifications.vendor_reassessment_due_soon_desc' },
        { key: 'vendor_reassessment_overdue', labelKey: 'notifications.vendor_reassessment_overdue', descKey: 'notifications.vendor_reassessment_overdue_desc' },
        { key: 'vendor_sla_due_soon', labelKey: 'notifications.vendor_sla_due_soon', descKey: 'notifications.vendor_sla_due_soon_desc' },
        { key: 'vendor_sla_due_tomorrow', labelKey: 'notifications.vendor_sla_due_tomorrow', descKey: 'notifications.vendor_sla_due_tomorrow_desc' },
        { key: 'vendor_sla_overdue', labelKey: 'notifications.vendor_sla_overdue', descKey: 'notifications.vendor_sla_overdue_desc' },
        { key: 'vendor_sla_near_breach', labelKey: 'notifications.vendor_sla_near_breach', descKey: 'notifications.vendor_sla_near_breach_desc' },
        { key: 'vendor_sla_breach_detected', labelKey: 'notifications.vendor_sla_breach_detected', descKey: 'notifications.vendor_sla_breach_detected_desc' },
    ];

    return (
        <div className="space-y-8">
            <div>
                <h3 className="text-lg font-semibold mb-2">{t('notifications.title')}</h3>
                <p className="text-slate-400 text-sm">
                    {t('notifications.subtitle')}
                </p>
            </div>

            {/* Approval Notifications Section */}
            <section className="bg-white/5 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
                        <Bell className="h-4 w-4 text-accent" />
                    </div>
                    <h4 className="text-md font-semibold text-slate-200">
                        {t('notifications.section_approval')}
                    </h4>
                </div>
                <div className="space-y-1">
                    {approvalSettings.map(({ key, labelKey, descKey }) => (
                        <ToggleItem
                            key={key}
                            label={t(labelKey, key)}
                            description={t(descKey, '')}
                            checked={preferences[key]}
                            onChange={(value) => handleToggle(key, value)}
                            loading={updating === key}
                        />
                    ))}
                </div>
            </section>

            {/* KRI Notifications Section */}
            <section className="bg-white/5 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    </div>
                    <h4 className="text-md font-semibold text-slate-200">
                        {t('notifications.section_kri')}
                    </h4>
                </div>
                <div className="space-y-1">
                    {kriSettings.map(({ key, labelKey, descKey }) => (
                        <ToggleItem
                            key={key}
                            label={t(labelKey, key)}
                            description={t(descKey, '')}
                            checked={preferences[key]}
                            onChange={(value) => handleToggle(key, value)}
                            loading={updating === key}
                        />
                    ))}
                </div>
            </section>

            {/* Questionnaire Notifications Section */}
            <section className="bg-white/5 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                        <Bell className="h-4 w-4 text-emerald-400" />
                    </div>
                    <h4 className="text-md font-semibold text-slate-200">
                        {t('notifications.section_questionnaires')}
                    </h4>
                </div>
                <div className="space-y-1">
                    {questionnaireSettings.map(({ key, labelKey, descKey }) => (
                        <ToggleItem
                            key={key}
                            label={t(labelKey, key)}
                            description={t(descKey, '')}
                            checked={preferences[key]}
                            onChange={(value) => handleToggle(key, value)}
                            loading={updating === key}
                        />
                    ))}
                </div>
            </section>

            {/* Vendor Notifications Section */}
            <section className="bg-white/5 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                        <Bell className="h-4 w-4 text-blue-400" />
                    </div>
                    <h4 className="text-md font-semibold text-slate-200">
                        {t('notifications.section_vendors')}
                    </h4>
                </div>
                <div className="space-y-1">
                    {vendorSettings.map(({ key, labelKey, descKey }) => (
                        <ToggleItem
                            key={key}
                            label={t(labelKey, key)}
                            description={t(descKey, '')}
                            checked={preferences[key]}
                            onChange={(value) => handleToggle(key, value)}
                            loading={updating === key}
                        />
                    ))}
                </div>
            </section>

            {/* Note */}
            <p className="text-xs text-slate-500 italic">
                {t('notifications.persistence_note')}
            </p>
        </div>
    );
}
