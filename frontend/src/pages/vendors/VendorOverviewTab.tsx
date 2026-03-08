import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Building2,
    Link2,
    Tag,
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
import { VendorBadge, VendorSurface } from '@/components/vendors/vendorRouteUi';
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
    if (tone === 'good') return 'success';
    if (tone === 'warn') return 'warn';
    if (tone === 'bad') return 'danger';
    return 'neutral';
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
            {/* KPI Metric Strip */}
            <div className="vendor-metric-strip">
                <div className="vendor-metric">
                    <span className="vendor-metric__label">{t('overview.kpis.risk_score')}</span>
                    <span className="vendor-metric__value">{vendor.risk_score_1_5}/5</span>
                </div>
                <div className="vendor-metric">
                    <span className="vendor-metric__label">{t('overview.kpis.assessment')}</span>
                    <span className="vendor-metric__value">
                        {latestAssessment
                            ? t(`assessments.status.${latestAssessment.status}`, latestAssessment.status)
                            : t('overview.kpis.no_assessment')}
                    </span>
                    <span className="vendor-metric__meta">
                        {latestAssessment ? formatDateTime(latestAssessment.updated_at) : '—'}
                    </span>
                </div>
                <div className="vendor-metric">
                    <span className="vendor-metric__label">{t('overview.kpis.reassessment_due')}</span>
                    <span className="vendor-metric__value">{formatDate(vendor.next_reassessment_due_at)}</span>
                    <VendorBadge tone={toneClasses(scheduleTone) as 'success' | 'warn' | 'danger' | 'neutral'}>
                        {t(`overview.schedule.${scheduleTone}`)}
                    </VendorBadge>
                </div>
                <div className="vendor-metric">
                    <span className="vendor-metric__label">{t('overview.kpis.linked_exposure')}</span>
                    <span className="vendor-metric__value">{linkedExposureCount}</span>
                    <span className="vendor-metric__meta">
                        {t('overview.kpis.linked_exposure_hint', {
                            controls: activeLinkedControls.length,
                            risks: vendor.linked_risks.length,
                        })}
                    </span>
                </div>
            </div>

            {/* Detail Cards */}
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {/* Classification Card */}
                <VendorSurface className="flex flex-col gap-4">
                    <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                        <Tag className="h-5 w-5 text-purple-400" />
                        <h3 className="text-xs font-bold uppercase tracking-widest text-white">{t('detail.classification')}</h3>
                    </div>
                    <div className="vendor-stack">
                        <div className="vendor-info-card">
                            <div className="vendor-info-card__label">{t('columns.type')}</div>
                            <div className="vendor-info-card__value">{t(`type.${vendor.vendor_type}`, vendor.vendor_type)}</div>
                        </div>
                        <div className="vendor-info-card">
                            <div className="vendor-info-card__label">{t('form.country')}</div>
                            <div className="vendor-info-card__value">{vendor.country || '—'}</div>
                        </div>
                        <div className="vendor-info-card">
                            <div className="vendor-info-card__label">{t('form.legal_name')}</div>
                            <div className="vendor-info-card__value">{vendor.legal_name || '—'}</div>
                        </div>
                        <div className="vendor-info-card">
                            <div className="vendor-info-card__label">{t('form.registration_id')}</div>
                            <div className="vendor-info-card__value">{vendor.registration_id || '—'}</div>
                        </div>
                    </div>
                </VendorSurface>

                {/* Ownership Card */}
                <VendorSurface className="flex flex-col gap-4">
                    <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                        <User className="h-5 w-5 text-accent" />
                        <h3 className="text-xs font-bold uppercase tracking-widest text-white">{t('detail.ownership')}</h3>
                    </div>
                    <div className="vendor-stack">
                        <div className="vendor-info-card">
                            <div className="vendor-info-card__label">{t('columns.owner')}</div>
                            <div className="vendor-info-card__value">
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-[10px] font-bold shrink-0">
                                        {(vendor.outsourcing_owner_name || 'U')[0]}
                                    </div>
                                    {vendor.outsourcing_owner_name || t('labels.unassigned')}
                                </div>
                            </div>
                        </div>
                        <div className="vendor-info-card">
                            <div className="vendor-info-card__label">{t('columns.department')}</div>
                            <div className="vendor-info-card__value">
                                <div className="flex items-center gap-2">
                                    <Building2 className="h-4 w-4 shrink-0 vendor-muted" />
                                    {vendor.department_name || t('labels.unassigned')}
                                </div>
                            </div>
                        </div>
                        <div className="vendor-info-card">
                            <div className="vendor-info-card__label">{t('form.process')}</div>
                            <div className="vendor-info-card__value">
                                {vendor.process}{vendor.subprocess ? ` / ${vendor.subprocess}` : ''}
                            </div>
                        </div>
                        <div className="vendor-info-card">
                            <div className="vendor-info-card__label">{t('form.website')}</div>
                            <div className="vendor-info-card__value">
                                {vendor.website ? (
                                    <a href={vendor.website} target="_blank" rel="noreferrer" className="hover:text-accent transition-colors">
                                        {vendor.website}
                                    </a>
                                ) : '—'}
                            </div>
                        </div>
                    </div>
                </VendorSurface>

                {/* Connections Card */}
                <VendorSurface className="flex flex-col gap-4">
                    <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                        <Link2 className="h-5 w-5 text-indigo-400" />
                        <h3 className="text-xs font-bold uppercase tracking-widest text-white">{t('detail.connections')}</h3>
                    </div>
                    <div className="vendor-stack">
                        <div className="vendor-info-card">
                            <div className="flex items-center justify-between">
                                <span className="vendor-info-card__label">{t('tabs.linked_risks')}</span>
                                <span className="vendor-info-card__value">{vendor.linked_risks.length}</span>
                            </div>
                        </div>
                        <div className="vendor-info-card">
                            <div className="flex items-center justify-between">
                                <span className="vendor-info-card__label">{t('tabs.linked_controls')}</span>
                                <span className="vendor-info-card__value">{activeLinkedControls.length}</span>
                            </div>
                        </div>
                        <div className="vendor-info-card">
                            <div className="flex items-center justify-between">
                                <span className="vendor-info-card__label">{t('tabs.risk_factors')}</span>
                                <span className="vendor-info-card__value">{isLoadingSummary ? '—' : summary.riskFactors.length}</span>
                            </div>
                        </div>
                        <div className="vendor-info-card">
                            <div className="flex items-center justify-between">
                                <span className="vendor-info-card__label">{t('overview.monitoring.sla_breaches')}</span>
                                <span className={`vendor-info-card__value ${!isLoadingSummary && slaBreachCount > 0 ? 'text-rose-400' : ''}`}>
                                    {isLoadingSummary ? '—' : slaBreachCount}
                                </span>
                            </div>
                        </div>
                        <div className="vendor-info-card">
                            <div className="flex items-center justify-between">
                                <span className="vendor-info-card__label">{t('overview.monitoring.major_incidents')}</span>
                                <span className={`vendor-info-card__value ${!isLoadingSummary && majorIncidentCount > 0 ? 'text-rose-400' : ''}`}>
                                    {isLoadingSummary ? '—' : majorIncidentCount}
                                </span>
                            </div>
                        </div>
                        <div className="vendor-info-card">
                            <div className="flex items-center justify-between">
                                <span className="vendor-info-card__label">{t('tabs.remediation')}</span>
                                <span className={`vendor-info-card__value ${!isLoadingSummary && openRemediationCount > 0 ? 'text-amber-400' : ''}`}>
                                    {isLoadingSummary ? '—' : openRemediationCount}
                                </span>
                            </div>
                        </div>
                    </div>
                </VendorSurface>
            </div>

            {/* Metadata Footer */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs vendor-muted">
                <span>{t('overview.meta.created_at')}: {formatDateTime(vendor.created_at)}</span>
                <span>{t('overview.meta.updated_at')}: {formatDateTime(vendor.updated_at)}</span>
                {!isLoadingSummary ? <span>{t('overview.meta.active_incidents')}: {activeIncidentCount}</span> : null}
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
