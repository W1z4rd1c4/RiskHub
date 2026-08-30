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

export function normalizeVendorDetailSearch(search: string): string | null {
    if (!search) {
        return null;
    }

    const params = new URLSearchParams(search);
    if (!params.has('tab') && !params.has('section')) {
        return null;
    }

    if (getVendorDetailScrollTargetId(params.get('tab'), params.get('section')) !== null) {
        return null;
    }

    params.delete('tab');
    params.delete('section');
    const normalizedSearch = params.toString();
    return normalizedSearch ? `?${normalizedSearch}` : '';
}

function parseVendorId(raw: string | null): number | null {
    if (!raw || !/^[1-9]\d*$/.test(raw)) return null;
    const vendorId = Number(raw);
    return Number.isSafeInteger(vendorId) ? vendorId : null;
}

function isExactVendorDetailReturnTo(candidate: string, vendorId: number): boolean {
    const expectedPath = buildVendorDetailPath(vendorId);
    const pathEnd = candidate.search(/[?#]/);
    const rawPath = pathEnd === -1 ? candidate : candidate.slice(0, pathEnd);
    if (rawPath !== expectedPath) return false;

    try {
        const parsed = new URL(candidate, 'https://riskhub.invalid');
        return parsed.origin === 'https://riskhub.invalid' && parsed.pathname === expectedPath;
    } catch {
        return false;
    }
}

export function coerceVendorContext(vendorIdRaw: string | null, returnToRaw: string | null): {
    vendorId: number | null;
    returnTo: string | null;
} {
    const vendorId = parseVendorId(vendorIdRaw);
    if (!vendorId) {
        return {
            vendorId: null,
            returnTo: null,
        };
    }

    const trimmedReturnTo = returnToRaw?.trim() || null;
    const safeReturnTo = trimmedReturnTo && isExactVendorDetailReturnTo(trimmedReturnTo, vendorId)
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
