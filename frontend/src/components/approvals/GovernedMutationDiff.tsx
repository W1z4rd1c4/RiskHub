import { ArrowRight } from 'lucide-react';

import { formatDateValue } from '@/i18n/formatters';
import { useTranslation } from '@/i18n/hooks';
import {
    processControlledValueLabel,
    processDerivedCifLabel,
    processDerivedCriticalityLabel,
    type ProcessControlledField,
} from '@/pages/processes/processesPagePresentation';
import type {
    GovernedDerivedImpact,
    GovernedAssetDerivedState,
    GovernedDerivedState,
    GovernedImpactedResource,
    GovernedMutationKind,
    GovernedRelationshipChange,
} from '@/types/approval';

interface GovernedMutationDiffProps {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    derivedImpact: GovernedDerivedImpact;
    impactedResources?: GovernedImpactedResource[];
    relationshipChange?: GovernedRelationshipChange | null;
    mutationKind?: GovernedMutationKind;
    testId?: string;
}

function valuesEqual(before: unknown, after: unknown): boolean {
    return JSON.stringify(before) === JSON.stringify(after);
}

function isRelationshipImpact(
    impact: GovernedDerivedImpact,
): impact is Extract<GovernedDerivedImpact, { processes?: unknown; assets?: unknown }> {
    return 'processes' in impact || 'assets' in impact;
}

function assetDerivedStateLabel(
    t: (key: string, options?: Record<string, unknown>) => string,
    state: GovernedAssetDerivedState,
    field: 'cif' | 'resulting_criticality',
): string {
    if (field === 'cif') return processDerivedCifLabel(t, state.cif);
    return processDerivedCriticalityLabel(t, state.resulting_criticality);
}

function nullableAssetDerivedStateLabel(
    t: (key: string, options?: Record<string, unknown>) => string,
    state: GovernedAssetDerivedState | null,
    field: 'cif' | 'resulting_criticality',
): string | null {
    return state === null ? null : assetDerivedStateLabel(t, state, field);
}

function derivedStateLabel(
    t: (key: string, options?: Record<string, unknown>) => string,
    state: GovernedDerivedState | null,
    field: 'cif' | 'criticality_class',
): string | null {
    if (state === null) return null;
    return field === 'cif'
        ? processDerivedCifLabel(t, state.cif)
        : processDerivedCriticalityLabel(t, state.criticality_class);
}

type AssetControlledField =
    | 'ai_relevance'
    | 'asset_level'
    | 'asset_type'
    | 'data_classification'
    | 'deployment_model'
    | 'gdpr_relevance'
    | 'internet_exposed'
    | 'lifecycle_state'
    | 'preliminary_criticality'
    | 'review_state';

type GovernedFieldKind = 'asset_controlled' | 'boolean' | 'controlled' | 'date' | 'number' | 'safe_label' | 'text';

interface GovernedFieldSpec {
    labelKey: string;
    kind: GovernedFieldKind;
    controlledField?: ProcessControlledField;
    assetControlledField?: AssetControlledField;
}

const ASSET_CONTROLLED_VALUES: Record<AssetControlledField, readonly string[]> = {
    asset_type: ['application', 'database', 'infrastructure', 'network_component', 'hardware', 'cloud_service', 'data_storage', 'information_asset', 'security_asset', 'bcm_dr_asset', 'other'],
    asset_level: ['primary', 'supporting', 'infrastructure'],
    deployment_model: ['on_premise', 'cloud', 'saas', 'paas', 'iaas', 'hybrid', 'externally_hosted', 'not_assessed', 'not_applicable'],
    gdpr_relevance: ['yes', 'no', 'undetermined'],
    ai_relevance: ['yes', 'no', 'undetermined'],
    data_classification: ['no_data_not_applicable', 'public', 'internal', 'confidential', 'highly_confidential_regulated', 'not_assessed'],
    internet_exposed: ['yes', 'no'],
    preliminary_criticality: ['low', 'medium', 'high', 'critical'],
    lifecycle_state: ['operational', 'in_development', 'being_decommissioned', 'legacy', 'retired'],
    review_state: ['review_required', 'reviewed'],
};

