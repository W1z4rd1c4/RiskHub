import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Link as LinkIcon, Loader2, Plus } from 'lucide-react';

import { LinkManagementDialog } from '@/components/LinkManagementDialog';
import type { ExistingLinkItem } from '@/components/linking/ExistingLinksPanel';
import { VendorLinkedControlCard } from '@/components/vendors/VendorLinkedControlCard';
import { useTranslation } from '@/i18n/hooks';
import { vendorLinkApi } from '@/services/vendorLinkApi';
import type { LinkedControl } from '@/types/vendorLink';
import { logError } from '@/services/logger';

interface VendorLinkedControlsTabProps {
    vendorId: number;
    canCreateControl: boolean;
    canEdit: boolean;
    onAddControl: () => void;
    onNavigateToControl: (controlId: number) => void;
}

type DialogMode = 'links-only' | 'search-only';

export function VendorLinkedControlsTab({
    vendorId,
    canCreateControl,
    canEdit,
    onAddControl,
    onNavigateToControl,
}: VendorLinkedControlsTabProps) {
    const { t } = useTranslation(['vendors', 'common']);
    const [linkedControls, setLinkedControls] = useState<LinkedControl[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<DialogMode>('search-only');

    const refresh = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await vendorLinkApi.getLinkedControls(vendorId);
            setLinkedControls(data);
            setError(null);
        } catch (err) {
            logError('Failed to load linked controls:', err);
            setError(t('errors.load_failed'));
        } finally {
            setIsLoading(false);
        }
    }, [t, vendorId]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const existingLinks = useMemo<ExistingLinkItem[]>(
        () =>
            linkedControls.map((control) => ({
                display_name: control.name,
                id: control.id,
                effectiveness: 'linked',
                control_id: control.id,
            })),
        [linkedControls],
    );

    const activeControls = linkedControls.filter((control) => !control.is_archived);
    const archivedControls = linkedControls.filter((control) => control.is_archived);

    const handleLink = async (controlId: number) => {
        await vendorLinkApi.linkControl(vendorId, controlId);
        await refresh();
    };

    const handleUnlink = async (controlId: number) => {
        await vendorLinkApi.unlinkControl(vendorId, controlId);
        await refresh();
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 }}
            className="glass-card"
        >
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6 gap-4">
                <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    <div>
                        <h3 className="font-bold text-white uppercase tracking-widest text-xs">
                            {t('tabs.linked_controls')}
                        </h3>
                        <p className="text-sm text-slate-500 mt-1">
                            {t('links.controls.subtitle')}
                        </p>
                    </div>
                </div>
                {canEdit ? (
                    <div className="flex items-stretch bg-accent/10 border border-accent/20 rounded-lg overflow-hidden">
                        <button
                            type="button"
                            onClick={() => {
                                setDialogMode('search-only');
                                setIsDialogOpen(true);
                            }}
                            className="flex items-center gap-2 px-4 py-1.5 text-accent text-[10px] font-black uppercase tracking-widest hover:bg-accent/10 transition-all border-r border-accent/20"
                        >
                            <LinkIcon className="h-3 w-3" />
                            {t('links.actions.link_existing')}
                        </button>
                        {canCreateControl ? (
                            <button
                                type="button"
                                onClick={onAddControl}
                                className="flex items-center gap-2 px-3 py-1.5 text-accent text-[10px] font-black uppercase tracking-widest hover:bg-accent/10 transition-all"
                                title={t('links.actions.add_control')}
                            >
                                <Plus className="h-3.5 w-3.5" />
                                <span>{t('links.actions.add_control')}</span>
                            </button>
                        ) : null}
                    </div>
                ) : null}
            </div>

            {isLoading ? (
                <div className="flex items-center gap-3 text-slate-400 font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('labels.loading')}
                </div>
            ) : error ? (
                <div className="mb-2 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400 text-sm font-medium">
                    <AlertCircle className="h-5 w-5" />
                    {error}
                </div>
            ) : linkedControls.length === 0 ? (
                <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-2xl">
                    <p className="text-xs text-slate-600 font-medium">{t('links.controls.empty')}</p>
                </div>
            ) : (
                <>
                    {activeControls.length > 0 ? (
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {activeControls.map((control) => (
                                <VendorLinkedControlCard
                                    key={control.id}
                                    control={control}
                                    onClick={() => onNavigateToControl(control.id)}
                                />
                            ))}
                        </div>
                    ) : null}

                    {archivedControls.length > 0 ? (
                        <div className="mt-8">
                            <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-slate-600" />
                                {t('links.archived_controls', { count: archivedControls.length })}
                            </h4>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 opacity-50 hover:opacity-100 transition-opacity">
                                {archivedControls.map((control) => (
                                    <VendorLinkedControlCard
                                        key={control.id}
                                        control={control}
                                        onClick={() => onNavigateToControl(control.id)}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : null}
                </>
            )}

            {canEdit ? (
                <button
                    type="button"
                    onClick={() => {
                        setDialogMode('links-only');
                        setIsDialogOpen(true);
                    }}
                    className="w-full mt-6 py-3 border border-dashed border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white hover:border-accent/40 hover:bg-white/5 transition-all"
                >
                    {t('links.actions.manage_existing')}
                </button>
            ) : null}

            {canEdit ? (
                <LinkManagementDialog
                    mode="risk-to-control"
                    title={t('links.dialogs.link_controls_title')}
                    existingLinks={existingLinks}
                    onLink={async (targetId) => handleLink(targetId)}
                    onUnlink={async (targetId) => handleUnlink(targetId)}
                    isOpen={isDialogOpen}
                    onClose={() => setIsDialogOpen(false)}
                    showSearch={dialogMode !== 'links-only'}
                    showLinks={dialogMode !== 'search-only'}
                    showLinkMetadataBadge={false}
                />
            ) : null}
        </motion.div>
    );
}
