import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { Activity, BadgeCheck, Clock, Loader2, Plus, RefreshCcw } from 'lucide-react';
import {
    VendorActionButton,
    VendorBadge,
    VendorEmptyState,
    VendorSectionHeader,
    VendorSurface,
} from '@/components/vendors/vendorRouteUi';
import { vendorSlaApi } from '@/services/vendorSlaApi';
import type { VendorSLA } from '@/types/vendorSla';
import { VendorSLAModal } from '@/components/vendors/VendorSLAModal';
import { useAuth } from '@/contexts/AuthContext';

interface VendorSLATabProps {
    vendorId: number;
    canEditVendor: boolean;
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
        <VendorSurface className="space-y-6">
            <VendorSectionHeader
                icon={<Activity className="h-4 w-4" />}
                title={t('tabs.sla')}
                description={t('sla.subtitle')}
                actions={(
                    <>
                        <VendorActionButton onClick={refresh}>
                            <RefreshCcw className="h-4 w-4" />
                            {t('actions.refresh')}
                        </VendorActionButton>
                        {canCreate ? (
                            <VendorActionButton
                                variant="primary"
                                onClick={() => {
                                    setSelected(null);
                                    setIsModalOpen(true);
                                }}
                            >
                                <Plus className="h-4 w-4" />
                                {t('sla.actions.add')}
                            </VendorActionButton>
                        ) : null}
                    </>
                )}
            />

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

            {!isLoading && ordered.length > 0 && (
                <div className="vendor-metric-strip" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    <div className="vendor-metric">
                        <span className="vendor-metric__label">{t('tabs.sla')}</span>
                        <span className="vendor-metric__value">{ordered.filter((s) => !s.is_archived).length}</span>
                    </div>
                    <div className="vendor-metric">
                        <span className="vendor-metric__label">{t('overview.monitoring.sla_breaches')}</span>
                        <span className={`vendor-metric__value ${ordered.filter((s) => s.breach_status !== 'within' && !s.is_archived).length > 0 ? 'text-rose-400' : ''}`}>
                            {ordered.filter((s) => s.breach_status !== 'within' && !s.is_archived).length}
                        </span>
                    </div>
                    <div className="vendor-metric">
                        <span className="vendor-metric__label">OK</span>
                        <span className="vendor-metric__value" style={{ color: 'var(--vendor-success)' }}>
                            {ordered.filter((s) => s.breach_status === 'within' && !s.is_archived).length}
                        </span>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center gap-3 vendor-muted font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('labels.loading')}
                </div>
            ) : ordered.length === 0 ? (
                <VendorEmptyState title={t('sla.empty')} icon={<Activity className="h-8 w-8" />} />
            ) : (
                <div className="space-y-3">
                    {ordered.map((sla) => (
                        <div
                            key={sla.id}
                            className="vendor-card flex items-start justify-between gap-4"
                        >
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm text-white font-bold">{sla.metric_name}</p>
                                    <VendorBadge tone={sla.breach_status !== 'within' ? 'danger' : 'success'}>
                                        {sla.breach_status !== 'within' ? 'BREACH' : 'OK'}
                                    </VendorBadge>
                                    {sla.is_archived && (
                                        <VendorBadge tone="neutral">
                                            {t('sla.badges.archived')}
                                        </VendorBadge>
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
                                    <VendorActionButton
                                        type="button"
                                        onClick={async () => {
                                            await vendorSlaApi.restore(sla.id);
                                            await refresh();
                                        }}
                                        variant="success"
                                    >
                                        {t('actions.unarchive')}
                                    </VendorActionButton>
                                )}
                                {(canManageItem(sla) || canCreate) && (
                                    <VendorActionButton
                                        type="button"
                                        onClick={() => {
                                            setSelected(sla);
                                            setIsModalOpen(true);
                                        }}
                                    >
                                        <BadgeCheck className="h-4 w-4" />
                                        {t('sla.actions.manage')}
                                    </VendorActionButton>
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
        </VendorSurface>
    );
}
