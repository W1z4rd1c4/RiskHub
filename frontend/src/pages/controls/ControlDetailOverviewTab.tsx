import type { MouseEvent } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, BookOpen, Building2, Calendar, ShieldAlert, User } from 'lucide-react';

import { UserAvatar } from '@/components/access/UserAvatar';
import { LinkManagementDialog } from '@/components/LinkManagementDialog';
import { RiskQuickViewModal } from '@/components/RiskQuickViewModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardHeader } from '@/components/ui/card';
import { InlineMessage } from '@/components/ui/inline-message';
import { AccessDeniedState, EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import { translateUiMessage } from '@/i18n/hooks';
import { getControlEffectivenessMeta } from '@/lib/monitoringStatus';
import { formatControlForm, formatControlFrequency, getControlRiskLevelColor } from '@/pages/controls/controlsPagePresentation';
import type { Control, ControlRiskLink } from '@/types/control';
import type { ControlEffectiveness, Risk } from '@/types/risk';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type ControlDetailOverviewTabProps = {
    control: Control;
    t: TranslateFn;
    linkedRisks: ControlRiskLink[];
    activeLinkedRisks: ControlRiskLink[];
    archivedLinkedRisks: ControlRiskLink[];
    canLinkRisk: boolean;
    canUnlinkRisk: boolean;
    linkErrorKey: string | null;
    linkedRisksErrorKey: string | null;
    linkedRisksOutcome: 'loading' | 'content' | 'empty' | 'error' | 'stale-with-error' | 'denied';
    isLinkDialogOpen: boolean;
    selectedRisk: Risk | null;
    isRiskModalOpen: boolean;
    onOpenLinkDialog: () => void;
    onCloseLinkDialog: () => void;
    onLinkRisk: (riskId: number, effectiveness: ControlEffectiveness, notes?: string) => Promise<void>;
    onUnlinkRisk: (riskId: number) => Promise<void>;
    onRiskClick: (riskId: number, event: MouseEvent) => void | Promise<void>;
    onCloseRiskModal: () => void;
    onRetryLinkedRisks: () => void;
};

/** Link effectiveness: three distinct status tones and a translated label (PG-19). */
function EffectivenessBadge({ level, t }: { level: ControlEffectiveness; t: TranslateFn }) {
    const meta = getControlEffectivenessMeta(level);
    return (
        <Badge tone={meta.tone} size="sm" className="shrink-0">
            {meta.labelKey ? t(meta.labelKey) : level}
        </Badge>
    );
}

/** One linked risk; a `Button` card that opens the risk quick view (archived ones carry a badge, GAP-D-14). */
function LinkedRiskCard({
    link,
    isArchived = false,
    onRiskClick,
    t,
}: {
    link: ControlRiskLink;
    isArchived?: boolean;
    onRiskClick: (riskId: number, event: MouseEvent) => void | Promise<void>;
    t: TranslateFn;
}) {
    return (
        <Button
            variant="ghost"
            onClick={(e) => onRiskClick(link.risk_id, e)}
            className="h-auto w-full flex-col items-stretch justify-start gap-1 whitespace-normal rounded-2xl border border-border bg-nested p-4 text-left font-normal hover:border-accent/30"
        >
            <span className="mb-1 flex items-start justify-between gap-2">
                <span className="min-w-0">
                    <span className="block text-xs font-bold text-foreground line-clamp-1">{link.risk?.name || t('controls:detail.unnamed_risk')}</span>
                    {link.risk?.process && <span className="text-xs text-muted-foreground block mt-0.5">{link.risk.process}</span>}
                </span>
                <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {isArchived ? <Badge size="sm" tone="neutral">{t('risks:status.archived')}</Badge> : null}
                    <EffectivenessBadge level={link.effectiveness} t={t} />
                </span>
            </span>
            {link.risk?.description && <span className="block text-xs text-muted-foreground line-clamp-2">{link.risk.description}</span>}
            {link.notes && <span className="mt-1 block text-xs text-muted-foreground font-medium italic">{t('common:labels.quoted', { text: link.notes })}</span>}
        </Button>
    );
}

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.1 },
    },
};

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
};

