import { Fragment, useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';

import type { Column } from '@/components/tables/SortableTable';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

import type { SubOutsourcingChainGroup, SubOutsourcingChainRow } from './vendorSubOutsourcingPresentation';

interface VendorSubOutsourcingChainTableProps {
    groups: SubOutsourcingChainGroup[];
    columns: Column<SubOutsourcingChainRow>[];
}

/**
 * Grouped, collapsible render of the sub-outsourcing chain (FR-P4-7, S13).
 *
 * The workbook flattened every chain into one always-expanded list. Here each
 * Contract gets a disclosure header row that expands/collapses its chain nodes
 * (`aria-expanded` + `aria-controls` on a real `<button>`, defaulting to
 * expanded so no data is hidden on first paint). The per-row cells reuse the
 * shared column render fns verbatim, so the structural indent + the
 * authoritative engine rank badge (`vendorSubOutsourcingPresentation`) are
 * preserved exactly — this component only adds the grouping + collapse shell.
 */
export function VendorSubOutsourcingChainTable({ groups, columns }: VendorSubOutsourcingChainTableProps) {
    const { t } = useTranslation('vendors');
    const tableId = useId();
    const columnHeaderIds = columns.map((_, index) => `${tableId}-column-${index}`);
    // Collapsed set: a Contract is expanded unless the user has collapsed it.
    const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());

    const toggle = (contractId: number) =>
        setCollapsed((previous) => {
            const next = new Set(previous);
            if (next.has(contractId)) {
                next.delete(contractId);
            } else {
                next.add(contractId);
            }
            return next;
        });

    return (
        <div className="glass-card !p-0 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border">
                            {columns.map((col, index) => (
                                <th
                                    key={String(col.key)}
                                    id={columnHeaderIds[index]}
                                    scope="col"
                                    className={cn(
                                        'px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground',
                                        col.headerClassName,
                                    )}
                                >
                                    {col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    {groups.map((group) => {
                        const isExpanded = !collapsed.has(group.contractId);
                        const panelId = `vendor-sub-outsourcing-group-panel-${group.contractId}`;
                        const groupHeaderId = `${tableId}-group-${group.contractId}`;
                        return (
                            <Fragment key={group.contractId}>
                                <tbody className="border-b border-border">
                                    <tr className="bg-nested">
                                        <th id={groupHeaderId} colSpan={columns.length} className="px-6 py-3 text-left">
                                            <button
                                                type="button"
                                                onClick={() => toggle(group.contractId)}
                                                aria-expanded={isExpanded}
                                                aria-controls={panelId}
                                                data-testid={`vendor-sub-outsourcing-group-${group.contractId}`}
                                                className="group inline-flex items-center gap-2 rounded text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                            >
                                                <ChevronRight
                                                    className={cn(
                                                        'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                                                        isExpanded && 'rotate-90',
                                                    )}
                                                    aria-hidden="true"
                                                />
                                                <span className="text-sm font-bold text-foreground">{group.label}</span>
                                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                                    {t('sub_outsourcing.chain_group.count', { count: group.rows.length })}
                                                </span>
                                            </button>
                                        </th>
                                    </tr>
                                </tbody>
                                <tbody id={panelId} className="divide-y divide-white/5 border-b border-border">
                                    {isExpanded
                                        ? group.rows.map((row, index) => (
                                              <tr
                                                  key={row.entry.id}
                                                  className="hover:bg-glass-hover transition-colors"
                                              >
                                                  {columns.map((col, columnIndex) => (
                                                      <td
                                                          key={String(col.key)}
                                                          headers={`${columnHeaderIds[columnIndex]} ${groupHeaderId}`}
                                                          className={cn('px-6 py-4', col.className)}
                                                      >
                                                          {col.render ? col.render(row, index) : null}
                                                      </td>
                                                  ))}
                                              </tr>
                                          ))
                                        : null}
                                </tbody>
                            </Fragment>
                        );
                    })}
                </table>
            </div>
        </div>
    );
}