const GOVERNED_ASSET_FIELDS: Record<string, GovernedFieldSpec> = {
    name: { labelKey: 'assets:form.name', kind: 'text' },
    description: { labelKey: 'assets:form.description', kind: 'text' },
    asset_type: { labelKey: 'assets:form.asset_type', kind: 'asset_controlled', assetControlledField: 'asset_type' },
    asset_level: { labelKey: 'assets:form.asset_level', kind: 'asset_controlled', assetControlledField: 'asset_level' },
    physical_location: { labelKey: 'assets:form.physical_location', kind: 'text' },
    deployment_model: { labelKey: 'assets:form.deployment_model', kind: 'asset_controlled', assetControlledField: 'deployment_model' },
    alternative_names: { labelKey: 'assets:form.alternative_names', kind: 'text' },
    business_owner_user_id: { labelKey: 'assets:form.business_owner', kind: 'safe_label' },
    business_owner: { labelKey: 'assets:form.business_owner', kind: 'safe_label' },
    ict_owner_user_id: { labelKey: 'assets:form.ict_owner', kind: 'safe_label' },
    ict_owner: { labelKey: 'assets:form.ict_owner', kind: 'safe_label' },
    owning_department_id: { labelKey: 'assets:form.owner_department', kind: 'safe_label' },
    gdpr_relevance: { labelKey: 'assets:form.gdpr_relevance', kind: 'asset_controlled', assetControlledField: 'gdpr_relevance' },
    ai_relevance: { labelKey: 'assets:form.ai_relevance', kind: 'asset_controlled', assetControlledField: 'ai_relevance' },
    data_classification: { labelKey: 'assets:form.data_classification', kind: 'asset_controlled', assetControlledField: 'data_classification' },
    confidentiality_rating: { labelKey: 'assets:form.confidentiality_rating', kind: 'number' },
    integrity_rating: { labelKey: 'assets:form.integrity_rating', kind: 'number' },
    availability_rating: { labelKey: 'assets:form.availability_rating', kind: 'number' },
    authenticity_rating: { labelKey: 'assets:form.authenticity_rating', kind: 'number' },
    substitutability_rating: { labelKey: 'assets:form.substitutability_rating', kind: 'number' },
    vendor_dependency_rating: { labelKey: 'assets:form.vendor_dependency_rating', kind: 'number' },
    internet_exposed: { labelKey: 'assets:form.internet_exposed', kind: 'asset_controlled', assetControlledField: 'internet_exposed' },
    lifecycle_state: { labelKey: 'assets:form.lifecycle_state', kind: 'asset_controlled', assetControlledField: 'lifecycle_state' },
    standard_support_end_date: { labelKey: 'assets:form.standard_support_end_date', kind: 'date' },
    extended_support_end_date: { labelKey: 'assets:form.extended_support_end_date', kind: 'date' },
    custom_support_end_date: { labelKey: 'assets:form.custom_support_end_date', kind: 'date' },
    last_legacy_risk_assessment_date: { labelKey: 'assets:form.last_legacy_risk_assessment_date', kind: 'date' },
    review_state: { labelKey: 'assets:form.review_state', kind: 'asset_controlled', assetControlledField: 'review_state' },
    preliminary_criticality: { labelKey: 'assets:form.preliminary_criticality', kind: 'asset_controlled', assetControlledField: 'preliminary_criticality' },
    impact_client: { labelKey: 'assets:form.impact_client', kind: 'number' },
    impact_regulatory: { labelKey: 'assets:form.impact_regulatory', kind: 'number' },
    notes: { labelKey: 'assets:form.notes', kind: 'text' },
    is_archived: { labelKey: 'approvals:governed.link_fields.archived', kind: 'boolean' },
    linked: { labelKey: 'approvals:governed.link_fields.linked', kind: 'boolean' },
    related_resource_name: { labelKey: 'approvals:governed.link_fields.related_resource', kind: 'safe_label' },
    significance: { labelKey: 'approvals:governed.link_fields.significance', kind: 'safe_label' },
    spof: { labelKey: 'approvals:governed.link_fields.spof', kind: 'safe_label' },
    is_primary: { labelKey: 'approvals:governed.link_fields.is_primary', kind: 'boolean' },
    note: { labelKey: 'approvals:governed.link_fields.note', kind: 'text' },
    direct_service_description: { labelKey: 'approvals:governed.link_fields.direct_service_description', kind: 'text' },
    dependency_type: { labelKey: 'approvals:governed.link_fields.dependency_type', kind: 'text' },
    vendor_role: { labelKey: 'approvals:governed.link_fields.vendor_role', kind: 'text' },
    ict_service_code: { labelKey: 'approvals:governed.link_fields.ict_service_code', kind: 'text' },
    contract_reference: { labelKey: 'approvals:governed.link_fields.contract_reference', kind: 'text' },
    reliance: { labelKey: 'approvals:governed.link_fields.reliance', kind: 'text' },
};

