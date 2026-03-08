import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { ExternalLink, Link2, Loader2, Plus } from 'lucide-react';
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
import type { LinkedRisk } from '@/types/vendorLink';

interface VendorLinkedRisksTabProps {
    vendorId: number;
    canEdit: boolean;
    onNavigateToRisk: (riskId: number) => void;
}

export function VendorLinkedRisksTab({ vendorId, canEdit, onNavigateToRisk }: VendorLinkedRisksTabProps) {
    const { t } = useTranslation('vendors');
    const [linkedRisks, setLinkedRisks] = useState<LinkedRisk[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

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
        refresh();
    }, [refresh]);

    const existingLinks = useMemo<ExistingLinkItem[]>(
        () =>
            linkedRisks.map((r) => ({
                display_name: `${r.risk_id_code}: ${r.name}`,
                id: r.id,
                effectiveness: 'linked',
                risk_id: r.id,
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
        <VendorSurface className="space-y-6">
            <VendorSectionHeader
                icon={<Link2 className="h-4 w-4" />}
                title={t('tabs.linked_risks')}
                description={t('links.risks.subtitle')}
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
            ) : linkedRisks.length === 0 ? (
                <VendorEmptyState icon={<Link2 className="h-8 w-8" />} title={t('links.risks.empty')} />
            ) : (
                <div className="space-y-5">
                    {activeRisks.length > 0 && (
                        <div className="space-y-3">
                            {activeRisks.map((risk) => (
                                <button
                                    key={risk.id}
                                    onClick={() => onNavigateToRisk(risk.id)}
                                    className="w-full p-4 bg-white/[0.03] border border-white/5 rounded-2xl flex items-center justify-between hover:bg-white/[0.05] transition-all text-left group"
                                >
                                    <div className="min-w-0 pr-4">
                                        <div className="text-sm font-bold text-white truncate group-hover:text-accent transition-colors">
                                            {risk.risk_id_code}: {risk.name}
                                        </div>
                                        <div className="text-[10px] text-slate-500 mt-1 font-medium">
                                            {risk.process}
                                            {risk.department_name ? (
                                                <>
                                                    <span className="text-slate-700 mx-2">/</span>
                                                    {risk.department_name}
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
                    {archivedRisks.length > 0 && (
                        <div className="space-y-3">
                            <h4 className="text-sm font-semibold vendor-text">
                                {t('links.archived_risks')} ({archivedRisks.length})
                            </h4>
                            <div className="space-y-3 opacity-70">
                                {archivedRisks.map((risk) => (
                                    <button
                                        key={risk.id}
                                        onClick={() => onNavigateToRisk(risk.id)}
                                        className="w-full p-4 bg-white/[0.03] border border-white/5 rounded-2xl flex items-center justify-between hover:bg-white/[0.05] transition-all text-left group"
                                    >
                                        <div className="min-w-0 pr-4">
                                            <div className="text-sm font-bold text-white truncate group-hover:text-accent transition-colors">
                                                {risk.risk_id_code}: {risk.name}
                                            </div>
                                            <div className="text-[10px] text-slate-500 mt-1 font-medium">
                                                {risk.process}
                                                {risk.department_name ? (
                                                    <>
                                                        <span className="text-slate-700 mx-2">/</span>
                                                        {risk.department_name}
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
                    mode="control-to-risk"
                    title={t('links.dialogs.link_risks_title')}
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
