import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { AlertTriangle, Loader2, RefreshCcw, Radar } from 'lucide-react';
import {
    VendorActionButton,
    VendorBadge,
    VendorEmptyState,
    VendorSectionHeader,
    VendorSurface,
} from '@/components/vendors/vendorRouteUi';
import { vendorSignalApi } from '@/services/vendorSignalApi';
import type { VendorExternalSignal } from '@/types/vendorSignal';

interface VendorSignalsTabProps {
    vendorId: number;
    canRefresh: boolean;
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
        <VendorSurface className="space-y-6">
            <VendorSectionHeader
                icon={<Radar className="h-4 w-4" />}
                title={t('tabs.signals')}
                description={t('signals.subtitle')}
                actions={(
                    <>
                        <VendorActionButton onClick={refresh}>
                            <RefreshCcw className="h-4 w-4" />
                            {t('actions.refresh')}
                        </VendorActionButton>
                        {canRefresh ? (
                            <VendorActionButton
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
                                variant="primary"
                            >
                                {isRefreshing ? t('signals.actions.refreshing') : t('signals.actions.refresh')}
                            </VendorActionButton>
                        ) : null}
                    </>
                )}
            />

            {isLoading ? (
                <div className="flex items-center gap-3 vendor-muted font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('labels.loading')}
                </div>
            ) : grouped.length === 0 ? (
                <VendorEmptyState title={t('signals.empty')} icon={<Radar className="h-8 w-8" />} />
            ) : (
                <div className="space-y-4">
                    {grouped.map((g) => (
                        <div key={g.provider} className="vendor-card space-y-2">
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
                                        ? <VendorBadge tone="danger">ERROR</VendorBadge>
                                        : <VendorBadge tone="success">OK</VendorBadge>}
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
                                        <div key={s.id} className="vendor-card">
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
        </VendorSurface>
    );
}
