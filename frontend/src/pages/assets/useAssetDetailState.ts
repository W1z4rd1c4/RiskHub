import { useCallback } from 'react';
import { useParams } from 'react-router-dom';

import { resolveCapabilityFlag } from '@/lib/capabilities';
import { useDetailQuery } from '@/pages/detail/useDetailQuery';
import { logError } from '@/services/logger';
import { assetApi } from '@/services/assetApi';
import type { Asset } from '@/types/asset';

export type AssetDetailMode = 'view' | 'new' | 'edit';

interface UseAssetDetailStateOptions {
    mode: AssetDetailMode;
}

export function useAssetDetailState({ mode }: UseAssetDetailStateOptions) {
    const { id } = useParams<{ id: string }>();

    const {
        isRetrying,
        loadOutcome,
        refetch: fetchAsset,
        resource: asset,
        resourceId: assetId,
        setResource: setAsset,
    } = useDetailQuery<Asset>({
        enabled: mode !== 'new',
        entity: 'asset',
        rawId: id,
        load: (assetId) => assetApi.getAsset(assetId),
    });

    const restoreAsset = useCallback(async () => {
        if (!asset) {
            return;
        }
        try {
            await assetApi.restoreAsset(asset.id);
            await fetchAsset();
        } catch (restoreError) {
            logError('Error restoring asset:', restoreError);
        }
    }, [fetchAsset, asset]);

    return {
        canArchive: resolveCapabilityFlag(asset?.capabilities, 'can_archive'),
        canEdit: resolveCapabilityFlag(asset?.capabilities, 'can_update'),
        canRestore: resolveCapabilityFlag(asset?.capabilities, 'can_restore'),
        fetchAsset,
        isRetrying,
        loadOutcome,
        asset,
        assetId,
        restoreAsset,
        setAsset,
    };
}
