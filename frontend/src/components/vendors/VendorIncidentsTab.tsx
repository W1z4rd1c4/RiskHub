import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { AlertOctagon, Loader2, Plus, Trash2 } from 'lucide-react';
import {
    VendorActionButton,
    VendorBadge,
    VendorEmptyState,
    VendorSectionHeader,
    VendorSurface,
} from '@/components/vendors/vendorRouteUi';
import { vendorIncidentApi } from '@/services/vendorIncidentApi';
import type { VendorIncident } from '@/types/vendorIncident';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { VendorIncidentModal } from '@/components/vendors/VendorIncidentModal';

interface VendorIncidentsTabProps {
    vendorId: number;
    canEdit: boolean;
}



export function VendorIncidentsTab({ vendorId, canEdit }: VendorIncidentsTabProps) {
    const { t } = useTranslation('vendors');
    const [items, setItems] = useState<VendorIncident[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [deleteIncidentId, setDeleteIncidentId] = useState<number | null>(null);
    const refresh = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await vendorIncidentApi.listIncidents(vendorId);
            setItems(data);
        } catch (err) {
            console.error('Failed to load vendor incidents:', err);
        } finally {
            setIsLoading(false);
        }
    }, [vendorId]);

    useEffect(() => {
        refresh();
    }, [refresh]);



    const handleConfirmDelete = async () => {
        if (deleteIncidentId === null) return;
        try {
            await vendorIncidentApi.deleteIncident(deleteIncidentId);
            await refresh();
        } catch (err) {
            console.error('Failed to delete incident:', err);
        } finally {
            setDeleteIncidentId(null);
        }
    };

    return (
        <>
            <VendorSurface className="space-y-6">
                <VendorSectionHeader
                    icon={<AlertOctagon className="h-4 w-4" />}
                    title={t('tabs.incidents')}
                    description={t('incidents.subtitle')}
                    actions={canEdit ? (
                        <VendorActionButton variant="primary" onClick={() => setIsModalOpen(true)}>
                            <Plus className="h-4 w-4" />
                            {t('incidents.actions.add')}
                        </VendorActionButton>
                    ) : null}
                />



                {isLoading ? (
                    <div className="flex items-center gap-3 vendor-muted font-medium">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('labels.loading')}
                    </div>
                ) : items.length === 0 ? (
                    <VendorEmptyState title={t('incidents.empty')} icon={<AlertOctagon className="h-8 w-8" />} />
                ) : (
                    <div className="space-y-3">
                        {items.map((i) => (
                            <div
                                key={i.id}
                                className={`vendor-card space-y-2 ${i.severity === 'critical' || i.severity === 'high' ? 'border-rose-500/30 bg-rose-500/5' :
                                    i.severity === 'medium' ? 'border-amber-500/30 bg-amber-500/5' :
                                        ''
                                    }`}
                            >
                                <div className="flex items-center justify-between">
                                    <p className="text-sm text-white font-bold">{i.summary}</p>
                                    <div className="flex items-center gap-2">
                                        {i.is_major && <VendorBadge tone="danger">MAJOR</VendorBadge>}
                                        <VendorBadge tone="neutral">{i.severity.toUpperCase()}</VendorBadge>
                                        {canEdit && (
                                            <button
                                                onClick={() => setDeleteIncidentId(i.id)}
                                                className="p-2 text-rose-300 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500 font-medium">
                                    {i.incident_type} · {new Date(i.created_at).toLocaleDateString()}
                                </p>
                                {i.details && <p className="text-sm text-slate-200 whitespace-pre-wrap">{i.details}</p>}
                            </div>
                        ))}
                    </div>
                )}
                <ConfirmDialog
                    isOpen={deleteIncidentId !== null}
                    onClose={() => setDeleteIncidentId(null)}
                    onConfirm={handleConfirmDelete}
                    title={t('common:actions.delete')}
                    message={t('incidents.confirm_delete')}
                    confirmLabel={t('common:actions.delete')}
                    variant="danger"
                />
            </VendorSurface>
            <VendorIncidentModal
                vendorId={vendorId}
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSaved={refresh}
            />
        </>
    );
}
