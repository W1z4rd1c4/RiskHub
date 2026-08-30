import { ArrowRight } from 'lucide-react';

import { formatDateTimeValue, formatDateValue, formatNumberValue } from '@/i18n/formatters';
import { useTranslation } from '@/i18n/hooks';
import type {
    ApprovalPendingChange,
    ApprovalResourceType,
    PendingChange,
} from '@/types/approval';

type LegacyFieldKind =
    | 'actor_label'
    | 'actor_labels'
    | 'boolean'
    | 'controlled'
    | 'date'
    | 'date_time'
    | 'number'
    | 'risk_type'
    | 'score'
    | 'text'
    | 'unit';

interface LegacyFieldSpec {
    labelKey: string;
    kind: LegacyFieldKind;
    referenceType?: 'department' | 'user' | 'vendor';
    values?: readonly string[];
    valueGroup?: 'control_form' | 'frequency' | 'status';
}

const RISK_FIELDS: Record<string, LegacyFieldSpec> = {
    risk_id_code: { labelKey: 'legacy.fields.risk_id_code', kind: 'text' },
    name: { labelKey: 'legacy.fields.name', kind: 'text' },
    process: { labelKey: 'legacy.fields.process', kind: 'text' },
    subprocess: { labelKey: 'legacy.fields.subprocess', kind: 'text' },
    risk_type: { labelKey: 'legacy.fields.risk_type', kind: 'risk_type' },
    category: { labelKey: 'legacy.fields.category', kind: 'text' },
    description: { labelKey: 'legacy.fields.description', kind: 'text' },
    department_id: { labelKey: 'legacy.fields.department', kind: 'actor_label', referenceType: 'department' },
    owner_id: { labelKey: 'legacy.fields.owner', kind: 'actor_label', referenceType: 'user' },
    gross_probability: { labelKey: 'legacy.fields.gross_probability', kind: 'score' },
    gross_impact: { labelKey: 'legacy.fields.gross_impact', kind: 'score' },
    net_probability: { labelKey: 'legacy.fields.net_probability', kind: 'score' },
    net_impact: { labelKey: 'legacy.fields.net_impact', kind: 'score' },
    status: {
        labelKey: 'legacy.fields.status',
        kind: 'controlled',
        valueGroup: 'status',
        values: ['active', 'emerging'],
    },
    is_priority: { labelKey: 'legacy.fields.is_priority', kind: 'boolean' },
    acceptance_approver: { labelKey: 'legacy.fields.acceptance_approver', kind: 'text' },
    acceptance_justification: { labelKey: 'legacy.fields.acceptance_justification', kind: 'text' },
    acceptance_date: { labelKey: 'legacy.fields.acceptance_date', kind: 'date' },
};

const CONTROL_FIELDS: Record<string, LegacyFieldSpec> = {
    name: { labelKey: 'legacy.fields.name', kind: 'text' },
    description: { labelKey: 'legacy.fields.description', kind: 'text' },
    data_source: { labelKey: 'legacy.fields.data_source', kind: 'text' },
    methodology_reference: { labelKey: 'legacy.fields.methodology_reference', kind: 'text' },
    control_form: {
        labelKey: 'legacy.fields.control_form',
        kind: 'controlled',
        valueGroup: 'control_form',
        values: ['manual', 'automatic'],
    },
    process_owner_position: { labelKey: 'legacy.fields.process_owner_position', kind: 'text' },
    control_owner_id: { labelKey: 'legacy.fields.control_owner', kind: 'actor_label', referenceType: 'user' },
    executor_position: { labelKey: 'legacy.fields.executor_position', kind: 'text' },
    frequency: {
        labelKey: 'legacy.fields.frequency',
        kind: 'controlled',
        valueGroup: 'frequency',
        values: [
            'daily',
            'weekly',
            'monthly',
            'quarterly',
            'semi-annually',
            'annually',
            'ad_hoc',
            'continuous',
        ],
    },
    risk_level: { labelKey: 'legacy.fields.risk_level', kind: 'score' },
    output_description: { labelKey: 'legacy.fields.output_description', kind: 'text' },
    report_recipient: { labelKey: 'legacy.fields.report_recipient', kind: 'text' },
    documentation_location: { labelKey: 'legacy.fields.documentation_location', kind: 'text' },
    department_id: { labelKey: 'legacy.fields.department', kind: 'actor_label', referenceType: 'department' },
    status: {
        labelKey: 'legacy.fields.status',
        kind: 'controlled',
        valueGroup: 'status',
        values: ['draft', 'active', 'inactive'],
    },
};

