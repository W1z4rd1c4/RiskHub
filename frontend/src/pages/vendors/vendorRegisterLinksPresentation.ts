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
}

/** Rows for the linked-Assets block (sheet 10_VAD seen from the Vendor end). */
export function buildVendorAssetLinkRows(
    links: AssetVendorLink[],
    assetNamesById: Map<number, string>,
): VendorRegisterLinkRow<AssetVendorLink>[] {
    return links.map((link) => ({
        link,
        name: assetNamesById.get(link.asset_id) ?? `#${link.asset_id}`,
        meta: formatAssetVendorLinkMeta(link),
        canDelete: resolveCapabilityFlag(link.capabilities, 'can_delete'),
    }));
}

/** Rows for the linked-Processes block (sheet 11 §1 seen from the Vendor end). */
export function buildVendorProcessLinkRows(
    links: ProcessVendorLink[],
    processNamesById: Map<number, string>,
): VendorRegisterLinkRow<ProcessVendorLink>[] {
    return links.map((link) => ({
        link,
        name: processNamesById.get(link.process_id) ?? `#${link.process_id}`,
        meta: formatProcessVendorLinkMeta(link),
        canDelete: resolveCapabilityFlag(link.capabilities, 'can_delete'),
    }));
}
