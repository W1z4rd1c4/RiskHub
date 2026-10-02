import { Fragment, useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';

import type { Column } from '@/components/tables/SortableTable';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
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
 * (`aria-expanded` + `aria-controls` on a shared `Button`, defaulting to
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
        <Card padding="none" className="overflow-hidden">
            <Table regionLabel={t('sub_outsourcing.title')}>
                <THead>
                    <TR>
                        {columns.map((col, index) => (
                            <TH key={String(col.key)} id={columnHeaderIds[index]} className={col.headerClassName}>
                                {col.label}
                            </TH>
                        ))}
                    </TR>
                </THead>
                {groups.map((group) => {
                    const isExpanded = !collapsed.has(group.contractId);
                    const panelId = `vendor-sub-outsourcing-group-panel-${group.contractId}`;
                    const groupHeaderId = `${tableId}-group-${group.contractId}`;
                    return (
                        <Fragment key={group.contractId}>
                            <TBody className="border-b border-border">
                                <TR className="bg-nested hover:bg-nested">
                                    <TH
                                        id={groupHeaderId}
                                        colSpan={columns.length}
                                        scope="rowgroup"
                                        className="py-3 normal-case tracking-normal"
                                    >
                                        <Button
                                            variant="ghost"
                                            size="compact"
                                            onClick={() => toggle(group.contractId)}
                                            aria-expanded={isExpanded}
                                            aria-controls={panelId}
                                            data-testid={`vendor-sub-outsourcing-group-${group.contractId}`}
                                            className="-ml-3 text-left"
                                        >
                                            <ChevronRight
                                                className={cn(
                                                    'text-muted-foreground transition-transform',
                                                    isExpanded && 'rotate-90',
                                                )}
                                                aria-hidden="true"
                                            />
                                            <span className="text-sm font-bold text-foreground">{group.label}</span>
                                            <span className="text-eyebrow">
                                                {t('sub_outsourcing.chain_group.count', { count: group.rows.length })}
                                            </span>
                                        </Button>
                                    </TH>
                                </TR>
                            </TBody>
                            <TBody id={panelId} className="border-b border-border">
                                {isExpanded
                                    ? group.rows.map((row, index) => (
                                          <TR key={row.entry.id}>
                                              {columns.map((col, columnIndex) => (
                                                  <TD
                                                      key={String(col.key)}
                                                      headers={`${columnHeaderIds[columnIndex]} ${groupHeaderId}`}
                                                      className={col.className}
                                                  >
                                                      {col.render ? col.render(row, index) : null}
                                                  </TD>
                                              ))}
                                          </TR>
                                      ))
                                    : null}
                            </TBody>
                        </Fragment>
                    );
                })}
            </Table>
        </Card>
    );
}
