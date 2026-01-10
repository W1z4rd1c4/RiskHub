import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings2, Save, Check, AlertCircle } from 'lucide-react';
import { riskHubApi } from '@/services/riskHubApi';
import type { GlobalConfig } from '@/services/riskHubApi';
import { cn } from '@/lib/utils';

const CATEGORY_LABELS: Record<string, { label: string; description: string }> = {
    risk_thresholds: {
        label: 'Risk Thresholds',
        description: 'Configure score thresholds for risk classification'
    },
    approvals: {
        label: 'Approval Settings',
        description: 'Control which actions require approval workflows'
    },
    notifications: {
        label: 'Notification Settings',
        description: 'Configure reminder and escalation timing'
    },
};

interface ConfigInputProps {
    config: GlobalConfig;
    onSave: (key: string, value: string) => Promise<void>;
}

function ConfigInput({ config, onSave }: ConfigInputProps) {
    const [value, setValue] = useState(config.value);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const hasChanged = value !== config.value;

    const handleSave = async () => {
        if (!hasChanged) return;
        setError(null);
        setSaving(true);
        try {
            await onSave(config.key, value);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const renderInput = () => {
        if (config.value_type === 'bool') {
            return (
                <button
                    onClick={() => {
                        const newVal = value.toLowerCase() === 'true' ? 'false' : 'true';
                        setValue(newVal);
                    }}
                    className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                        value.toLowerCase() === 'true' ? "bg-accent" : "bg-white/20"
                    )}
                >
                    <span
                        className={cn(
                            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                            value.toLowerCase() === 'true' ? "translate-x-6" : "translate-x-1"
                        )}
                    />
                </button>
            );
        }

        if (config.value_type === 'int') {
            // Format display value with space thousands separators (e.g., "10 000 000 000")
            const numValue = parseInt(value) || 0;
            const displayValue = numValue.toLocaleString('cs-CZ').replace(/\u00a0/g, ' ');
            // Dynamic width: ~10px per char + padding
            const inputWidth = Math.max(60, displayValue.length * 10 + 24);

            return (
                <input
                    type="text"
                    inputMode="numeric"
                    value={displayValue}
                    onChange={(e) => {
                        // Strip spaces and non-numeric chars, store raw number
                        const cleaned = e.target.value.replace(/[^0-9]/g, '');
                        setValue(cleaned);
                    }}
                    style={{ width: `${inputWidth}px` }}
                    className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-right font-mono focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    disabled={!config.is_editable}
                />
            );
        }

        return (
            <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-accent"
                disabled={!config.is_editable}
            />
        );
    };

    return (
        <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
            <div className="flex-1">
                <div className="flex items-center gap-2">
                    <span className="text-white font-medium">{config.display_name}</span>
                    {config.min_value !== null && config.max_value !== null && (
                        <span className="text-xs text-slate-500">
                            ({config.min_value} - {config.max_value})
                        </span>
                    )}
                </div>
                {config.description && (
                    <p className="text-sm text-slate-500 mt-0.5">{config.description}</p>
                )}
            </div>

            <div className="flex items-center gap-3">
                {renderInput()}

                {hasChanged && (
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-1 px-3 py-1.5 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
                    >
                        {saving ? (
                            <span className="animate-spin">⏳</span>
                        ) : (
                            <Save className="h-3.5 w-3.5" />
                        )}
                        Save
                    </button>
                )}

                {saved && (
                    <span className="flex items-center gap-1 text-green-400 text-sm">
                        <Check className="h-4 w-4" /> Saved
                    </span>
                )}

                {error && (
                    <span className="flex items-center gap-1 text-red-400 text-sm">
                        <AlertCircle className="h-4 w-4" /> {error}
                    </span>
                )}
            </div>
        </div>
    );
}

export function SystemSettingsPanel() {
    const queryClient = useQueryClient();

    const { data: configs, isLoading, error } = useQuery({
        queryKey: ['globalConfig'],
        queryFn: () => riskHubApi.getAllConfig(),
    });

    const updateMutation = useMutation({
        mutationFn: ({ key, value }: { key: string; value: string }) => riskHubApi.updateConfig(key, value),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['globalConfig'] }),
    });

    const handleSave = async (key: string, value: string) => {
        await updateMutation.mutateAsync({ key, value });
    };

    if (isLoading) {
        return <div className="text-slate-400 text-center py-8">Loading settings...</div>;
    }

    if (error) {
        return <div className="text-red-400 text-center py-8">Failed to load settings</div>;
    }

    const categories = Object.keys(configs || {});

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Settings2 className="h-5 w-5 text-accent" />
                <h3 className="text-lg font-semibold text-white">System Settings</h3>
            </div>

            {categories.map((category) => {
                const categoryInfo = CATEGORY_LABELS[category] || { label: category, description: '' };
                const categoryConfigs = configs?.[category] || [];

                return (
                    <div key={category} className="bg-white/5 rounded-xl p-4">
                        <div className="mb-4">
                            <h4 className="text-white font-medium">{categoryInfo.label}</h4>
                            <p className="text-sm text-slate-500">{categoryInfo.description}</p>
                        </div>

                        <div className="space-y-1">
                            {categoryConfigs.map((config) => (
                                <ConfigInput
                                    key={config.key}
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