const GOVERNED_PROCESS_FIELDS: Record<string, GovernedFieldSpec> = {
    l0_area: { labelKey: 'processes:form.l0_area', kind: 'text' },
    l1_process: { labelKey: 'processes:form.l1_process', kind: 'text' },
    l2_subprocess: { labelKey: 'processes:form.l2_subprocess', kind: 'text' },
    process_owner_user_id: { labelKey: 'processes:form.owner', kind: 'safe_label' },
    process_owner: { labelKey: 'processes:form.owner', kind: 'safe_label' },
    owning_department_id: { labelKey: 'processes:form.owner_department', kind: 'safe_label' },
    owning_department: { labelKey: 'processes:form.owner_department', kind: 'safe_label' },
    impact_client: { labelKey: 'processes:form.impact_client', kind: 'number' },
    impact_market_operations: { labelKey: 'processes:form.impact_market_operations', kind: 'number' },
    impact_regulatory: { labelKey: 'processes:form.impact_regulatory', kind: 'number' },
    impact_financial: { labelKey: 'processes:form.impact_financial', kind: 'number' },
    impact_reputational: { labelKey: 'processes:form.impact_reputational', kind: 'number' },
    mtpd_hours: { labelKey: 'processes:form.mtpd_hours', kind: 'number' },
    cif_override: {
        labelKey: 'processes:form.cif_override',
        kind: 'controlled',
        controlledField: 'cif_override',
    },
    licensed_activity: {
        labelKey: 'processes:form.licensed_activity',
        kind: 'controlled',
        controlledField: 'licensed_activity',
    },
    rto_hours: { labelKey: 'processes:form.rto_hours', kind: 'number' },
    rpo_hours: { labelKey: 'processes:form.rpo_hours', kind: 'number' },
    bcm_link: {
        labelKey: 'processes:form.bcm_link',
        kind: 'controlled',
        controlledField: 'bcm_link',
    },
    last_dr_test_date: { labelKey: 'processes:form.last_dr_test_date', kind: 'date' },
    dr_test_result: {
        labelKey: 'processes:form.dr_test_result',
        kind: 'controlled',
        controlledField: 'dr_test_result',
    },
    interruption_impact: {
        labelKey: 'processes:form.interruption_impact',
        kind: 'controlled',
        controlledField: 'interruption_impact',
    },
    assessment_date: { labelKey: 'processes:form.assessment_date', kind: 'date' },
    notes: { labelKey: 'processes:form.notes', kind: 'text' },
    linked: { labelKey: 'approvals:governed.link_fields.linked', kind: 'boolean' },
    related_resource_name: { labelKey: 'approvals:governed.link_fields.related_resource', kind: 'safe_label' },
    significance: { labelKey: 'approvals:governed.link_fields.significance', kind: 'safe_label' },
    spof: { labelKey: 'approvals:governed.link_fields.spof', kind: 'safe_label' },
    is_primary: { labelKey: 'approvals:governed.link_fields.is_primary', kind: 'boolean' },
    note: { labelKey: 'approvals:governed.link_fields.note', kind: 'text' },
    direct_service_description: {
        labelKey: 'approvals:governed.link_fields.direct_service_description',
        kind: 'text',
    },
};

