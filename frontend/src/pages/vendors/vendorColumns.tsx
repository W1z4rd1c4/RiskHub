import { Building2, User } from 'lucide-react';

import type { Column } from '@/components/tables';
import type { SafeTFunction } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { Vendor } from '@/types/vendor';

import { vendorOwnerDisplayName, vendorOwnerMetadata } from './vendorDetailPresentation';
import { getVendorDisplayStatus } from './vendorsPagePresentation';

function scorePill(score: number) {
    if (score >= 5) return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
    if (score >= 4) return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
    if (score >= 3) return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
    if (score >= 2) return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
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
                    <span className="text-sm font-bold text-white">{vendor.name}</span>
                    <span className="text-[10px] text-slate-500">
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
                <div className="flex items-center gap-2 text-xs text-slate-300">
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
                <div className="flex items-start gap-2 text-xs text-slate-300">
                    <User className="h-3 w-3 text-accent" aria-hidden="true" />
                    <span className="flex flex-col">
                        <span>{vendorOwnerDisplayName(vendor.outsourcing_owner, vendor.ownership_status, t)}</span>
                        <span className="text-[10px] text-slate-500">
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
                <span className="text-xs font-medium text-slate-400">
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
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase text-slate-300 bg-white/5 border border-white/10">
                            {t(`vendors:status.${displayStatus}`, displayStatus)}
                        </span>
                        {resolveCapabilityFlag(vendor.capabilities, 'has_pending_change') ? (
                            <span
                                data-testid={`vendor-pending-change-${vendor.id}`}
                                className="inline-flex items-center rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-bold text-amber-200"
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
                            className="px-2 py-1 rounded-md border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 text-[10px] font-black uppercase tracking-wider"
                        >
                            {t('vendors:actions.unarchive')}
                        </button>
                    ) : null}
                </div>
            ),
        },
    ];
}
