import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Activity,
    Building2,
    Globe,
    Link2,
    ShieldCheck,
    ShieldEllipsis,
    User,
} from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';

import { vendorAssessmentApi } from '@/services/vendorAssessmentApi';
import { vendorIncidentApi } from '@/services/vendorIncidentApi';
import { vendorLinkApi } from '@/services/vendorLinkApi';
import { vendorRiskFactorApi } from '@/services/vendorRiskFactorApi';
import { vendorSlaApi } from '@/services/vendorSlaApi';
import type { VendorAssessment } from '@/types/vendorAssessment';
import type { LinkedControl } from '@/types/vendorLink';
import type { VendorIncident, VendorRemediationAction } from '@/types/vendorIncident';
import type { VendorSLA } from '@/types/vendorSla';
import type { VendorRiskFactor } from '@/types/vendorRisk';
import type { Vendor } from '@/types/vendor';
import { VendorLinkedControlsTab } from '@/components/vendors/VendorLinkedControlsTab';
import { VendorLinkedRisksTab } from '@/components/vendors/VendorLinkedRisksTab';
import { VendorRiskFactorsTab } from '@/components/vendors/VendorRiskFactorsTab';

import { VendorSectionStack } from './VendorSectionStack';
import type { VendorSectionView } from './vendorDetailPresentation';

interface VendorOverviewSummary {
    assessments: VendorAssessment[];
    incidents: VendorIncident[];
    linkedControls: LinkedControl[];
    remediation: VendorRemediationAction[];
    riskFactors: VendorRiskFactor[];
    slas: VendorSLA[];
}

interface VendorOverviewTabProps {
    activeSection: VendorSectionView;
    canEdit: boolean;
    onNavigateToControl: (controlId: number) => void;
    onNavigateToRisk: (riskId: number) => void;
    onSelectSection: (section: VendorSectionView) => void;
    vendor: Vendor;
}

function getScheduleTone(nextDueAt?: string | null): 'good' | 'warn' | 'bad' | 'neutral' {
    if (!nextDueAt) {
        return 'neutral';
    }

    const dueAt = new Date(nextDueAt);
    const diffMs = dueAt.getTime() - Date.now();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays < 0) {
        return 'bad';
    }
    if (diffDays <= 30) {
        return 'warn';
    }
    return 'good';
}

function toneClasses(tone: 'good' | 'warn' | 'bad' | 'neutral'): string {
    if (tone === 'good') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300';
    if (tone === 'warn') return 'border-amber-400/20 bg-amber-400/10 text-amber-300';
    if (tone === 'bad') return 'border-rose-400/20 bg-rose-400/10 text-rose-300';
    return 'border-white/10 bg-white/5 text-slate-300';
}

function formatDate(value?: string | null): string {
    if (!value) {
        return '—';
    }
    return new Date(value).toLocaleDateString();
}

function formatDateTime(value?: string | null): string {
    if (!value) {
        return '—';
    }
    return new Date(value).toLocaleString();
}

