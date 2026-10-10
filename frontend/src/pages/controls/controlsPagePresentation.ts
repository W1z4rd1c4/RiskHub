import { ordinalSeverityBand, severityClass } from '@/lib/severity';
import type { ControlForm, ControlFrequency, ControlStatus } from '@/types/control';
import type { CollectionGroup } from '@/types/collection';

export const CONTROL_GROUP_UNLINKED_VENDOR = '__unlinked_vendor__';
export const CONTROL_GROUP_UNCATEGORIZED = '__uncategorized__';
export const CONTROL_GROUP_UNKNOWN_DEPARTMENT = '__unknown_department__';
export const CONTROL_GROUP_NO_PROCESS = '__no_process__';
export const CONTROL_GROUP_UNKNOWN_RISK_TYPE = '__unknown_risk_type__';
export const CONTROL_GROUP_UNKNOWN_RISK = '__unknown_risk__';
export const ARCHIVED_CONTROL_FILTER = 'archived' as const;
export const ARCHIVED_CONTROL_BADGE_CLASS_NAME = 'text-muted-foreground bg-muted';
export type ControlDisplayStatus = ControlStatus | typeof ARCHIVED_CONTROL_FILTER;

/**
 * GAP-D-01 / PG-03: translated control enums. Literal keys (never a regex
 * "prettifier") so the i18n usage validator sees every label.
 */
export const CONTROL_FREQUENCY_LABEL_KEYS: Readonly<Record<ControlFrequency, string>> = {
    daily: 'controls:frequencies.daily',
    weekly: 'controls:frequencies.weekly',
    monthly: 'controls:frequencies.monthly',
    quarterly: 'controls:frequencies.quarterly',
    'semi-annually': 'controls:frequencies.semi-annually',
    annually: 'controls:frequencies.annually',
    ad_hoc: 'controls:frequencies.ad_hoc',
    continuous: 'controls:frequencies.continuous',
};

export const CONTROL_FORM_LABEL_KEYS: Readonly<Record<ControlForm, string>> = {
    manual: 'controls:control_forms.manual',
    automatic: 'controls:control_forms.automatic',
};

export const CONTROL_STATUS_LABEL_KEYS: Readonly<Record<ControlDisplayStatus, string>> = {
    draft: 'controls:status.draft',
    active: 'controls:status.active',
    inactive: 'controls:status.inactive',
    archived: 'controls:status.archived',
};

type ControlEnumTranslate = (key: string, fallback: string) => string;

/** Translated frequency; unknown (legacy) codes fall back to the raw code. */
export function formatControlFrequency(frequency: string | null | undefined, t: ControlEnumTranslate): string {
    if (!frequency) return '';
    const key = CONTROL_FREQUENCY_LABEL_KEYS[frequency as ControlFrequency];
    return key ? t(key, frequency) : frequency;
}

/** Translated control form (manual / automatic). */
export function formatControlForm(form: string | null | undefined, t: ControlEnumTranslate): string {
    if (!form) return '';
    const key = CONTROL_FORM_LABEL_KEYS[form as ControlForm];
    return key ? t(key, form) : form;
}

/** Control risk level (1-5) on the D1 severity scale; blue never encodes severity. */
export function getControlRiskLevelColor(level: number): string {
    return severityClass('badge', ordinalSeverityBand(level));
}

export function getControlDisplayStatus(control: { status: ControlStatus; is_archived: boolean }): ControlDisplayStatus {
    return control.is_archived ? ARCHIVED_CONTROL_FILTER : control.status;
}

export function getControlStatusColor(status: ControlDisplayStatus): string {
    switch (status) {
        case ARCHIVED_CONTROL_FILTER:
            return ARCHIVED_CONTROL_BADGE_CLASS_NAME;
        case 'active':
            return 'text-success-text bg-success/10';
        case 'draft':
            return 'text-muted-foreground bg-muted';
        case 'inactive':
            return 'text-destructive bg-destructive/10';
        default:
            return 'text-muted-foreground bg-muted';
    }
}

export function formatControlGroupLabel(
    group: CollectionGroup,
    labels: {
        unlinkedVendor: string;
        uncategorized: string;
        unknownDepartment: string;
        noProcess: string;
        unknownRiskType: string;
        unknownRisk: string;
        controlForm: (value: string) => string;
    },
): string {
    switch (group.value) {
        case CONTROL_GROUP_UNLINKED_VENDOR:
            return labels.unlinkedVendor;
        case CONTROL_GROUP_UNCATEGORIZED:
            return labels.uncategorized;
        case CONTROL_GROUP_UNKNOWN_DEPARTMENT:
            return labels.unknownDepartment;
        case CONTROL_GROUP_NO_PROCESS:
            return labels.noProcess;
        case CONTROL_GROUP_UNKNOWN_RISK_TYPE:
            return labels.unknownRiskType;
        case CONTROL_GROUP_UNKNOWN_RISK:
            return labels.unknownRisk;
        case 'manual':
        case 'automatic':
            return labels.controlForm(group.value);
        default:
            return group.label;
    }
}
