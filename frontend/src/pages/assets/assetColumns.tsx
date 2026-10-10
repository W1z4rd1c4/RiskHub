import type { MouseEvent } from 'react';

import { PendingChangeBadge } from '@/components/approvals/PendingChangeBadge';
import { CriticalityClassPill } from '@/components/ict-register/CriticalityClassPill';
import type { Column } from '@/components/tables/SortableTable';
import { RowRestoreButton } from '@/components/tables/RowRestoreButton';
import { Badge } from '@/components/ui/badge';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { Tone } from '@/lib/tones';
import type { Asset } from '@/types/asset';

import { assetDepartmentDisplay, assetDerivedBooleanLabel, assetDerivedCriticalityLabel, assetOwnerDisplayName, getAssetDisplayStatus, type AssetDisplayStatus } from './assetsPagePresentation';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type BuildAssetColumnsParams = {
    t: TranslateFn;
    onRestore: (assetId: number, event: MouseEvent) => void | Promise<void>;
    canRestoreAsset: (asset: Asset) => boolean;
};

/** Lifecycle status tone (D1): active reads success, archived neutral. */
export function getAssetStatusTone(status: AssetDisplayStatus): Tone {
    return status === 'archived' ? 'neutral' : 'success';
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
                    <span className="text-sm font-bold text-foreground">{asset.name}</span>
                    {asset.asset_level ? (
                        <span className="text-xs text-muted-foreground">{t(`assets:values.asset_level.${asset.asset_level}`)}</span>
                    ) : null}
                </div>
            ),
        },
        {
            key: 'asset_type',
            label: t('assets:columns.asset_type'),
            sortable: true,
            render: (asset) => <span className="text-sm text-foreground">{asset.asset_type ? t(`assets:values.asset_type.${asset.asset_type}`) : '—'}</span>,
        },
        {
            key: 'business_owner',
            label: t('assets:columns.owner'),
            render: (asset) => (
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-foreground">{assetOwnerDisplayName(asset.business_owner) ?? t('assets:detail.unknown_owner')}</span>
                    {assetDepartmentDisplay(asset) ? (
                        <span className="text-xs text-muted-foreground">{assetDepartmentDisplay(asset)}</span>
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
                <span className="text-sm text-foreground">
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
                <span className="text-sm text-foreground">{asset.lifecycle_state ? t(`assets:values.lifecycle_state.${asset.lifecycle_state}`) : '—'}</span>
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
                            <Badge tone={getAssetStatusTone(status)}>{t(`assets:status.${status}`)}</Badge>
                            {resolveCapabilityFlag(asset.capabilities, 'has_pending_change') ? (
                                <PendingChangeBadge data-testid={`asset-pending-change-${asset.id}`} />
                            ) : null}
                        </div>
                        {status === 'archived' && canRestoreAsset(asset) ? (
                            <RowRestoreButton
                                itemName={asset.name}
                                data-testid={`asset-restore-${asset.id}`}
                                onClick={(event) => void onRestore(asset.id, event)}
                            />
                        ) : null}
                    </div>
                );
            },
        },
    ];
}
