import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    Building2,
    Clock,
    Link as LinkIcon,
    ShieldCheck,
    Tag,
    User,
} from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import { vendorLinkApi } from '@/services/vendorLinkApi';
import type { LinkedControl, LinkedKRI } from '@/types/vendorLink';
import type { Vendor } from '@/types/vendor';
import { VendorLinkedControlsTab } from '@/components/vendors/VendorLinkedControlsTab';
import { VendorLinkedKRIsTab } from '@/components/vendors/VendorLinkedKRIsTab';
import { VendorLinkedRisksTab } from '@/components/vendors/VendorLinkedRisksTab';

interface VendorOverviewSummary {
    linkedControls: LinkedControl[];
    linkedKRIs: LinkedKRI[];
}

interface VendorOverviewTabProps {
    canCreateControl: boolean;
    canCreateKri: boolean;
    canCreateRisk: boolean;
    canEdit: boolean;
    onAddControl: () => void;
    onAddKri: () => void;
    onAddRisk: () => void;
    onNavigateToControl: (controlId: number) => void;
    onNavigateToKri: (kriId: number) => void;
    onNavigateToRisk: (riskId: number) => void;
    vendor: Vendor;
}

function formatDateTime(value?: string | null, locale?: string): string {
    if (!value) {
        return '—';
    }
    return new Date(value).toLocaleDateString(locale);
}

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.08 },
    },
};

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
};

