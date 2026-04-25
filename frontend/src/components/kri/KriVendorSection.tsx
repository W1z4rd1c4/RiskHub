import { KRIVendorSelector, type KRIVendorOption } from '@/components/kri/KRIVendorSelector';

import type { KriModalTranslate } from './kriModalTypes';

interface KriVendorSectionProps {
    debouncedVendorSearch: string;
    isLoadingVendors: boolean;
    onChange: (vendorIds: number[]) => void;
    onSearchChange: (value: string) => void;
    selectedVendorIds: number[];
    selectedVendorOptions: KRIVendorOption[];
    t: KriModalTranslate;
    vendorOptions: KRIVendorOption[];
    vendorSearch: string;
}

export function KriVendorSection({
    debouncedVendorSearch,
    isLoadingVendors,
    onChange,
    onSearchChange,
    selectedVendorIds,
    selectedVendorOptions,
    t,
    vendorOptions,
    vendorSearch,
}: KriVendorSectionProps) {
    return (
        <div className="pt-6 border-t border-white/5">
            <KRIVendorSelector
                vendors={vendorOptions}
                selectedVendorIds={selectedVendorIds}
                selectedVendorOptions={selectedVendorOptions}
                onChange={onChange}
                isLoading={isLoadingVendors}
                search={vendorSearch}
                onSearchChange={onSearchChange}
                emptyStateLabel={
                    debouncedVendorSearch.trim().length > 0
                        ? t('kris:vendor_assignment.empty_search')
                        : t('kris:vendor_assignment.empty')
                }
            />
        </div>
    );
}
