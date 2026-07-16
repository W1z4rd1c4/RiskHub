export type ProcessSemanticFilters = { cif?: boolean };
export type AssetSemanticFilters = {
    has_process_link?: boolean;
    criticality?: string;
};
export type VendorSemanticFilters = {
    has_direct_process_link?: boolean;
    has_roi_contract?: boolean;
    has_sub_outsourcing?: boolean;
    tier?: string;
};
export type RiskSemanticFilters = {
    ict_linked?: boolean;
    above_tolerance?: boolean;
    response?: 'acceptance';
    gross_probability?: number;
    gross_impact?: number;
    gross_band?: string;
    net_band?: string;
};

function trueValue(params: URLSearchParams, key: string): boolean | undefined {
    return params.get(key) === 'true' ? true : undefined;
}

function textValue(params: URLSearchParams, key: string): string | undefined {
    return params.get(key)?.trim() || undefined;
}

const ASSET_CRITICALITY_CODES: Readonly<Record<string, string>> = {
    low: 'low',
    Low: 'low',
    'Nízká': 'low',
    medium: 'medium',
    Medium: 'medium',
    'Střední': 'medium',
    high: 'high',
    High: 'high',
    'Vysoká': 'high',
    critical: 'critical',
    Critical: 'critical',
    'Kritická': 'critical',
};

/** Keep legacy committee links working while requests use canonical Asset codes. */
export function canonicalAssetCriticality(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const normalized = value.trim();
    return ASSET_CRITICALITY_CODES[normalized] ?? normalized;
}

function scoreValue(params: URLSearchParams, key: string): number | undefined {
    const value = Number(params.get(key));
    return Number.isInteger(value) && value >= 1 && value <= 5 ? value : undefined;
}

export function parseProcessSemanticFilters(params: URLSearchParams): ProcessSemanticFilters {
    return { cif: trueValue(params, 'cif') };
}

export function parseAssetSemanticFilters(params: URLSearchParams): AssetSemanticFilters {
    return {
        has_process_link: trueValue(params, 'has_process_link'),
        criticality: canonicalAssetCriticality(textValue(params, 'criticality')),
    };
}

export function parseVendorSemanticFilters(params: URLSearchParams): VendorSemanticFilters {
    return {
        has_direct_process_link: trueValue(params, 'has_direct_process_link'),
        has_roi_contract: trueValue(params, 'has_roi_contract'),
        has_sub_outsourcing: trueValue(params, 'has_sub_outsourcing'),
        tier: textValue(params, 'tier'),
    };
}

export function parseRiskSemanticFilters(params: URLSearchParams): RiskSemanticFilters {
    return {
        ict_linked: trueValue(params, 'ict_linked'),
        above_tolerance: trueValue(params, 'above_tolerance'),
        response: params.get('response') === 'acceptance' ? 'acceptance' : undefined,
        gross_probability: scoreValue(params, 'gross_probability'),
        gross_impact: scoreValue(params, 'gross_impact'),
        gross_band: textValue(params, 'gross_band'),
        net_band: textValue(params, 'net_band'),
    };
}

export function presentSemanticFilters(
    filters: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean> {
    return Object.fromEntries(
        Object.entries(filters).filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined),
    );
}
