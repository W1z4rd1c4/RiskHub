import type { CollectionGroup } from '@/types/collection';
import type { Vendor, VendorType } from '@/types/vendor';

export const VENDOR_GROUP_UNASSIGNED = '__unassigned__';
export const VENDOR_GROUP_NO_PROCESS = '__no_process__';
export const VENDOR_GROUP_UNLINKED_RISK = '__unlinked_risk__';
export const VENDOR_GROUP_DORA_RELEVANT = '__dora_relevant__';
export const VENDOR_GROUP_SUPPORTS_CORE_FUNCTION = '__supports_core_function__';
export const VENDOR_GROUP_SIGNIFICANT_VENDOR = '__significant_vendor__';
export const VENDOR_GROUP_INSIGNIFICANT_VENDOR = '__insignificant_vendor__';
export type VendorDisplayStatus = 'active' | 'inactive';

export function getVendorDisplayStatus(vendor: Pick<Vendor, 'is_archived'>): VendorDisplayStatus {
    return vendor.is_archived ? 'inactive' : 'active';
}

export function formatVendorGroupLabel(
    group: CollectionGroup,
    labels: {
        noProcess: string;
        typeLabel: (value: VendorType) => string;
        unassigned: string;
        unlinkedRisk: string;
        doraRelevant: string;
        supportsCoreFunction: string;
        significantVendor: string;
        insignificantVendor: string;
    }
): string {
    switch (group.value) {
        case VENDOR_GROUP_UNASSIGNED:
            return labels.unassigned;
        case VENDOR_GROUP_NO_PROCESS:
            return labels.noProcess;
        case VENDOR_GROUP_UNLINKED_RISK:
            return labels.unlinkedRisk;
        case VENDOR_GROUP_DORA_RELEVANT:
            return labels.doraRelevant;
        case VENDOR_GROUP_SUPPORTS_CORE_FUNCTION:
            return labels.supportsCoreFunction;
        case VENDOR_GROUP_SIGNIFICANT_VENDOR:
            return labels.significantVendor;
        case VENDOR_GROUP_INSIGNIFICANT_VENDOR:
            return labels.insignificantVendor;
        case 'ict':
        case 'outsourcing':
        case 'professional_services':
        case 'partner':
        case 'other':
            return labels.typeLabel(group.value);
        default:
            return group.label;
    }
}
