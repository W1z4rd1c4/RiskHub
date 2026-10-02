import { useState, useEffect, useId } from 'react';
import { Bell, AlertTriangle } from 'lucide-react';
import { useFeedback } from '@/hooks/useFeedback';
import { useTranslation } from '@/i18n/hooks';
import { apiClient } from '@/services/apiClient';
import { notificationsApi } from '@/services/notificationsApi';
import type { NotificationPreferences } from '@/types/notification';
import { logError } from '@/services/logger';
import { ErrorState, LoadingState, Skeleton } from '@/components/ui/state';
import { Switch } from '@/components/ui/switch';

interface ToggleItemProps {
    label: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    loading?: boolean;
}

function ToggleItem({ label, description, checked, onChange, loading }: ToggleItemProps) {
    const labelId = useId();
    const descriptionId = useId();
    return (
        <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
            <div className="flex-1 pr-4">
                <p id={labelId} className="text-foreground font-medium">{label}</p>
                <p id={descriptionId} className="text-muted-foreground text-sm">{description}</p>
            </div>
            <Switch
                checked={checked}
                onCheckedChange={onChange}
                aria-labelledby={labelId}
                aria-describedby={descriptionId}
                disabled={loading}
            />
        </div>
    );
}

export function NotificationSettings() {
    const { t } = useTranslation('settings');
    const feedback = useFeedback();
    const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);
    const [errorKey, setErrorKey] = useState<string | null>(null);

    useEffect(() => {
        void loadPreferences();
    }, []);

    const loadPreferences = async () => {
        try {
            setLoading(true);
            setErrorKey(null);
            const prefs = await notificationsApi.getPreferences();
            setPreferences(prefs);
        } catch (err) {
            setErrorKey('notifications.load_failed');
            logError('Failed to load notification preferences:', err);
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
            // Roll back and tell the user (GAP-C-14, D9): a failed save is never silent.
            setPreferences({ ...preferences, [key]: previousValue });
            logError('Failed to update preference:', err);
            feedback.error({ title: t('notifications.save_failed'), messageKey: apiClient.toUiMessageKey(err) });
        } finally {
            setUpdating(null);
        }
    };

    if (loading) {
        return (
            <LoadingState
                skeleton={(
                    <div className="space-y-8">
                        <Skeleton className="h-6 w-48" />
                        <div className="space-y-4">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="flex items-center justify-between">
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-3 w-64" />
                                    </div>
                                    <Skeleton className="h-6 w-12 rounded-full" />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            />
        );
    }

    if (errorKey) {
        return <ErrorState message={t(errorKey)} onRetry={() => void loadPreferences()} />;
    }

    if (!preferences) return null;

    const approvalSettings: { key: keyof NotificationPreferences; labelKey: string; descKey: string }[] = [
        { key: 'approval_pending', labelKey: 'notifications.approval_pending', descKey: 'notifications.approval_pending_desc' },
        { key: 'approval_resolved', labelKey: 'notifications.approval_resolved', descKey: 'notifications.approval_resolved_desc' },
        { key: 'approval_cancelled', labelKey: 'notifications.approval_cancelled', descKey: 'notifications.approval_cancelled_desc' },
        { key: 'governed_approval_action_required', labelKey: 'notifications.governed_approval_action_required', descKey: 'notifications.governed_approval_action_required_desc' },
        { key: 'governed_approval_request_updates', labelKey: 'notifications.governed_approval_request_updates', descKey: 'notifications.governed_approval_request_updates_desc' },
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

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-lg font-semibold mb-2">{t('notifications.title')}</h2>
                <p className="text-muted-foreground text-sm">
                    {t('notifications.subtitle')}
                </p>
            </div>

            {/* Approval Notifications Section */}
            <section className="bg-tint/5 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
                        <Bell aria-hidden="true" className="h-4 w-4 text-accent-text" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">
                        {t('notifications.section_approval')}
                    </h3>
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
            <section className="bg-tint/5 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-warning/20 flex items-center justify-center">
                        <AlertTriangle className="h-4 w-4 text-warning-text" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">
                        {t('notifications.section_kri')}
                    </h3>
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
            <section className="bg-tint/5 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-success/20 flex items-center justify-center">
                        <Bell className="h-4 w-4 text-success-text" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">
                        {t('notifications.section_questionnaires')}
                    </h3>
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

            {/* Note */}
            <p className="text-xs text-muted-foreground italic">
                {t('notifications.persistence_note')}
            </p>
        </div>
    );
}
