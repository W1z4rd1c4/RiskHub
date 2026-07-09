import type { MouseEvent } from 'react';
import { ArchiveRestore, ChevronRight } from 'lucide-react';

import type { Column } from '@/components/tables/SortableTable';
import type { Process } from '@/types/process';

import { getProcessDisplayStatus, type ProcessDisplayStatus } from './processesPagePresentation';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type BuildProcessColumnsParams = {
    t: TranslateFn;
    onRestore: (processId: number, event: MouseEvent) => void | Promise<void>;
    canRestoreProcess: (process: Process) => boolean;
};

export function getProcessStatusColor(status: ProcessDisplayStatus): string {
    return status === 'archived' ? 'text-slate-400 bg-slate-400/10' : 'text-emerald-400 bg-emerald-400/10';
}

const CRITICALITY_PILLS: Record<string, string> = {
    ['Nízká']: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    ['Střední']: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    ['Vysoká']: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
    ['Kritická']: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
};

export function buildProcessColumns({
    t,
    onRestore,
    canRestoreProcess,
}: BuildProcessColumnsParams): Column<Process>[] {
    return [
        {
            key: 'f_code',
            label: t('columns.f_code'),
            sortable: true,
            className: 'w-[90px]',
            render: (process) => (
                <span className="text-xs font-mono font-bold text-accent">{process.f_code}</span>
            ),
        },
        {
            key: 'l1_process',
            label: t('columns.process'),
            sortable: true,
            className: 'w-[340px] min-w-[240px]',
            render: (process) => (
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-bold text-white">{process.l1_process}</span>
                    {process.l2_subprocess ? (
                        <span className="text-xs text-slate-500">{process.l2_subprocess}</span>
                    ) : null}
                </div>
            ),
        },
        {
            key: 'l0_area',
            label: t('columns.l0_area'),
            sortable: true,
            render: (process) => <span className="text-sm text-slate-300">{process.l0_area}</span>,
        },
        {
            key: 'owner',
            label: t('columns.owner'),
            sortable: true,
            render: (process) => (
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-slate-300">{process.owner ?? '—'}</span>
                    {process.owner_department ? (
                        <span className="text-xs text-slate-500">{process.owner_department}</span>
                    ) : null}
                </div>
            ),
        },
        {
            key: 'mtpd_hours',
            label: t('columns.mtpd'),
            className: 'w-[90px]',
            render: (process) => (
                <span className="text-sm text-slate-300 tabular-nums">
                    {process.mtpd_hours ?? '—'}
                </span>
            ),
        },
        {
            key: 'preliminary_criticality',
            label: t('columns.preliminary_criticality'),
            render: (process) =>
                process.preliminary_criticality ? (
                    <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                            CRITICALITY_PILLS[process.preliminary_criticality] ??
                            'text-slate-300 bg-slate-400/10 border-slate-400/20'
                        }`}
                    >
                        {process.preliminary_criticality}
                    </span>
                ) : (
                    <span className="text-sm text-slate-500">—</span>
                ),
        },
        {
            key: 'cif_override',
            label: t('columns.cif_override'),
            className: 'w-[110px]',
            render: (process) => (
                <span className="text-sm text-slate-300">{process.cif_override ?? '—'}</span>
            ),
        },
        {
            key: 'status',
            label: t('columns.status'),
            className: 'w-[130px]',
            render: (process) => {
                const status = getProcessDisplayStatus(process);
                return (
                    <div className="flex items-center gap-2">
                        <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${getProcessStatusColor(status)}`}
                        >
                            {t(`status.${status}`)}
                        </span>
                        {status === 'archived' && canRestoreProcess(process) ? (
                            <button
                                type="button"
                                data-testid={`process-restore-${process.id}`}
                                onClick={(event) => void onRestore(process.id, event)}
                                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                                title={t('actions.restore')}
                            >
                                <ArchiveRestore className="h-4 w-4" />
                            </button>
                        ) : null}
                    </div>
                );
            },
        },
        {
            key: 'chevron',
            label: '',
            className: 'w-[40px]',
            render: () => <ChevronRight className="h-4 w-4 text-slate-600" />,
        },
    ];
}
