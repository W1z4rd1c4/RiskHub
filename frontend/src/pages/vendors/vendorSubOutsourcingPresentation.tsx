import type { MouseEvent } from 'react';
import { ArchiveRestore, Pencil, Trash2 } from 'lucide-react';

import type { Column } from '@/components/tables/SortableTable';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { VendorSubOutsourcing, VendorSubOutsourcingWritePayload } from '@/types/vendorSubOutsourcing';

export type SubOutsourcingDisplayStatus = 'active' | 'archived';

export function getSubOutsourcingDisplayStatus(
    entry: Pick<VendorSubOutsourcing, 'is_archived'>,
): SubOutsourcingDisplayStatus {
    return entry.is_archived ? 'archived' : 'active';
}

export function getSubOutsourcingStatusColor(status: SubOutsourcingDisplayStatus): string {
    return status === 'archived' ? 'text-slate-400 bg-slate-400/10' : 'text-emerald-400 bg-emerald-400/10';
}

/**
 * Normalize a form's field values into a Sub-outsourcing write payload: trims
 * strings, converts empty strings to null (clearing the column), and passes
 * numbers and nulls through untouched. Only fields present in the input are
 * emitted, so untouched fields stay unsent on PATCH.
 */
export function buildVendorSubOutsourcingPayload(
    fields: Record<string, string | number | null | undefined>,
): VendorSubOutsourcingWritePayload {
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
    return payload as VendorSubOutsourcingWritePayload;
}

/** One table row of the full-depth chain render: the entry plus its display depth. */
export interface SubOutsourcingChainRow {
    entry: VendorSubOutsourcing;
    /** 0 = direct sub-outsourcer of the Contract; +1 per predecessor hop. */
    depth: number;
}

/**
 * Order the flat collection for the full-depth chain render: group by
 * Contract (ascending id), then depth-first from each chain root
 * (predecessor_id null), children after their predecessor in id order.
 * Display depth is computed client-side by walking predecessor_id — the
 * authoritative Rank arrives with the derivation engine (#49). Entries whose
 * predecessor is not in the collection are rendered defensively as roots.
 */
export function buildSubOutsourcingChainRows(
    entries: VendorSubOutsourcing[],
): SubOutsourcingChainRow[] {
    const byId = new Set(entries.map((entry) => entry.id));
    const childrenByPredecessor = new Map<number, VendorSubOutsourcing[]>();
    const rootsByContract = new Map<number, VendorSubOutsourcing[]>();

    const sorted = [...entries].sort((left, right) => left.id - right.id);
    for (const entry of sorted) {
        const predecessorId = entry.predecessor_id ?? null;
        if (predecessorId !== null && byId.has(predecessorId)) {
            const siblings = childrenByPredecessor.get(predecessorId) ?? [];
            siblings.push(entry);
            childrenByPredecessor.set(predecessorId, siblings);
            continue;
        }
        const roots = rootsByContract.get(entry.contract_id) ?? [];
        roots.push(entry);
        rootsByContract.set(entry.contract_id, roots);
    }

    const rows: SubOutsourcingChainRow[] = [];
    const visited = new Set<number>();
    const walk = (entry: VendorSubOutsourcing, depth: number) => {
        if (visited.has(entry.id)) {
            return; // defensive: enforced data is acyclic
        }
        visited.add(entry.id);
        rows.push({ entry, depth });
        for (const child of childrenByPredecessor.get(entry.id) ?? []) {
            walk(child, depth + 1);
        }
    };

    for (const contractId of [...rootsByContract.keys()].sort((left, right) => left - right)) {
        for (const root of rootsByContract.get(contractId) ?? []) {
            walk(root, 0);
        }
    }
    return rows;
}

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type BuildVendorSubOutsourcingColumnsParams = {
    t: TranslateFn;
    getContractLabel: (contractId: number) => string;
    onEdit: (entry: VendorSubOutsourcing, event?: MouseEvent) => void;
    onArchive: (entry: VendorSubOutsourcing, event?: MouseEvent) => void | Promise<void>;
    onRestore: (entry: VendorSubOutsourcing, event?: MouseEvent) => void | Promise<void>;
};