const KRI_FIELDS: Record<string, LegacyFieldSpec> = {
    metric_name: { labelKey: 'legacy.fields.metric_name', kind: 'text' },
    description: { labelKey: 'legacy.fields.description', kind: 'text' },
    current_value: { labelKey: 'legacy.fields.current_value', kind: 'number' },
    lower_limit: { labelKey: 'legacy.fields.lower_limit', kind: 'number' },
    upper_limit: { labelKey: 'legacy.fields.upper_limit', kind: 'number' },
    unit: { labelKey: 'legacy.fields.unit', kind: 'unit' },
    frequency: {
        labelKey: 'legacy.fields.frequency',
        kind: 'controlled',
        valueGroup: 'frequency',
        values: ['daily', 'weekly', 'monthly', 'quarterly', 'annually'],
    },
    reporting_owner_id: { labelKey: 'legacy.fields.reporting_owner', kind: 'actor_label', referenceType: 'user' },
    linked_vendor_ids: { labelKey: 'legacy.fields.linked_vendors', kind: 'actor_labels', referenceType: 'vendor' },
    period_end: { labelKey: 'legacy.fields.period_end', kind: 'date' },
    recorded_at: { labelKey: 'legacy.fields.recorded_at', kind: 'date_time' },
};

const LEGACY_FIELDS_BY_RESOURCE: Partial<
    Record<ApprovalResourceType, Record<string, LegacyFieldSpec>>
> = {
    risk: RISK_FIELDS,
    control: CONTROL_FIELDS,
    kri: KRI_FIELDS,
};

const UNIT_VALUE_KEYS: Record<string, string> = {
    '%': 'percentage',
    count: 'count',
    days: 'days',
    hours: 'hours',
    ratio: 'ratio',
};

const KRI_HISTORY_FIELDS = new Set([
    'old_value',
    'new_value',
    'reason',
    'period_end',
    'recorded_at',
]);

interface LegacyApprovalChangesProps {
    pendingChanges: Record<string, ApprovalPendingChange>;
    resourceType: ApprovalResourceType;
    locale?: string;
    testId?: string;
}

type FormattedValue = { restricted: true } | { restricted: false; text: string };

function isEmptyValue(value: unknown): boolean {
    return value === null
        || value === undefined
        || (typeof value === 'string' && value.trim() === '')
        || (Array.isArray(value) && value.length === 0);
}

function isSafeActorLabel(value: unknown): value is string {
    return typeof value === 'string'
        && value.trim() !== ''
        && !/^\d+$/.test(value.trim());
}

function isPendingChange(value: ApprovalPendingChange): value is PendingChange {
    return value !== null
        && typeof value === 'object'
        && !Array.isArray(value)
        && Object.hasOwn(value, 'old')
        && Object.hasOwn(value, 'new');
}

function hasKriHistoryShape(
    resourceType: ApprovalResourceType,
    pendingChanges: Record<string, ApprovalPendingChange>,
): boolean {
    return resourceType === 'kri'
        && (Object.hasOwn(pendingChanges, 'old_value') || Object.hasOwn(pendingChanges, 'new_value'));
}

