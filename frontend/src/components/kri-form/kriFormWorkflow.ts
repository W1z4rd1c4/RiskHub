export interface VendorContextWarningInput {
    expectedVendorName: string | null;
    selectedVendorName: string | null;
}

export function buildVendorContextWarning({
    expectedVendorName,
    selectedVendorName,
}: VendorContextWarningInput): string | null {
    if (!expectedVendorName || !selectedVendorName || expectedVendorName === selectedVendorName) {
        return null;
    }
    return `Selected vendor differs from ${expectedVendorName}`;
}
