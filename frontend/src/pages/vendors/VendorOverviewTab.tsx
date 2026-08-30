import { useCallback, useState } from 'react';
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
import { formatDateValue } from '@/i18n/formatters';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { vendorValueLabel } from '@/lib/vendorValues';
import type { Vendor } from '@/types/vendor';
import { VendorLinkedControlsTab } from '@/components/vendors/VendorLinkedControlsTab';
import { VendorLinkedKRIsTab } from '@/components/vendors/VendorLinkedKRIsTab';
import { VendorLinkedRisksTab } from '@/components/vendors/VendorLinkedRisksTab';
import type { VendorLinkedRegionSummary } from '@/components/vendors/VendorLinkedEntitiesTab';

import { VendorContractsSection } from './VendorContractsSection';
import { VendorDerivedSection } from './VendorDerivedSection';
import { VendorRegisterLinksSection } from './VendorRegisterLinksSection';
import { VendorSubOutsourcingSection } from './VendorSubOutsourcingSection';
import { getVendorDisplayStatus } from './vendorsPagePresentation';
import { vendorOwnerDisplayName, vendorOwnerMetadata } from './vendorDetailPresentation';

interface VendorOverviewSummary {
    vendorId: number;
    linkedRisks: VendorLinkedRegionSummary;
    linkedControls: VendorLinkedRegionSummary;
    linkedKRIs: VendorLinkedRegionSummary;
}

const createVendorOverviewSummary = (vendorId: number): VendorOverviewSummary => ({
    vendorId,
    linkedRisks: { status: 'loading' },
    linkedControls: { status: 'loading' },
    linkedKRIs: { status: 'loading' },
});

