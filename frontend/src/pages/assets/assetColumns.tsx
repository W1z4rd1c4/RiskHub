import type { MouseEvent } from 'react';
import { ArchiveRestore } from 'lucide-react';

import { CriticalityClassPill } from '@/components/ict-register/CriticalityClassPill';
import type { Column } from '@/components/tables/SortableTable';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { Asset } from '@/types/asset';

import { assetDepartmentDisplay, assetDerivedBooleanLabel, assetDerivedCriticalityLabel, assetOwnerDisplayName, getAssetDisplayStatus, type AssetDisplayStatus } from './assetsPagePresentation';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type BuildAssetColumnsParams = {
    t: TranslateFn;
    onRestore: (assetId: number, event: MouseEvent) => void | Promise<void>;
    canRestoreAsset: (asset: Asset) => boolean;
};

export function getAssetStatusColor(status: AssetDisplayStatus): string {
    return status === 'archived' ? 'text-muted-foreground bg-muted' : 'text-success-text bg-success/10';
}

export function buildAssetColumns({
    t,
    onRestore,
    canRestoreAsset,
}: BuildAssetColumnsParams): Column<Asset>[] {
    return [
        {
            key: 'name',
            label: t('assets:columns.name'),
            sortable: true,
            className: 'w-[300px] min-w-[220px]',
            render: (asset) => (
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-bold text-white">{asset.name}</span>
                    {asset.asset_level ? (
                        <span className="text-xs text-slate-500">{t(`assets:values.asset_level.${asset.asset_level}`)}</span>
                    ) : null}
                </div>
            ),
        },
        {
            key: 'asset_type',
            label: t('assets:columns.asset_type'),
            sortable: true,
            render: (asset) => <span className="text-sm text-slate-300">{asset.asset_type ? t(`assets:values.asset_type.${asset.asset_type}`) : '—'}</span>,
        },
        {
            key: 'business_owner',
            label: t('assets:columns.owner'),
            render: (asset) => (
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-slate-300">{assetOwnerDisplayName(asset.business_owner) ?? t('assets:detail.unknown_owner')}</span>
                    {assetDepartmentDisplay(asset) ? (
                        <span className="text-xs text-slate-500">{assetDepartmentDisplay(asset)}</span>
                    ) : null}
                </div>
            ),
        },
        {
            // Engine-derived resulting criticality (vysledna, ticket #48) — read-only.
            key: 'derived_resulting_criticality',
            label: t('assets:columns.resulting_criticality'),
            render: (asset) => (
                <CriticalityClassPill
                    criticalityClass={asset.derived?.resulting_criticality}
                    displayValue={assetDerivedCriticalityLabel(t, asset.derived?.resulting_criticality)}
                />
            ),
        },
        {
            // Engine-derived CIF support (ticket #48) — read-only.
            key: 'derived_cif',
            label: t('assets:columns.cif'),
            className: 'w-[90px]',
            render: (asset) => (
                <span className="text-sm text-slate-300">
                    {assetDerivedBooleanLabel(t, asset.derived?.cif) ?? '—'}
                </span>
            ),
        },
        {
            key: 'lifecycle_state',
            label: t('assets:columns.lifecycle_state'),
            sortable: true,
            className: 'w-[130px]',
            render: (asset) => (
                <span className="text-sm text-slate-300">{asset.lifecycle_state ? t(`assets:values.lifecycle_state.${asset.lifecycle_state}`) : '—'}</span>
            ),
        },
        {
            key: 'status',
            label: t('assets:columns.status'),
            className: 'w-[130px]',
            render: (asset) => {
                const status = getAssetDisplayStatus(asset);
                return (
                    <div className="flex items-center gap-2">
                        <div className="flex flex-col items-start gap-1">
                            <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${getAssetStatusColor(status)}`}
                            >
                                {t(`assets:status.${status}`)}
                            </span>
                            {resolveCapabilityFlag(asset.capabilities, 'has_pending_change') ? (
                                <span
                                    data-testid={`asset-pending-change-${asset.id}`}
                                    className="inline-flex items-center rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-bold text-amber-200"
                                >
                                    {t('assets:pending_change.badge')}
                                </span>
                            ) : null}
                        </div>
                        {status === 'archived' && canRestoreAsset(asset) ? (
                            <button
                                type="button"
                                data-testid={`asset-restore-${asset.id}`}
                                onClick={(event) => void onRestore(asset.id, event)}
                                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                                aria-label={t('assets:actions.restore')}
                                title={t('assets:actions.restore')}
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
