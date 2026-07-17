import { ArrowRight } from 'lucide-react';

import { formatDateValue } from '@/i18n/formatters';
import { useTranslation } from '@/i18n/hooks';
import {
    processControlledValueLabel,
    processDerivedCifLabel,
    processDerivedCriticalityLabel,
    type ProcessControlledField,
} from '@/pages/processes/processesPagePresentation';
import type { GovernedDerivedImpact, GovernedImpactedResource } from '@/types/approval';

interface GovernedMutationDiffProps {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    derivedImpact: GovernedDerivedImpact;
    impactedResources?: GovernedImpactedResource[];
    testId?: string;
}

function valuesEqual(before: unknown, after: unknown): boolean {
    return JSON.stringify(before) === JSON.stringify(after);
}

type GovernedFieldKind = 'controlled' | 'date' | 'number' | 'safe_label' | 'text';

interface GovernedFieldSpec {
    labelKey: string;
    kind: GovernedFieldKind;
    controlledField?: ProcessControlledField;
}

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
    preliminary_criticality: {
        labelKey: 'processes:form.preliminary_criticality',
        kind: 'controlled',
        controlledField: 'preliminary_criticality',
    },
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
    testId,
}: GovernedMutationDiffProps) {
    const { t, i18n } = useTranslation(['approvals', 'processes']);
    const changedFields = [...new Set([...Object.keys(before), ...Object.keys(after)])]
        .filter((field) => !valuesEqual(before[field], after[field]));
    const visibleChangedFields = changedFields.filter((field) => GOVERNED_PROCESS_FIELDS[field] !== undefined);
    const hasRestrictedChanges = visibleChangedFields.length !== changedFields.length;
    const derivedRows = [
        [
            'approvals:governed.derived.cif',
            processDerivedCifLabel(t, derivedImpact.before.cif),
            processDerivedCifLabel(t, derivedImpact.after.cif),
        ],
        [
            'approvals:governed.derived.criticality_class',
            processDerivedCriticalityLabel(t, derivedImpact.before.criticality_class),
            processDerivedCriticalityLabel(t, derivedImpact.after.criticality_class),
        ],
    ] as const;
    const readableImpactedResources = impactedResources.filter(
        (resource) => isSafeBusinessLabel(resource.resource_name),
    );

    return (
        <div className="space-y-5" data-testid={testId}>
            <section aria-labelledby={`${testId ?? 'governed-mutation'}-business-fields`}>
                <h5
                    id={`${testId ?? 'governed-mutation'}-business-fields`}
                    className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-500"
                >
                    {t('approvals:governed.business_changes')}
                </h5>
                {changedFields.length === 0 ? (
                    <p className="text-sm text-slate-500">{t('approvals:changes.no_changes')}</p>
                ) : (
                    <dl className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {visibleChangedFields.map((field) => {
                            const spec = GOVERNED_PROCESS_FIELDS[field];
                            return (
                                <div key={field} className="rounded-lg border border-white/5 bg-black/20 p-3">
                                    <dt className="mb-2 text-[10px] font-bold uppercase text-accent">
                                        {t(spec.labelKey)}
                                    </dt>
                                    <dd className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                                        <span className="break-words text-rose-300">
                                            {displayGovernedValue(before[field], spec, t, i18n.language)}
                                        </span>
                                        <ArrowRight className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
                                        <span className="break-words font-bold text-emerald-300">
                                            {displayGovernedValue(after[field], spec, t, i18n.language)}
                                        </span>
                                    </dd>
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
                <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {derivedRows.map(([labelKey, oldValue, newValue]) => (
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
