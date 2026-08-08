import type { MouseEvent } from 'react';
import { motion } from 'framer-motion';
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

/** A per-contract group of chain rows for the grouped, collapsible render (FR-P4-7). */
export interface SubOutsourcingChainGroup {
    contractId: number;
    /** Real contract label (never a raw `#id`), resolved from the group's first entry. */
    label: string;
    rows: SubOutsourcingChainRow[];
}

/** The workbook's 09!K chain findings (engine literals, never re-spelled). */
export const CHAIN_CHECK_DUPLICATE = 'DUPLICITA';
export const CHAIN_CHECK_BROKEN = 'CHYBA ŘETĚZCE';

/**
 * The authoritative derived Rank (09!I, engine #49) rendered as the workbook
 * renders it: the number, or the "?" sentinel for a broken chain.
 */
export function formatSubOutsourcingRank(
    entry: Pick<VendorSubOutsourcing, 'derived'>,
): string {
    const rank = entry.derived?.rank;
    return rank === null || rank === undefined ? '?' : String(rank);
}

/**
 * Order the flat collection for the full-depth chain render: group by
 * Contract (ascending id), then depth-first from each chain root
 * (predecessor_id null), children after their predecessor in id order.
 * The STRUCTURAL indent stays client-side; the authoritative Rank badge
 * comes from the engine block (#49). Entries whose predecessor is not in
 * the collection are rendered defensively as roots.
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

/**
 * Fold the ordered full-depth chain rows into per-contract groups for the
 * grouped, collapsible render (FR-P4-7, S13). Row order within a group — and
 * the structural indent `depth` — is preserved verbatim from
 * `buildSubOutsourcingChainRows`; groups appear in first-seen contract order.
 * The group label is resolved from the group's first entry via the caller's
 * real-label resolver, so a group header never leaks a raw `#<id>`.
 */
export function groupSubOutsourcingChainRows(
    rows: SubOutsourcingChainRow[],
    getContractLabel: (entry: VendorSubOutsourcing) => string,
): SubOutsourcingChainGroup[] {
    const groups: SubOutsourcingChainGroup[] = [];
    const byContract = new Map<number, SubOutsourcingChainGroup>();
    for (const row of rows) {
        const contractId = row.entry.contract_id;
        let group = byContract.get(contractId);
        if (!group) {
            group = { contractId, label: getContractLabel(row.entry), rows: [] };
            byContract.set(contractId, group);
            groups.push(group);
        }
        group.rows.push(row);
    }
    return groups;
}

/**
 * Resolve the Contract label for a chain row: the contracts collection's
 * label when known, else the contract reference the entry's derived block
 * already embeds (a real label even while the contracts query is loading),
 * else the i18n'd unknown label — never a raw `#<id>` fallback.
 */
export function resolveSubOutsourcingContractLabel(
    entry: Pick<VendorSubOutsourcing, 'contract_id' | 'derived'>,
    contractLabelById: ReadonlyMap<number, string>,
    unknownContractLabel: string,
): string {
    return (
        contractLabelById.get(entry.contract_id) ??
        (entry.derived?.contract_reference || unknownContractLabel)
    );
}

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type BuildVendorSubOutsourcingColumnsParams = {
    t: TranslateFn;
    getContractLabel: (entry: VendorSubOutsourcing) => string;
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
            label: t('vendors:sub_outsourcing.columns.sub_provider'),
            className: 'w-[280px] min-w-[200px]',
            render: ({ entry, depth }) => (
                <motion.div
                    data-testid={`vendor-sub-outsourcing-provider-${entry.id}`}
                    className="flex flex-col gap-0.5"
                    initial={false}
                    animate={{ paddingLeft: `${depth * DEPTH_INDENT_PX}px` }}
                    transition={{ duration: 0 }}
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
                </motion.div>
            ),
        },
        {
            key: 'rank',
            label: t('vendors:sub_outsourcing.columns.rank'),
            className: 'w-[110px]',
            render: ({ entry }) => {
                const broken = entry.derived != null && entry.derived.rank == null;
                const duplicate = entry.derived?.chain_check === CHAIN_CHECK_DUPLICATE;
                return (
                    <div className="flex items-center gap-1.5" data-testid={`vendor-sub-outsourcing-rank-${entry.id}`}>
                        <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${
                                broken
                                    ? 'text-rose-300 bg-rose-500/10 border-rose-400/30'
                                    : 'text-cyan-300 bg-cyan-400/10 border-cyan-400/20'
                            }`}
                        >
                            {entry.derived ? formatSubOutsourcingRank(entry) : '—'}
                        </span>
                        {broken ? (
                            <span
                                className="text-[10px] font-black uppercase tracking-widest text-rose-300"
                                data-testid={`vendor-sub-outsourcing-chain-error-${entry.id}`}
                            >
                                {t('vendors:sub_outsourcing.chain_status.chain_error')}
                            </span>
                        ) : null}
                        {duplicate ? (
                            <span className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                                {t('vendors:sub_outsourcing.chain_status.duplicate')}
                            </span>
                        ) : null}
                    </div>
                );
            },
        },
        {
            key: 'contract',
            label: t('vendors:sub_outsourcing.columns.contract'),
            render: ({ entry }) => (
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-slate-300">{getContractLabel(entry)}</span>
                    {entry.derived?.critical_service === 'Ano' ? (
                        <span
                            className="inline-flex w-fit items-center rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-rose-300"
                            data-testid={`vendor-sub-outsourcing-critical-${entry.id}`}
                        >
                            {t('vendors:sub_outsourcing.columns.critical_service')}
                        </span>
                    ) : null}
                </div>
            ),
        },
        {
            key: 'country',
            label: t('vendors:sub_outsourcing.columns.country'),
            className: 'w-[90px]',
            render: ({ entry }) => <span className="text-sm text-slate-300">{entry.country ?? '—'}</span>,
        },
        {
            key: 'ict_service_code',
            label: t('vendors:sub_outsourcing.columns.ict_service'),
            className: 'w-[110px]',
            render: ({ entry }) => (
                <span className="text-sm text-slate-300">{entry.ict_service_code ?? '—'}</span>
            ),
        },
        {
            key: 'status',
            label: t('vendors:sub_outsourcing.columns.status'),
            className: 'w-[120px]',
            render: ({ entry }) => {
                const status = getSubOutsourcingDisplayStatus(entry);
                return (
                    <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${getSubOutsourcingStatusColor(status)}`}
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
            render: ({ entry }) => (
                <div className="flex items-center justify-end gap-1">
                    {resolveCapabilityFlag(entry.capabilities, 'can_update') ? (
                        <button
                            type="button"
                            data-testid={`vendor-sub-outsourcing-edit-${entry.id}`}
                            onClick={(event) => onEdit(entry, event)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                            title={t('vendors:sub_outsourcing.actions.edit')}
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
                            title={t('vendors:sub_outsourcing.actions.archive')}
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
                            title={t('vendors:sub_outsourcing.actions.restore')}
                        >
                            <ArchiveRestore className="h-4 w-4" />
                        </button>
                    ) : null}
                </div>
            ),
        },
    ];
}
