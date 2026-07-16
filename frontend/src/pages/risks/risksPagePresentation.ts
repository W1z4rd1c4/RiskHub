import type { CollectionGroup } from '@/types/collection';
import type { RiskStatus, RiskSummary } from '@/types/risk';

export const RISK_GROUP_UNLINKED_VENDOR = '__unlinked_vendor__';
export const RISK_GROUP_UNCATEGORIZED = '__uncategorized__';
export const RISK_GROUP_UNKNOWN_DEPARTMENT = '__unknown_department__';
export const RISK_GROUP_NO_PROCESS = '__no_process__';
export const RISK_GROUP_UNKNOWN_RISK_TYPE = '__unknown_risk_type__';
export type RiskDisplayStatus = RiskStatus | 'archived';

export function normalizeRiskSummary(risk: RiskSummary): RiskSummary {
    return {
        ...risk,
        kri_count: risk.kri_count ?? 0,
        has_breach: risk.has_breach ?? false,
        control_count: risk.control_count ?? 0,
        linked_vendors: risk.linked_vendors ?? [],
    };
}

export function normalizeRiskSummaries(items: RiskSummary[]): RiskSummary[] {
    return items.map(normalizeRiskSummary);
}

export function getRiskDisplayStatus(risk: Pick<RiskSummary, 'status' | 'is_archived'>): RiskDisplayStatus {
    return risk.is_archived ? 'archived' : risk.status;
}

export function formatRiskGroupLabel(
    group: CollectionGroup,
    labels: {
        unlinkedVendor: string;
        uncategorized: string;
        unknownDepartment: string;
        noProcess: string;
        unknownRiskType: string;
    },
): string {
    switch (group.value) {
        case RISK_GROUP_UNLINKED_VENDOR:
            return labels.unlinkedVendor;
        case RISK_GROUP_UNCATEGORIZED:
            return labels.uncategorized;
        case RISK_GROUP_UNKNOWN_DEPARTMENT:
            return labels.unknownDepartment;
        case RISK_GROUP_NO_PROCESS:
            return labels.noProcess;
        case RISK_GROUP_UNKNOWN_RISK_TYPE:
            return labels.unknownRiskType;
        default:
            return group.label;
    }
}
