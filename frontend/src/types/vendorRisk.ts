export const vendorRiskCategoryKeys = [
    'regulatory_legal',
    'info_security_data',
    'cyber_supply_chain',
    'operational_continuity',
    'service_quality',
    'financial',
    'strategic_reputational',
    'governance_oversight',
    'technology_lockin',
    'human_factor',
    'concentration',
] as const;

export type VendorRiskCategoryKey = typeof vendorRiskCategoryKeys[number];

export interface VendorRiskFactor {
    id: number;
    vendor_id: number;
    category_key: VendorRiskCategoryKey;
    description: string;
    created_at: string;
    updated_at: string;
}

export interface VendorRiskFactorCreate {
    category_key: VendorRiskCategoryKey;
    description: string;
}

export interface VendorRiskFactorUpdate {
    category_key?: VendorRiskCategoryKey;
    description?: string;
}

