import { resolveCapabilityFlag } from '@/lib/capabilities';
import { formatAssetVendorLinkMeta } from '@/pages/assets/assetVendorLinksPresentation';
import { formatProcessVendorLinkMeta } from '@/pages/processes/processVendorLinksPresentation';
import type { AssetVendorLink } from '@/types/asset';
import type { ProcessVendorLink } from '@/types/process';

/** One rendered row of the Vendor detail's register-links section. */
export interface VendorRegisterLinkRow<TLink> {
    link: TLink;
    /** The register-end display name (Asset name / Process display name). */
    name: string;
    /** The entered link columns, joined for the row's meta line. */
    meta: string;
    /** Per-row remove gating from the backend capability (register-end write). */
    canDelete: boolean;
    /** Authoritative Process impact lock, present on Process relationship rows. */
    processEditBlocked?: boolean;
}

/** Display label of a stored workbook closed-list code (`lib/closedListLabels`). */
export type ClosedListLabeler = (list: string, value: string) => string;

const rawClosedListLabel: ClosedListLabeler = (_list, value) => value;

/**
 * The Asset link meta line (`formatAssetVendorLinkMeta`) with the workbook codes
 * it carries — role (`RoleDodavatele`) and reliance (`Reliance`) — shown through
 * `label` (GAP-C-09); the S-code and contract reference are identifiers.
 */
export function formatVendorAssetLinkMeta(
    link: AssetVendorLink,
    label: ClosedListLabeler = rawClosedListLabel,
): string {
    return formatAssetVendorLinkMeta({
        ...link,
        vendor_role: link.vendor_role ? label('RoleDodavatele', link.vendor_role) : link.vendor_role,
        reliance: link.reliance ? label('Reliance', link.reliance) : link.reliance,
    });
}

/** Rows for the linked-Assets block (sheet 10_VAD seen from the Vendor end).

The Asset display name is server-embedded on the link row; an unresolved end
renders the i18n'd unknown label, never a raw id
(docs/agent/FRONTEND_DISPLAY_GUARDRAILS.md). */
export function buildVendorAssetLinkRows(
    links: AssetVendorLink[],
    unknownAssetLabel: string,
    closedListLabel: ClosedListLabeler = rawClosedListLabel,
): VendorRegisterLinkRow<AssetVendorLink>[] {
    return links.map((link) => ({
        link,
        name: link.asset_name ?? unknownAssetLabel,
        meta: formatVendorAssetLinkMeta(link, closedListLabel),
        canDelete: resolveCapabilityFlag(link.capabilities, 'can_delete'),
    }));
}

/** Rows for the linked-Processes block (sheet 11 §1 seen from the Vendor end). */
export function buildVendorProcessLinkRows(
    links: ProcessVendorLink[],
    unknownProcessLabel: string,
): VendorRegisterLinkRow<ProcessVendorLink>[] {
    return links.map((link) => ({
        link,
        name: link.process_name ?? unknownProcessLabel,
        meta: formatProcessVendorLinkMeta(link),
        canDelete: resolveCapabilityFlag(link.capabilities, 'can_delete'),
        processEditBlocked: link.process_business_edit_blocked,
    }));
}
