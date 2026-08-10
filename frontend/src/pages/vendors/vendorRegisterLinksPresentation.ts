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

/** Rows for the linked-Assets block (sheet 10_VAD seen from the Vendor end).

The Asset display name is server-embedded on the link row; an unresolved end
renders the i18n'd unknown label, never a raw id
(docs/agent/FRONTEND_DISPLAY_GUARDRAILS.md). */
export function buildVendorAssetLinkRows(
    links: AssetVendorLink[],
    unknownAssetLabel: string,
): VendorRegisterLinkRow<AssetVendorLink>[] {
    return links.map((link) => ({
        link,
        name: link.asset_name ?? unknownAssetLabel,
        meta: formatAssetVendorLinkMeta(link),
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
