/**
 * ICT Register Sub-outsourcing — one link in a Vendor's fourth-party chain
 * (issue #45).
 *
 * Carries the workbook's entered 09_Subdodávky columns only, with the
 * sub-provider identity inline; a null predecessor_id marks a direct
 * sub-outsourcer of the Contract. Derived columns (Rank, lookups, the
 * chain-error check) arrive compute-on-read with the derivation engine (#49).
 */

export interface VendorSubOutsourcingCapabilities {
    can_read: boolean;
    can_update: boolean;
    can_archive: boolean;
    can_restore: boolean;
}

export interface VendorSubOutsourcing {
    id: number;
    vendor_id: number;
    contract_id: number;
    predecessor_id?: number | null;

    sub_provider_name?: string | null;
    person_type?: string | null;
    identifier_type?: string | null;
    identifier_value?: string | null;
    country?: string | null;
    ict_service_code?: string | null;
    note?: string | null;

    // Engine-derived block (ticket #49): read-only, rejected on write.
    derived?: VendorSubOutsourcingDerived | null;

    is_archived: boolean;
    archived_at?: string | null;
    archived_by_id?: number | null;
    capabilities?: VendorSubOutsourcingCapabilities | null;
    created_at: string;
    updated_at: string;
}

/** The chain-walk ingredients behind the derived block. */
export interface VendorSubOutsourcingDerivedInputs {
    contract_id: number;
    predecessor_id?: number | null;
    predecessor_rank?: number | null;
    is_direct: boolean;
    duplicate_key_count: number;
}

/**
 * Engine-derived 09_Subdodávky columns (ticket #49) — read-only, computed on
 * read. A null rank is the workbook's "?" unknown-rank sentinel; chain_check
 * then reads CHYBA ŘETĚZCE (unless DUPLICITA takes precedence).
 */
export interface VendorSubOutsourcingDerived {
    contract_reference?: string | null;
    contract_vendor_id?: number | null;
    contract_vendor_name: string;
    rank?: number | null;
    critical_service: string;
    chain_check: string;
    roi_scope?: string | null;
    inputs: VendorSubOutsourcingDerivedInputs;
}

/** Entered columns only — the write payload never carries derived columns. */
export type VendorSubOutsourcingWritePayload = Partial<
    Omit<
        VendorSubOutsourcing,
        | 'id'
        | 'vendor_id'
        | 'derived'
        | 'is_archived'
        | 'archived_at'
        | 'archived_by_id'
        | 'capabilities'
        | 'created_at'
        | 'updated_at'
    >
>;

/** One S01-S19 ICT service taxonomy entry from the reference API. */
export interface IctServiceType {
    code: string;
    label: string;
}
