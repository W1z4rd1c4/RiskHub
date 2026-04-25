import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings2 } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import { adminApi, type LogConfig } from '@/services/adminApi';
import { apiClient } from '@/services/apiClient';

interface LogConfigNumberInputProps {
    label: string;
    hint: string;
    value: number;
    onChange: (value: number) => void;
}

function LogConfigNumberInput({ label, hint, value, onChange }: LogConfigNumberInputProps) {
    return (
        <div className="space-y-2">
            <label className="admin-muted text-sm">{label}</label>
            <input
                type="number"
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-accent"
                min="1"
                max="500"
            />
            <p className="admin-subtle text-xs">{hint}</p>
        </div>
    );
}

function isSameLogConfig(left: LogConfig, right: LogConfig): boolean {
    return (
        left.app_log_rotation_size_mb === right.app_log_rotation_size_mb
        && left.app_log_retention_count === right.app_log_retention_count
        && left.audit_log_rotation_size_mb === right.audit_log_rotation_size_mb
        && left.audit_log_retention_count === right.audit_log_retention_count
    );
}

export function LogSettingsPanel() {
    const { t } = useTranslation('admin');
    const queryClient = useQueryClient();
    const lastSavedConfigRef = useRef<LogConfig | null>(null);
    const [showSavedNotice, setShowSavedNotice] = useState(false);
    const [form, setForm] = useState<LogConfig | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    const { data: config, isLoading } = useQuery({
        queryKey: ['logConfig'],
        queryFn: () => adminApi.getLogConfig(),
    });

    const mutation = useMutation({
        mutationFn: (newConfig: LogConfig) => adminApi.updateLogConfig(newConfig),
        onSuccess: (updatedConfig) => {
            setErrorMessage(null);
            lastSavedConfigRef.current = updatedConfig;
            queryClient.setQueryData(['logConfig'], updatedConfig);
            setForm(updatedConfig);
            setIsDirty(false);
            void queryClient.invalidateQueries({ queryKey: ['logConfig'] });
            setShowSavedNotice(true);
        },
        onError: (error) => {
            setShowSavedNotice(false);
            setErrorMessage(apiClient.getRawErrorMessage(error) ?? t(apiClient.toUiMessageKey(error), { ns: 'errorKeys' }));
        },
    });

    useEffect(() => {
        if (!config || isLoading) return;
        if (!form) {
            setForm(config);
            return;
        }
        if (isDirty) return;

        const lastSavedConfig = lastSavedConfigRef.current;
        if (lastSavedConfig) {
            if (isSameLogConfig(config, lastSavedConfig)) {
                lastSavedConfigRef.current = null;
                setForm(config);
            }
            return;
        }

        setForm(config);
    }, [config, form, isDirty, isLoading]);

    useEffect(() => {
        if (!showSavedNotice) return;
        const timeout = window.setTimeout(() => setShowSavedNotice(false), 3500);
        return () => window.clearTimeout(timeout);
    }, [showSavedNotice]);

    if (isLoading || !form) return null;

    const updateForm = (patch: Partial<LogConfig>) => {
        setForm({ ...form, ...patch });
        setIsDirty(true);
    };

    return (
        <div className="admin-surface-muted mb-6 rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-4">
                <Settings2 className="h-5 w-5 text-accent" />
                <h4 className="admin-title font-medium">{t('audit.title')}</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="admin-surface-elevated space-y-4 rounded-xl border p-4">
                    <h5 className="admin-title text-sm font-semibold">{t('tabs.application_logs')}</h5>
                    <LogConfigNumberInput
                        label={t('audit.max_file_size')}
                        hint={t('audit.max_file_size_hint')}
                        value={form.app_log_rotation_size_mb}
                        onChange={(app_log_rotation_size_mb) => updateForm({ app_log_rotation_size_mb })}
                    />
                    <LogConfigNumberInput
                        label={t('audit.retention_count')}
                        hint={t('audit.retention_count_hint')}
                        value={form.app_log_retention_count}
                        onChange={(app_log_retention_count) => updateForm({ app_log_retention_count })}
                    />
                </div>

                <div className="admin-surface-elevated space-y-4 rounded-xl border p-4">
                    <h5 className="admin-title text-sm font-semibold">{t('tabs.audit_logs')}</h5>
                    <LogConfigNumberInput
                        label={t('audit.max_file_size')}
                        hint={t('audit.max_file_size_hint')}
                        value={form.audit_log_rotation_size_mb}
                        onChange={(audit_log_rotation_size_mb) => updateForm({ audit_log_rotation_size_mb })}
                    />
                    <LogConfigNumberInput
                        label={t('audit.retention_count')}
                        hint={t('audit.retention_count_hint')}
                        value={form.audit_log_retention_count}
                        onChange={(audit_log_retention_count) => updateForm({ audit_log_retention_count })}
                    />
                </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
                <div className="space-y-1">
                    <p className="text-xs text-amber-500/80 italic">
                        {t('audit.note')}
                    </p>
                    {showSavedNotice && (
                        <p className="text-xs text-emerald-400 font-medium">
                            {t('audit.settings_saved_notice')}
                        </p>
                    )}
                    {errorMessage && (
                        <p className="text-xs text-rose-400 font-medium">
                            {errorMessage}
                        </p>
                    )}
                </div>
                <button
                    onClick={() => mutation.mutate(form)}
                    disabled={mutation.isPending}
                    className="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded-lg transition-colors font-medium disabled:opacity-50"
                >
                    {mutation.isPending ? t('audit.saving') : t('audit.save_settings')}
                </button>
            </div>
        </div>
    );
}
