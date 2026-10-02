import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings2, Save } from 'lucide-react';
import { riskHubApi } from '@/services/riskHubApi';
import { apiClient } from '@/services/apiClient';
import type { GlobalConfig } from '@/services/riskHubApi';
import { riskHubKeys } from '@/lib/queryKeys';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { InlineMessage } from '@/components/ui/inline-message';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useFeedback } from '@/hooks/useFeedback';
import { translateUiMessage, useFormat, useTranslation } from '@/i18n/hooks';
import { riskHubCapabilityEnabled, useRiskHubCapabilities } from './useRiskHubCapabilities';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';

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

/**
 * One editable setting (DS-04 rewrite): `Field` names the control after the
 * setting and describes it with the setting description and allowed range;
 * `Switch` for booleans, `Input` for numbers and text, a "Save {name}" `Button`,
 * a success toast (D9) and the server error as an `InlineMessage` (AX-05).
 */
function ConfigInput({ config, canUpdate, onSave }: ConfigInputProps) {
    const { t } = useTranslation(['admin', 'common']);
    const format = useFormat();
    const [value, setValue] = useState(config.value);
    const feedback = useFeedback();
    const [saving, setSaving] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const isReadOnly = !config.is_editable || !canUpdate;

    const hasChanged = value !== config.value;
    const hasRange = config.min_value !== null && config.max_value !== null;
    const help = config.description || hasRange ? (
        <>
            {config.description}
            {config.description && hasRange ? ' ' : null}
            {hasRange
                ? t('admin:system_settings.range', {
                    min: format.number(config.min_value),
                    max: format.number(config.max_value),
                })
                : null}
        </>
    ) : undefined;

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

    const saveButton = hasChanged && canUpdate && config.is_editable ? (
        <Button
            variant="accent"
            size="compact"
            onClick={() => void handleSave()}
            isLoading={saving}
            aria-label={t('admin:system_settings.save_named', { name: config.display_name })}
        >
            {saving ? null : <Save aria-hidden="true" />}
            {t('common:actions.save')}
        </Button>
    ) : null;

    const errorMessage = errorKey ? (
        <InlineMessage tone="danger">{translateUiMessage(t, errorKey)}</InlineMessage>
    ) : null;

    if (config.value_type === 'bool') {
        const checked = value.toLowerCase() === 'true';
        return (
            <div className="space-y-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Field layout="inline" label={config.display_name} help={help} className="min-w-0 flex-1">
                        {(field) => (
                            <Switch
                                {...field}
                                checked={checked}
                                onCheckedChange={(next) => setValue(next ? 'true' : 'false')}
                                disabled={isReadOnly}
                            />
                        )}
                    </Field>
                    {saveButton}
                </div>
                {errorMessage}
            </div>
        );
    }

    return (
        <div className="space-y-2 py-3">
            <Field label={config.display_name} help={help}>
                {(field) => (
                    <div className="flex flex-wrap items-center gap-3">
                        {config.value_type === 'int' ? (
                            <Input
                                {...field}
                                type="text"
                                size="compact"
                                inputMode="numeric"
                                // PG-38: group digits in the UI language ("10,000,000" en /
                                // "10 000 000" cs); the change handler strips every separator.
                                value={format.number(parseInt(value) || 0)}
                                onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ''))}
                                className="w-32 text-right font-mono"
                                disabled={isReadOnly}
                            />
                        ) : (
                            <Input
                                {...field}
                                type="text"
                                size="compact"
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                className="min-w-0 flex-1"
                                disabled={isReadOnly}
                            />
                        )}
                        {saveButton}
                    </div>
                )}
            </Field>
            {errorMessage}
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
            <CardHeader className="mb-0" icon={Settings2} title={t('admin:system_settings.title')} />

            {error ? (
                <ErrorState variant="banner" onRetry={() => void refetch()} isRetrying={isFetching} />
            ) : null}

            {categories.length === 0 ? (
                <EmptyState title={t('admin:system_settings.empty')} testId="system-settings-empty" />
            ) : null}

            {categories.map((category) => {
                const categoryInfo = CATEGORY_LABELS[category];
                const categoryConfigs = configs?.[category] || [];

                return (
                    <Card as="section" key={category} tone="nested" padding="compact">
                        <CardHeader
                            className="mb-2"
                            titleAs="h3"
                            title={categoryInfo ? t(categoryInfo.labelKey) : category}
                            description={categoryInfo ? t(categoryInfo.descriptionKey) : undefined}
                        />

                        <div className="divide-y divide-border">
                            {categoryConfigs.map((config) => (
                                <ConfigInput
                                    key={config.key}
                                    canUpdate={canUpdateSettings}
                                    config={config}
                                    onSave={handleSave}
                                />
                            ))}
                        </div>
                    </Card>
                );
            })}
        </div>
    );
}