function isSafeBusinessLabel(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const label = value.trim();
    return label.length > 0 && !/^#?\d+$/.test(label);
}

function displayGovernedValue(
    value: unknown,
    spec: GovernedFieldSpec,
    t: (key: string, options?: Record<string, unknown>) => string,
    locale: string,
): string {
    if (value === null || value === undefined || value === '') {
        return t('approvals:governed.not_set');
    }
    if (spec.kind === 'safe_label') {
        return isSafeBusinessLabel(value) ? value.trim() : t('approvals:governed.redacted_value');
    }
    if (spec.kind === 'text') {
        return typeof value === 'string' ? value : t('approvals:governed.redacted_value');
    }
    if (spec.kind === 'boolean') {
        return typeof value === 'boolean'
            ? t(value ? 'approvals:governed.yes' : 'approvals:governed.no')
            : t('approvals:governed.redacted_value');
    }
    if (spec.kind === 'number') {
        return typeof value === 'number' && Number.isFinite(value)
            ? new Intl.NumberFormat(locale).format(value)
            : t('approvals:governed.redacted_value');
    }
    if (spec.kind === 'date') {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return t('approvals:governed.redacted_value');
        }
        return formatDateValue(value, locale) || t('approvals:governed.redacted_value');
    }
    if (spec.kind === 'asset_controlled') {
        const field = spec.assetControlledField;
        if (typeof value !== 'string' || field === undefined || !ASSET_CONTROLLED_VALUES[field].includes(value)) {
            return t('approvals:governed.redacted_value');
        }
        return t(`assets:values.${field}.${value}`);
    }
    if (typeof value !== 'string' || spec.controlledField === undefined) {
        return t('approvals:governed.redacted_value');
    }
    return processControlledValueLabel(t, spec.controlledField, value)
        ?? t('approvals:governed.not_set');
}