function humanizeRiskTypeCode(code: string): string | null {
    if (!/^[a-z][a-z0-9_]{1,49}$/.test(code)) return null;
    return code
        .split('_')
        .map((part, index) => {
            if (part.length <= 3) return part.toUpperCase();
            return index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part;
        })
        .join(' ');
}

export function LegacyApprovalChanges({
    pendingChanges,
    resourceType,
    locale = 'en',
    testId,
}: LegacyApprovalChangesProps) {
    const { t } = useTranslation('approvals');

    const formatValue = (value: unknown, spec: LegacyFieldSpec): FormattedValue => {
        if (isEmptyValue(value)) {
            return { restricted: false, text: t('legacy.not_set') };
        }
        if (spec.kind === 'text') {
            return typeof value === 'string'
                ? { restricted: false, text: value.trim() }
                : { restricted: true };
        }
        if (spec.kind === 'actor_label') {
            if (!isSafeActorLabel(value) || !spec.referenceType) return { restricted: true };
            const label = value.trim();
            return {
                restricted: false,
                text: label.toLowerCase() === `unknown ${spec.referenceType}`
                    ? t(`legacy.unknown_${spec.referenceType}`)
                    : label,
            };
        }
        if (spec.kind === 'actor_labels') {
            if (!Array.isArray(value) || !value.every(isSafeActorLabel) || !spec.referenceType) {
                return { restricted: true };
            }
            return {
                restricted: false,
                text: value.map((item) => {
                    const label = item.trim();
                    return label.toLowerCase() === `unknown ${spec.referenceType}`
                        ? t(`legacy.unknown_${spec.referenceType}`)
                        : label;
                }).join(', '),
            };
        }
        if (spec.kind === 'boolean') {
            return typeof value === 'boolean'
                ? { restricted: false, text: t(value ? 'legacy.yes' : 'legacy.no') }
                : { restricted: true };
        }
        if (spec.kind === 'date' || spec.kind === 'date_time') {
            if (typeof value !== 'string') return { restricted: true };
            const formatted = spec.kind === 'date'
                ? formatDateValue(value, locale)
                : formatDateTimeValue(value, locale);
            return formatted
                ? { restricted: false, text: formatted }
                : { restricted: true };
        }
        if (spec.kind === 'number') {
            return typeof value === 'number' && Number.isFinite(value)
                ? {
                    restricted: false,
                    text: formatNumberValue(value, locale, { maximumFractionDigits: 2 }),
                }
                : { restricted: true };
        }
        if (spec.kind === 'unit') {
            if (typeof value !== 'string') return { restricted: true };
            const unit = value.trim();
            const valueKey = UNIT_VALUE_KEYS[unit];
            return {
                restricted: false,
                text: valueKey ? t(`legacy.values.unit.${valueKey}`) : unit,
            };
        }
        if (spec.kind === 'risk_type') {
            if (typeof value !== 'string') return { restricted: true };
            if (value === 'strategic' || value === 'operational') {
                return { restricted: false, text: t(`legacy.values.risk_type.${value}`) };
            }
            const label = humanizeRiskTypeCode(value);
            return label
                ? { restricted: false, text: label }
                : { restricted: true };
        }
        if (spec.kind === 'controlled') {
            return typeof value === 'string'
                && spec.valueGroup !== undefined
                && spec.values?.includes(value)
                ? { restricted: false, text: t(`legacy.values.${spec.valueGroup}.${value}`) }
                : { restricted: true };
        }
        return typeof value === 'number'
            && Number.isInteger(value)
            && value >= 1
            && value <= 5
            ? { restricted: false, text: t('legacy.score_out_of_five', { value }) }
            : { restricted: true };
    };

    const isKriHistory = hasKriHistoryShape(resourceType, pendingChanges);
    const historyOldValue = pendingChanges.old_value;
    const historyNewValue = pendingChanges.new_value;
    const historyReason = pendingChanges.reason;
    const historyPeriodEnd = pendingChanges.period_end;
    const historyRecordedAt = pendingChanges.recorded_at;
    const formattedHistoryPeriod = typeof historyPeriodEnd === 'string'
        ? formatDateValue(historyPeriodEnd, locale)
        : '';
    const formattedHistoryRecordedAt = typeof historyRecordedAt === 'string'
        ? formatDateTimeValue(historyRecordedAt, locale)
        : '';
    const validKriHistory = isKriHistory
        && typeof historyOldValue === 'number'
        && Number.isFinite(historyOldValue)
        && typeof historyNewValue === 'number'
        && Number.isFinite(historyNewValue)
        && typeof historyReason === 'string'
        && historyReason.trim() !== ''
        && formattedHistoryPeriod !== ''
        && (historyRecordedAt === undefined || formattedHistoryRecordedAt !== '');

    return (
        <div
            data-testid={testId}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
            {isKriHistory && (
                <div className="bg-black/20 rounded-lg p-3 border border-white/5 md:col-span-2">
                    {validKriHistory ? (
                        <>
                            <h5 className="text-xs text-accent-text font-bold uppercase mb-2">
                                {t('legacy.kri_history.title')}
                            </h5>
                            <div className="mb-3">
                                <span className="block text-xs font-bold text-muted-foreground mb-1">
                                    {t('legacy.kri_history.value')}
                                </span>
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="text-destructive line-through">
                                        {formatNumberValue(historyOldValue, locale, { maximumFractionDigits: 2 })}
                                    </span>
                                    <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                                    <span className="text-success-text font-bold">
                                        {formatNumberValue(historyNewValue, locale, { maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                            <dl className="space-y-2 text-xs">
                                <div>
                                    <dt className="font-bold text-muted-foreground">
                                        {t('legacy.kri_history.reason')}
                                    </dt>
                                    <dd className="text-foreground">{historyReason.trim()}</dd>
                                </div>
                                <div>
                                    <dt className="font-bold text-muted-foreground">
                                        {t('legacy.fields.period_end')}
                                    </dt>
                                    <dd className="text-foreground">{formattedHistoryPeriod}</dd>
                                </div>
                                {historyRecordedAt !== undefined && (
                                    <div>
                                        <dt className="font-bold text-muted-foreground">
                                            {t('legacy.fields.recorded_at')}
                                        </dt>
                                        <dd className="text-foreground">{formattedHistoryRecordedAt}</dd>
                                    </div>
                                )}
                            </dl>
                        </>
                    ) : (
                        <span className="text-xs font-bold text-muted-foreground">
                            {t('legacy.restricted_change')}
                        </span>
                    )}
                </div>
            )}
            {Object.entries(pendingChanges).map(([field, change]) => {
                if (isKriHistory && KRI_HISTORY_FIELDS.has(field)) return null;
                const spec = LEGACY_FIELDS_BY_RESOURCE[resourceType]?.[field];
                if (!spec || !isPendingChange(change)) {
                    return (
                        <div key={field} className="bg-black/20 rounded-lg p-3 border border-white/5">
                            <span className="text-xs font-bold text-muted-foreground">
                                {t('legacy.restricted_change')}
                            </span>
                        </div>
                    );
                }

                const before = formatValue(change.old, spec);
                const after = formatValue(change.new, spec);
                return (
                    <div key={field} className="bg-black/20 rounded-lg p-3 border border-white/5">
                        <span className="block text-xs text-accent-text font-bold uppercase mb-1">
                            {t(spec.labelKey)}
                        </span>
                        {before.restricted || after.restricted ? (
                            <span className="text-xs font-bold text-muted-foreground">
                                {t('legacy.restricted_change')}
                            </span>
                        ) : (
                            <div className="flex items-center gap-2 text-xs">
                                <span className="text-destructive line-through">{before.text}</span>
                                <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                                <span className="text-success-text font-bold">{after.text}</span>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
