import type * as React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Link as LinkIcon, Plus } from 'lucide-react';

import { ControlCreateDialog } from '@/components/ControlCreateDialog';
import { LinkManagementDialog } from '@/components/LinkManagementDialog';
import { ControlGaugeCard } from '@/components/controls/ControlGaugeCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardHeader } from '@/components/ui/card';
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
    const hasControls = activeControls.length > 0 || draftControls.length > 0 || archivedControls.length > 0;

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="glass-card"
        >
            <CardHeader
                icon={CheckCircle2}
                title={t('overview.mitigating_controls', { ns: 'risks' })}
                className="mb-6 border-b border-border pb-4"
                actions={canLinkControls ? (
                    <>
                        <Button
                            variant="outline"
                            size="compact"
                            onClick={() => {
                                setDialogMode('search-only');
                                setIsLinkDialogOpen(true);
                            }}
                        >
                            <LinkIcon aria-hidden="true" />
                            {t('overview.link_existing', { ns: 'risks' })}
                        </Button>
                        {canCreateLinkedControl && (
                            <Button
                                variant="outline"
                                size="compact"
                                onClick={onOpenCreateControl}
                                title={t('overview.create_new_control', { ns: 'risks' })}
                            >
                                <Plus aria-hidden="true" />
                                {t('common:actions.add_control')}
                            </Button>
                        )}
                    </>
                ) : undefined}
            />

            {!hasControls ? (
                <div className="py-10 text-center border-2 border-dashed border-border rounded-2xl">
                    <p className="text-xs text-muted-foreground font-medium">{t('overview.no_controls_linked', { ns: 'risks' })}</p>
                </div>
            ) : (
                <>
                    <ControlGroup links={activeControls} onNavigateToControl={onNavigateToControl} gapClassName="gap-6" />
                    {draftControls.length > 0 && (
                        <div className="mt-8">
                            <h3 className="text-eyebrow mb-4 flex items-center gap-2">
                                <span aria-hidden="true" className="w-2 h-2 rounded-full bg-warning" />
                                {t('overview.draft_controls', { ns: 'risks', count: draftControls.length })}
                            </h3>
                            {/* GAP-D-14: no whole-group opacity; each card carries its own status badge. */}
                            <ControlGroup
                                links={draftControls}
                                onNavigateToControl={onNavigateToControl}
                                gapClassName="gap-4"
                                statusBadge={<Badge size="sm" tone="warning">{t('controls:status.draft')}</Badge>}
                            />
                            <p className="text-xs text-muted-foreground italic mt-3">{t('overview.draft_controls_help', { ns: 'risks' })}</p>
                        </div>
                    )}
                    {archivedControls.length > 0 && (
                        <div className="mt-8">
                            <h3 className="text-eyebrow mb-4 flex items-center gap-2">
                                <span aria-hidden="true" className="w-2 h-2 rounded-full bg-muted-foreground" />
                                {t('overview.archived_controls', { ns: 'risks', count: archivedControls.length })}
                            </h3>
                            <ControlGroup
                                links={archivedControls}
                                onNavigateToControl={onNavigateToControl}
                                gapClassName="gap-4"
                                statusBadge={<Badge size="sm" tone="neutral">{t('controls:status.archived')}</Badge>}
                            />
                        </div>
                    )}
                </>
            )}

            {canUnlinkControls && (
                <Button
                    variant="outline"
                    className="mt-6 w-full border-dashed"
                    onClick={() => {
                        setDialogMode('links-only');
                        setIsLinkDialogOpen(true);
                    }}
                >
                    {t('overview.manage_existing_links', { ns: 'risks' })}
                </Button>
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
                onSuccess={() => {
                    // A partial outcome (control saved, risk link failed) is a
                    // warning toast raised by the control form itself (D9).
                    setIsCreateDialogOpen(false);
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
    statusBadge,
}: {
    links: RiskControlLink[];
    onNavigateToControl: (controlId: number) => void;
    gapClassName: string;
    statusBadge?: React.ReactNode;
}) {
    if (links.length === 0) {
        return null;
    }

    return (
        <div className={`grid ${gapClassName} sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`}>
            {links.map((link) => (
                <ControlGaugeCard
                    key={link.id}
                    link={link}
                    statusBadge={statusBadge}
                    onClick={() => link.control && onNavigateToControl(link.control.id)}
                />
            ))}
        </div>
    );
}
