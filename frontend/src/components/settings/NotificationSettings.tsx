import { useState, useEffect } from 'react';
import { Bell, AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

    return (
        <div className="space-y-8">
            <div>
                <h3 className="text-lg font-semibold mb-2">{t('notifications.title', 'Notification Preferences')}</h3>
                <p className="text-slate-400 text-sm">
                    {t('notifications.subtitle', 'Choose which notifications you want to receive')}
                </p>
            </div>

            {/* Approval Notifications Section */}
            <section className="bg-white/5 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
                        <Bell className="h-4 w-4 text-accent" />
                    </div>
                    <h4 className="text-md font-semibold text-slate-200">
                        {t('notifications.section_approval', 'Approval Notifications')}
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
                        {t('notifications.section_kri', 'KRI Notifications')}
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

            {/* Note */}
            <p className="text-xs text-slate-500 italic">
                {t('notifications.persistence_note', 'Your preferences are saved automatically and synced across devices.')}
            </p>
        </div>
    );
}
