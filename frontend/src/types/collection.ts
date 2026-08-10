export interface CollectionGroup {
    value: string;
    label: string;
    count: number;
    active_count?: number | null;
    highlighted_count?: number | null;
    meta?: Record<string, unknown>;
}

export interface CollectionCapabilities {
    can_create?: boolean;
    can_export?: boolean;
    can_view_risk_contexts?: boolean;
    can_view_vendor_contexts?: boolean;
}

export interface CollectionFacetOption {
    value: string;
    label: string;
    count: number;
    selected: boolean;
    disabled: boolean;
    meta?: Record<string, unknown> | null;
}

export interface CollectionListResponse<
    TItem,
    TCapabilities extends object = CollectionCapabilities,
> {
    items: TItem[];
    total: number;
    offset: number;
    limit: number;
    groups?: CollectionGroup[] | null;
    facets?: Record<string, CollectionFacetOption[]> | null;
    capabilities?: TCapabilities | null;
}

export interface CollectionSort {
    field: string;
    direction: 'asc' | 'desc';
}
