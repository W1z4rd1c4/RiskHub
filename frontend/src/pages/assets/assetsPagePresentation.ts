import type { Asset, AssetListParams, AssetOwnerRead, AssetSortField, AssetWritePayload } from '@/types/asset';

export type AssetArchiveFilter = 'active' | 'archived' | '';
export type AssetDisplayStatus = 'active' | 'archived';

export function getAssetDisplayStatus(asset: Pick<Asset, 'is_archived'>): AssetDisplayStatus {
    return asset.is_archived ? 'archived' : 'active';
}

export const ASSET_CONTROLLED_CODES = {
    asset_type: ['application', 'database', 'infrastructure', 'network_component', 'hardware', 'cloud_service', 'data_storage', 'information_asset', 'security_asset', 'bcm_dr_asset', 'other'],
    asset_level: ['primary', 'supporting', 'infrastructure'],
    deployment_model: ['on_premise', 'cloud', 'saas', 'paas', 'iaas', 'hybrid', 'externally_hosted', 'not_assessed', 'not_applicable'],
    gdpr_relevance: ['yes', 'no', 'undetermined'],
    ai_relevance: ['yes', 'no', 'undetermined'],
    data_classification: ['no_data_not_applicable', 'public', 'internal', 'confidential', 'highly_confidential_regulated', 'not_assessed'],
    internet_exposed: ['yes', 'no'],
    preliminary_criticality: ['low', 'medium', 'high', 'critical'],
    lifecycle_state: ['operational', 'in_development', 'being_decommissioned', 'legacy', 'retired'],
    review_state: ['review_required', 'reviewed'],
} as const;

const ASSET_DERIVED_CRITICALITY_CODES = ASSET_CONTROLLED_CODES.preliminary_criticality;
const ASSET_DERIVED_BOOLEAN_CODES = ['yes', 'no'] as const;
const ASSET_DERIVED_ARTICLE8_CODES = ['critical', 'non_critical'] as const;

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

function localizedDerivedCode(
    t: TranslateFn,
    value: string | null | undefined,
    allowed: readonly string[],
    keyPrefix: string,
): string | null {
    if (!value) return null;
    return allowed.includes(value)
        ? t(`${keyPrefix}.${value}`)
        : t('assets:values.unknown');
}

export function assetDerivedCriticalityLabel(
    t: TranslateFn,
    value: string | null | undefined,
): string | null {
    return localizedDerivedCode(
        t,
        value,
        ASSET_DERIVED_CRITICALITY_CODES,
        'assets:values.preliminary_criticality',
    );
}

export function assetDerivedBooleanLabel(
    t: TranslateFn,
    value: string | null | undefined,
): string | null {
    return localizedDerivedCode(
        t,
        value,
        ASSET_DERIVED_BOOLEAN_CODES,
        'assets:derived.values.boolean',
    );
}

export function assetDerivedArticle8Label(
    t: TranslateFn,
    value: string | null | undefined,
): string | null {
    return localizedDerivedCode(
        t,
        value,
        ASSET_DERIVED_ARTICLE8_CODES,
        'assets:derived.values.article8',
    );
}

export function assetCompletenessFieldLabel(t: TranslateFn, field: string): string {
    if (field === 'primary_process') {
        return t('assets:derived.primary_process_name');
    }
    const formFields = [
        'asset_type',
        'asset_level',
        'description',
        'physical_location',
        'deployment_model',
        'business_owner',
        'ict_owner',
        'gdpr_relevance',
        'ai_relevance',
        'data_classification',
        'confidentiality_rating',
        'integrity_rating',
        'availability_rating',
        'authenticity_rating',
        'impact_client',
        'impact_regulatory',
        'substitutability_rating',
        'vendor_dependency_rating',
        'internet_exposed',
        'lifecycle_state',
    ];
    return formFields.includes(field)
        ? t(`assets:form.${field}`)
        : t('assets:values.unknown');
}

export function assetOwnerDisplayName(owner: AssetOwnerRead | null | undefined): string | null {
    return owner?.name?.trim() || null;
}

export function assetOwnerMetadata(owner: AssetOwnerRead | null | undefined): string | null {
    if (!owner) return null;
    return [owner.department_name, owner.role_name].filter(Boolean).join(' · ') || null;
}

export function assetDepartmentDisplay(asset: Pick<Asset, 'owning_department'>): string | null {
    return asset.owning_department
        ? `${asset.owning_department.name} (${asset.owning_department.code})`
        : null;
}

/**
 * FR-P5-5 (S10): distinguish a genuinely empty register ("no data") from a
 * search that matched nothing ("no search results"). Keyed on the live search
 * box (not the status filter) so an unmatched query gets the "no results" copy.
 */
export function assetsEmptyStateKey(hasActiveSearch: boolean): string {
    return hasActiveSearch ? 'empty.no_results' : 'empty.no_assets';
}

interface BuildAssetListParamsOptions {
    currentPage: number;
    debouncedSearch: string;
    includeArchived: boolean;
    limit: number;
    sortDirection: 'asc' | 'desc' | null;
    sortField: AssetSortField | null;
}

export function buildAssetListParams({
    currentPage,
    debouncedSearch,
    includeArchived,
    limit,
    sortDirection,
    sortField,
}: BuildAssetListParamsOptions): AssetListParams {
    const params: AssetListParams = {
        offset: (currentPage - 1) * limit,
        limit,
        include_archived: includeArchived,
    };

    if (debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
    }
    if (sortField && sortDirection) {
        params.sort_by = sortField;
        params.sort_order = sortDirection;
    }

    return params;
}

/**
 * Normalize a form's field values into a write payload: trims strings,
 * converts empty strings to null (clearing the field), and passes through
 * numbers and nulls untouched. Only fields present in the input are emitted,
 * so untouched fields stay unsent on PATCH.
 */
export function buildAssetWritePayload(
    fields: Record<string, string | number | null | undefined>
): AssetWritePayload {
    const payload: Record<string, string | number | null> = {};
    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) {
            continue;
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            payload[key] = trimmed === '' ? null : trimmed;
            continue;
        }
        payload[key] = value;
    }
    return payload as AssetWritePayload;
}
