import {
    Activity,
    AlertOctagon,
    AlertTriangle,
    CalendarClock,
    CheckSquare,
    ClipboardCheck,
    ClipboardList,
    FileCheck2,
    Link2,
    Radar,
    Shield,
    type LucideIcon,
} from 'lucide-react';

import type { Vendor } from '@/types/vendor';

export type VendorDetailMode = 'view' | 'edit' | 'new';

export type VendorTabView =
    | 'risk_factors'
    | 'linked_risks'
    | 'linked_controls'
    | 'assessments'
    | 'schedule'
    | 'contract_controls'
    | 'resilience'
    | 'dependencies'
    | 'incidents'
    | 'remediation'
    | 'sla'
    | 'signals';

export interface VendorTabDefinition {
    icon: LucideIcon;
    labelKey: string;
    value: VendorTabView;
}

export const VENDOR_TAB_DEFINITIONS: VendorTabDefinition[] = [
    { value: 'risk_factors', labelKey: 'tabs.risk_factors', icon: AlertTriangle },
    { value: 'linked_risks', labelKey: 'tabs.linked_risks', icon: Link2 },
    { value: 'linked_controls', labelKey: 'tabs.linked_controls', icon: CheckSquare },
    { value: 'assessments', labelKey: 'tabs.assessments', icon: ClipboardList },
    { value: 'schedule', labelKey: 'tabs.schedule', icon: CalendarClock },
    { value: 'contract_controls', labelKey: 'tabs.contract_controls', icon: FileCheck2 },
    { value: 'resilience', labelKey: 'tabs.resilience', icon: Shield },
    { value: 'dependencies', labelKey: 'tabs.dependencies', icon: AlertTriangle },
    { value: 'incidents', labelKey: 'tabs.incidents', icon: AlertOctagon },
    { value: 'remediation', labelKey: 'tabs.remediation', icon: ClipboardCheck },
    { value: 'sla', labelKey: 'tabs.sla', icon: Activity },
    { value: 'signals', labelKey: 'tabs.signals', icon: Radar },
];

const VENDOR_TABS = new Set<VendorTabView>(VENDOR_TAB_DEFINITIONS.map((tab) => tab.value));

export function parseVendorTab(value: string | null): VendorTabView | null {
    if (!value || !VENDOR_TABS.has(value as VendorTabView)) {
        return null;
    }
    return value as VendorTabView;
}

export function canEditVendorByOwnership(
    vendor: Vendor | null,
    currentUserId: number | null | undefined,
): boolean {
    return Boolean(vendor && currentUserId === vendor.outsourcing_owner_user_id);
}
