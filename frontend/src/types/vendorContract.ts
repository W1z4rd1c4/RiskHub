/**
 * ICT Register Contract — a contractual arrangement with a Vendor (issue #44).
 *
 * Carries the workbook's entered 08_Smlouvy columns only; derived columns
 * (vendor-name lookup, chain display, duplicate check) arrive compute-on-read
 * with the derivation engine (#48/#49).
 */

export interface VendorContractCapabilities {
    can_read: boolean;
    can_update: boolean;
    can_archive: boolean;
    can_restore: boolean;
}

export interface VendorContract {
    id: number;
    vendor_id: number;

    contract_reference?: string | null;
    internal_contract_number?: string | null;
    records_system?: string | null;
    arrangement_type?: string | null;
    main_contract?: string | null;
    overarching_arrangement_reference?: string | null;
    description?: string | null;
    roi_scope?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    notice_period_entity_days?: number | null;
    notice_period_provider_days?: number | null;
    governing_law_country?: string | null;
    annual_cost?: number | string | null;
    currency?: string | null;
    note?: string | null;

    is_archived: boolean;
    archived_at?: string | null;
    archived_by_id?: number | null;
    capabilities?: VendorContractCapabilities | null;
    created_at: string;
    updated_at: string;
}

/** Entered columns only — the write payload never carries derived columns. */
export type VendorContractWritePayload = Partial<
    Omit<
        VendorContract,
        | 'id'
        | 'vendor_id'
        | 'is_archived'
        | 'archived_at'
        | 'archived_by_id'
        | 'capabilities'
        | 'created_at'
        | 'updated_at'
    >
>;
