import { ControlStatus } from '@/types/control';
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

export function getControlRiskLevelColor(level: number): string {
    if (level >= 4) return 'text-destructive bg-destructive/10 border-destructive/20';
    if (level >= 3) return 'text-warning-text bg-warning/10 border-warning/20';
    if (level >= 2) return 'text-accent-text bg-info/10 border-info/20';
    return 'text-success-text bg-success/10 border-success/20';
}

export function getControlDisplayStatus(control: { status: ControlStatus; is_archived: boolean }): ControlDisplayStatus {
    return control.is_archived ? ARCHIVED_CONTROL_FILTER : control.status;
}

export function getControlStatusColor(status: ControlDisplayStatus): string {
    switch (status) {
        case ARCHIVED_CONTROL_FILTER:
            return ARCHIVED_CONTROL_BADGE_CLASS_NAME;
        case ControlStatus.ACTIVE:
            return 'text-success-text bg-success/10';
        case ControlStatus.DRAFT:
            return 'text-muted-foreground bg-muted';
        case ControlStatus.INACTIVE:
            return 'text-destructive bg-destructive/10';
        case 'active':
        case 'draft':
        case 'inactive':
            return 'text-muted-foreground bg-muted';
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
