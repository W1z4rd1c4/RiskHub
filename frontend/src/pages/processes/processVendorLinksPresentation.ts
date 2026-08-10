import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { ProcessVendorLink, ProcessVendorLinkCreatePayload } from '@/types/process';

/** The add-form field values for one Process<->Vendor link (sheet 11 §1). */
export interface ProcessVendorLinkFormFields {
    vendor_id: string;
    direct_service_description?: string;
    note?: string;
}

function trimmedOrNull(value: string | undefined): string | null {
    const trimmed = (value ?? '').trim();
    return trimmed === '' ? null : trimmed;
}

/**
 * Normalize the add-form fields into a create payload. The Vendor is the
 * pair's other end (§1 has no service column), so without it there is no
 * payload to send.
 */
export function buildProcessVendorLinkPayload(
    fields: ProcessVendorLinkFormFields,
): ProcessVendorLinkCreatePayload | null {
    const vendorId = Number.parseInt(fields.vendor_id.trim(), 10);
    if (!Number.isFinite(vendorId) || vendorId <= 0) {
        return null;
    }
    return {
        vendor_id: vendorId,
        direct_service_description: trimmedOrNull(fields.direct_service_description),
        note: trimmedOrNull(fields.note),
    };
}

/** One meta line per link row: direct-service description · note. */
export function formatProcessVendorLinkMeta(link: ProcessVendorLink): string {
    return [link.direct_service_description, link.note].filter(Boolean).join(' · ');
}

/**
 * Row name from the server-embedded Vendor display name. Never a raw id: an
 * unresolved Vendor end renders the i18n'd unknown label
 * (docs/agent/FRONTEND_DISPLAY_GUARDRAILS.md).
 */
export function processVendorLinkRowName(link: ProcessVendorLink, unknownVendorLabel: string): string {
    return link.vendor_name ?? unknownVendorLabel;
}

/** Per-row remove gating comes from the backend capability, never local policy. */
export function canDeleteProcessVendorLink(link: ProcessVendorLink): boolean {
    return resolveCapabilityFlag(link.capabilities, 'can_delete');
}
