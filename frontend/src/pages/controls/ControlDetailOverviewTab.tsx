import type { MouseEvent } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, BarChart3, BookOpen, Building2, Calendar, ShieldAlert, User } from 'lucide-react';

import { PermissionGate } from '@/components/PermissionGate';
import { LinkManagementDialog } from '@/components/LinkManagementDialog';
import { RiskQuickViewModal } from '@/components/RiskQuickViewModal';
import type { Control, ControlRiskLink } from '@/types/control';
import type { ControlEffectiveness, Risk } from '@/types/risk';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type ControlDetailOverviewTabProps = {
    control: Control;
    t: TranslateFn;
    linkedRisks: ControlRiskLink[];
    activeLinkedRisks: ControlRiskLink[];
    archivedLinkedRisks: ControlRiskLink[];
    linkErrorKey: string | null;
    linkedRisksErrorKey: string | null;
    isLinkDialogOpen: boolean;
    selectedRisk: Risk | null;
    isRiskModalOpen: boolean;
    onOpenLinkDialog: () => void;
    onCloseLinkDialog: () => void;
    onLinkRisk: (riskId: number, effectiveness: ControlEffectiveness, notes?: string) => Promise<void>;
    onUnlinkRisk: (riskId: number) => Promise<void>;
    onRiskClick: (riskId: number, event: MouseEvent) => void | Promise<void>;
    onCloseRiskModal: () => void;
};

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

function getRiskLevelColor(level: number) {
    if (level >= 5) return 'text-rose-400 bg-rose-400/10 border-rose-400/20 shadow-lg shadow-rose-500/20';
    if (level >= 4) return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
    if (level >= 3) return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
    return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
}

