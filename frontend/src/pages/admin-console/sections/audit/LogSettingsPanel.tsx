import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { InlineMessage } from '@/components/ui/inline-message';
import { Input } from '@/components/ui/input';
import { translateUiMessage, useTranslation } from '@/i18n/hooks';
import { parseBoundedInteger } from '@/lib/boundedInteger';
import { adminKeys } from '@/lib/queryKeys';
import { adminApi, type LogConfig } from '@/services/adminApi';
import { apiClient } from '@/services/apiClient';
import { ErrorState, LoadingState } from '@/components/ui/state';

interface LogConfigNumberInputProps {
    label: string;
    hint: string;
    value: string;
    error?: string;
    onChange: (value: string) => void;
}

function LogConfigNumberInput({ label, hint, value, error, onChange }: LogConfigNumberInputProps) {
    return (
        <Field label={label} help={hint} error={error} className="space-y-2">
            {(control) => (
                <Input
                    {...control}
                    type="number"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    min="1"
                    max="500"
                />
            )}
        </Field>
    );
}

type LogConfigDraft = Record<keyof LogConfig, string>;

function toLogConfigDraft(config: LogConfig): LogConfigDraft {
    return {
        app_log_rotation_size_mb: String(config.app_log_rotation_size_mb),
        app_log_retention_count: String(config.app_log_retention_count),
        audit_log_rotation_size_mb: String(config.audit_log_rotation_size_mb),
        audit_log_retention_count: String(config.audit_log_retention_count),
    };
}

function parseLogConfigDraft(draft: LogConfigDraft): LogConfig | null {
    const appLogRotationSize = parseBoundedInteger(draft.app_log_rotation_size_mb, 1, 500);
    const appLogRetentionCount = parseBoundedInteger(draft.app_log_retention_count, 1, 500);
    const auditLogRotationSize = parseBoundedInteger(draft.audit_log_rotation_size_mb, 1, 500);
    const auditLogRetentionCount = parseBoundedInteger(draft.audit_log_retention_count, 1, 500);
    if (
        appLogRotationSize === null
        || appLogRetentionCount === null
        || auditLogRotationSize === null
        || auditLogRetentionCount === null
    ) return null;

    return {
        app_log_rotation_size_mb: appLogRotationSize,
        app_log_retention_count: appLogRetentionCount,
        audit_log_rotation_size_mb: auditLogRotationSize,
        audit_log_retention_count: auditLogRetentionCount,
    };
}

function isSameLogConfig(left: LogConfig, right: LogConfig): boolean {
    return (
        left.app_log_rotation_size_mb === right.app_log_rotation_size_mb
        && left.app_log_retention_count === right.app_log_retention_count
        && left.audit_log_rotation_size_mb === right.audit_log_rotation_size_mb
        && left.audit_log_retention_count === right.audit_log_retention_count
    );
}

function isSameLogConfigDraft(draft: LogConfigDraft, config: LogConfig): boolean {
    return (
        draft.app_log_rotation_size_mb === String(config.app_log_rotation_size_mb)
        && draft.app_log_retention_count === String(config.app_log_retention_count)
        && draft.audit_log_rotation_size_mb === String(config.audit_log_rotation_size_mb)
        && draft.audit_log_retention_count === String(config.audit_log_retention_count)
    );
}

interface LogSettingsPanelProps {
    canUpdateLogConfig: boolean;
}

