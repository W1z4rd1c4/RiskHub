import { motion } from 'framer-motion';
import {
    Building2,
    User,
    Tag,
    ShieldAlert,
    Star,
    Clock,
    CheckCircle2,
    FileText,
    Plus,
    Link as LinkIcon,
    Handshake,
} from 'lucide-react';
import type { Risk, RiskControlLink, ControlEffectiveness } from '@/types/risk';
import type { OverdueKRI } from '@/types/kri';
import type { Vendor } from '@/types/vendor';
import { PermissionGate } from '@/components/PermissionGate';
import { RiskScoreMatrix } from '@/components/RiskScoreMatrix';
import { LinkManagementDialog } from '@/components/LinkManagementDialog';
import { ControlCreateDialog } from '@/components/ControlCreateDialog';
import { KRIGaugeCard } from '@/components/kri/KRIGaugeCard';
import { ControlGaugeCard } from '@/components/controls/ControlGaugeCard';
import { useTranslation } from '@/i18n/hooks';

// Helper to convert hex color to rgba for backgrounds/borders
function hexToRgba(hex: string, alpha: number): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return `rgba(100, 116, 139, ${alpha})`; // slate-500 fallback
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
};

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
};

interface RiskDetailOverviewTabProps {
    risk: Risk;
    linkedControls: RiskControlLink[];
    linkedVendors: Vendor[];
    overdueKRIs: OverdueKRI[];
    getColor: (type: string) => string;
    getDisplayName: (type: string) => string;
    onNavigateToNewKri: () => void;
    onNavigateToKri: (kriId: number) => void;
    onLinkControl: (controlId: number, effectiveness: ControlEffectiveness, notes?: string) => Promise<void>;
    onUnlinkControl: (controlId: number) => Promise<void>;
    onOpenCreateControl: () => void;
    onNavigateToControl: (controlId: number) => void;
    onNavigateToVendor: (vendorId: number) => void;
    onRefreshData: () => void;
    // Dialog state
    isLinkDialogOpen: boolean;
    setIsLinkDialogOpen: (open: boolean) => void;
    dialogMode: 'both' | 'search-only' | 'links-only';
    setDialogMode: (mode: 'both' | 'search-only' | 'links-only') => void;
    isCreateDialogOpen: boolean;
    setIsCreateDialogOpen: (open: boolean) => void;
}

