export type VendorExternalSignalStatus = 'ok' | 'error';

export interface VendorExternalSignal {
    id: number;
    vendor_id: number;
    provider_key: string;
    signal_type: string;
    payload_json: Record<string, unknown>;
    fetched_at: string;
    status: VendorExternalSignalStatus;
    error_message?: string | null;
    created_at: string;
}

