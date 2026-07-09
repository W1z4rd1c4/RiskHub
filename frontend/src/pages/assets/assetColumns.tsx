import type { MouseEvent } from 'react';
import { ArchiveRestore, ChevronRight } from 'lucide-react';

import type { Column } from '@/components/tables/SortableTable';
import type { Asset } from '@/types/asset';

import { getAssetDisplayStatus, type AssetDisplayStatus } from './assetsPagePresentation';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type BuildAssetColumnsParams = {
    t: TranslateFn;
    onRestore: (assetId: number, event: MouseEvent) => void | Promise<void>;
    canRestoreAsset: (asset: Asset) => boolean;
};

export function getAssetStatusColor(status: AssetDisplayStatus): string {
    return status === 'archived' ? 'text-slate-400 bg-slate-400/10' : 'text-emerald-400 bg-emerald-400/10';
}

const CRITICALITY_PILLS: Record<string, string> = {
    ['Nízká']: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    ['Střední']: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    ['Vysoká']: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
    ['Kritická']: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
};

export function buildAssetColumns({
    t,
    onRestore,
    canRestoreAsset,
}: BuildAssetColumnsParams): Column<Asset>[] {
    return [
        {
            key: 'name',
            label: t('columns.name'),
            sortable: true,
            className: 'w-[300px] min-w-[220px]',
            render: (asset) => (
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-bold text-white">{asset.name}</span>
                    {asset.asset_level ? (
                        <span className="text-xs text-slate-500">{asset.asset_level}</span>
                    ) : null}
                </div>
            ),
        },
        {
            key: 'asset_type',
            label: t('columns.asset_type'),
            sortable: true,
            render: (asset) => <span className="text-sm text-slate-300">{asset.asset_type ?? '—'}</span>,
        },
        {
            key: 'business_owner',
            label: t('columns.owner'),
            render: (asset) => (
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-slate-300">{asset.business_owner ?? '—'}</span>
                    {asset.owner_department ? (
                        <span className="text-xs text-slate-500">{asset.owner_department}</span>
                    ) : null}
                </div>
            ),
        },
        {
            key: 'preliminary_criticality',
            label: t('columns.preliminary_criticality'),
            render: (asset) =>
                asset.preliminary_criticality ? (
                    <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                            CRITICALITY_PILLS[asset.preliminary_criticality] ??
                            'text-slate-300 bg-slate-400/10 border-slate-400/20'
                        }`}
                    >
                        {asset.preliminary_criticality}
                    </span>
                ) : (
                    <span className="text-sm text-slate-500">—</span>
                ),
        },
        {
            key: 'lifecycle_state',
            label: t('columns.lifecycle_state'),
            sortable: true,
            className: 'w-[130px]',
            render: (asset) => (
                <span className="text-sm text-slate-300">{asset.lifecycle_state ?? '—'}</span>
            ),
        },
        {
            key: 'status',
            label: t('columns.status'),
            className: 'w-[130px]',
            render: (asset) => {
                const status = getAssetDisplayStatus(asset);
                return (
                    <div className="flex items-center gap-2">
                        <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${getAssetStatusColor(status)}`}
                        >
                            {t(`status.${status}`)}
                        </span>
                        {status === 'archived' && canRestoreAsset(asset) ? (
                            <button
                                type="button"
                                data-testid={`asset-restore-${asset.id}`}
                                onClick={(event) => void onRestore(asset.id, event)}
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
