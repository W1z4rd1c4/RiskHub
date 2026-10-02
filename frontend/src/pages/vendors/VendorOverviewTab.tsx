import { useCallback, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
    Clock,
    Link as LinkIcon,
    ShieldCheck,
    Tag,
    User,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { vendorValueLabel } from '@/lib/vendorValues';
import type { Vendor } from '@/types/vendor';
import { VendorLinkedControlsTab } from '@/components/vendors/VendorLinkedControlsTab';
import { VendorLinkedKRIsTab } from '@/components/vendors/VendorLinkedKRIsTab';
import { VendorLinkedRisksTab } from '@/components/vendors/VendorLinkedRisksTab';
import type { VendorLinkedRegionSummary } from '@/components/vendors/VendorLinkedEntitiesTab';

import { DetailField, DetailFieldList } from '../detail/DetailField';
import { DetailSection } from '../detail/DetailSection';
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

/** One headline figure of the overview summary (a nested panel inside the section card). */
function SummaryTile({ label, value, hint, valueClassName = 'text-3xl' }: {
    label: string;
    value: ReactNode;
    hint?: ReactNode;
    valueClassName?: string;
}) {
    return (
        <Card tone="nested" padding="compact" className="p-5">
            <p className="text-eyebrow">{label}</p>
            <div className={`mt-3 font-bold tabular-nums text-foreground ${valueClassName}`}>{value}</div>
            {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
        </Card>
    );
}

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
    const { t } = useTranslation(['vendors', 'common']);
    const format = useFormat();
    const formatDate = (value?: string | null) => (value ? format.date(value) : '') || '—';
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
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <DetailSection title={t('detail.overview')} icon={ShieldCheck} testId="vendor-overview">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <SummaryTile
                            label={t('overview.summary.risk_score')}
                            value={`${vendor.risk_score_1_5}/5`}
                            hint={t('overview.summary.risk_score_hint')}
                        />
                        <SummaryTile
                            label={t('columns.status')}
                            value={t(`status.${displayStatus}`, displayStatus)}
                            valueClassName="text-xl"
                            hint={t('overview.summary.type_hint', { type: t(`type.${vendor.vendor_type}`, vendor.vendor_type) })}
                        />
                        {canViewAnyLinkedExposure && linkedExposureCount !== null ? (
                            <SummaryTile
                                label={t('overview.summary.linked_exposure')}
                                value={linkedExposureCount}
                                hint={t('overview.summary.linked_exposure_hint', {
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
                            />
                        ) : null}
                        <Card tone="nested" padding="compact" className="p-5">
                            <p className="text-eyebrow">{t('overview.summary.flags')}</p>
                            {vendorFlags.length > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {vendorFlags.map((flag) => (
                                        <Badge key={flag} tone="success">{flag}</Badge>
                                    ))}
                                </div>
                            ) : (
                                <p className="mt-3 text-sm text-muted-foreground">{t('overview.summary.no_flags')}</p>
                            )}
                        </Card>
                    </div>
                </DetailSection>
            </motion.div>

            <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
            >
                <motion.div variants={item} className="min-w-0">
                    <DetailSection title={t('detail.classification')} icon={Tag} className="h-full">
                        <DetailFieldList className="md:grid-cols-1">
                            <DetailField label={t('columns.type')} value={t(`type.${vendor.vendor_type}`, vendor.vendor_type)} />
                            <DetailField label={t('form.country')} value={vendorValueLabel(t, 'country', vendor.country)} />
                            <DetailField label={t('form.legal_name')} value={vendor.legal_name} />
                            <DetailField label={t('form.registration_id')} value={vendor.registration_id} />
                        </DetailFieldList>
                    </DetailSection>
                </motion.div>

                <motion.div variants={item} className="min-w-0">
                    <DetailSection title={t('detail.ownership')} icon={User} className="h-full">
                        <DetailFieldList className="md:grid-cols-1">
                            <DetailField
                                label={t('columns.owner')}
                                value={(
                                    <>
                                        <span className="block font-bold">{ownerName}</span>
                                        <span className="block text-xs text-muted-foreground">
                                            {vendorOwnerMetadata(vendor.outsourcing_owner, t)}
                                        </span>
                                    </>
                                )}
                            />
                            <DetailField
                                label={t('columns.department')}
                                value={vendor.department_name || t('labels.unassigned')}
                            />
                            <DetailField
                                label={t('form.process')}
                                value={`${vendor.process}${vendor.subprocess ? ` / ${vendor.subprocess}` : ''}`}
                            />
                            <DetailField label={t('form.website')} value={vendor.website} />
                        </DetailFieldList>
                    </DetailSection>
                </motion.div>

                <motion.div variants={item} className="min-w-0">
                    <DetailSection title={t('detail.connections')} icon={LinkIcon} className="h-full">
                        <DetailFieldList className="md:grid-cols-1">
                            {canViewLinkedRisks ? (
                                <DetailField
                                    label={t('tabs.linked_risks')}
                                    value={renderLinkedCount(currentSummary.linkedRisks)}
                                />
                            ) : null}
                            {canViewLinkedControls ? (
                                <DetailField
                                    label={t('tabs.linked_controls')}
                                    value={renderLinkedCount(currentSummary.linkedControls)}
                                />
                            ) : null}
                            {canViewLinkedKris ? (
                                <DetailField
                                    label={t('tabs.linked_kris')}
                                    value={renderLinkedCount(currentSummary.linkedKRIs)}
                                />
                            ) : null}
                            {canViewAnyLinkedExposure && linkedExposureCount !== null ? (
                                <DetailField
                                    label={t('overview.summary.linked_exposure')}
                                    value={linkedExposureCount}
                                />
                            ) : null}
                            <DetailField
                                label={t('overview.summary.replaceability')}
                                value={vendorValueLabel(t, 'replaceability', vendor.replaceability)}
                            />
                        </DetailFieldList>
                    </DetailSection>
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

            <div className="flex items-center justify-end gap-6 text-xs font-medium text-muted-foreground">
                <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {t('overview.meta.created_at')}: {formatDate(vendor.created_at)}
                </div>
                <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {t('overview.meta.updated_at')}: {formatDate(vendor.updated_at)}
                </div>
            </div>
        </div>
    );
}