const DEPTH_INDENT_PX = 20;

export function buildVendorSubOutsourcingColumns({
    t,
    getContractLabel,
    onEdit,
    onArchive,
    onRestore,
}: BuildVendorSubOutsourcingColumnsParams): Column<SubOutsourcingChainRow>[] {
    return [
        {
            key: 'sub_provider',
            label: t('sub_outsourcing.columns.sub_provider'),
            className: 'w-[280px] min-w-[200px]',
            render: ({ entry, depth }) => (
                <div
                    data-testid={`vendor-sub-outsourcing-provider-${entry.id}`}
                    className="flex flex-col gap-0.5"
                    style={{ paddingLeft: `${depth * DEPTH_INDENT_PX}px` }}
                >
                    <span className="text-sm font-bold text-white">
                        {depth > 0 ? <span className="text-slate-500">↳ </span> : null}
                        {entry.sub_provider_name ?? '—'}
                    </span>
                    {entry.identifier_type || entry.identifier_value ? (
                        <span className="text-xs text-slate-500">
                            {[entry.identifier_type, entry.identifier_value].filter(Boolean).join(': ')}
                        </span>
                    ) : null}
                </div>
            ),
        },
        {
            key: 'contract',
            label: t('sub_outsourcing.columns.contract'),
            render: ({ entry }) => (
                <span className="text-sm text-slate-300">{getContractLabel(entry.contract_id)}</span>
            ),
        },
        {
            key: 'country',
            label: t('sub_outsourcing.columns.country'),
            className: 'w-[90px]',
            render: ({ entry }) => <span className="text-sm text-slate-300">{entry.country ?? '—'}</span>,
        },
        {
            key: 'ict_service_code',
            label: t('sub_outsourcing.columns.ict_service'),
            className: 'w-[110px]',
            render: ({ entry }) => (
                <span className="text-sm text-slate-300">{entry.ict_service_code ?? '—'}</span>
            ),
        },
        {
            key: 'status',
            label: t('sub_outsourcing.columns.status'),
            className: 'w-[120px]',
            render: ({ entry }) => {
                const status = getSubOutsourcingDisplayStatus(entry);
                return (
                    <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${getSubOutsourcingStatusColor(status)}`}
                    >
                        {t(`status.${status}`)}
                    </span>
                );
            },
        },
        {
            key: 'actions',
            label: '',
            className: 'w-[110px]',
            render: ({ entry }) => (
                <div className="flex items-center justify-end gap-1">
                    {resolveCapabilityFlag(entry.capabilities, 'can_update') ? (
                        <button
                            type="button"
                            data-testid={`vendor-sub-outsourcing-edit-${entry.id}`}
                            onClick={(event) => onEdit(entry, event)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                            title={t('sub_outsourcing.actions.edit')}
                        >
                            <Pencil className="h-4 w-4" />
                        </button>
                    ) : null}
                    {resolveCapabilityFlag(entry.capabilities, 'can_archive') ? (
                        <button
                            type="button"
                            data-testid={`vendor-sub-outsourcing-archive-${entry.id}`}
                            onClick={(event) => void onArchive(entry, event)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                            title={t('sub_outsourcing.actions.archive')}
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    ) : null}
                    {resolveCapabilityFlag(entry.capabilities, 'can_restore') ? (
                        <button
                            type="button"
                            data-testid={`vendor-sub-outsourcing-restore-${entry.id}`}
                            onClick={(event) => void onRestore(entry, event)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                            title={t('sub_outsourcing.actions.restore')}
                        >
                            <ArchiveRestore className="h-4 w-4" />
                        </button>
                    ) : null}
                </div>
            ),
        },
    ];
}
