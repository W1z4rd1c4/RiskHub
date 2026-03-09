import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Link as LinkIcon, Loader2, Plus } from 'lucide-react';

import { LinkManagementDialog } from '@/components/LinkManagementDialog';
import type { ExistingLinkItem } from '@/components/linking/ExistingLinksPanel';
import { VendorLinkedRiskCard } from '@/components/vendors/VendorLinkedRiskCard';
import { useTranslation } from '@/i18n/hooks';
import { vendorLinkApi } from '@/services/vendorLinkApi';
import type { LinkedRisk } from '@/types/vendorLink';

interface VendorLinkedRisksTabProps {
    vendorId: number;
    canCreateRisk: boolean;
    canEdit: boolean;
    onAddRisk: () => void;
    onNavigateToRisk: (riskId: number) => void;
}

type DialogMode = 'links-only' | 'search-only';

export function VendorLinkedRisksTab({
    vendorId,
    canCreateRisk,
    canEdit,
    onAddRisk,
    onNavigateToRisk,
}: VendorLinkedRisksTabProps) {
    const { t } = useTranslation(['vendors', 'common']);
    const [linkedRisks, setLinkedRisks] = useState<LinkedRisk[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<DialogMode>('search-only');

    const refresh = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await vendorLinkApi.getLinkedRisks(vendorId);
            setLinkedRisks(data);
            setError(null);
        } catch (err) {
            console.error('Failed to load linked risks:', err);
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
            linkedRisks.map((risk) => ({
                display_name: `${risk.risk_id_code}: ${risk.name}`,
                id: risk.id,
                effectiveness: 'linked',
                risk_id: risk.id,
            })),
        [linkedRisks],
    );

    const activeRisks = linkedRisks.filter((risk) => risk.status !== 'archived');
    const archivedRisks = linkedRisks.filter((risk) => risk.status === 'archived');

    const handleLink = async (riskId: number) => {
        await vendorLinkApi.linkRisk(vendorId, riskId);
        await refresh();
    };

    const handleUnlink = async (riskId: number) => {
        await vendorLinkApi.unlinkRisk(vendorId, riskId);
        await refresh();
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="glass-card"
        >
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6 gap-4">
                <div className="flex items-center gap-3">
                    <LinkIcon className="h-5 w-5 text-indigo-400" />
                    <div>
                        <h3 className="font-bold text-white uppercase tracking-widest text-xs">
                            {t('tabs.linked_risks')}
                        </h3>
                        <p className="text-sm text-slate-500 mt-1">
                            {t('links.risks.subtitle')}
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
                        {canCreateRisk ? (
                            <button
                                type="button"
                                onClick={onAddRisk}
                                className="flex items-center gap-2 px-3 py-1.5 text-accent text-[10px] font-black uppercase tracking-widest hover:bg-accent/10 transition-all"
                                title={t('links.actions.add_risk')}
                            >
                                <Plus className="h-3.5 w-3.5" />
                                <span>{t('links.actions.add_risk')}</span>
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
            ) : linkedRisks.length === 0 ? (
                <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-2xl">
                    <p className="text-xs text-slate-600 font-medium">{t('links.risks.empty')}</p>
                </div>
            ) : (
                <>
                    {activeRisks.length > 0 ? (
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {activeRisks.map((risk) => (
                                <VendorLinkedRiskCard
                                    key={risk.id}
                                    risk={risk}
                                    onClick={() => onNavigateToRisk(risk.id)}
                                />
                            ))}
                        </div>
                    ) : null}

                    {archivedRisks.length > 0 ? (
                        <div className="mt-8">
                            <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-slate-600" />
                                {t('links.archived_risks', { count: archivedRisks.length })}
                            </h4>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 opacity-50 hover:opacity-100 transition-opacity">
                                {archivedRisks.map((risk) => (
                                    <VendorLinkedRiskCard
                                        key={risk.id}
                                        risk={risk}
                                        onClick={() => onNavigateToRisk(risk.id)}
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
                    mode="control-to-risk"
                    title={t('links.dialogs.link_risks_title')}
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
