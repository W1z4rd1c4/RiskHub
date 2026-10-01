import { useId, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings2, Save, AlertCircle } from 'lucide-react';
import { riskHubApi } from '@/services/riskHubApi';
import { apiClient } from '@/services/apiClient';
import type { GlobalConfig } from '@/services/riskHubApi';
import { riskHubKeys } from '@/lib/queryKeys';
import { Switch } from '@/components/ui/switch';
import { useFeedback } from '@/hooks/useFeedback';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { riskHubCapabilityEnabled, useRiskHubCapabilities } from './useRiskHubCapabilities';
import { ErrorState, LoadingState, Spinner } from '@/components/ui/state';

const CATEGORY_LABELS: Record<string, { labelKey: string; descriptionKey: string }> = {
    risk_thresholds: {
        labelKey: 'admin:system_settings.categories.risk_thresholds.label',
        descriptionKey: 'admin:system_settings.categories.risk_thresholds.description'
    },
    approvals: {
        labelKey: 'admin:system_settings.categories.approvals.label',
        descriptionKey: 'admin:system_settings.categories.approvals.description'
    },
    notifications: {
        labelKey: 'admin:system_settings.categories.notifications.label',
        descriptionKey: 'admin:system_settings.categories.notifications.description'
    },
};

interface ConfigInputProps {
    config: GlobalConfig;
    canUpdate: boolean;
    onSave: (key: string, value: string) => Promise<void>;
}

function ConfigInput({ config, canUpdate, onSave }: ConfigInputProps) {
    const { t } = useTranslation(['admin', 'common']);
    const format = useFormat();
    const [value, setValue] = useState(config.value);
    const feedback = useFeedback();
    const [saving, setSaving] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const fieldId = useId();
    const nameId = `${fieldId}-name`;
    const descriptionId = config.description ? `${fieldId}-description` : undefined;
    const isReadOnly = !config.is_editable || !canUpdate;

    const hasChanged = value !== config.value;

    const handleSave = async () => {
        if (!hasChanged || !canUpdate) return;
        setErrorKey(null);
        setSaving(true);
        try {
            await onSave(config.key, value);
            // D9 / GAP-B-10: the save outcome is a toast, not a 2 s inline flash.
            feedback.success({ title: t('common:success.saved'), description: config.display_name });
        } catch (err) {
            setErrorKey(apiClient.toUiMessageKey(err));
        } finally {
            setSaving(false);
        }
    };

    const renderInput = () => {
        if (config.value_type === 'bool') {
            const checked = value.toLowerCase() === 'true';
            return (
                <Switch
                    checked={checked}
                    onCheckedChange={(next) => setValue(next ? 'true' : 'false')}
                    aria-labelledby={nameId}
                    aria-describedby={descriptionId}
                    disabled={isReadOnly}
                />
            );
        }

        if (config.value_type === 'int') {
            // PG-38: group digits in the UI language ("10,000,000" en / "10 000 000" cs);
            // the change handler strips every separator back to the raw number.
            const numValue = parseInt(value) || 0;
            const displayValue = format.number(numValue);

            return (
                <input
                    type="text"
                    inputMode="numeric"
                    aria-labelledby={nameId}
                    aria-describedby={descriptionId}
                    value={displayValue}
                    onChange={(e) => {
                        // Strip spaces and non-numeric chars, store raw number
                        const cleaned = e.target.value.replace(/[^0-9]/g, '');
                        setValue(cleaned);
                    }}
                    className="w-24 md:w-32 px-3 py-1.5 bg-tint/5 border border-input rounded-lg text-foreground text-right font-mono focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    disabled={isReadOnly}
                />
            );
        }

        return (
            <input
                type="text"
                aria-labelledby={nameId}
                aria-describedby={descriptionId}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-tint/5 border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                disabled={isReadOnly}
            />
        );
    };

    return (
        <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
            <div className="flex-1">
                <div className="flex items-center gap-2">
                    <span id={nameId} className="text-foreground font-medium">{config.display_name}</span>
                    {config.min_value !== null && config.max_value !== null && (
                        <span className="text-xs text-muted-foreground">
                            ({config.min_value} - {config.max_value})
                        </span>
                    )}
                </div>
                {config.description && (
                    <p id={descriptionId} className="text-sm text-muted-foreground mt-0.5">{config.description}</p>
                )}
            </div>

            <div className="flex items-center gap-3">
                {renderInput()}

                {hasChanged && canUpdate && config.is_editable && (
                    <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={saving}
                        aria-label={t('admin:system_settings.save_named', { name: config.display_name })}
                        className="flex items-center gap-1 px-3 py-1.5 bg-accent text-accent-foreground text-sm rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
                    >
                        {saving ? (
                            <Spinner size="sm" className="size-3.5 text-current" />
                        ) : (
                            <Save className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {t('common:actions.save')}
                    </button>
                )}

                {errorKey && (
                    <span role="alert" className="flex items-center gap-1 text-destructive text-sm">
                        <AlertCircle className="h-4 w-4" aria-hidden="true" /> {t(errorKey, { ns: 'errorKeys' })}
                    </span>
                )}
            </div>
        </div>
    );
}

export function SystemSettingsPanel() {
    const { t } = useTranslation(['admin', 'common']);
    const queryClient = useQueryClient();
    const { data: riskHubCapabilities } = useRiskHubCapabilities();
    const canUpdateSettings = riskHubCapabilityEnabled(riskHubCapabilities?.system_settings, 'can_update');

    const { data: configs, isLoading, error, isFetching, refetch } = useQuery({
        queryKey: riskHubKeys.globalConfig(),
        queryFn: () => riskHubApi.getAllConfig(),
    });

    const updateMutation = useMutation({
        mutationFn: ({ key, value }: { key: string; value: string }) => riskHubApi.updateConfig(key, value),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: riskHubKeys.globalConfig() }),
    });

    const handleSave = async (key: string, value: string) => {
        await updateMutation.mutateAsync({ key, value });
    };

    // DS-17 / GAP-C-11: shared loading and error (with retry) states.
    if (isLoading) {
        return <LoadingState label={t('common:loading.settings')} />;
    }

    if (error && !configs) {
        return (
            <ErrorState
                message={t('admin:errors.failed_to_load_settings')}
                onRetry={() => void refetch()}
                isRetrying={isFetching}
            />
        );
    }

    const categories = Object.keys(configs || {});

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Settings2 className="h-5 w-5 text-accent" />
                <h3 className="text-lg font-semibold text-foreground">{t('admin:system_settings.title')}</h3>
            </div>

            {categories.map((category) => {
                const categoryInfo = CATEGORY_LABELS[category];
                const categoryConfigs = configs?.[category] || [];

                return (
                    <div key={category} className="bg-tint/5 rounded-xl p-4">
                        <div className="mb-4">
                            <h4 className="text-foreground font-medium">
                                {categoryInfo ? t(categoryInfo.labelKey) : category}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                                {categoryInfo ? t(categoryInfo.descriptionKey) : ''}
                            </p>
                        </div>

                        <div className="space-y-1">
                            {categoryConfigs.map((config) => (
                                <ConfigInput
                                    key={config.key}
                                    canUpdate={canUpdateSettings}
                                    config={config}
                                    onSave={handleSave}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