interface VendorOverviewTabProps {
    canCreateControl: boolean;
    canCreateKri: boolean;
    canCreateRisk: boolean;
    canLinkControl: boolean;
    canLinkKri: boolean;
    canLinkRisk: boolean;
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
    return formatDateValue(value, locale);
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
    canLinkControl,
    canLinkKri,
    canLinkRisk,
    onAddControl,
    onAddKri,
    onAddRisk,
    onNavigateToControl,
    onNavigateToKri,
    onNavigateToRisk,
    vendor,
}: VendorOverviewTabProps) {
    const { t, i18n } = useTranslation(['vendors', 'common']);
    const [summary, setSummary] = useState<VendorOverviewSummary>(() => (
        createVendorOverviewSummary(vendor.id)
    ));
    const displayStatus = getVendorDisplayStatus(vendor);
    const ownerName = vendorOwnerDisplayName(vendor.outsourcing_owner, vendor.ownership_status, t);
    const canViewLinkedRisks = resolveCapabilityFlag(vendor.capabilities, 'can_view_linked_risks');
    const canViewLinkedControls = resolveCapabilityFlag(vendor.capabilities, 'can_view_linked_controls');
    const canViewLinkedKris = resolveCapabilityFlag(vendor.capabilities, 'can_view_linked_kris');
    // ADR-016 (#100/#101): the backend's capability is the single protected-Vendor
    // switch for governed link/contract/sub-outsourcing mutations — never re-derived locally.
    const protectedChangeRequiresApproval = resolveCapabilityFlag(
        vendor.capabilities,
        'protected_change_requires_approval',
    );
    const canViewAnyLinkedExposure = canViewLinkedRisks || canViewLinkedControls || canViewLinkedKris;
    const currentSummary = summary.vendorId === vendor.id
        ? summary
        : createVendorOverviewSummary(vendor.id);
    const updateLinkedRisks = useCallback((next: VendorLinkedRegionSummary) => {
        setSummary((current) => ({
            ...(current.vendorId === vendor.id ? current : createVendorOverviewSummary(vendor.id)),
            linkedRisks: next,
        }));
    }, [vendor.id]);
    const updateLinkedControls = useCallback((next: VendorLinkedRegionSummary) => {
        setSummary((current) => ({
            ...(current.vendorId === vendor.id ? current : createVendorOverviewSummary(vendor.id)),
            linkedControls: next,
        }));
    }, [vendor.id]);
    const updateLinkedKris = useCallback((next: VendorLinkedRegionSummary) => {
        setSummary((current) => ({
            ...(current.vendorId === vendor.id ? current : createVendorOverviewSummary(vendor.id)),
            linkedKRIs: next,
        }));
    }, [vendor.id]);
    const visibleLinkedSummaries = [
        canViewLinkedRisks ? currentSummary.linkedRisks : null,
        canViewLinkedControls ? currentSummary.linkedControls : null,
        canViewLinkedKris ? currentSummary.linkedKRIs : null,
    ].filter((region): region is VendorLinkedRegionSummary => region !== null);
    const linkedExposureComplete = visibleLinkedSummaries.length > 0
        && visibleLinkedSummaries.every((region) => region.status === 'success');
    const linkedExposureCount = linkedExposureComplete
        ? visibleLinkedSummaries.reduce(
            (count, region) => count + (region.status === 'success' ? region.activeCount : 0),
            0,
        )
        : null;
    const renderLinkedCount = (region: VendorLinkedRegionSummary) => {
        if (region.status === 'success') {
            return region.activeCount;
        }
        return region.status === 'loading'
            ? t('labels.loading')
            : t('overview.summary.unavailable');
    };
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
                <div className="flex items-center gap-3 border-b border-border pb-4 mb-6">
                    <ShieldCheck className="h-5 w-5 text-accent" />
                    <h3 className="font-bold text-foreground uppercase tracking-widest text-xs">{t('detail.overview')}</h3>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-border bg-nested p-5">
                        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                            {t('overview.summary.risk_score')}
                        </p>
                        <div className="mt-3 text-3xl font-black text-foreground">{vendor.risk_score_1_5}/5</div>
                        <p className="mt-2 text-xs text-muted-foreground">{t('overview.summary.risk_score_hint')}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-nested p-5">
                        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                            {t('columns.status')}
                        </p>
                        <div className="mt-3 text-xl font-black text-foreground">
                            {t(`status.${displayStatus}`, displayStatus)}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{t('overview.summary.type_hint', { type: t(`type.${vendor.vendor_type}`, vendor.vendor_type) })}</p>
                    </div>
                    {canViewAnyLinkedExposure && linkedExposureCount !== null ? (
                        <div className="rounded-2xl border border-border bg-nested p-5">
                            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                                {t('overview.summary.linked_exposure')}
                            </p>
                            <div className="mt-3 text-3xl font-black text-foreground">{linkedExposureCount}</div>
                            <p className="mt-2 text-xs text-muted-foreground">
                                {t('overview.summary.linked_exposure_hint', {
                                    controls: canViewLinkedControls && currentSummary.linkedControls.status === 'success'
                                        ? currentSummary.linkedControls.activeCount
                                        : 0,
                                    kris: canViewLinkedKris && currentSummary.linkedKRIs.status === 'success'
                                        ? currentSummary.linkedKRIs.activeCount
                                        : 0,
                                    risks: canViewLinkedRisks && currentSummary.linkedRisks.status === 'success'
                                        ? currentSummary.linkedRisks.activeCount
                                        : 0,
                                })}
                            </p>
                        </div>
                    ) : null}
                    <div className="rounded-2xl border border-border bg-nested p-5">
                        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                            {t('overview.summary.flags')}
                        </p>
                        {vendorFlags.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {vendorFlags.map((flag) => (
                                    <span
                                        key={flag}
                                        className="px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-widest text-success-text bg-success/10 border border-success/20"
                                    >
                                        {flag}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="mt-3 text-sm text-muted-foreground">{t('overview.summary.no_flags')}</p>
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
                    <div className="flex items-center gap-3 border-b border-border pb-4">
                        <Tag className="h-5 w-5 text-accent-text" />
                        <h3 className="font-bold text-foreground uppercase tracking-widest text-xs">{t('detail.classification')}</h3>
                    </div>

                    <div className="space-y-5">
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">{t('columns.type')}</span>
                            <span className="text-sm text-foreground font-medium">{t(`type.${vendor.vendor_type}`, vendor.vendor_type)}</span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">{t('form.country')}</span>
                            <span className="text-sm text-foreground font-medium">{vendorValueLabel(t, 'country', vendor.country)}</span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">{t('form.legal_name')}</span>
                            <span className="text-sm text-foreground font-medium text-right">{vendor.legal_name || '—'}</span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">{t('form.registration_id')}</span>
                            <span className="text-sm text-foreground font-medium">{vendor.registration_id || '—'}</span>
                        </div>
                    </div>
                </motion.div>

                <motion.div variants={item} className="glass-card flex flex-col gap-6">
                    <div className="flex items-center gap-3 border-b border-border pb-4">
                        <User className="h-5 w-5 text-accent" />
                        <h3 className="font-bold text-foreground uppercase tracking-widest text-xs">{t('detail.ownership')}</h3>
                    </div>

                    <div className="space-y-5">
                        <div className="flex gap-3 items-start">
                            <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-xs font-bold">
                                {ownerName[0] || 'U'}
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground font-black uppercase tracking-widest">{t('columns.owner')}</p>
                                <p className="text-sm font-bold text-foreground leading-snug">{ownerName}</p>
                                <p className="text-xs text-muted-foreground">{vendorOwnerMetadata(vendor.outsourcing_owner, t)}</p>
                            </div>
                        </div>
                        <div className="flex gap-3 items-start">
                            <div className="w-8 h-8 rounded-full bg-nested border border-border flex items-center justify-center text-muted-foreground">
                                <Building2 className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground font-black uppercase tracking-widest">{t('columns.department')}</p>
                                <p className="text-sm font-bold text-foreground leading-snug">{vendor.department_name || t('labels.unassigned')}</p>
                            </div>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">{t('form.process')}</span>
                            <span className="text-sm text-foreground font-medium text-right">
                                {vendor.process}{vendor.subprocess ? ` / ${vendor.subprocess}` : ''}
                            </span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">{t('form.website')}</span>
                            <span className="text-sm text-foreground font-medium text-right truncate">
                                {vendor.website || '—'}
                            </span>
                        </div>
                    </div>
                </motion.div>

                <motion.div variants={item} className="glass-card flex flex-col gap-6">
                    <div className="flex items-center gap-3 border-b border-border pb-4">
                        <LinkIcon className="h-5 w-5 text-accent-text" />
                        <h3 className="font-bold text-foreground uppercase tracking-widest text-xs">{t('detail.connections')}</h3>
                    </div>

                    <div className="space-y-4">
                        {canViewLinkedRisks ? (
                            <div className="flex justify-between items-center gap-4">
                                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">{t('tabs.linked_risks')}</span>
                                <span className="text-lg text-foreground font-black">
                                    {renderLinkedCount(currentSummary.linkedRisks)}
                                </span>
                            </div>
                        ) : null}
                        {canViewLinkedControls ? (
                            <div className="flex justify-between items-center gap-4">
                                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">{t('tabs.linked_controls')}</span>
                                <span className="text-lg text-foreground font-black">
                                    {renderLinkedCount(currentSummary.linkedControls)}
                                </span>
                            </div>
                        ) : null}
                        {canViewLinkedKris ? (
                            <div className="flex justify-between items-center gap-4">
                                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">{t('tabs.linked_kris')}</span>
                                <span className="text-lg text-foreground font-black">
                                    {renderLinkedCount(currentSummary.linkedKRIs)}
                                </span>
                            </div>
                        ) : null}
                        {canViewAnyLinkedExposure && linkedExposureCount !== null ? (
                            <div className="flex justify-between items-center gap-4">
                                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">{t('overview.summary.linked_exposure')}</span>
                                <span className="text-lg text-foreground font-black">{linkedExposureCount}</span>
                            </div>
                        ) : null}
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">{t('overview.summary.replaceability')}</span>
                            <span className="text-sm text-foreground font-medium">
                                {vendorValueLabel(t, 'replaceability', vendor.replaceability)}
                            </span>
                        </div>
                    </div>
                </motion.div>
            </motion.div>

            {vendor.derived ? (
                <div id="vendor-derived">
                    <VendorDerivedSection derived={vendor.derived} />
                </div>
            ) : null}

            {canViewLinkedRisks ? (
                <div id="vendor-linked-risks">
                    <VendorLinkedRisksTab
                        vendorId={vendor.id}
                        canCreateRisk={canCreateRisk}
                        canEdit={canLinkRisk}
                        protectedChangeRequiresApproval={protectedChangeRequiresApproval}
                        onAddRisk={onAddRisk}
                        onNavigateToRisk={onNavigateToRisk}
                        onCollectionStateChange={updateLinkedRisks}
                    />
                </div>
            ) : null}

            {canViewLinkedControls ? (
                <div id="vendor-linked-controls">
                    <VendorLinkedControlsTab
                        vendorId={vendor.id}
                        canCreateControl={canCreateControl}
                        canEdit={canLinkControl}
                        protectedChangeRequiresApproval={protectedChangeRequiresApproval}
                        onAddControl={onAddControl}
                        onNavigateToControl={onNavigateToControl}
                        onCollectionStateChange={updateLinkedControls}
                    />
                </div>
            ) : null}

            {canViewLinkedKris ? (
                <div id="vendor-linked-kris">
                    <VendorLinkedKRIsTab
                        vendorId={vendor.id}
                        canCreateKri={canCreateKri}
                        canEdit={canLinkKri}
                        protectedChangeRequiresApproval={protectedChangeRequiresApproval}
                        onAddKri={onAddKri}
                        onNavigateToKri={onNavigateToKri}
                        onCollectionStateChange={updateLinkedKris}
                    />
                </div>
            ) : null}

            {resolveCapabilityFlag(vendor.capabilities, 'can_view_contracts') ? (
                <div id="vendor-contracts">
                    <VendorContractsSection
                        vendorId={vendor.id}
                        canManageContracts={resolveCapabilityFlag(vendor.capabilities, 'can_manage_contracts')}
                        protectedChangeRequiresApproval={protectedChangeRequiresApproval}
                    />
                </div>
            ) : null}

            {resolveCapabilityFlag(vendor.capabilities, 'can_view_sub_outsourcing') ? (
                <div id="vendor-sub-outsourcing">
                    <VendorSubOutsourcingSection
                        vendorId={vendor.id}
                        canManageSubOutsourcing={resolveCapabilityFlag(
                            vendor.capabilities,
                            'can_manage_sub_outsourcing',
                        )}
                        protectedChangeRequiresApproval={protectedChangeRequiresApproval}
                    />
                </div>
            ) : null}

            <div id="vendor-register-links">
                <VendorRegisterLinksSection
                    vendorId={vendor.id}
                    capabilities={vendor.capabilities}
                />
            </div>

            <div className="flex items-center justify-end gap-6 text-xs text-muted-foreground font-medium">
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
