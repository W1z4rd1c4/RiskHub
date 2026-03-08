import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { CheckSquare, ExternalLink, Link2, Loader2, Plus } from 'lucide-react';
import { LinkManagementDialog } from '@/components/LinkManagementDialog';
import type { ExistingLinkItem } from '@/components/linking/ExistingLinksPanel';
import {
    VendorActionButton,
    VendorEmptyState,
    VendorInlineMessage,
    VendorSectionHeader,
    VendorSurface,
} from '@/components/vendors/vendorRouteUi';
import { vendorLinkApi } from '@/services/vendorLinkApi';
import type { LinkedControl } from '@/types/vendorLink';

interface VendorLinkedControlsTabProps {
    vendorId: number;
    canEdit: boolean;
    onNavigateToControl: (controlId: number) => void;
}

export function VendorLinkedControlsTab({ vendorId, canEdit, onNavigateToControl }: VendorLinkedControlsTabProps) {
    const { t } = useTranslation('vendors');
    const [linkedControls, setLinkedControls] = useState<LinkedControl[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const refresh = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await vendorLinkApi.getLinkedControls(vendorId);
            setLinkedControls(data);
            setError(null);
        } catch (err) {
            console.error('Failed to load linked controls:', err);
            setError(t('errors.load_failed'));
        } finally {
            setIsLoading(false);
        }
    }, [t, vendorId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const existingLinks = useMemo<ExistingLinkItem[]>(
        () =>
            linkedControls.map((c) => ({
                display_name: c.name,
                id: c.id,
                effectiveness: 'linked',
                control_id: c.id,
            })),
        [linkedControls],
    );

    const activeControls = linkedControls.filter((control) => control.status !== 'archived');
    const archivedControls = linkedControls.filter((control) => control.status === 'archived');

    const handleLink = async (controlId: number) => {
        await vendorLinkApi.linkControl(vendorId, controlId);
        await refresh();
    };

    const handleUnlink = async (controlId: number) => {
        await vendorLinkApi.unlinkControl(vendorId, controlId);
        await refresh();
    };

    return (
        <VendorSurface className="space-y-6">
            <VendorSectionHeader
                icon={<CheckSquare className="h-4 w-4" />}
                title={t('tabs.linked_controls')}
                description={t('links.controls.subtitle')}
                actions={canEdit ? (
                    <VendorActionButton variant="primary" onClick={() => setIsDialogOpen(true)}>
                        <Plus className="h-4 w-4" />
                        {t('links.actions.manage')}
                    </VendorActionButton>
                ) : null}
            />

            {isLoading ? (
                <div className="flex items-center gap-3 vendor-muted font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('labels.loading')}
                </div>
            ) : error ? (
                <VendorInlineMessage tone="danger">{error}</VendorInlineMessage>
            ) : linkedControls.length === 0 ? (
                <VendorEmptyState icon={<Link2 className="h-8 w-8" />} title={t('links.controls.empty')} />
            ) : (
                <div className="space-y-5">
                    {activeControls.length > 0 && (
                        <div className="space-y-3">
                            {activeControls.map((control) => (
                                <button
                                    key={control.id}
                                    onClick={() => onNavigateToControl(control.id)}
                                    className="w-full p-4 bg-white/[0.03] border border-white/5 rounded-2xl flex items-center justify-between hover:bg-white/[0.05] transition-all text-left group"
                                >
                                    <div className="min-w-0 pr-4">
                                        <div className="text-sm font-bold text-white truncate group-hover:text-accent transition-colors">
                                            {control.name}
                                        </div>
                                        <div className="text-[10px] text-slate-500 mt-1 font-medium">
                                            {control.department_name ?? '—'}
                                            {control.status ? (
                                                <>
                                                    <span className="text-slate-700 mx-2">/</span>
                                                    {control.status}
                                                </>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="p-2 rounded-lg bg-white/5 group-hover:bg-accent/20 transition-colors">
                                        <ExternalLink className="h-4 w-4 text-slate-500 group-hover:text-accent" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                    {archivedControls.length > 0 && (
                        <div className="space-y-3">
                            <h4 className="text-sm font-semibold vendor-text">
                                {t('links.archived_controls')} ({archivedControls.length})
                            </h4>
                            <div className="space-y-3 opacity-70">
                                {archivedControls.map((control) => (
                                    <button
                                        key={control.id}
                                        onClick={() => onNavigateToControl(control.id)}
                                        className="w-full p-4 bg-white/[0.03] border border-white/5 rounded-2xl flex items-center justify-between hover:bg-white/[0.05] transition-all text-left group"
                                    >
                                        <div className="min-w-0 pr-4">
                                            <div className="text-sm font-bold text-white truncate group-hover:text-accent transition-colors">
                                                {control.name}
                                            </div>
                                            <div className="text-[10px] text-slate-500 mt-1 font-medium">
                                                {control.department_name ?? '—'}
                                                {control.status ? (
                                                    <>
                                                        <span className="text-slate-700 mx-2">/</span>
                                                        {control.status}
                                                    </>
                                                ) : null}
                                            </div>
                                        </div>
                                        <div className="p-2 rounded-lg bg-white/5 group-hover:bg-accent/20 transition-colors">
                                            <ExternalLink className="h-4 w-4 text-slate-500 group-hover:text-accent" />
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {canEdit && (
                <LinkManagementDialog
                    mode="risk-to-control"
                    title={t('links.dialogs.link_controls_title')}
                    existingLinks={existingLinks}
                    onLink={async (targetId, _effectiveness, _notes) => handleLink(targetId)}
                    onUnlink={async (targetId) => handleUnlink(targetId)}
                    isOpen={isDialogOpen}
                    onClose={() => setIsDialogOpen(false)}
                    showLinkMetadataBadge={false}
                />
            )}
        </VendorSurface>
    );
}
