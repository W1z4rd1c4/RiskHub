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

export interface CollectionListResponse<
    TItem,
    TCapabilities extends object = CollectionCapabilities,
> {
    items: TItem[];
    total: number;
    offset: number;
    limit: number;
    groups?: CollectionGroup[] | null;
    capabilities?: TCapabilities | null;
}

export interface CollectionSort {
    field: string;
    direction: 'asc' | 'desc';
}