export function VendorOverviewTab({
    activeSection,
    canEdit,
    onNavigateToControl,
    onNavigateToRisk,
    onSelectSection,
    vendor,
}: VendorOverviewTabProps) {
    const { t } = useTranslation('vendors');
    const [summary, setSummary] = useState<VendorOverviewSummary>({
        assessments: [],
        incidents: [],
        linkedControls: [],
        remediation: [],
        riskFactors: [],
        slas: [],
    });
    const [isLoadingSummary, setIsLoadingSummary] = useState(true);

    const refreshSummary = useCallback(async () => {
        setIsLoadingSummary(true);
        const [
            assessmentsResult,
            linkedControlsResult,
            incidentsResult,
            remediationResult,
            slasResult,
            riskFactorsResult,
        ] = await Promise.allSettled([
            vendorAssessmentApi.getVendorAssessments(vendor.id),
            vendorLinkApi.getLinkedControls(vendor.id),
            vendorIncidentApi.listIncidents(vendor.id),
            vendorIncidentApi.listRemediation(vendor.id),
            vendorSlaApi.list({ vendor_id: vendor.id }),
            vendorRiskFactorApi.getVendorRiskFactors(vendor.id),
        ]);

        setSummary({
            assessments: assessmentsResult.status === 'fulfilled' ? assessmentsResult.value : [],
            incidents: incidentsResult.status === 'fulfilled' ? incidentsResult.value : [],
            linkedControls: linkedControlsResult.status === 'fulfilled' ? linkedControlsResult.value : [],
            remediation: remediationResult.status === 'fulfilled' ? remediationResult.value : [],
            riskFactors: riskFactorsResult.status === 'fulfilled' ? riskFactorsResult.value : [],
            slas: slasResult.status === 'fulfilled' ? slasResult.value.filter((sla) => !sla.is_archived) : [],
        });
        setIsLoadingSummary(false);
    }, [vendor.id]);

    useEffect(() => {
        void refreshSummary();
    }, [refreshSummary]);

    const latestAssessment = useMemo(
        () =>
            [...summary.assessments].sort(
                (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
            )[0] ?? null,
        [summary.assessments]
    );
    const activeLinkedControls = useMemo(
        () => summary.linkedControls.filter((control) => control.status !== 'archived'),
        [summary.linkedControls]
    );
    const openRemediationCount = useMemo(
        () => summary.remediation.filter((action) => action.status !== 'done').length,
        [summary.remediation]
    );
    const activeIncidentCount = summary.incidents.length;
    const majorIncidentCount = summary.incidents.filter((incident) => incident.is_major).length;
    const slaBreachCount = summary.slas.filter((sla) => sla.breach_status !== 'within').length;
    const scheduleTone = getScheduleTone(vendor.next_reassessment_due_at);
    const linkedExposureCount = vendor.linked_risks.length + activeLinkedControls.length;

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <section className="glass-card p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {t('overview.kpis.risk_score')}
                    </p>
                    <div className="mt-3 flex items-end justify-between gap-3">
                        <p className="text-3xl font-black text-white">{vendor.risk_score_1_5}/5</p>
                        <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-300">
                            {t('tabs.overview')}
                        </span>
                    </div>
                </section>

                <section className="glass-card p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {t('overview.kpis.assessment')}
                    </p>
                    <div className="mt-3 space-y-2">
                        <p className="text-lg font-black text-white">
                            {latestAssessment
                                ? t(`assessments.status.${latestAssessment.status}`, latestAssessment.status)
                                : t('overview.kpis.no_assessment')}
                        </p>
                        <p className="text-xs font-medium text-slate-500">
                            {latestAssessment ? formatDateTime(latestAssessment.updated_at) : '—'}
                        </p>
                    </div>
                </section>

                <section className="glass-card p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {t('overview.kpis.reassessment_due')}
                    </p>
                    <div className="mt-3 space-y-2">
                        <p className="text-lg font-black text-white">{formatDate(vendor.next_reassessment_due_at)}</p>
                        <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${toneClasses(scheduleTone)}`}>
                            {t(`overview.schedule.${scheduleTone}`)}
                        </span>
                    </div>
                </section>

                <section className="glass-card p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {t('overview.kpis.linked_exposure')}
                    </p>
                    <div className="mt-3 space-y-2">
                        <p className="text-3xl font-black text-white">{linkedExposureCount}</p>
                        <p className="text-xs font-medium text-slate-500">
                            {t('overview.kpis.linked_exposure_hint', {
                                controls: activeLinkedControls.length,
                                risks: vendor.linked_risks.length,
                            })}
                        </p>
                    </div>
                </section>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <section className="glass-card p-6 space-y-4">
                    <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                        <ShieldCheck className="h-5 w-5 text-amber-300" />
                        <h3 className="text-xs font-black uppercase tracking-widest text-white">
                            {t('detail.classification')}
                        </h3>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('form.legal_name')}</p>
                            <p className="text-sm text-slate-200">{vendor.legal_name || '—'}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('form.registration_id')}</p>
                            <p className="text-sm text-slate-200">{vendor.registration_id || '—'}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('form.country')}</p>
                            <p className="text-sm text-slate-200">{vendor.country || '—'}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('columns.type')}</p>
                            <p className="text-sm text-slate-200">{t(`type.${vendor.vendor_type}`, vendor.vendor_type)}</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-300">
                            {t('columns.risk_score')}: {vendor.risk_score_1_5}/5
                        </span>
                        {vendor.supports_important_core_insurance_function && (
                            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-300">
                                {t('flags.supports_core_function')}
                            </span>
                        )}
                        {vendor.dora_relevant && (
                            <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-300">
                                {t('flags.dora_relevant')}
                            </span>
                        )}
                        {vendor.is_significant_vendor && (
                            <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-orange-300">
                                {t('flags.significant_vendor')}
                            </span>
                        )}
                    </div>
                </section>

                <section className="glass-card p-6 space-y-4">
                    <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                        <User className="h-5 w-5 text-accent" />
                        <h3 className="text-xs font-black uppercase tracking-widest text-white">
                            {t('detail.ownership')}
                        </h3>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="flex items-start gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                            <Building2 className="mt-0.5 h-4 w-4 text-accent" />
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('columns.department')}</p>
                                <p className="text-sm font-bold text-white">{vendor.department_name || t('labels.unassigned')}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                            <User className="mt-0.5 h-4 w-4 text-accent" />
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('columns.owner')}</p>
                                <p className="text-sm font-bold text-white">{vendor.outsourcing_owner_name || '—'}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                            <ShieldEllipsis className="mt-0.5 h-4 w-4 text-accent" />
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('form.process')}</p>
                                <p className="text-sm font-bold text-white">
                                    {vendor.process}
                                    {vendor.subprocess ? ` / ${vendor.subprocess}` : ''}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                            <Globe className="mt-0.5 h-4 w-4 text-accent" />
                            <div className="min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('form.website')}</p>
                                {vendor.website ? (
                                    <a
                                        href={vendor.website}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="truncate text-sm font-bold text-accent hover:text-white"
                                    >
                                        {vendor.website}
                                    </a>
                                ) : (
                                    <p className="text-sm font-bold text-white">—</p>
                                )}
                            </div>
                        </div>
                    </div>
                    {vendor.description && (
                        <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('form.description')}</p>
                            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{vendor.description}</p>
                        </div>
                    )}
                </section>

                <section className="glass-card p-6 space-y-4">
                    <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                        <Activity className="h-5 w-5 text-emerald-300" />
                        <h3 className="text-xs font-black uppercase tracking-widest text-white">
                            {t('detail.monitoring')}
                        </h3>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('overview.monitoring.assessment')}</p>
                            <p className="mt-2 text-sm font-bold text-white">
                                {latestAssessment
                                    ? t(`assessments.status.${latestAssessment.status}`, latestAssessment.status)
                                    : t('overview.kpis.no_assessment')}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('overview.monitoring.schedule')}</p>
                            <p className="mt-2 text-sm font-bold text-white">{formatDate(vendor.next_reassessment_due_at)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('overview.monitoring.sla_breaches')}</p>
                            <p className="mt-2 text-sm font-bold text-white">{slaBreachCount}</p>
                        </div>
                        <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('overview.monitoring.major_incidents')}</p>
                            <p className="mt-2 text-sm font-bold text-white">{majorIncidentCount}</p>
                        </div>
                    </div>
                </section>

                <section className="glass-card p-6 space-y-4">
                    <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                        <Link2 className="h-5 w-5 text-indigo-300" />
                        <h3 className="text-xs font-black uppercase tracking-widest text-white">
                            {t('detail.connections')}
                        </h3>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('tabs.linked_risks')}</p>
                            <p className="mt-2 text-sm font-bold text-white">{vendor.linked_risks.length}</p>
                        </div>
                        <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('tabs.linked_controls')}</p>
                            <p className="mt-2 text-sm font-bold text-white">{activeLinkedControls.length}</p>
                        </div>
                        <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('tabs.risk_factors')}</p>
                            <p className="mt-2 text-sm font-bold text-white">{summary.riskFactors.length}</p>
                        </div>
                        <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('tabs.remediation')}</p>
                            <p className="mt-2 text-sm font-bold text-white">{openRemediationCount}</p>
                        </div>
                    </div>
                </section>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-6 text-[10px] font-medium text-slate-600">
                <span>
                    {t('overview.meta.created_at')}: {formatDateTime(vendor.created_at)}
                </span>
                <span>
                    {t('overview.meta.updated_at')}: {formatDateTime(vendor.updated_at)}
                </span>
                {!isLoadingSummary && (
                    <span>
                        {t('overview.meta.active_incidents')}: {activeIncidentCount}
                    </span>
                )}
            </div>

            <VendorSectionStack
                activeSection={activeSection}
                onSelectSection={onSelectSection}
                sections={[
                    {
                        id: 'risk_factors',
                        labelKey: 'tabs.risk_factors',
                        content: <VendorRiskFactorsTab vendorId={vendor.id} canEdit={canEdit} />,
                    },
                    {
                        id: 'linked_risks',
                        labelKey: 'tabs.linked_risks',
                        content: (
                            <VendorLinkedRisksTab
                                vendorId={vendor.id}
                                canEdit={canEdit}
                                onNavigateToRisk={onNavigateToRisk}
                            />
                        ),
                    },
                    {
                        id: 'linked_controls',
                        labelKey: 'tabs.linked_controls',
                        content: (
                            <VendorLinkedControlsTab
                                vendorId={vendor.id}
                                canEdit={canEdit}
                                onNavigateToControl={onNavigateToControl}
                            />
                        ),
                    },
                ]}
            />
        </div>
    );
}
