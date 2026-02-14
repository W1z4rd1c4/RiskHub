import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { Activity, BadgeCheck, Clock, Loader2, Plus, RefreshCcw } from 'lucide-react';
import { vendorSlaApi } from '@/services/vendorSlaApi';
import type { VendorSLA } from '@/types/vendorSla';
import { VendorSLAModal } from '@/components/vendors/VendorSLAModal';
import { useAuth } from '@/contexts/AuthContext';

interface VendorSLATabProps {
    vendorId: number;
    canEditVendor: boolean;
}

function statusBadge(sla: VendorSLA) {
    const isBreaching = sla.breach_status !== 'within';
    return (
        <span
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${isBreaching
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/20'
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/20'
                }`}
        >
            {isBreaching ? 'BREACH' : 'OK'}
        </span>
    );
}

export function VendorSLATab({ vendorId, canEditVendor }: VendorSLATabProps) {
    const { t } = useTranslation('vendors');
    const { user, hasPermission } = useAuth();

    const [items, setItems] = useState<VendorSLA[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [includeArchived, setIncludeArchived] = useState(false);

    const [selected, setSelected] = useState<VendorSLA | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const latestRequestIdRef = useRef(0);

    const refresh = useCallback(async () => {
        const requestId = ++latestRequestIdRef.current;
        try {
            setIsLoading(true);
            const data = await vendorSlaApi.list({ vendor_id: vendorId, include_archived: includeArchived });
            if (requestId === latestRequestIdRef.current) {
                setItems(data);
            }
        } catch (err) {
            console.error('Failed to load vendor SLAs:', err);
        } finally {
            if (requestId === latestRequestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, [vendorId, includeArchived]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const canCreate = canEditVendor || hasPermission('vendors', 'write');
    const canDeleteSla = hasPermission('vendors', 'delete');

    const canManageItem = useCallback(
        (sla: VendorSLA) => {
            if (canEditVendor || hasPermission('vendors', 'write')) return true;
            if (user?.id && sla.reporting_owner_id && user.id === sla.reporting_owner_id) return true;
            return false;
        },
        [canEditVendor, hasPermission, user?.id],
    );

    const ordered = useMemo(() => {
        const active = items.filter((s) => !s.is_archived);
        const archived = items.filter((s) => s.is_archived);
        const sortBy = (a: VendorSLA, b: VendorSLA) => a.metric_name.localeCompare(b.metric_name);
        return [...active.sort(sortBy), ...archived.sort(sortBy)];
    }, [items]);

    return (
        <section className="glass-card p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        {t('tabs.sla')}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                        {t('sla.subtitle')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={refresh}
                        className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                        title={t('actions.refresh')}
                    >
                        <RefreshCcw className="h-4 w-4 text-slate-300" />
                    </button>
                    {canCreate && (
                        <button
                            type="button"
                            onClick={() => {
                                setSelected(null);
                                setIsModalOpen(true);
                            }}
                            className="px-4 py-2 bg-accent/20 border border-accent/30 text-accent rounded-xl font-bold hover:bg-accent/30 transition-colors flex items-center gap-2"
                        >
                            <Plus className="h-4 w-4" />
                            {t('sla.actions.add')}
                        </button>
                    )}
                </div>
            </div>

            <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-200 font-medium">
                    <input
                        type="checkbox"
                        checked={includeArchived}
                        onChange={(e) => setIncludeArchived(e.target.checked)}
                    />
                    {t('sla.include_archived')}
                </label>
            </div>

            {isLoading ? (
                <div className="flex items-center gap-3 text-slate-500 font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('labels.loading')}
                </div>
            ) : ordered.length === 0 ? (
                <p className="text-sm text-slate-500 font-medium">{t('sla.empty')}</p>
            ) : (
                <div className="space-y-3">
                    {ordered.map((sla) => (
                        <div
                            key={sla.id}
                            className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl flex items-start justify-between gap-4"
                        >
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm text-white font-bold">{sla.metric_name}</p>
                                    {statusBadge(sla)}
                                    {sla.is_archived && (
                                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-white/5 text-slate-300 border border-white/10">
                                            {t('sla.badges.archived')}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 font-medium">
                                    {t('sla.current')}: <span className="font-mono text-slate-300">{sla.current_value} {sla.unit}</span>{' '}
                                    · {t('sla.limits')}: <span className="font-mono text-slate-300">{sla.lower_limit}–{sla.upper_limit} {sla.unit}</span>
                                </p>
                                {sla.last_reported_at && (
                                    <p className="text-xs text-slate-600 font-medium flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {t('sla.last_reported')}: {new Date(sla.last_reported_at).toLocaleString()}
                                    </p>
                                )}
                                {sla.description && <p className="text-sm text-slate-200 whitespace-pre-wrap">{sla.description}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                                {sla.is_archived && canDeleteSla && (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            await vendorSlaApi.restore(sla.id);
                                            await refresh();
                                        }}
                                        className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-bold hover:bg-emerald-500/20 transition-colors"
                                    >
                                        {t('actions.unarchive')}
                                    </button>
                                )}
                                {(canManageItem(sla) || canCreate) && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelected(sla);
                                            setIsModalOpen(true);
                                        }}
                                        className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-200 font-bold hover:bg-white/10 transition-colors flex items-center gap-2"
                                    >
                                        <BadgeCheck className="h-4 w-4" />
                                        {t('sla.actions.manage')}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <VendorSLAModal
                vendorId={vendorId}
                sla={selected}
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSaved={refresh}
                canManage={selected ? canManageItem(selected) : canCreate}
                canDelete={canDeleteSla}
            />
        </section>
    );
}
