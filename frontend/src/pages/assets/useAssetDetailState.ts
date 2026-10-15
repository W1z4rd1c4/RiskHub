import { useProtectedDetailState } from '@/pages/detail/useProtectedDetailState';
import { assetApi } from '@/services/assetApi';
import type { Asset } from '@/types/asset';

export type AssetDetailMode = 'view' | 'new' | 'edit';

export function useAssetDetailState({ mode }: { mode: AssetDetailMode }) {
    const {
        isRetrying, loadOutcome, refetch: fetchAsset, resource: asset, resourceId: assetId,
        restoreRecord: restoreAsset, canArchive, canEdit, canRestore, setResource: setAsset,
    } = useProtectedDetailState<Asset>({
        mode, entity: 'asset',
        load: (id, signal) => assetApi.getAsset(id, { signal }),
        restore: (id) => assetApi.restoreAsset(id), name: (record) => record.name,
    });

    return {
        canArchive, canEdit, canRestore, fetchAsset, isRetrying, loadOutcome,
        asset, assetId, restoreAsset, setAsset,
    };
}
