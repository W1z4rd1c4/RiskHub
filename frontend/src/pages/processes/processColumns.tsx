import type { MouseEvent } from 'react';
import { ArchiveRestore } from 'lucide-react';

import { CriticalityClassPill } from '@/components/ict-register/CriticalityClassPill';
import type { Column } from '@/components/tables/SortableTable';
import type { Process } from '@/types/process';

import {
    getProcessDisplayStatus,
    processDepartmentDisplayLabel,
    processDerivedCifLabel,
    processDerivedCriticalityLabel,
    processOwnerDisplayLabel,
    type ProcessDisplayStatus,
} from './processesPagePresentation';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type BuildProcessColumnsParams = {
    t: TranslateFn;
    onRestore: (processId: number, event: MouseEvent) => void | Promise<void>;
    canRestoreProcess: (process: Process) => boolean;
};

export function getProcessStatusColor(status: ProcessDisplayStatus): string {
    return status === 'archived' ? 'text-muted-foreground bg-muted' : 'text-success-text bg-success/10';
}

export function buildProcessColumns({
    t,
    onRestore,
    canRestoreProcess,
}: BuildProcessColumnsParams): Column<Process>[] {
    return [
        {
            key: 'f_code',
            label: t('processes:columns.f_code'),
            sortable: true,
            className: 'w-[90px]',
            render: (process) => (
                <span className="text-xs font-mono font-bold text-accent-text">{process.f_code}</span>
            ),
        },
        {
            key: 'l1_process',
            label: t('processes:columns.process'),
            sortable: true,
            className: 'w-[340px] min-w-[240px]',
            render: (process) => (
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-bold text-white">{process.l1_process}</span>
                    {process.l2_subprocess ? (
                        <span className="text-xs text-muted-foreground">{process.l2_subprocess}</span>
                    ) : null}
                </div>
            ),
        },
        {
            key: 'l0_area',
            label: t('processes:columns.l0_area'),
            sortable: true,
            render: (process) => <span className="text-sm text-slate-300">{process.l0_area}</span>,
        },
        {
            key: 'owner',
            label: t('processes:columns.owner'),
            sortable: true,
            render: (process) => (
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-slate-300">{processOwnerDisplayLabel(t, process)}</span>
                    <span className="text-xs text-muted-foreground">
                        {processDepartmentDisplayLabel(t, process)}
                    </span>
                </div>
            ),
        },
        {
            // P8 (FR-P5-4): numeric column right-aligned so digits line up under
            // the header; `tabular-nums` keeps the figures monospaced.
            key: 'mtpd_hours',
            label: t('processes:columns.mtpd'),
            className: 'w-[90px] text-right',
            headerClassName: 'text-right',
            render: (process) => (
                <span className="text-sm text-slate-300 tabular-nums">
                    {process.mtpd_hours ?? '—'}
                </span>
            ),
        },
        {
            // Engine-derived Criticality class (trida, ticket #48) — read-only.
            key: 'derived_criticality_class',
            label: t('processes:columns.criticality_class'),
            render: (process) => (
                <CriticalityClassPill
                    criticalityClass={process.derived?.criticality_class}
                    displayValue={processDerivedCriticalityLabel(t, process.derived?.criticality_class)}
                />
            ),
        },
        {
            // Engine-derived CIF (ticket #48) — read-only.
            key: 'derived_cif',
            label: t('processes:columns.cif'),
            className: 'w-[90px]',
            render: (process) => (
                <span className="text-sm text-slate-300">
                    {processDerivedCifLabel(t, process.derived?.cif) ?? '—'}
                </span>
            ),
        },
        {
            key: 'status',
            label: t('processes:columns.status'),
            className: 'w-[130px]',
            render: (process) => {
                const status = getProcessDisplayStatus(process);
                return (
                    <div className="flex items-center gap-2">
                        <div className="flex flex-col items-start gap-1">
                            <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${getProcessStatusColor(status)}`}
                            >
                                {t(`processes:status.${status}`)}
                            </span>
                            {process.pending_change ? (
                                <span
                                    data-testid={`process-pending-change-${process.id}`}
                                    className="inline-flex items-center rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-bold text-amber-200"
                                >
                                    {t('processes:pending_change.badge')}
                                </span>
                            ) : null}
                        </div>
                        {status === 'archived' && canRestoreProcess(process) ? (
                            <button
                                type="button"
                                data-testid={`process-restore-${process.id}`}
                                onClick={(event) => void onRestore(process.id, event)}
                                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                                aria-label={t('processes:actions.restore')}
                                title={t('processes:actions.restore')}
                            >
                                <ArchiveRestore className="h-4 w-4" />
                            </button>
                        ) : null}
                    </div>
                );
            },
        },
    ];
}