export function ControlDetailOverviewTab({
    control,
    t,
    linkedRisks,
    activeLinkedRisks,
    archivedLinkedRisks,
    canLinkRisk,
    canUnlinkRisk,
    linkErrorKey,
    linkedRisksErrorKey,
    linkedRisksOutcome,
    isLinkDialogOpen,
    selectedRisk,
    isRiskModalOpen,
    onOpenLinkDialog,
    onCloseLinkDialog,
    onLinkRisk,
    onUnlinkRisk,
    onRiskClick,
    onCloseRiskModal,
    onRetryLinkedRisks,
}: ControlDetailOverviewTabProps) {
    return (
        <>
            <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
            >
                <motion.div variants={item} className="glass-card flex flex-col gap-6">
                    <CardHeader icon={BarChart3} title={t('controls:detail.standard_configuration')} className="mb-0 border-b border-border pb-4" />

                    <div className="space-y-4">
                        <div className="flex justify-between items-center group">
                            <span className="text-eyebrow">{t('controls:columns.risk_level')}</span>
                            <span className={`rounded-full border px-3 py-1 text-xs font-bold tabular-nums ${getControlRiskLevelColor(control.risk_level)}`}>
                                {t('controls:columns.risk_level_value', { level: control.risk_level })}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-eyebrow">{t('common:labels.frequency')}</span>
                            <div className="flex items-center gap-2 text-foreground font-bold text-sm bg-tint/5 px-3 py-1 rounded-lg border border-border">
                                <Calendar className="h-3.5 w-3.5 text-accent-text" aria-hidden="true" />
                                <span>{formatControlFrequency(control.frequency, (key, fallback) => t(key, { defaultValue: fallback }))}</span>
                            </div>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-eyebrow">{t('controls:detail.control_form')}</span>
                            <span className="text-foreground font-bold text-sm">{formatControlForm(control.control_form, (key, fallback) => t(key, { defaultValue: fallback }))}</span>
                        </div>
                    </div>
                </motion.div>

                <motion.div variants={item} className="glass-card flex flex-col gap-6">
                    <CardHeader icon={User} title={t('controls:detail.ownership_responsibility')} className="mb-0 border-b border-border pb-4" />

                    <div className="space-y-5">
                        <div className="flex gap-3 items-start">
                            {/* GAP-D-27: the one avatar recipe (no hard-coded 'U' fallback). */}
                            <UserAvatar name={control.control_owner?.name} className="h-8 w-8 text-xs" />
                            <div>
                                <p className="text-eyebrow">{t('controls:fields.owner')}</p>
                                <p className="text-sm font-bold text-foreground leading-snug">{control.control_owner?.name || t('common:fallbacks.unassigned')}</p>
                                <p className="text-xs text-muted-foreground">{control.control_owner?.email || ''}</p>
                            </div>
                        </div>
                        <div className="flex gap-3 items-start">
                            <div className="w-8 h-8 rounded-full bg-tint/5 border border-border flex items-center justify-center text-muted-foreground">
                                <Building2 className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-eyebrow">{t('controls:detail.department_position')}</p>
                                <p className="text-sm font-bold text-foreground leading-snug">{control.department?.name || t('controls:detail.no_department')}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {control.process_owner_position || t('common:fallbacks.not_available')}
                                </p>
                            </div>
                        </div>
                    </div>
                </motion.div>

                <motion.div variants={item} className="glass-card flex flex-col gap-6">
                    <CardHeader icon={BookOpen} title={t('controls:detail.methodology_source')} className="mb-0 border-b border-border pb-4" />

                    <div className="space-y-4">
                        <div>
                            <p className="text-eyebrow mb-1">{t('controls:detail.methodology_ref')}</p>
                            <p className="text-sm font-medium text-foreground bg-tint/5 p-2 rounded-lg border border-border font-mono truncate">
                                {control.methodology_reference || t('common:fallbacks.not_available')}
                            </p>
                        </div>
                        <div>
                            <p className="text-eyebrow mb-1">{t('controls:detail.data_source')}</p>
                            <p className="text-xs text-muted-foreground leading-relaxed italic border-l-2 border-accent/30 pl-3">
                                {control.data_source || t('controls:detail.not_specified')}
                            </p>
                        </div>
                    </div>
                </motion.div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
                className="glass-card"
            >
                <CardHeader
                    icon={ShieldAlert}
                    title={t('controls:detail.mitigated_risks')}
                    className="mb-6"
                    actions={(
                        <Badge data-testid="control-linked-risk-count" tone="success" size="sm">
                            {linkedRisksOutcome === 'content'
                            || linkedRisksOutcome === 'empty'
                            || linkedRisksOutcome === 'stale-with-error'
                                ? linkedRisks.length
                                : '—'}
                        </Badge>
                    )}
                />

                {linkErrorKey && (
                    <InlineMessage tone="danger" className="mb-3">
                        {translateUiMessage(t, linkErrorKey)}
                    </InlineMessage>
                )}

                {linkedRisksOutcome === 'stale-with-error' && linkedRisksErrorKey ? (
                    <ErrorState
                        variant="banner"
                        message={t(linkedRisksErrorKey)}
                        onRetry={onRetryLinkedRisks}
                        className="mb-3"
                    />
                ) : null}

                {linkedRisksOutcome === 'loading' ? (
                    <LoadingState layout="section" label={t('common:loading.generic')} className="py-6" />
                ) : linkedRisksOutcome === 'denied' ? (
                    <AccessDeniedState
                        layout="section"
                        descriptionKey="detail.linked_risks_denied"
                        ns="controls"
                        className="py-6"
                        live
                    />
                ) : linkedRisksOutcome === 'error' && linkedRisksErrorKey ? (
                    <ErrorState
                        layout="section"
                        message={t(linkedRisksErrorKey)}
                        onRetry={onRetryLinkedRisks}
                        className="py-6"
                    />
                ) : (
                    <div className="space-y-6">
                        {activeLinkedRisks.length === 0 && archivedLinkedRisks.length === 0 ? (
                            <EmptyState layout="section" title={t('controls:empty_state.no_linked_risks')} className="py-6" />
                        ) : (
                            <>
                                {activeLinkedRisks.length > 0 && (
                                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                        {activeLinkedRisks.map((link) => (
                                            <LinkedRiskCard key={link.id} link={link} onRiskClick={onRiskClick} t={t} />
                                        ))}
                                    </div>
                                )}
                                {archivedLinkedRisks.length > 0 && (
                                    <div>
                                        <h3 className="text-eyebrow mb-3">
                                            {t('controls:detail.archived_risks', { count: archivedLinkedRisks.length })}
                                        </h3>
                                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                            {archivedLinkedRisks.map((link) => (
                                                <LinkedRiskCard key={link.id} link={link} isArchived onRiskClick={onRiskClick} t={t} />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {linkedRisksOutcome !== 'denied' && (canLinkRisk || canUnlinkRisk) && (
                    <Button variant="outline" className="mt-4 w-full border-dashed" onClick={onOpenLinkDialog}>
                        {t('controls:detail.manage_risk_linkage')}
                    </Button>
                )}

                <LinkManagementDialog
                    isOpen={isLinkDialogOpen && linkedRisksOutcome !== 'denied'}
                    onClose={onCloseLinkDialog}
                    mode="control-to-risk"
                    existingLinks={linkedRisks}
                    onLink={onLinkRisk}
                    onUnlink={onUnlinkRisk}
                />

                <RiskQuickViewModal
                    risk={linkedRisksOutcome === 'denied' ? null : selectedRisk}
                    isOpen={isRiskModalOpen && linkedRisksOutcome !== 'denied'}
                    onClose={onCloseRiskModal}
                />
            </motion.div>
        </>
    );
}
