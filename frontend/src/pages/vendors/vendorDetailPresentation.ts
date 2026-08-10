import type { SafeTFunction } from '@/i18n/hooks';
import type { Vendor, VendorOwnerRead, VendorOwnershipStatus } from '@/types/vendor';

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
    tab?: string | null,
    section?: string | null,
): string {
    const params = new URLSearchParams();
    if (tab) {
        params.set('tab', tab);
    }
    if (section) {
        params.set('section', section);
    }
    const query = params.toString();
    return query ? `/vendors/${vendorId}?${query}` : `/vendors/${vendorId}`;
}

export function getVendorDetailScrollTargetId(tab: string | null, section: string | null): string | null {
    if (tab === 'assessments' && section === 'schedule') {
        return 'vendor-linked-kris';
    }
    if (tab === 'connections' && section === 'risks') {
        return 'vendor-linked-risks';
    }
    if (tab === 'connections' && section === 'controls') {
        return 'vendor-linked-controls';
    }
    if (tab === 'contracts') {
        return 'vendor-contracts';
    }
    if (tab === 'sub-outsourcing') {
        return 'vendor-sub-outsourcing';
    }
    return null;
}

export function shouldNormalizeVendorDetailSearch(search: string): boolean {
    if (!search) {
        return false;
    }

    const params = new URLSearchParams(search);
    if (!params.has('tab') && !params.has('section')) {
        return false;
    }

    return getVendorDetailScrollTargetId(params.get('tab'), params.get('section')) === null;
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

export function vendorOwnerDisplayName(
    owner: VendorOwnerRead | null | undefined,
    status: VendorOwnershipStatus,
    t: SafeTFunction,
): string {
    if (owner?.name.trim()) return owner.name.trim();
    return t(`vendors:ownership.status.${status}`);
}

export function vendorOwnerMetadata(owner: VendorOwnerRead | null | undefined, t: SafeTFunction): string {
    if (!owner) return t('vendors:ownership.context_unknown');
    return [owner.email, owner.department_name, owner.role_name].filter(Boolean).join(' · ')
        || t('vendors:ownership.context_unknown');
}