export function ControlDetailOverviewTab({
    control,
    t,
    linkedRisks,
    activeLinkedRisks,
    archivedLinkedRisks,
    linkErrorKey,
    linkedRisksErrorKey,
    isLinkDialogOpen,
    selectedRisk,
    isRiskModalOpen,
    onOpenLinkDialog,
    onCloseLinkDialog,
    onLinkRisk,
    onUnlinkRisk,
    onRiskClick,
    onCloseRiskModal,
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
                    <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                        <BarChart3 className="h-5 w-5 text-accent" />
                        <h3 className="font-bold text-white uppercase tracking-widest text-xs">{t('controls:detail.standard_configuration')}</h3>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center group">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('controls:columns.risk_level')}</span>
                            <div className={`px-3 py-1 rounded-full text-xs font-black border ${getRiskLevelColor(control.risk_level)}`}>
                                {control.risk_level} / 5
                            </div>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('common:labels.frequency')}</span>
                            <div className="flex items-center gap-2 text-white font-bold text-sm bg-white/5 px-3 py-1 rounded-lg border border-white/5">
                                <Calendar className="h-3.5 w-3.5 text-accent" />
                                <span className="capitalize">{control.frequency}</span>
                            </div>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('controls:detail.control_form')}</span>
                            <span className="text-white font-bold text-sm capitalize">{control.control_form}</span>
                        </div>
                    </div>
                </motion.div>

                <motion.div variants={item} className="glass-card flex flex-col gap-6">
                    <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                        <User className="h-5 w-5 text-purple-400" />
                        <h3 className="font-bold text-white uppercase tracking-widest text-xs">{t('controls:detail.ownership_responsibility')}</h3>
                    </div>

                    <div className="space-y-5">
                        <div className="flex gap-3 items-start">
                            <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-xs font-bold">
                                {control.control_owner?.name?.[0] || 'U'}
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{t('controls:fields.owner')}</p>
                                <p className="text-sm font-bold text-white leading-snug">{control.control_owner?.name || t('controls:detail.unassigned')}</p>
                                <p className="text-xs text-slate-500">{control.control_owner?.email || ''}</p>
                            </div>
                        </div>
                        <div className="flex gap-3 items-start">
                            <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400">
                                <Building2 className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{t('controls:detail.department_position')}</p>
                                <p className="text-sm font-bold text-white leading-snug">{control.department?.name || t('controls:detail.no_department')}</p>
                                <p className="text-xs text-slate-500 italic uppercase tracking-tighter text-[10px] font-bold mt-0.5">
                                    {control.process_owner_position || t('controls:detail.not_available')}
                                </p>
                            </div>
                        </div>
                    </div>
                </motion.div>

                <motion.div variants={item} className="glass-card flex flex-col gap-6">
                    <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                        <BookOpen className="h-5 w-5 text-amber-400" />
                        <h3 className="font-bold text-white uppercase tracking-widest text-xs">{t('controls:detail.methodology_source')}</h3>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">{t('controls:detail.methodology_ref')}</p>
                            <p className="text-sm font-medium text-slate-300 bg-white/5 p-2 rounded-lg border border-white/5 font-mono truncate">
                                {control.methodology_reference || t('controls:detail.not_available')}
                            </p>
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">{t('controls:detail.data_source')}</p>
                            <p className="text-xs text-slate-400 leading-relaxed italic border-l-2 border-accent/30 pl-3">
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
                <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-white uppercase tracking-widest text-xs flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-emerald-400" />
                        {t('controls:detail.mitigated_risks')}
                    </h3>
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-black rounded-full border border-emerald-500/20">
                        {linkedRisks.length}
                    </span>
                </div>

                {linkErrorKey && (
                    <div className="mb-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        {t(linkErrorKey, { ns: 'errorKeys' })}
                    </div>
                )}

                {linkedRisksErrorKey ? (
                    <div className="py-10 text-center border-2 border-dashed border-rose-500/20 rounded-2xl bg-rose-500/5">
                        <AlertCircle className="h-8 w-8 text-rose-400 mx-auto mb-2" />
                        <p className="text-xs text-rose-400 font-medium">{t(linkedRisksErrorKey)}</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {activeLinkedRisks.length === 0 && archivedLinkedRisks.length === 0 ? (
                            <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-2xl col-span-full">
                                <p className="text-xs text-slate-600 font-medium">{t('controls:empty_state.no_linked_risks')}</p>
                            </div>
                        ) : (
                            <>
                                {activeLinkedRisks.length > 0 && (
                                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                        {activeLinkedRisks.map((link) => (
                                            <div
                                                key={link.id}
                                                onClick={(e) => onRiskClick(link.risk_id, e)}
                                                className="group p-4 bg-white/[0.03] border border-white/5 rounded-2xl hover:bg-white/[0.05] hover:border-accent/30 transition-all cursor-pointer relative"
                                            >
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <span className="text-xs font-bold text-white line-clamp-1">{link.risk?.name || t('controls:detail.unnamed_risk')}</span>
                                                        {link.risk?.process && <span className="text-[10px] text-slate-500 block mt-0.5">{link.risk.process}</span>}
                                                    </div>
                                                    <span
                                                        className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${
                                                            link.effectiveness === 'high'
                                                                ? 'bg-emerald-500/10 text-emerald-400'
                                                                : 'bg-amber-500/10 text-amber-400'
                                                        }`}
                                                    >
                                                        {link.effectiveness}
                                                    </span>
                                                </div>
                                                {link.risk?.description && <p className="mt-1 text-[10px] text-slate-400 line-clamp-2">{link.risk.description}</p>}
                                                {link.notes && <p className="mt-2 text-[10px] text-slate-500 font-medium italic">"{link.notes}"</p>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {archivedLinkedRisks.length > 0 && (
                                    <div>
                                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
                                            {t('controls:detail.archived_risks', { count: archivedLinkedRisks.length })}
                                        </h4>
                                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 opacity-70">
                                            {archivedLinkedRisks.map((link) => (
                                                <div
                                                    key={link.id}
                                                    onClick={(e) => onRiskClick(link.risk_id, e)}
                                                    className="group p-4 bg-white/[0.03] border border-white/5 rounded-2xl hover:bg-white/[0.05] hover:border-accent/30 transition-all cursor-pointer relative"
                                                >
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div>
                                                            <span className="text-xs font-bold text-white line-clamp-1">{link.risk?.name || t('controls:detail.unnamed_risk')}</span>
                                                            {link.risk?.process && <span className="text-[10px] text-slate-500 block mt-0.5">{link.risk.process}</span>}
                                                        </div>
                                                        <span
                                                            className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${
                                                                link.effectiveness === 'high'
                                                                    ? 'bg-emerald-500/10 text-emerald-400'
                                                                    : 'bg-amber-500/10 text-amber-400'
                                                            }`}
                                                        >
                                                            {link.effectiveness}
                                                        </span>
                                                    </div>
                                                    {link.risk?.description && <p className="mt-1 text-[10px] text-slate-400 line-clamp-2">{link.risk.description}</p>}
                                                    {link.notes && <p className="mt-2 text-[10px] text-slate-500 font-medium italic">"{link.notes}"</p>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                <PermissionGate resource="controls" action="write">
                    <button
                        onClick={onOpenLinkDialog}
                        className="w-full mt-4 py-3 border border-dashed border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white hover:border-accent/40 hover:bg-white/5 transition-all"
                    >
                        {t('controls:detail.manage_risk_linkage')}
                    </button>
                </PermissionGate>

                <LinkManagementDialog
                    isOpen={isLinkDialogOpen}
                    onClose={onCloseLinkDialog}
                    mode="control-to-risk"
                    existingLinks={linkedRisks}
                    onLink={onLinkRisk}
                    onUnlink={onUnlinkRisk}
                />

                <RiskQuickViewModal risk={selectedRisk} isOpen={isRiskModalOpen} onClose={onCloseRiskModal} />
            </motion.div>
        </>
    );
}
