import type { MouseEvent } from 'react';
import { ArchiveRestore, Pencil, Trash2 } from 'lucide-react';

import type { Column } from '@/components/tables/SortableTable';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { VendorContract, VendorContractWritePayload } from '@/types/vendorContract';

export type ContractDisplayStatus = 'active' | 'archived';

export function getContractDisplayStatus(
    contract: Pick<VendorContract, 'is_archived'>,
): ContractDisplayStatus {
    return contract.is_archived ? 'archived' : 'active';
}

export function getContractStatusColor(status: ContractDisplayStatus): string {
    return status === 'archived' ? 'text-slate-400 bg-slate-400/10' : 'text-emerald-400 bg-emerald-400/10';
}

/**
 * Normalize a form's field values into a Contract write payload: trims
 * strings, converts empty strings to null (clearing the column), and passes
 * numbers and nulls through untouched. Only fields present in the input are
 * emitted, so untouched fields stay unsent on PATCH.
 */
export function buildVendorContractPayload(
    fields: Record<string, string | number | null | undefined>,
): VendorContractWritePayload {
    const payload: Record<string, string | number | null> = {};
    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) {
            continue;
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            payload[key] = trimmed === '' ? null : trimmed;
            continue;
        }
        payload[key] = value;
    }
    return payload as VendorContractWritePayload;
}

export function formatContractCost(contract: VendorContract): string | null {
    if (contract.annual_cost === null || contract.annual_cost === undefined) {
        return null;
    }
    const amount = Number(contract.annual_cost);
    const rendered = Number.isFinite(amount) ? amount.toLocaleString('cs-CZ') : String(contract.annual_cost);
    return contract.currency ? `${rendered} ${contract.currency}` : rendered;
}

/** The workbook's 08!U duplicate finding (engine literal, never re-spelled). */
export const CONTRACT_DUPLICATE_CHECK = 'DUPLICITA';

export function isContractReferenceDuplicate(
    contract: Pick<VendorContract, 'derived'>,
): boolean {
    return contract.derived?.duplicate_check === CONTRACT_DUPLICATE_CHECK;
}

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type BuildVendorContractColumnsParams = {
    t: TranslateFn;
    onEdit: (contract: VendorContract, event?: MouseEvent) => void;
    onArchive: (contract: VendorContract, event?: MouseEvent) => void | Promise<void>;
    onRestore: (contract: VendorContract, event?: MouseEvent) => void | Promise<void>;
};

export function buildVendorContractColumns({
    t,
    onEdit,
    onArchive,
    onRestore,
}: BuildVendorContractColumnsParams): Column<VendorContract>[] {
    return [
        {
            key: 'contract_reference',
            label: t('vendors:contracts.columns.reference'),
            className: 'w-[220px] min-w-[160px]',
            render: (contract) => (
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-bold text-white">
                        {contract.contract_reference ?? '—'}
                    </span>
                    {contract.internal_contract_number ? (
                        <span className="text-xs text-slate-500">
                            {contract.internal_contract_number}
                        </span>
                    ) : null}
                    {isContractReferenceDuplicate(contract) ? (
                        <span
                            className="inline-flex w-fit items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-300"
                            data-testid={`vendor-contract-duplicate-${contract.id}`}
                        >
                            {t('vendors:contracts.columns.duplicate_flag')}
                        </span>
                    ) : null}
                </div>
            ),
        },
        {
            key: 'arrangement_type',
            label: t('vendors:contracts.columns.arrangement_type'),
            render: (contract) => (
                <span className="text-sm text-slate-300">{contract.arrangement_type ?? '—'}</span>
            ),
        },
        {
            key: 'flags',
            label: t('vendors:contracts.columns.flags'),
            render: (contract) => (
                <div className="flex flex-wrap items-center gap-1.5">
                    {contract.main_contract === 'Ano' ? (
                        <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-300">
                            {t('vendors:contracts.columns.main_flag')}
                        </span>
                    ) : null}
                    {contract.roi_scope === 'Ano' ? (
                        <span className="inline-flex items-center rounded-full border border-indigo-400/30 bg-indigo-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-300">
                            {t('vendors:contracts.columns.roi_flag')}
                        </span>
                    ) : null}
                    {contract.derived?.cif === 'Ano' ? (
                        <span
                            className="inline-flex items-center rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-rose-300"
                            data-testid={`vendor-contract-cif-${contract.id}`}
                        >
                            {t('vendors:contracts.columns.cif')}
                        </span>
                    ) : null}
                    {contract.main_contract !== 'Ano' &&
                    contract.roi_scope !== 'Ano' &&
                    contract.derived?.cif !== 'Ano' ? (
                        <span className="text-sm text-slate-500">—</span>
                    ) : null}
                </div>
            ),
        },
        {
            key: 'chain',
            label: t('vendors:contracts.columns.chain'),
            render: (contract) =>
                contract.derived ? (
                    <span
                        className="text-sm text-slate-300"
                        data-testid={`vendor-contract-chain-${contract.id}`}
                    >
                        {contract.derived.sub_outsourcing_chain}
                    </span>
                ) : (
                    <span className="text-sm text-slate-500">—</span>
                ),
        },
        {
            key: 'term',
            label: t('vendors:contracts.columns.term'),
            render: (contract) => (
                <span className="text-sm text-slate-300">
                    {contract.start_date ?? '—'} → {contract.end_date ?? '—'}
                </span>
            ),
        },
        {
            key: 'annual_cost',
            label: t('vendors:contracts.columns.annual_cost'),
            render: (contract) => (
                <span className="text-sm text-slate-300">{formatContractCost(contract) ?? '—'}</span>
            ),
        },
        {
            key: 'status',
            label: t('vendors:contracts.columns.status'),
            className: 'w-[120px]',
            render: (contract) => {
                const status = getContractDisplayStatus(contract);
                return (
                    <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${getContractStatusColor(status)}`}
                    >
                        {t(`vendors:status.${status}`)}
                    </span>
                );
            },
        },
        {
            key: 'actions',
            label: '',
            className: 'w-[110px]',
            render: (contract) => (
                <div className="flex items-center justify-end gap-1">
                    {resolveCapabilityFlag(contract.capabilities, 'can_update') ? (
                        <button
                            type="button"
                            data-testid={`vendor-contract-edit-${contract.id}`}
                            onClick={(event) => onEdit(contract, event)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                            title={t('vendors:contracts.actions.edit')}
                        >
                            <Pencil className="h-4 w-4" />
                        </button>
                    ) : null}
                    {resolveCapabilityFlag(contract.capabilities, 'can_archive') ? (
                        <button
                            type="button"
                            data-testid={`vendor-contract-archive-${contract.id}`}
                            onClick={(event) => void onArchive(contract, event)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                            title={t('vendors:contracts.actions.archive')}
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    ) : null}
                    {resolveCapabilityFlag(contract.capabilities, 'can_restore') ? (
                        <button
                            type="button"
                            data-testid={`vendor-contract-restore-${contract.id}`}
                            onClick={(event) => void onRestore(contract, event)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                            title={t('vendors:contracts.actions.restore')}
                        >
                            <ArchiveRestore className="h-4 w-4" />
                        </button>
                    ) : null}
                </div>
            ),
        },
    ];
}