export function LogSettingsPanel({ canUpdateLogConfig }: LogSettingsPanelProps) {
    const { t } = useTranslation('admin');
    const queryClient = useQueryClient();
    const lastSavedConfigRef = useRef<LogConfig | null>(null);
    const [showSavedNotice, setShowSavedNotice] = useState(false);
    const [form, setForm] = useState<LogConfigDraft | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    const { data: config, isLoading, isError, isFetching, refetch } = useQuery({
        queryKey: adminKeys.logConfig(),
        queryFn: () => adminApi.getLogConfig(),
    });

    const mutation = useMutation({
        mutationFn: (newConfig: LogConfig) => adminApi.updateLogConfig(newConfig),
        onSuccess: (updatedConfig) => {
            setErrorMessage(null);
            lastSavedConfigRef.current = updatedConfig;
            queryClient.setQueryData(adminKeys.logConfig(), updatedConfig);
            setForm(toLogConfigDraft(updatedConfig));
            setIsDirty(false);
            void queryClient.invalidateQueries({ queryKey: adminKeys.logConfig() });
            setShowSavedNotice(true);
        },
        onError: (error) => {
            setShowSavedNotice(false);
            setErrorMessage(translateUiMessage(t, apiClient.toUiMessageKey(error)));
        },
    });

    useEffect(() => {
        if (!config || isLoading) return;
        if (!form) {
            setForm(toLogConfigDraft(config));
            return;
        }
        if (isDirty) return;

        const lastSavedConfig = lastSavedConfigRef.current;
        if (lastSavedConfig) {
            if (isSameLogConfig(config, lastSavedConfig)) {
                lastSavedConfigRef.current = null;
                setForm(toLogConfigDraft(config));
            }
            return;
        }

        if (!isSameLogConfigDraft(form, config)) {
            setForm(toLogConfigDraft(config));
        }
    }, [config, form, isDirty, isLoading]);

    if (isLoading) {
        return <LoadingState label={t('common:loading.named', { name: t('audit.title') })} className="mb-6" />;
    }
    if (isError && !config) {
        return (
            <ErrorState
                title={t('audit.title')}
                onRetry={() => void refetch()}
                isRetrying={isFetching}
                className="mb-6"
            />
        );
    }
    if (!form) return null;

    const updateForm = (patch: Partial<LogConfigDraft>) => {
        setForm({ ...form, ...patch });
        setIsDirty(true);
        setShowSavedNotice(false);
    };
    const parsedForm = parseLogConfigDraft(form);
    const valueError = t('audit.value_between');
    const fieldError = (field: keyof LogConfig) => (
        parseBoundedInteger(form[field], 1, 500) === null ? valueError : undefined
    );

    return (
        <Card tone="nested" padding="compact" className="mb-6">
            <div className="flex items-center gap-2 mb-4">
                <Settings2 aria-hidden="true" className="h-5 w-5 text-accent-text" />
                <h2 className="font-medium text-foreground">{t('audit.title')}</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4 rounded-xl border border-border bg-tint/5 p-4">
                    <h3 className="text-sm font-semibold text-foreground">{t('tabs.application_logs')}</h3>
                    <LogConfigNumberInput
                        label={t('audit.max_file_size')}
                        hint={t('audit.max_file_size_hint')}
                        value={form.app_log_rotation_size_mb}
                        error={fieldError('app_log_rotation_size_mb')}
                        onChange={(app_log_rotation_size_mb) => updateForm({ app_log_rotation_size_mb })}
                    />
                    <LogConfigNumberInput
                        label={t('audit.retention_count')}
                        hint={t('audit.retention_count_hint')}
                        value={form.app_log_retention_count}
                        error={fieldError('app_log_retention_count')}
                        onChange={(app_log_retention_count) => updateForm({ app_log_retention_count })}
                    />
                </div>

                <div className="space-y-4 rounded-xl border border-border bg-tint/5 p-4">
                    <h3 className="text-sm font-semibold text-foreground">{t('tabs.audit_logs')}</h3>
                    <LogConfigNumberInput
                        label={t('audit.max_file_size')}
                        hint={t('audit.max_file_size_hint')}
                        value={form.audit_log_rotation_size_mb}
                        error={fieldError('audit_log_rotation_size_mb')}
                        onChange={(audit_log_rotation_size_mb) => updateForm({ audit_log_rotation_size_mb })}
                    />
                    <LogConfigNumberInput
                        label={t('audit.retention_count')}
                        hint={t('audit.retention_count_hint')}
                        value={form.audit_log_retention_count}
                        error={fieldError('audit_log_retention_count')}
                        onChange={(audit_log_retention_count) => updateForm({ audit_log_retention_count })}
                    />
                </div>
            </div>

            {errorMessage ? <InlineMessage tone="danger" className="mt-4">{errorMessage}</InlineMessage> : null}
            {/* The saved notice carries the restart caveat, so it stays until the next edit
                or dismissal instead of vanishing on a timer. */}
            {showSavedNotice ? (
                <InlineMessage tone="success" className="mt-4" onDismiss={() => setShowSavedNotice(false)}>
                    {t('audit.settings_saved_notice')}
                </InlineMessage>
            ) : null}

            <div className="mt-4 flex items-center justify-between">
                <div className="space-y-1">
                    <p className="text-xs text-warning-text italic">
                        {t('audit.note')}
                    </p>
                </div>
                {canUpdateLogConfig && (
                    <Button
                        type="button"
                        variant="accent"
                        onClick={() => {
                            if (parsedForm) mutation.mutate(parsedForm);
                        }}
                        disabled={mutation.isPending || parsedForm === null}
                        isLoading={mutation.isPending}
                    >
                        {mutation.isPending ? t('audit.saving') : t('audit.save_settings')}
                    </Button>
                )}
            </div>
        </Card>
    );
}
