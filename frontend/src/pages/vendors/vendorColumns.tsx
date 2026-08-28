import { Building2, User } from 'lucide-react';

import type { Column } from '@/components/tables';
import type { SafeTFunction } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { Vendor } from '@/types/vendor';

import { vendorOwnerDisplayName, vendorOwnerMetadata } from './vendorDetailPresentation';
import { getVendorDisplayStatus } from './vendorsPagePresentation';

function scorePill(score: number) {
    if (score >= 5) return 'text-destructive bg-destructive/10 border-destructive/20';
    if (score >= 4) return 'text-warning-text bg-warning/10 border-warning/20';
    if (score >= 3) return 'text-accent-text bg-info/10 border-info/20';
    if (score >= 2) return 'text-muted-foreground bg-muted border-border';
    return 'text-success-text bg-success/10 border-success/20';
}

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
                    <Building2 className="h-3 w-3 text-accent" aria-hidden="true" />
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
                    <User className="h-3 w-3 text-accent" aria-hidden="true" />
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
                    <div className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${scorePill(vendor.risk_score_1_5)}`}>
                        {vendor.risk_score_1_5} / 5
                    </div>
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
                        <span className="px-2 py-0.5 rounded-md text-xs font-bold uppercase text-foreground bg-nested border border-border">
                            {t(`vendors:status.${displayStatus}`, displayStatus)}
                        </span>
                        {resolveCapabilityFlag(vendor.capabilities, 'has_pending_change') ? (
                            <span
                                data-testid={`vendor-pending-change-${vendor.id}`}
                                className="inline-flex items-center rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-bold text-warning-text"
                            >
                                {t('vendors:pending_change.badge')}
                            </span>
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
                        <button
                            type="button"
                            onClick={(event) => onRestore(vendor.id, event)}
                            data-testid={`vendor-unarchive-${vendor.id}`}
                            className="px-2 py-1 rounded-md border border-success/30 text-success-text hover:bg-success/10 text-xs font-black uppercase tracking-wider"
                        >
                            {t('vendors:actions.unarchive')}
                        </button>
                    ) : null}
                </div>
            ),
        },
    ];
}
