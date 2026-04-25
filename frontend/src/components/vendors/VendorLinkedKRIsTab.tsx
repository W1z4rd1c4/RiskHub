import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Link as LinkIcon, Loader2, Plus, Target } from 'lucide-react';

import { LinkManagementDialog } from '@/components/LinkManagementDialog';
import type { ExistingLinkItem } from '@/components/linking/ExistingLinksPanel';
import { KRIGaugeCard } from '@/components/kri/KRIGaugeCard';
import { useTranslation } from '@/i18n/hooks';
import { vendorLinkApi } from '@/services/vendorLinkApi';
import type { LinkedKRI } from '@/types/vendorLink';
import { logError } from '@/services/logger';

interface VendorLinkedKRIsTabProps {
    vendorId: number;
    canCreateKri: boolean;
    canEdit: boolean;
    onAddKri: () => void;
    onNavigateToKri: (kriId: number) => void;
}

type DialogMode = 'links-only' | 'search-only';

export function VendorLinkedKRIsTab({
    vendorId,
    canCreateKri,
    canEdit,
    onAddKri,
    onNavigateToKri,
}: VendorLinkedKRIsTabProps) {
    const { t } = useTranslation(['vendors', 'common']);
    const [linkedKRIs, setLinkedKRIs] = useState<LinkedKRI[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<DialogMode>('search-only');

    const refresh = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await vendorLinkApi.getLinkedKRIs(vendorId);
            setLinkedKRIs(data);
            setError(null);
        } catch (err) {
            logError('Failed to load linked KRIs:', err);
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
            linkedKRIs.map((kri) => ({
                display_name: kri.metric_name,
                id: kri.id,
                kri_id: kri.id,
                effectiveness: 'linked',
            })),
        [linkedKRIs],
    );

    const activeKRIs = linkedKRIs.filter((kri) => !kri.is_archived);
    const archivedKRIs = linkedKRIs.filter((kri) => kri.is_archived);

    const handleLink = async (kriId: number) => {
        await vendorLinkApi.linkKRI(vendorId, kriId);
        await refresh();
    };

    const handleUnlink = async (kriId: number) => {
        await vendorLinkApi.unlinkKRI(vendorId, kriId);
        await refresh();
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-card"
            data-testid="vendor-linked-kris-section"
        >
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6 gap-4">
                <div className="flex items-center gap-3">
                    <Target className="h-5 w-5 text-amber-400" />
                    <div>
                        <h3 className="font-bold text-white uppercase tracking-widest text-xs">
                            {t('tabs.linked_kris')}
                        </h3>
                        <p className="text-sm text-slate-500 mt-1">
                            {t('links.kris.subtitle')}
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
                            data-testid="vendor-linked-kris-link-existing"
                            className="flex items-center gap-2 px-4 py-1.5 text-accent text-[10px] font-black uppercase tracking-widest hover:bg-accent/10 transition-all border-r border-accent/20"
                        >
                            <LinkIcon className="h-3 w-3" />
                            {t('links.actions.link_existing')}
                        </button>
                        {canCreateKri ? (
                            <button
                                type="button"
                                onClick={onAddKri}
                                data-testid="vendor-linked-kris-add-kri"
                                className="flex items-center gap-2 px-3 py-1.5 text-accent text-[10px] font-black uppercase tracking-widest hover:bg-accent/10 transition-all"
                                title={t('links.actions.add_kri')}
                            >
                                <Plus className="h-3.5 w-3.5" />
                                <span>{t('links.actions.add_kri')}</span>
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
            ) : linkedKRIs.length === 0 ? (
                <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-2xl">
                    <p className="text-xs text-slate-600 font-medium">{t('links.kris.empty')}</p>
                </div>
            ) : (
                <>
                    {activeKRIs.length > 0 ? (
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {activeKRIs.map((kri) => (
                                <KRIGaugeCard key={kri.id} kri={kri} onClick={() => onNavigateToKri(kri.id)} />
                            ))}
                        </div>
                    ) : null}

                    {archivedKRIs.length > 0 ? (
                        <div className="mt-8">
                            <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-slate-600" />
                                {t('links.archived_kris', { count: archivedKRIs.length })}
                            </h4>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 opacity-50 hover:opacity-100 transition-opacity">
                                {archivedKRIs.map((kri) => (
                                    <KRIGaugeCard key={kri.id} kri={kri} onClick={() => onNavigateToKri(kri.id)} />
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
                    data-testid="vendor-linked-kris-manage-existing"
                    className="w-full mt-6 py-3 border border-dashed border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white hover:border-accent/40 hover:bg-white/5 transition-all"
                >
                    {t('links.actions.manage_existing')}
                </button>
            ) : null}

            {canEdit ? (
                <LinkManagementDialog
                    mode="vendor-to-kri"
                    title={t('links.dialogs.link_kris_title')}
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
