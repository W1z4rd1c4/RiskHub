import { useId, useMemo } from 'react';
import { Building2, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/i18n/hooks';
import { EmptyState, LoadingState } from '@/components/ui/state';

export interface KRIVendorOption {
    id: number;
    name: string;
    status?: string | null;
    is_archived?: boolean;
}

interface KRIVendorSelectorProps {
    vendors: KRIVendorOption[];
    selectedVendorIds: number[];
    selectedVendorOptions?: KRIVendorOption[];
    onChange: (vendorIds: number[]) => void;
    isLoading?: boolean;
    search: string;
    onSearchChange: (value: string) => void;
    emptyStateLabel?: string;
}

export function KRIVendorSelector({
    vendors,
    selectedVendorIds,
    selectedVendorOptions,
    onChange,
    isLoading = false,
    search,
    onSearchChange,
    emptyStateLabel,
}: KRIVendorSelectorProps) {
    const { t } = useTranslation(['kris', 'vendors']);
    const labelId = useId();
    const optionIdPrefix = useId();

    const selectedVendors = useMemo(
        () => (selectedVendorOptions ?? vendors.filter((vendor) => selectedVendorIds.includes(vendor.id))),
        [selectedVendorIds, selectedVendorOptions, vendors],
    );

    const sortedVendors = useMemo(
        () =>
            [...vendors].sort((left, right) => {
            const leftSelected = selectedVendorIds.includes(left.id) ? 0 : 1;
            const rightSelected = selectedVendorIds.includes(right.id) ? 0 : 1;
            if (leftSelected !== rightSelected) {
                return leftSelected - rightSelected;
            }
            return left.name.localeCompare(right.name);
            }),
        [selectedVendorIds, vendors],
    );

    const toggleVendor = (vendorId: number) => {
        if (selectedVendorIds.includes(vendorId)) {
            onChange(selectedVendorIds.filter((id) => id !== vendorId));
            return;
        }
        onChange([...selectedVendorIds, vendorId]);
    };

    return (
        <div className="space-y-4">
            <div>
                <p id={labelId} className="mb-2 text-eyebrow">
                    {t('kris:vendor_assignment.label')}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                    {t('kris:vendor_assignment.help')}
                </p>
            </div>

            <Input
                type="text"
                leadingIcon={Search}
                aria-labelledby={labelId}
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={t('kris:vendor_assignment.search_placeholder')}
            />

            {selectedVendors.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    {selectedVendors.map((vendor) => (
                        <Button
                            key={vendor.id}
                            variant="outline"
                            size="compact"
                            onClick={() => toggleVendor(vendor.id)}
                            aria-label={t('common:actions.remove_named', { name: vendor.name })}
                            className="rounded-full border-accent/30 bg-accent/10 text-accent-text"
                        >
                            {vendor.name}
                            <X aria-hidden="true" />
                        </Button>
                    ))}
                </div>
            ) : null}

            <div className="max-h-56 overflow-y-auto rounded-xl border border-border divide-y divide-border custom-scrollbar">
                {isLoading ? (
                    <LoadingState layout="inline" className="justify-center p-6" />
                ) : sortedVendors.length === 0 ? (
                    <EmptyState
                        layout="inline"
                        icon={null}
                        className="justify-center p-6 text-muted-foreground"
                        title={emptyStateLabel ?? t('kris:vendor_assignment.empty')}
                    />
                ) : (
                    sortedVendors.map((vendor) => {
                        const checked = selectedVendorIds.includes(vendor.id);
                        return (
                            <label
                                key={vendor.id}
                                htmlFor={`${optionIdPrefix}-${vendor.id}`}
                                className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-tint/5 transition-colors"
                            >
                                <Checkbox
                                    id={`${optionIdPrefix}-${vendor.id}`}
                                    checked={checked}
                                    onCheckedChange={() => toggleVendor(vendor.id)}
                                    aria-label={vendor.name}
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <Building2 aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="truncate text-sm font-medium text-foreground">
                                            {vendor.name}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-eyebrow">
                                        {vendor.is_archived
                                            ? t('vendors:status.inactive')
                                            : t('vendors:status.active')}
                                    </p>
                                </div>
                            </label>
                        );
                    })
                )}
            </div>
        </div>
    );
}