export function VendorOverviewTab({
    canCreateControl,
    canCreateKri,
    canCreateRisk,
    canEdit,
    onAddControl,
    onAddKri,
    onAddRisk,
    onNavigateToControl,
    onNavigateToKri,
    onNavigateToRisk,
    vendor,
}: VendorOverviewTabProps) {
    const { t, i18n } = useTranslation(['vendors', 'common']);
    const [summary, setSummary] = useState<VendorOverviewSummary>({
        linkedControls: [],
        linkedKRIs: [],
    });

    const refreshSummary = useCallback(async () => {
        const [linkedControlsResult, linkedKRIsResult] = await Promise.all([
            vendorLinkApi.getLinkedControls(vendor.id),
            vendorLinkApi.getLinkedKRIs(vendor.id),
        ]);
        setSummary({
            linkedControls: linkedControlsResult,
            linkedKRIs: linkedKRIsResult,
        });
    }, [vendor.id]);

    useEffect(() => {
        void refreshSummary();
    }, [refreshSummary]);

    const activeLinkedControls = useMemo(
        () => summary.linkedControls.filter((control) => control.status !== 'archived'),
        [summary.linkedControls],
    );
    const activeLinkedKRIs = useMemo(
        () => summary.linkedKRIs.filter((kri) => !kri.is_archived),
        [summary.linkedKRIs],
    );
    const linkedExposureCount = vendor.linked_risks.length + activeLinkedControls.length + activeLinkedKRIs.length;
    const vendorFlags = [
        vendor.supports_important_core_insurance_function
            ? t('flags.supports_core_function')
            : null,
        vendor.dora_relevant ? t('flags.dora_relevant') : null,
        vendor.is_significant_vendor ? t('flags.significant_vendor') : null,
        vendor.has_alternative_providers ? t('flags.has_alternatives') : null,
    ].filter(Boolean) as string[];

    return (
        <div className="space-y-8">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card"
            >
                <div className="flex items-center gap-3 border-b border-white/5 pb-4 mb-6">
                    <ShieldCheck className="h-5 w-5 text-accent" />
                    <h3 className="font-bold text-white uppercase tracking-widest text-xs">{t('detail.overview')}</h3>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            {t('overview.summary.risk_score')}
                        </p>
                        <div className="mt-3 text-3xl font-black text-white">{vendor.risk_score_1_5}/5</div>
                        <p className="mt-2 text-xs text-slate-500">{t('overview.summary.risk_score_hint')}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            {t('columns.status')}
                        </p>
                        <div className="mt-3 text-xl font-black text-white">
                            {t(`status.${vendor.status}`, vendor.status)}
                        </div>
                        <p className="mt-2 text-xs text-slate-500">{t('overview.summary.type_hint', { type: t(`type.${vendor.vendor_type}`, vendor.vendor_type) })}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            {t('overview.summary.linked_exposure')}
                        </p>
                        <div className="mt-3 text-3xl font-black text-white">{linkedExposureCount}</div>
                        <p className="mt-2 text-xs text-slate-500">
                            {t('overview.summary.linked_exposure_hint', {
                                controls: activeLinkedControls.length,
                                kris: activeLinkedKRIs.length,
                                risks: vendor.linked_risks.length,
                            })}
                        </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            {t('overview.summary.flags')}
                        </p>
                        {vendorFlags.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {vendorFlags.map((flag) => (
                                    <span
                                        key={flag}
                                        className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest text-emerald-300 bg-emerald-400/10 border border-emerald-400/20"
                                    >
                                        {flag}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="mt-3 text-sm text-slate-400">{t('overview.summary.no_flags')}</p>
                        )}
                    </div>
                </div>
            </motion.div>

            <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
            >
                <motion.div variants={item} className="glass-card flex flex-col gap-6">
                    <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                        <Tag className="h-5 w-5 text-purple-400" />
                        <h3 className="font-bold text-white uppercase tracking-widest text-xs">{t('detail.classification')}</h3>
                    </div>

                    <div className="space-y-5">
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('columns.type')}</span>
                            <span className="text-sm text-white font-medium">{t(`type.${vendor.vendor_type}`, vendor.vendor_type)}</span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('form.country')}</span>
                            <span className="text-sm text-white font-medium">{vendor.country || '—'}</span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('form.legal_name')}</span>
                            <span className="text-sm text-white font-medium text-right">{vendor.legal_name || '—'}</span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('form.registration_id')}</span>
                            <span className="text-sm text-white font-medium">{vendor.registration_id || '—'}</span>
                        </div>
                    </div>
                </motion.div>

                <motion.div variants={item} className="glass-card flex flex-col gap-6">
                    <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                        <User className="h-5 w-5 text-accent" />
                        <h3 className="font-bold text-white uppercase tracking-widest text-xs">{t('detail.ownership')}</h3>
                    </div>

                    <div className="space-y-5">
                        <div className="flex gap-3 items-start">
                            <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-xs font-bold">
                                {(vendor.outsourcing_owner_name || 'U')[0]}
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{t('columns.owner')}</p>
                                <p className="text-sm font-bold text-white leading-snug">{vendor.outsourcing_owner_name || t('labels.unassigned')}</p>
                            </div>
                        </div>
                        <div className="flex gap-3 items-start">
                            <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400">
                                <Building2 className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{t('columns.department')}</p>
                                <p className="text-sm font-bold text-white leading-snug">{vendor.department_name || t('labels.unassigned')}</p>
                            </div>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('form.process')}</span>
                            <span className="text-sm text-white font-medium text-right">
                                {vendor.process}{vendor.subprocess ? ` / ${vendor.subprocess}` : ''}
                            </span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('form.website')}</span>
                            <span className="text-sm text-slate-300 font-medium text-right truncate">
                                {vendor.website || '—'}
                            </span>
                        </div>
                    </div>
                </motion.div>

                <motion.div variants={item} className="glass-card flex flex-col gap-6">
                    <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                        <LinkIcon className="h-5 w-5 text-indigo-400" />
                        <h3 className="font-bold text-white uppercase tracking-widest text-xs">{t('detail.connections')}</h3>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('tabs.linked_risks')}</span>
                            <span className="text-lg text-white font-black">{vendor.linked_risks.length}</span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('tabs.linked_controls')}</span>
                            <span className="text-lg text-white font-black">{activeLinkedControls.length}</span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('tabs.linked_kris')}</span>
                            <span className="text-lg text-white font-black">{activeLinkedKRIs.length}</span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('overview.summary.linked_exposure')}</span>
                            <span className="text-lg text-white font-black">{linkedExposureCount}</span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{t('overview.summary.replaceability')}</span>
                            <span className="text-sm text-white font-medium">
                                {vendor.replaceability ? t(`form.replaceability.${vendor.replaceability}`) : '—'}
                            </span>
                        </div>
                    </div>
                </motion.div>
            </motion.div>

            <VendorLinkedRisksTab
                vendorId={vendor.id}
                canCreateRisk={canCreateRisk}
                canEdit={canEdit}
                onAddRisk={onAddRisk}
                onNavigateToRisk={onNavigateToRisk}
            />

            <VendorLinkedControlsTab
                vendorId={vendor.id}
                canCreateControl={canCreateControl}
                canEdit={canEdit}
                onAddControl={onAddControl}
                onNavigateToControl={onNavigateToControl}
            />

                <VendorLinkedKRIsTab
                    vendorId={vendor.id}
                    canCreateKri={canCreateKri}
                    canEdit={canEdit}
                    onAddKri={onAddKri}
                    onNavigateToKri={onNavigateToKri}
                />

            <div className="flex items-center justify-end gap-6 text-[10px] text-slate-600 font-medium">
                <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {t('overview.meta.created_at')}: {formatDateTime(vendor.created_at, i18n.language)}
                </div>
                <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {t('overview.meta.updated_at')}: {formatDateTime(vendor.updated_at, i18n.language)}
                </div>
            </div>
        </div>
    );
}
