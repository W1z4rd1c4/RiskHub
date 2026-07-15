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
        criticality: textValue(params, 'criticality'),
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
