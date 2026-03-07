import {
    Activity,
    ClipboardList,
    Gauge,
    Radar,
    Shield,
    type LucideIcon,
} from 'lucide-react';

import type { Vendor } from '@/types/vendor';

export type VendorDetailMode = 'view' | 'edit' | 'new';

export type VendorTabView =
    | 'overview'
    | 'assessments'
    | 'assurance'
    | 'operations'
    | 'ecosystem';

export type VendorSectionView =
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
    { value: 'overview', labelKey: 'tabs.overview', icon: Gauge },
    { value: 'assessments', labelKey: 'tabs.assessments', icon: ClipboardList },
    { value: 'assurance', labelKey: 'tabs.assurance', icon: Shield },
    { value: 'operations', labelKey: 'tabs.operations', icon: Activity },
    { value: 'ecosystem', labelKey: 'tabs.ecosystem', icon: Radar },
];

const VENDOR_TABS = new Set<VendorTabView>(VENDOR_TAB_DEFINITIONS.map((tab) => tab.value));
const VENDOR_SECTIONS = new Set<VendorSectionView>([
    'risk_factors',
    'linked_risks',
    'linked_controls',
    'assessments',
    'schedule',
    'contract_controls',
    'resilience',
    'dependencies',
    'incidents',
    'remediation',
    'sla',
    'signals',
]);

const DEFAULT_SECTION_BY_TAB: Record<VendorTabView, VendorSectionView> = {
    overview: 'risk_factors',
    assessments: 'assessments',
    assurance: 'contract_controls',
    operations: 'sla',
    ecosystem: 'dependencies',
};

const SECTIONS_BY_TAB: Record<VendorTabView, VendorSectionView[]> = {
    overview: ['risk_factors', 'linked_risks', 'linked_controls'],
    assessments: ['assessments', 'schedule'],
    assurance: ['contract_controls', 'resilience'],
    operations: ['sla', 'incidents', 'remediation'],
    ecosystem: ['dependencies', 'signals'],
};

const LEGACY_TAB_REMAP: Record<VendorSectionView, { tab: VendorTabView; section: VendorSectionView }> = {
    risk_factors: { tab: 'overview', section: 'risk_factors' },
    linked_risks: { tab: 'overview', section: 'linked_risks' },
    linked_controls: { tab: 'overview', section: 'linked_controls' },
    assessments: { tab: 'assessments', section: 'assessments' },
    schedule: { tab: 'assessments', section: 'schedule' },
    contract_controls: { tab: 'assurance', section: 'contract_controls' },
    resilience: { tab: 'assurance', section: 'resilience' },
    dependencies: { tab: 'ecosystem', section: 'dependencies' },
    incidents: { tab: 'operations', section: 'incidents' },
    remediation: { tab: 'operations', section: 'remediation' },
    sla: { tab: 'operations', section: 'sla' },
    signals: { tab: 'ecosystem', section: 'signals' },
};

export function parseVendorTab(value: string | null): VendorTabView | null {
    if (!value || !VENDOR_TABS.has(value as VendorTabView)) {
        return null;
    }
    return value as VendorTabView;
}

export function parseVendorSection(value: string | null): VendorSectionView | null {
    if (!value || !VENDOR_SECTIONS.has(value as VendorSectionView)) {
        return null;
    }
    return value as VendorSectionView;
}

export function isVendorSectionInTab(tab: VendorTabView, section: VendorSectionView): boolean {
    return SECTIONS_BY_TAB[tab].includes(section);
}

export function defaultVendorSection(tab: VendorTabView): VendorSectionView {
    return DEFAULT_SECTION_BY_TAB[tab];
}

export function normalizeVendorLocation(
    tabValue: string | null,
    sectionValue: string | null,
): {
    tab: VendorTabView;
    section: VendorSectionView;
    shouldCanonicalize: boolean;
} {
    const parsedTab = parseVendorTab(tabValue);
    const parsedSection = parseVendorSection(sectionValue);

    if (parsedTab) {
        const section = parsedSection && isVendorSectionInTab(parsedTab, parsedSection)
            ? parsedSection
            : defaultVendorSection(parsedTab);
        return {
            tab: parsedTab,
            section,
            shouldCanonicalize: parsedSection !== section,
        };
    }

    const remapped = parseVendorSection(tabValue);
    if (remapped) {
        return {
            ...LEGACY_TAB_REMAP[remapped],
            shouldCanonicalize: true,
        };
    }

    return {
        tab: 'overview',
        section: defaultVendorSection('overview'),
        shouldCanonicalize: Boolean(tabValue || sectionValue),
    };
}

export function buildVendorSearchParams(
    tab: VendorTabView,
    section?: VendorSectionView | null,
): URLSearchParams {
    const params = new URLSearchParams();
    params.set('tab', tab);
    if (section && isVendorSectionInTab(tab, section)) {
        params.set('section', section);
    }
    return params;
}

export function buildVendorDetailPath(
    vendorId: number,
    tab?: VendorTabView | null,
    section?: VendorSectionView | null,
): string {
    if (!tab) {
        return `/vendors/${vendorId}`;
    }

    const params = buildVendorSearchParams(tab, section);
    return `/vendors/${vendorId}?${params.toString()}`;
}

export function canEditVendorByOwnership(
    vendor: Vendor | null,
    currentUserId: number | null | undefined,
): boolean {
    return Boolean(vendor && currentUserId === vendor.outsourcing_owner_user_id);
}
