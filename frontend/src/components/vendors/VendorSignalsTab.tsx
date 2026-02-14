import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { AlertTriangle, Loader2, RefreshCcw, Radar } from 'lucide-react';
import { vendorSignalApi } from '@/services/vendorSignalApi';
import type { VendorExternalSignal } from '@/types/vendorSignal';

interface VendorSignalsTabProps {
    vendorId: number;
    canRefresh: boolean;
}

function badge(text: string, className: string) {
    return <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${className}`}>{text}</span>;
}

export function VendorSignalsTab({ vendorId, canRefresh }: VendorSignalsTabProps) {
    const { t } = useTranslation('vendors');
    const [items, setItems] = useState<VendorExternalSignal[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const refresh = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await vendorSignalApi.list(vendorId);
            setItems(data);
        } catch (err) {
            console.error('Failed to load vendor signals:', err);
        } finally {
            setIsLoading(false);
        }
    }, [vendorId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const grouped = useMemo(() => {
        const byProvider = new Map<string, VendorExternalSignal[]>();
        for (const s of items) {
            const list = byProvider.get(s.provider_key) || [];
            list.push(s);
            byProvider.set(s.provider_key, list);
        }
        return Array.from(byProvider.entries()).map(([provider, list]) => ({
            provider,
            latest: list[0],
            items: list,
        }));
    }, [items]);

    return (
        <section className="glass-card p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <Radar className="h-4 w-4" />
                        {t('tabs.signals')}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                        {t('signals.subtitle')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={refresh}
                        className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                        title={t('actions.refresh')}
                    >
                        <RefreshCcw className="h-4 w-4 text-slate-300" />
                    </button>
                    {canRefresh && (
                        <button
                            onClick={async () => {
                                try {
                                    setIsRefreshing(true);
                                    const data = await vendorSignalApi.refresh(vendorId);
                                    setItems(data);
                                } catch (err) {
                                    console.error('Failed to refresh vendor signals:', err);
                                } finally {
                                    setIsRefreshing(false);
                                }
                            }}
                            disabled={isRefreshing}
                            className="px-4 py-2 bg-accent/20 border border-accent/30 text-accent rounded-xl font-bold hover:bg-accent/30 transition-colors disabled:opacity-60"
                        >
                            {isRefreshing ? t('signals.actions.refreshing') : t('signals.actions.refresh')}
                        </button>
                    )}
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center gap-3 text-slate-500 font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('labels.loading')}
                </div>
            ) : grouped.length === 0 ? (
                <p className="text-sm text-slate-500 font-medium">{t('signals.empty')}</p>
            ) : (
                <div className="space-y-4">
                    {grouped.map((g) => (
                        <div key={g.provider} className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl space-y-2">
                            <div className="flex items-center justify-between gap-3">
                                <div className="space-y-1">
                                    <p className="text-sm text-white font-bold">{g.provider}</p>
                                    {g.latest && (
                                        <p className="text-xs text-slate-500 font-medium">
                                            {t('signals.last_fetched')}: {new Date(g.latest.fetched_at).toLocaleString()}
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {g.latest?.status === 'error'
                                        ? badge('ERROR', 'bg-rose-500/20 text-rose-300 border-rose-500/20')
                                        : badge('OK', 'bg-emerald-500/20 text-emerald-300 border-emerald-500/20')}
                                    {g.latest?.status === 'error' && <AlertTriangle className="h-4 w-4 text-rose-300" />}
                                </div>
                            </div>

                            {g.latest?.status === 'error' && g.latest.error_message && (
                                <p className="text-sm text-rose-200 whitespace-pre-wrap">{g.latest.error_message}</p>
                            )}

                            <details className="pt-2">
                                <summary className="cursor-pointer text-sm text-slate-300 font-bold">
                                    {t('signals.details')}
                                </summary>
                                <div className="mt-2 space-y-3">
                                    {g.items.slice(0, 5).map((s) => (
                                        <div key={s.id} className="p-3 bg-slate-950/40 border border-white/10 rounded-xl">
                                            <p className="text-xs text-slate-500 font-medium mb-2">
                                                {s.signal_type} · {new Date(s.fetched_at).toLocaleString()}
                                            </p>
                                            <pre className="text-xs text-slate-200 overflow-auto">
                                                {JSON.stringify(s.payload_json, null, 2)}
                                            </pre>
                                        </div>
                                    ))}
                                </div>
                            </details>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
