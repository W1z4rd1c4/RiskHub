import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Link as LinkIcon, Plus, TriangleAlert } from 'lucide-react';

import { ControlCreateDialog } from '@/components/ControlCreateDialog';
import type { ControlFormLocationState } from '@/components/control-form/useControlFormWorkflow';
import { LinkManagementDialog } from '@/components/LinkManagementDialog';
import { ControlGaugeCard } from '@/components/controls/ControlGaugeCard';
import { useTranslation } from '@/i18n/hooks';
import type { ControlEffectiveness, RiskControlLink } from '@/types/risk';

type DialogMode = 'both' | 'search-only' | 'links-only';

interface RiskLinkedControlsSectionProps {
    linkedControls: RiskControlLink[];
    activeControls: RiskControlLink[];
    draftControls: RiskControlLink[];
    archivedControls: RiskControlLink[];
    isLinkDialogOpen: boolean;
    setIsLinkDialogOpen: (open: boolean) => void;
    dialogMode: DialogMode;
    setDialogMode: (mode: DialogMode) => void;
    isCreateDialogOpen: boolean;
    setIsCreateDialogOpen: (open: boolean) => void;
    onLinkControl: (controlId: number, effectiveness: ControlEffectiveness, notes?: string) => Promise<void>;
    onUnlinkControl: (controlId: number) => Promise<void>;
    onOpenCreateControl: () => void;
    onNavigateToControl: (controlId: number) => void;
    onRefreshData: () => void;
    canCreateLinkedControl: boolean;
    canLinkControls: boolean;
    canUnlinkControls: boolean;
}

export function RiskLinkedControlsSection({
    linkedControls,
    activeControls,
    draftControls,
    archivedControls,
    isLinkDialogOpen,
    setIsLinkDialogOpen,
    dialogMode,
    setDialogMode,
    isCreateDialogOpen,
    setIsCreateDialogOpen,
    onLinkControl,
    onUnlinkControl,
    onOpenCreateControl,
    onNavigateToControl,
    onRefreshData,
    canCreateLinkedControl,
    canLinkControls,
    canUnlinkControls,
}: RiskLinkedControlsSectionProps) {
    const { t } = useTranslation(['risks', 'common']);
    const [controlFlash, setControlFlash] = useState<ControlFormLocationState['controlFlash'] | null>(null);
    const hasControls = activeControls.length > 0 || draftControls.length > 0 || archivedControls.length > 0;

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="glass-card"
        >
            <div className="flex items-center justify-between border-b border-border pb-4 mb-6">
                <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-success-text" />
                    <h3 className="font-bold text-foreground uppercase tracking-widest text-xs">{t('overview.mitigating_controls', { ns: 'risks' })}</h3>
                </div>
                {canLinkControls && (
                    <div className="flex items-stretch bg-accent/10 border border-accent/20 rounded-lg overflow-hidden">
                        <button
                            onClick={() => {
                                setDialogMode('search-only');
                                setIsLinkDialogOpen(true);
                            }}
                            className="flex items-center gap-2 px-4 py-1.5 text-accent-text text-xs font-black uppercase tracking-widest hover:bg-accent/10 transition-colors border-r border-accent/20"
                        >
                            <LinkIcon className="h-3 w-3" />
                            {t('overview.link_existing', { ns: 'risks' })}
                        </button>
                        {canCreateLinkedControl && (
                            <button
                                onClick={onOpenCreateControl}
                                className="flex items-center gap-2 px-3 py-1.5 text-accent-text text-xs font-black uppercase tracking-widest hover:bg-accent/10 transition-colors"
                                title={t('overview.create_new_control', { ns: 'risks' })}
                            >
                                <Plus className="h-3.5 w-3.5" />
                                <span>{t('common:actions.add_control')}</span>
                            </button>
                        )}
                    </div>
                )}
            </div>

            {controlFlash && (
                <div
                    role="status"
                    className="mb-6 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning-text"
                >
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" aria-hidden="true" />
                    <span>{controlFlash.message}</span>
                </div>
            )}

            {!hasControls ? (
                <div className="py-10 text-center border-2 border-dashed border-border rounded-2xl">
                    <p className="text-xs text-muted-foreground font-medium">{t('overview.no_controls_linked', { ns: 'risks' })}</p>
                </div>
            ) : (
                <>
                    <ControlGroup links={activeControls} onNavigateToControl={onNavigateToControl} gapClassName="gap-6" />
                    {draftControls.length > 0 && (
                        <div className="mt-8">
                            <h4 className="text-xs font-black text-warning-text uppercase tracking-widest mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-warning/50" />
                                {t('overview.draft_controls', { ns: 'risks', count: draftControls.length })}
                            </h4>
                            <ControlGroup
                                links={draftControls}
                                onNavigateToControl={onNavigateToControl}
                                gapClassName="gap-4"
                                className="opacity-60"
                            />
                            <p className="text-xs text-muted-foreground italic mt-3">{t('overview.draft_controls_help', { ns: 'risks' })}</p>
                        </div>
                    )}
                    {archivedControls.length > 0 && (
                        <div className="mt-8">
                            <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-slate-600" />
                                {t('overview.archived_controls', { ns: 'risks', count: archivedControls.length })}
                            </h4>
                            <ControlGroup
                                links={archivedControls}
                                onNavigateToControl={onNavigateToControl}
                                gapClassName="gap-4"
                                className="opacity-40 hover:opacity-100 transition-opacity"
                            />
                        </div>
                    )}
                </>
            )}

            {canUnlinkControls && (
                <button
                    onClick={() => {
                        setDialogMode('links-only');
                        setIsLinkDialogOpen(true);
                    }}
                    className="w-full mt-6 py-3 border border-dashed border-border rounded-2xl text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-accent/40 hover:bg-tint/5 transition-colors"
                >
                    {t('overview.manage_existing_links', { ns: 'risks' })}
                </button>
            )}

            <LinkManagementDialog
                isOpen={isLinkDialogOpen}
                onClose={() => setIsLinkDialogOpen(false)}
                mode="risk-to-control"
                existingLinks={linkedControls}
                onLink={onLinkControl}
                onUnlink={onUnlinkControl}
                showSearch={canLinkControls && dialogMode !== 'links-only'}
                showLinks={canUnlinkControls && dialogMode !== 'search-only'}
            />

            <ControlCreateDialog
                isOpen={isCreateDialogOpen}
                onClose={() => setIsCreateDialogOpen(false)}
                onSuccess={(_controlId, locationState) => {
                    setIsCreateDialogOpen(false);
                    setControlFlash(locationState?.controlFlash ?? null);
                    onRefreshData();
                }}
            />
        </motion.div>
    );
}

function ControlGroup({
    links,
    onNavigateToControl,
    gapClassName,
    className,
}: {
    links: RiskControlLink[];
    onNavigateToControl: (controlId: number) => void;
    gapClassName: string;
    className?: string;
}) {
    if (links.length === 0) {
        return null;
    }

    return (
        <div className={`grid ${gapClassName} sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${className ?? ''}`}>
            {links.map((link) => (
                <ControlGaugeCard
                    key={link.id}
                    link={link}
                    onClick={() => link.control && onNavigateToControl(link.control.id)}
                />
            ))}
        </div>
    );
}