export function GovernedMutationDiff({
    before,
    after,
    derivedImpact,
    impactedResources = [],
    relationshipChange,
    mutationKind,
    testId,
}: GovernedMutationDiffProps) {
    const { t, i18n } = useTranslation(['approvals', 'processes']);
    const locale = i18n?.language ?? 'en';
    const displayedBefore = relationshipChange?.before ?? before;
    const displayedAfter = relationshipChange?.after ?? after;
    const changedFields = [...new Set([...Object.keys(displayedBefore), ...Object.keys(displayedAfter)])]
        .filter((field) => !valuesEqual(displayedBefore[field], displayedAfter[field]));
    const assetPointMutation = mutationKind?.startsWith('asset.') === true;
    const governedFields = assetPointMutation ? GOVERNED_ASSET_FIELDS : GOVERNED_PROCESS_FIELDS;
    const visibleChangedFields = changedFields.filter((field) => governedFields[field] !== undefined);
    const visibleFields = visibleChangedFields;
    const hasRestrictedChanges = visibleChangedFields.length !== changedFields.length;
    const pointDerivedRows = isRelationshipImpact(derivedImpact)
        ? []
        : assetPointMutation
            ? ([
                [
                    'approvals:governed.derived.cif',
                    nullableAssetDerivedStateLabel(t, derivedImpact.before as GovernedAssetDerivedState | null, 'cif'),
                    nullableAssetDerivedStateLabel(t, derivedImpact.after as GovernedAssetDerivedState | null, 'cif'),
                ],
                [
                    'approvals:governed.derived.resulting_criticality',
                    nullableAssetDerivedStateLabel(t, derivedImpact.before as GovernedAssetDerivedState | null, 'resulting_criticality'),
                    nullableAssetDerivedStateLabel(t, derivedImpact.after as GovernedAssetDerivedState | null, 'resulting_criticality'),
                ],
            ] as const)
            : ([
            [
                'approvals:governed.derived.cif',
                derivedStateLabel(t, derivedImpact.before, 'cif'),
                derivedStateLabel(t, derivedImpact.after, 'cif'),
            ],
            [
                'approvals:governed.derived.criticality_class',
                derivedStateLabel(t, derivedImpact.before, 'criticality_class'),
                derivedStateLabel(t, derivedImpact.after, 'criticality_class'),
            ],
            ] as const);
    const readableImpactedResources = impactedResources.filter(
        (resource) => isSafeBusinessLabel(resource.resource_name),
    );

    return (
        <div className="space-y-5" data-testid={testId}>
            {mutationKind ? (
                <p className="text-xs font-bold uppercase tracking-widest text-accent">
                    {t(`approvals:governed.mutation_kind.${mutationKind.replaceAll('.', '_')}`, {
                        defaultValue: t('approvals:request_types.update'),
                    })}
                </p>
            ) : null}
            {relationshipChange ? (
                <section aria-labelledby={`${testId ?? 'governed-mutation'}-relationship-context`}>
                    <h5
                        id={`${testId ?? 'governed-mutation'}-relationship-context`}
                        className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-500"
                    >
                        {t('approvals:governed.relationship.title')}
                    </h5>
                    <dl className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div className="rounded-lg border border-white/5 bg-black/20 p-3">
                            <dt className="mb-2 text-[10px] font-bold uppercase text-accent">
                                {t('approvals:governed.relationship.target')}
                            </dt>
                            <dd className="break-words text-xs font-bold text-slate-300">
                                {isSafeBusinessLabel(relationshipChange.target_resource_name)
                                    ? relationshipChange.target_resource_name.trim()
                                    : t('approvals:governed.redacted_value')}
                            </dd>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-black/20 p-3">
                            <dt className="mb-2 text-[10px] font-bold uppercase text-accent">
                                {t('approvals:governed.relationship.type')}
                            </dt>
                            <dd className="text-xs font-bold text-slate-300">
                                {t(`approvals:governed.relationship.resource_type.${relationshipChange.target_resource_type}`, {
                                    defaultValue: t('approvals:governed.redacted_value'),
                                })}
                            </dd>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-black/20 p-3">
                            <dt className="mb-2 text-[10px] font-bold uppercase text-accent">
                                {t('approvals:governed.relationship.action_label')}
                            </dt>
                            <dd className="text-xs font-bold text-slate-300">
                                {t(`approvals:governed.relationship.action.${relationshipChange.action}`)}
                            </dd>
                        </div>
                    </dl>
                </section>
            ) : null}
            <section aria-labelledby={`${testId ?? 'governed-mutation'}-business-fields`}>
                <h5
                    id={`${testId ?? 'governed-mutation'}-business-fields`}
                    className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-500"
                >
                    {t('approvals:governed.business_changes')}
                </h5>
                {visibleFields.length === 0 && changedFields.length === 0 ? (
                    <p className="text-sm text-slate-500">{t('approvals:changes.no_changes')}</p>
                ) : (
                    <dl className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {visibleFields.map((field) => {
                            const spec = governedFields[field];
                            const unchangedContext = valuesEqual(displayedBefore[field], displayedAfter[field]);
                            return (
                                <div key={field} className="rounded-lg border border-white/5 bg-black/20 p-3">
                                    <dt className="mb-2 text-[10px] font-bold uppercase text-accent">
                                        {t(spec.labelKey)}
                                    </dt>
                                    {unchangedContext ? (
                                        <dd className="break-words text-xs font-bold text-slate-300">
                                            {displayGovernedValue(displayedAfter[field], spec, t, locale)}
                                        </dd>
                                    ) : (
                                        <dd className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                                            <span className="break-words text-rose-300">
                                                {displayGovernedValue(displayedBefore[field], spec, t, locale)}
                                            </span>
                                            <ArrowRight className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
                                            <span className="break-words font-bold text-emerald-300">
                                                {displayGovernedValue(displayedAfter[field], spec, t, locale)}
                                            </span>
                                        </dd>
                                    )}
                                </div>
                            );
                        })}
                        {hasRestrictedChanges ? (
                            <div className="rounded-lg border border-white/5 bg-black/20 p-3">
                                <dt className="mb-2 text-[10px] font-bold uppercase text-accent">
                                    {t('approvals:governed.redacted_change')}
                                </dt>
                                <dd className="text-xs text-slate-400">
                                    {t('approvals:governed.redacted_value')}
                                </dd>
                            </div>
                        ) : null}
                    </dl>
                )}
            </section>

            <section aria-labelledby={`${testId ?? 'governed-mutation'}-derived-impact`}>
                <h5
                    id={`${testId ?? 'governed-mutation'}-derived-impact`}
                    className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-500"
                >
                    {t('approvals:governed.derived_impact')}
                </h5>
                {isRelationshipImpact(derivedImpact) ? (
                    <div className="space-y-3">
                        {(derivedImpact.processes ?? []).map((processImpact, index) => (
                            <div
                                key={`${processImpact.resource_name}-${index}`}
                                className="rounded-lg border border-white/5 bg-black/20 p-3"
                            >
                                <p className="mb-3 text-xs font-bold text-slate-200">
                                    {isSafeBusinessLabel(processImpact.resource_name)
                                        ? processImpact.resource_name.trim()
                                        : t('approvals:governed.redacted_value')}
                                </p>
                                <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    {(['cif', 'criticality_class'] as const).map((field) => (
                                        <div key={field}>
                                            <dt className="mb-2 text-[10px] font-bold uppercase text-accent">
                                                {t(`approvals:governed.derived.${field}`)}
                                            </dt>
                                            <dd className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                                                <span className="text-rose-300">
                                                    {derivedStateLabel(t, processImpact.before, field)
                                                        ?? t('approvals:governed.not_set')}
                                                </span>
                                                <ArrowRight className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
                                                <span className="font-bold text-emerald-300">
                                                    {derivedStateLabel(t, processImpact.after, field)
                                                        ?? t('approvals:governed.not_set')}
                                                </span>
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            </div>
                        ))}
                        {(derivedImpact.assets ?? []).map((assetImpact, index) => (
                            <div
                                key={`${assetImpact.resource_name}-${index}`}
                                className="rounded-lg border border-white/5 bg-black/20 p-3"
                            >
                                <p className="mb-3 text-xs font-bold text-slate-200">
                                    {isSafeBusinessLabel(assetImpact.resource_name)
                                        ? assetImpact.resource_name.trim()
                                        : t('approvals:governed.redacted_value')}
                                </p>
                                <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    {(['cif', 'resulting_criticality'] as const).map((field) => (
                                        <div key={field}>
                                            <dt className="mb-2 text-[10px] font-bold uppercase text-accent">
                                                {t(`approvals:governed.derived.${field}`)}
                                            </dt>
                                            <dd className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                                                <span className="text-rose-300">
                                                    {assetDerivedStateLabel(t, assetImpact.before, field)}
                                                </span>
                                                <ArrowRight className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
                                                <span className="font-bold text-emerald-300">
                                                    {assetDerivedStateLabel(t, assetImpact.after, field)}
                                                </span>
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            </div>
                        ))}
                    </div>
                ) : (
                <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {pointDerivedRows.map(([labelKey, oldValue, newValue]) => (
                        <div key={labelKey} className="rounded-lg border border-white/5 bg-black/20 p-3">
                            <dt className="mb-2 text-[10px] font-bold uppercase text-accent">{t(labelKey)}</dt>
                            <dd className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                                <span className="text-rose-300">
                                    {oldValue ?? t('approvals:governed.not_set')}
                                </span>
                                <ArrowRight className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
                                <span className="font-bold text-emerald-300">
                                    {newValue ?? t('approvals:governed.not_set')}
                                </span>
                            </dd>
                        </div>
                    ))}
                </dl>
                )}
            </section>

            {readableImpactedResources.length > 0 ? (
                <section aria-labelledby={`${testId ?? 'governed-mutation'}-impacted-resources`}>
                    <h5
                        id={`${testId ?? 'governed-mutation'}-impacted-resources`}
                        className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500"
                    >
                        {t('approvals:governed.impacted_resources')}
                    </h5>
                    <ul className="flex flex-wrap gap-2">
                        {readableImpactedResources.map((resource, index) => (
                            <li
                                key={`${resource.resource_type}-${resource.resource_name}-${index}`}
                                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300"
                            >
                                {resource.resource_name}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
        </div>
    );
}
