import type { Vendor } from '@/types/vendor';

export type VendorDetailMode = 'view' | 'edit' | 'new';
export type VendorDetailFlashTone = 'danger' | 'success' | 'warn';

export interface VendorDetailFlash {
    tone: VendorDetailFlashTone;
    message: string;
    ctaHref?: string;
    ctaLabel?: string;
}

export function buildVendorDetailPath(
    vendorId: number,
    _tab?: string | null,
    _section?: string | null,
): string {
    return `/vendors/${vendorId}`;
}

export function coerceVendorContext(vendorIdRaw: string | null, returnToRaw: string | null): {
    vendorId: number | null;
    returnTo: string | null;
} {
    const parsedVendorId = Number.parseInt(vendorIdRaw ?? '', 10);
    const vendorId = Number.isFinite(parsedVendorId) && parsedVendorId > 0 ? parsedVendorId : null;
    if (!vendorId) {
        return {
            vendorId: null,
            returnTo: null,
        };
    }

    const trimmedReturnTo = returnToRaw?.trim() || null;
    const safeReturnTo = trimmedReturnTo && /^\/vendors\/\d+(?:[/?#].*)?$/.test(trimmedReturnTo)
        ? trimmedReturnTo
        : buildVendorDetailPath(vendorId);

    return {
        vendorId,
        returnTo: safeReturnTo,
    };
}

export function canEditVendorByOwnership(
    vendor: Vendor | null,
    currentUserId: number | null | undefined,
): boolean {
    return Boolean(vendor && currentUserId === vendor.outsourcing_owner_user_id);
}
