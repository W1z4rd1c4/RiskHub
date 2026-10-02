import { useState, useEffect, useId } from 'react';
import { motion } from 'framer-motion';
import { User, Target, Activity, FileText, Calendar } from 'lucide-react';
import { DialogBody, DialogFooter, DialogHeader, DialogShell } from '@/components/ui/dialog';
import { controlApi } from '@/services/controlApi';
import { riskApi } from '@/services/riskApi';
import { threatApi } from '@/services/threatApi';
import { processApi } from '@/services/processApi';
import { assetApi } from '@/services/assetApi';
import { ENTITY_ICON_BY_TYPE, ENTITY_ICON_FALLBACK } from '@/constants/entityIcons';
import { translateCode } from '@/lib/humanizeCode';
import type { OrphanedItem } from '@/types/orphanedItem';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { logError } from '@/services/logger';
import { LoadingState } from '@/components/ui/state';

interface OrphanQuickViewModalProps {
    isOpen: boolean;
    onClose: () => void;
    orphan: OrphanedItem | null;
}

interface ItemDetails {
    description?: string;
    control_form?: string;
    frequency?: string;
    status?: string;
    category?: string;
}

export function OrphanQuickViewModal({ isOpen, onClose, orphan }: OrphanQuickViewModalProps) {
    const { t } = useTranslation('admin');
    const format = useFormat();
    const [itemDetails, setItemDetails] = useState<ItemDetails | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const titleId = useId();
    const descriptionId = useId();

    const orphanItemType = orphan?.item_type;
    const orphanItemId = orphan?.item_id;

    const handleClose = () => {
        setItemDetails(null);
        setIsInitialized(false);
        onClose();
    };

    useEffect(() => {
        if (!isOpen || orphanItemType == null || orphanItemId == null) {
            return;
        }

        let cancelled = false;
        let resetTimeout: ReturnType<typeof setTimeout> | null = null;
        let initTimeout: ReturnType<typeof setTimeout> | null = null;

        resetTimeout = setTimeout(() => {
            if (cancelled) return;
            setItemDetails(null);
            setIsInitialized(false);
        }, 0);

        const fetchDetails = async () => {
            try {
                if (orphanItemType === 'control') {
                    const control = await controlApi.getControl(orphanItemId);
                    if (cancelled) return;
                    setItemDetails(control as ItemDetails);
                } else if (orphanItemType === 'risk') {
                    const risk = await riskApi.getRisk(orphanItemId);
                    if (cancelled) return;
                    setItemDetails(risk as ItemDetails);
                } else if (orphanItemType === 'threat') {
                    const threat = await threatApi.getThreat(orphanItemId);
                    if (cancelled) return;
                    setItemDetails(threat as ItemDetails);
                } else if (orphanItemType === 'process') {
                    const process = await processApi.getProcess(orphanItemId);
                    if (cancelled) return;
                    setItemDetails({
                        description: process.notes || [process.l0_area, process.l1_process, process.l2_subprocess]
                            .filter(Boolean)
                            .join(' · '),
                        status: process.is_archived ? 'archived' : 'active',
                        category: process.derived?.criticality_class ?? undefined,
                    });
                } else if (orphanItemType === 'asset') {
                    const asset = await assetApi.getAsset(orphanItemId);
                    if (cancelled) return;
                    setItemDetails({
                        description: asset.description ?? asset.notes ?? undefined,
                        status: asset.is_archived ? 'archived' : 'active',
                        category: asset.derived?.resulting_criticality ?? undefined,
                    });
                }
                // Small delay for smooth entry
                initTimeout = setTimeout(() => {
                    if (!cancelled) setIsInitialized(true);
                }, 150);
            } catch (err) {
                logError('Failed to fetch item details:', err);
                initTimeout = setTimeout(() => {
                    if (!cancelled) setIsInitialized(true);
                }, 0);
            }
        };

        void fetchDetails();
        return () => {
            cancelled = true;
            if (resetTimeout) clearTimeout(resetTimeout);
            if (initTimeout) clearTimeout(initTimeout);
        };
    }, [isOpen, orphanItemType, orphanItemId]);

    if (!orphan) return null;

    const typeLabels = {
        risk: t('governance.type_risk'),
        control: t('governance.type_control'),
        kri: t('governance.type_kri'),
        threat: t('governance.type_threat'),
        process: t('governance.type_process'),
        asset: t('governance.type_asset'),
        vendor: t('governance.type_vendor'),
    };
    const Icon = ENTITY_ICON_BY_TYPE[orphan.item_type] ?? ENTITY_ICON_FALLBACK;

    // Hue on the icon tile only; the type label stays text-foreground (AA in every theme).
    const typeTones = {
        risk: { icon: 'text-destructive', tile: 'bg-destructive/10' },
        control: { icon: 'text-accent-text', tile: 'bg-accent/10' },
        kri: { icon: 'text-warning-text', tile: 'bg-warning/10' },
        threat: { icon: 'text-chart-3', tile: 'bg-chart-3/10' },
        process: { icon: 'text-accent-text', tile: 'bg-info/10' },
        asset: { icon: 'text-chart-2', tile: 'bg-chart-2/10' },
        vendor: { icon: 'text-severity-high-text', tile: 'bg-severity-high/10' },
    };
    const typeTone = typeTones[orphan.item_type as keyof typeof typeTones] || { icon: 'text-muted-foreground', tile: 'bg-muted' };

    return (
        <DialogShell
            isOpen={isOpen}
            onClose={handleClose}
            titleId={titleId}
            descriptionIds={[descriptionId]}
            size="lg"
        >
            <DialogHeader
                title={t('governance.quick_view.title')}
                description={<span className="block truncate">{orphan.item_name}</span>}
                descriptionId={descriptionId}
                closeLabel={t('common:actions.close')}
            />

            {/* Content Area */}
            <DialogBody className="custom-scrollbar">
                {!isInitialized ? (
                    <LoadingState className="py-20" label={t('governance.quick_view.initializing')} />
                ) : (
                    <motion.div
                        data-testid="orphan-quick-view-ready"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-6"
                    >
                        {/* Item Detail Summary Bubble - Replicated from Resolve Modal */}
                        <div className="p-5 rounded-2xl bg-tint/5 border border-border flex items-start gap-5">
                            <div className={`p-3 rounded-xl ${typeTone.tile} border border-border shrink-0`}>
                                <Icon aria-hidden="true" className={`h-6 w-6 ${typeTone.icon}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-3 mb-1">
                                    <span className={`text-eyebrow px-2 py-0.5 rounded-md text-foreground ${typeTone.tile}`}>
                                        {typeLabels[orphan.item_type as keyof typeof typeLabels] || orphan.item_type}
                                    </span>
                                </div>
                                <h4 className="text-lg font-bold text-foreground mb-3 truncate">
                                    {orphan.item_name}
                                </h4>
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-2">
                                        <User aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="text-xs text-muted-foreground font-medium">{orphan.previous_owner_name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Calendar aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="text-xs text-muted-foreground font-medium">
                                            {format.relative(orphan.orphaned_at)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Detailed Description Panel */}
                        <div className="space-y-3">
                            <h5 className="text-eyebrow flex items-center gap-2">
                                <FileText aria-hidden="true" className="h-3.5 w-3.5" />
                                {t('governance.quick_view.business_analysis')}
                            </h5>
                            <div className="p-5 rounded-2xl bg-tint/5 border border-border">
                                <p className="text-sm text-foreground leading-relaxed font-medium">
                                    {itemDetails?.description || orphan.item_name}
                                </p>
                            </div>
                        </div>

                        {/* Metadata Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            {orphan.item_type === 'control' && itemDetails && (
                                <>
                                    <div className="p-4 rounded-xl bg-tint/5 border border-border">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Activity aria-hidden="true" className="h-3.5 w-3.5 text-accent-text" />
                                            <p className="text-eyebrow">
                                                {t('governance.quick_view.methodology')}
                                            </p>
                                        </div>
                                        <p className="text-sm font-bold text-foreground">
                                            {itemDetails.control_form
                                                ? translateCode(t, 'controls:control_forms', itemDetails.control_form)
                                                : t('governance.quick_view.defaults.manual')}
                                        </p>
                                    </div>
                                    <div className="p-4 rounded-xl bg-tint/5 border border-border">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Target aria-hidden="true" className="h-3.5 w-3.5 text-accent-text" />
                                            <p className="text-eyebrow">
                                                {t('governance.quick_view.frequency')}
                                            </p>
                                        </div>
                                        <p className="text-sm font-bold text-foreground">
                                            {itemDetails.frequency
                                                ? translateCode(t, 'controls:frequencies', itemDetails.frequency)
                                                : t('governance.quick_view.defaults.periodic')}
                                        </p>
                                    </div>
                                </>
                            )}
                            {orphan.item_type === 'risk' && itemDetails && (
                                <>
                                    <div className="p-4 rounded-xl bg-tint/5 border border-border">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Activity aria-hidden="true" className="h-3.5 w-3.5 text-destructive" />
                                            <p className="text-eyebrow">
                                                {t('governance.quick_view.rating')}
                                            </p>
                                        </div>
                                        <p className="text-sm font-bold text-foreground">
                                            {itemDetails.status
                                                ? translateCode(t, 'risks:status', itemDetails.status)
                                                : t('governance.quick_view.defaults.active')}
                                        </p>
                                    </div>
                                    <div className="p-4 rounded-xl bg-tint/5 border border-border">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Target aria-hidden="true" className="h-3.5 w-3.5 text-destructive" />
                                            <p className="text-eyebrow">
                                                {t('governance.quick_view.category')}
                                            </p>
                                        </div>
                                        <p className="text-sm font-bold text-foreground truncate">
                                            {itemDetails.category || t('governance.quick_view.defaults.strategic')}
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </DialogBody>

            <DialogFooter
                cancelLabel={t('governance.quick_view.close_preview')}
                extra={(
                    <span className="text-eyebrow flex items-center gap-2">
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                        {t('governance.quick_view.audit_view')}
                    </span>
                )}
            />
        </DialogShell>
    );
}
