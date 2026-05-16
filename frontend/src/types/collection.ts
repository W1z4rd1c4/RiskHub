export interface CollectionGroup {
    value: string;
    label: string;
    count: number;
    active_count?: number | null;
    highlighted_count?: number | null;
    meta?: Record<string, unknown>;
}

export interface CollectionListResponse<
    TItem,
    TCapabilities extends object = Record<string, boolean>,
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
