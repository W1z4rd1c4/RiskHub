import { Building2, User } from 'lucide-react';

import { PendingChangeBadge } from '@/components/approvals/PendingChangeBadge';
import type { Column } from '@/components/tables';
import { RowRestoreButton } from '@/components/tables/RowRestoreButton';
import { Badge, SeverityBadge } from '@/components/ui/badge';
import type { SafeTFunction } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { ordinalSeverityBand } from '@/lib/severity';
import type { Vendor } from '@/types/vendor';

import { vendorOwnerDisplayName, vendorOwnerMetadata } from './vendorDetailPresentation';
import { getVendorDisplayStatus, getVendorStatusTone } from './vendorsPagePresentation';

interface BuildVendorColumnsOptions {
    onRestore: (vendorId: number, event: React.MouseEvent<HTMLButtonElement>) => void;
    t: SafeTFunction;
}

export function buildVendorColumns({ onRestore, t }: BuildVendorColumnsOptions): Column<Vendor>[] {
    return [
        {
            key: 'name',
            label: t('vendors:columns.name'),
            sortable: true,
            render: (vendor) => (
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-bold text-foreground">{vendor.name}</span>
                    <span className="text-xs text-muted-foreground">
                        {vendor.process || t('vendors:grouping.no_process')}
                    </span>
                </div>
            ),
        },
        {
            key: 'department',
            label: t('vendors:columns.department'),
            sortable: true,
            render: (vendor) => (
                <div className="flex items-center gap-2 text-xs text-foreground">
                    <Building2 className="h-3 w-3 text-accent-text" aria-hidden="true" />
                    <span>{vendor.department_name || t('vendors:labels.unassigned')}</span>
                </div>
            ),
        },
        {
            key: 'outsourcing_owner',
            label: t('vendors:columns.owner'),
            sortable: true,
            render: (vendor) => (
                <div className="flex items-start gap-2 text-xs text-foreground">
                    <User className="h-3 w-3 text-accent-text" aria-hidden="true" />
                    <span className="flex flex-col">
                        <span>{vendorOwnerDisplayName(vendor.outsourcing_owner, vendor.ownership_status, t)}</span>
                        <span className="text-xs text-muted-foreground">
                            {vendorOwnerMetadata(vendor.outsourcing_owner, t)}
                        </span>
                    </span>
                </div>
            ),
        },
        {
            key: 'vendor_type',
            label: t('vendors:columns.type'),
            sortable: true,
            render: (vendor) => (
                <span className="text-xs font-medium text-muted-foreground">
                    {t(`vendors:type.${vendor.vendor_type}`, vendor.vendor_type)}
                </span>
            ),
        },
        {
            key: 'risk_score',
            label: t('vendors:columns.risk_score'),
            sortable: true,
            className: 'text-center',
            render: (vendor) => (
                <div className="flex justify-center">
                    <SeverityBadge
                        band={ordinalSeverityBand(vendor.risk_score_1_5)}
                        label={`${vendor.risk_score_1_5} / 5`}
                    />
                </div>
            ),
        },
        {
            key: 'status',
            label: t('vendors:columns.status'),
            sortable: false,
            render: (vendor) => {
                const displayStatus = getVendorDisplayStatus(vendor);
                return (
                    <div className="flex flex-col items-start gap-1">
                        <Badge tone={getVendorStatusTone(displayStatus)}>
                            {t(`vendors:status.${displayStatus}`, displayStatus)}
                        </Badge>
                        {resolveCapabilityFlag(vendor.capabilities, 'has_pending_change') ? (
                            <PendingChangeBadge data-testid={`vendor-pending-change-${vendor.id}`} />
                        ) : null}
                    </div>
                );
            },
        },
        {
            key: 'id',
            label: '',
            sortable: false,
            render: (vendor) => (
                <div className="flex items-center justify-end gap-2">
                    {resolveCapabilityFlag(vendor.capabilities, 'can_restore') ? (
                        <RowRestoreButton
                            itemName={vendor.name}
                            onClick={(event) => onRestore(vendor.id, event)}
                            data-testid={`vendor-unarchive-${vendor.id}`}
                        />
                    ) : null}
                </div>
            ),
        },
    ];
}
