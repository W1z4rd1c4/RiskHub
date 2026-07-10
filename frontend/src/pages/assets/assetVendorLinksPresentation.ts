import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { AssetVendorLink, AssetVendorLinkCreatePayload } from '@/types/asset';

/** The add-form field values for one Asset<->Vendor link (sheet 10_VAD). */
export interface AssetVendorLinkFormFields {
    vendor_id: string;
    ict_service_code: string;
    vendor_role?: string;
    contract_reference?: string;
    reliance?: string;
}

function trimmedOrNull(value: string | undefined): string | null {
    const trimmed = (value ?? '').trim();
    return trimmed === '' ? null : trimmed;
}

/**
 * Normalize the add-form fields into a create payload. The Vendor and the
 * ICT service S-code are the link's identity (the tuple is asset + vendor +
 * S-code), so without either there is no payload to send.
 */
export function buildAssetVendorLinkPayload(
    fields: AssetVendorLinkFormFields,
): AssetVendorLinkCreatePayload | null {
    const vendorId = Number.parseInt(fields.vendor_id.trim(), 10);
    const ictServiceCode = fields.ict_service_code.trim();
    if (!Number.isFinite(vendorId) || vendorId <= 0 || ictServiceCode === '') {
        return null;
    }
    return {
        vendor_id: vendorId,
        ict_service_code: ictServiceCode,
        vendor_role: trimmedOrNull(fields.vendor_role),
        contract_reference: trimmedOrNull(fields.contract_reference),
        reliance: trimmedOrNull(fields.reliance),
    };
}

/** One meta line per link row: role · S-code · contract ref · reliance. */
export function formatAssetVendorLinkMeta(link: AssetVendorLink): string {
    return [link.vendor_role, link.ict_service_code, link.contract_reference, link.reliance]
        .filter(Boolean)
        .join(' · ');
}

/** Per-row remove gating comes from the backend capability, never local policy. */
export function canDeleteAssetVendorLink(link: AssetVendorLink): boolean {
    return resolveCapabilityFlag(link.capabilities, 'can_delete');
}

/**
 * Row name from the server-embedded Vendor display name. Never a raw id: an
 * unresolved Vendor end renders the i18n'd unknown label
 * (docs/agent/FRONTEND_DISPLAY_GUARDRAILS.md).
 */
export function assetVendorLinkRowName(link: AssetVendorLink, unknownVendorLabel: string): string {
    return link.vendor_name ?? unknownVendorLabel;
}