export function RiskDetailOverviewTab({
    risk,
    linkedControls,
    linkedVendors,
    overdueKRIs,
    getColor,
    getDisplayName,
    onNavigateToNewKri,
    onNavigateToKri,
    onLinkControl,
    onUnlinkControl,
    onOpenCreateControl,
    onNavigateToControl,
    onNavigateToVendor,
    onRefreshData,
    isLinkDialogOpen,
    setIsLinkDialogOpen,
    dialogMode,
    setDialogMode,
    isCreateDialogOpen,
    setIsCreateDialogOpen,
}: RiskDetailOverviewTabProps) {
    const { t, i18n } = useTranslation(['risks', 'common', 'vendors', 'controls', 'kris']);
    const activeControls = linkedControls.filter(link =>
        link.control?.status !== 'draft' && link.control?.status !== 'archived'
    );
    const draftControls = linkedControls.filter(link => link.control?.status === 'draft');
    const archivedControls = linkedControls.filter(link => link.control?.status === 'archived');
    const linkedKriCount = risk.kris?.length ?? 0;
    const linkedVendorCount = linkedVendors.length;

    return (
        <>
            {/* Risk Matrices - Gross vs Net */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card"
            >
                <div className="flex items-center gap-3 border-b border-white/5 pb-4 mb-6">
                    <ShieldAlert className="h-5 w-5 text-accent" />
                    <h3 className="font-bold text-white uppercase tracking-widest text-xs">{t('tabs.assessment', { ns: 'risks' })}</h3>
                </div>

                <div className="flex flex-col md:flex-row items-center justify-center gap-12 md:gap-24 py-4">
                    <RiskScoreMatrix
                        probability={risk.gross_probability}
                        impact={risk.gross_impact}
                        type="gross"
                        size="medium"
                    />

                    <div className="hidden md:block w-px h-32 bg-white/10" />
                    <div className="md:hidden w-32 h-px bg-white/10" />

                    <RiskScoreMatrix
                        probability={risk.net_probability}
                        impact={risk.net_impact}
                        type="net"
                        size="medium"
                    />
                </div>
            </motion.div>

            <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
            >
                {/* Classification */}
                <motion.div variants={item} className="glass-card flex flex-col gap-6">
                    <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                        <Tag className="h-5 w-5 text-purple-400" />
                        <h3 className="font-bold text-white uppercase tracking-widest text-xs">{t('overview.classification', { ns: 'risks' })}</h3>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('common:labels.type')}</span>
                            {(() => {
                                const typeColor = getColor(risk.risk_type);
                                return (
                                    <span
                                        className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase"
                                        style={{
                                            color: typeColor,
                                            backgroundColor: hexToRgba(typeColor, 0.12),
                                        }}
                                    >
                                        {getDisplayName(risk.risk_type)}
                                    </span>
                                );
                            })()}
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('common:labels.category')}</span>
                            <span className="text-sm text-white font-medium">{risk.category || '—'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('common:labels.process')}</span>
                            <span className="text-sm text-white font-medium">{risk.process}</span>
                        </div>
                        {risk.subprocess && (
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('overview.subprocess', { ns: 'risks' })}</span>
                                <span className="text-sm text-slate-300 font-medium">{risk.subprocess}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('fields.is_priority', { ns: 'risks' })}</span>
                            <span className={`flex items-center gap-1 text-sm font-bold ${risk.is_priority ? 'text-amber-400' : 'text-slate-400'}`}>
                                {risk.is_priority ? <><Star className="h-3 w-3 fill-amber-400" /> {t('common:actions.yes')}</> : t('common:actions.no')}
                            </span>
                        </div>
                    </div>
                </motion.div>

                {/* Ownership */}
                <motion.div variants={item} className="glass-card flex flex-col gap-6">
                    <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                        <User className="h-5 w-5 text-accent" />
                        <h3 className="font-bold text-white uppercase tracking-widest text-xs">{t('overview.ownership', { ns: 'risks' })}</h3>
                    </div>

                    <div className="space-y-5">
                        <div className="flex gap-3 items-start">
                            <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-xs font-bold">
                                {risk.owner?.name?.[0] || 'U'}
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{t('fields.owner', { ns: 'risks' })}</p>
                                <p className="text-sm font-bold text-white leading-snug">{risk.owner?.name || t('overview.unassigned', { ns: 'risks' })}</p>
                                <p className="text-xs text-slate-500">{risk.owner?.email || ''}</p>
                            </div>
                        </div>
                        <div className="flex gap-3 items-start">
                            <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400">
                                <Building2 className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{t('common:labels.department')}</p>
                                <p className="text-sm font-bold text-white leading-snug">{risk.department?.name || t('overview.no_department', { ns: 'risks' })}</p>
                                <p className="text-xs text-slate-500 font-mono">{risk.department?.code || ''}</p>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Connections */}
                <motion.div variants={item} className="glass-card flex flex-col gap-6">
                    <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                        <LinkIcon className="h-5 w-5 text-indigo-400" />
                        <h3 className="font-bold text-white uppercase tracking-widest text-xs">{t('overview.connections', { ns: 'risks' })}</h3>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                                {t('overview.mitigating_controls', { ns: 'risks' })}
                            </span>
                            <span className="text-lg text-white font-black">{activeControls.length}</span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                                {t('overview.risk_appetite_indicators', { ns: 'risks' })}
                            </span>
                            <span className="text-lg text-white font-black">{linkedKriCount}</span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                                {t('overview.linked_vendors', { ns: 'risks' })}
                            </span>
                            <span className="text-lg text-white font-black">{linkedVendorCount}</span>
                        </div>
                    </div>
                </motion.div>

                {/* KRI Section */}
                <motion.div variants={item} className="glass-card flex flex-col gap-6 md:col-span-2 lg:col-span-3">
                    <div className="flex items-center justify-between border-b border-white/5 pb-4">
                        <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-amber-400" />
                            <h3 className="font-bold text-white uppercase tracking-widest text-xs">{t('overview.risk_appetite_indicators', { ns: 'risks' })}</h3>
                        </div>
                        <PermissionGate resource="risks" action="write">
                            <button
                                onClick={onNavigateToNewKri}
                                className="px-3 py-1 bg-accent/10 border border-accent/20 rounded-lg text-accent text-[10px] font-black uppercase tracking-widest hover:bg-accent/20 transition-all font-bold"
                            >
                                <Plus className="h-3 w-3 inline mr-1" /> {t('overview.add_kri', { ns: 'risks' })}
                            </button>
                        </PermissionGate>
                    </div>

                    {risk.kris && risk.kris.length > 0 ? (
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {risk.kris.map(kri => {
                                const overdueInfo = overdueKRIs.find(o => o.kri_id === kri.id);
                                return (
                                    <KRIGaugeCard
                                        key={kri.id}
                                        kri={kri}
                                        isOverdue={!!overdueInfo}
                                        daysOverdue={overdueInfo?.days_overdue}
                                        onClick={() => onNavigateToKri(kri.id)}
                                    />
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-white/5 rounded-2xl">
                            <p className="text-slate-600 text-sm font-medium mb-2">{t('common:empty.no_kris_configured')}</p>
                            <p className="text-[10px] text-slate-700 max-w-xs mx-auto">{t('overview.kris_help_text', { ns: 'risks' })}</p>
                        </div>
                    )}
                </motion.div>
            </motion.div>

            {/* Linked Controls */}
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
                className="glass-card"
            >
                <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
                    <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        <h3 className="font-bold text-white uppercase tracking-widest text-xs">{t('overview.mitigating_controls', { ns: 'risks' })}</h3>
                    </div>
                    <PermissionGate resource="risks" action="write">
                        <div className="flex items-stretch bg-accent/10 border border-accent/20 rounded-lg overflow-hidden">
                            <button
                                onClick={() => {
                                    setDialogMode('search-only');
                                    setIsLinkDialogOpen(true);
                                }}
                                className="flex items-center gap-2 px-4 py-1.5 text-accent text-[10px] font-black uppercase tracking-widest hover:bg-accent/10 transition-all border-r border-accent/20"
                            >
                                <LinkIcon className="h-3 w-3" />
                                {t('overview.link_existing', { ns: 'risks' })}
                            </button>
                            <button
                                onClick={onOpenCreateControl}
                                className="flex items-center gap-2 px-3 py-1.5 text-accent text-[10px] font-black uppercase tracking-widest hover:bg-accent/10 transition-all"
                                title={t('overview.create_new_control', { ns: 'risks' })}
                            >
                                <Plus className="h-3.5 w-3.5" />
                                <span>{t('common:actions.add_control')}</span>
                            </button>
                        </div>
                    </PermissionGate>
                </div>

                <>
                    {activeControls.length === 0 && draftControls.length === 0 && archivedControls.length === 0 ? (
                        <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-2xl">
                            <p className="text-xs text-slate-600 font-medium">{t('overview.no_controls_linked', { ns: 'risks' })}</p>
                        </div>
                    ) : (
                        <>
                            {activeControls.length > 0 && (
                                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                    {activeControls.map((link) => (
                                        <ControlGaugeCard
                                            key={link.id}
                                            link={link}
                                            onClick={() => link.control && onNavigateToControl(link.control.id)}
                                        />
                                    ))}
                                </div>
                            )}

                            {draftControls.length > 0 && (
                                <div className="mt-8">
                                    <h4 className="text-[10px] font-black text-amber-500/70 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-amber-500/50"></span>
                                        {t('overview.draft_controls', { ns: 'risks', count: draftControls.length })}
                                    </h4>
                                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 opacity-60">
                                        {draftControls.map((link) => (
                                            <ControlGaugeCard
                                                key={link.id}
                                                link={link}
                                                onClick={() => link.control && onNavigateToControl(link.control.id)}
                                            />
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-slate-600 italic mt-3">{t('overview.draft_controls_help', { ns: 'risks' })}</p>
                                </div>
                            )}

                            {archivedControls.length > 0 && (
                                <div className="mt-8">
                                    <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                                        {t('overview.archived_controls', { ns: 'risks', count: archivedControls.length })}
                                    </h4>
                                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 opacity-40 hover:opacity-100 transition-opacity">
                                        {archivedControls.map((link) => (
                                            <ControlGaugeCard
                                                key={link.id}
                                                link={link}
                                                onClick={() => link.control && onNavigateToControl(link.control.id)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </>

                <PermissionGate resource="risks" action="write">
                    <button
                        onClick={() => {
                            setDialogMode('links-only');
                            setIsLinkDialogOpen(true);
                        }}
                        className="w-full mt-6 py-3 border border-dashed border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white hover:border-accent/40 hover:bg-white/5 transition-all"
                    >
                        {t('overview.manage_existing_links', { ns: 'risks' })}
                    </button>
                </PermissionGate>

                <LinkManagementDialog
                    isOpen={isLinkDialogOpen}
                    onClose={() => setIsLinkDialogOpen(false)}
                    mode="risk-to-control"
                    existingLinks={linkedControls}
                    onLink={onLinkControl}
                    onUnlink={onUnlinkControl}
                    showSearch={dialogMode !== 'links-only'}
                    showLinks={dialogMode !== 'search-only'}
                />

                <ControlCreateDialog
                    isOpen={isCreateDialogOpen}
                    onClose={() => setIsCreateDialogOpen(false)}
                    onSuccess={() => {
                        setIsCreateDialogOpen(false);
                        onRefreshData();
                    }}
                />
            </motion.div>

            {/* Linked Vendors */}
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.55 }}
                className="glass-card"
            >
                <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
                    <div className="flex items-center gap-3">
                        <Handshake className="h-5 w-5 text-indigo-400" />
                        <h3 className="font-bold text-white uppercase tracking-widest text-xs">{t('overview.linked_vendors', { ns: 'risks' })}</h3>
                    </div>
                </div>

                {linkedVendors.length === 0 ? (
                    <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-2xl">
                        <p className="text-xs text-slate-600 font-medium">{t('overview.no_vendors_linked', { ns: 'risks' })}</p>
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {linkedVendors.map((vendor) => (
                            <button
                                key={vendor.id}
                                onClick={() => onNavigateToVendor(vendor.id)}
                                className="group text-left bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 hover:border-accent/30 transition-all"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-white truncate">{vendor.name}</p>
                                        <p className="text-[10px] text-slate-500 truncate">{vendor.department_name || t('overview.unassigned', { ns: 'risks' })}</p>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black border text-amber-400 bg-amber-400/10 border-amber-400/20 whitespace-nowrap">
                                        {vendor.risk_score_1_5}/5
                                    </span>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {vendor.dora_relevant && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black border text-blue-400 bg-blue-400/10 border-blue-400/20">
                                            DORA
                                        </span>
                                    )}
                                    {vendor.supports_important_core_insurance_function && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black border text-emerald-400 bg-emerald-400/10 border-emerald-400/20">
                                            Core
                                        </span>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </motion.div>

            {/* Timestamps */}
                <div className="flex items-center justify-end gap-6 text-[10px] text-slate-600 font-medium">
                    <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                    {t('common:labels.created_at')}: {new Date(risk.created_at).toLocaleDateString(i18n.language)}
                    </div>
                    <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                    {t('common:labels.updated_at')}: {new Date(risk.updated_at).toLocaleDateString(i18n.language)}
                    </div>
                </div>
        </>
    );
}
