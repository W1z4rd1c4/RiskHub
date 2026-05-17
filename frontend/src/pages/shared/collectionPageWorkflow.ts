import { useCallback } from 'react';

import { loadCollectionPage } from '@/services/collectionApi';
import type { CollectionCapabilities, CollectionListResponse } from '@/types/collection';

import {
    type CollectionLoadFailureOptions,
    useCollectionDataState,
    useCollectionPageController,
} from './collectionPageState';

export interface CollectionWorkflowLoadRequest {
    currentPage: number;
    groupBy?: string | null;
    groupValue?: string | null;
}

interface UseCollectionPageWorkflowOptions<TItem, TCapabilities extends object> extends CollectionLoadFailureOptions {
    currentPage: number;
    groupBy?: string | null;
    loadPage: (request: CollectionWorkflowLoadRequest) => Promise<CollectionListResponse<TItem, TCapabilities>>;
    normalizeItems?: (items: TItem[]) => TItem[];
    onLoadError?: (error: unknown) => void;
}

export function useCollectionPageWorkflow<
    TItem,
    TCapabilities extends object = CollectionCapabilities,
>({
    clearOnNonForbidden,
    currentPage,
    fallbackErrorKey,
    groupBy,
    loadPage,
    normalizeItems,
    onLoadError,
    toErrorKey,
}: UseCollectionPageWorkflowOptions<TItem, TCapabilities>) {
    const collectionData = useCollectionDataState<TItem, TCapabilities>();
    const controller = useCollectionPageController();
    const {
        applyFailure,
        applySuccess,
        setIsLoading,
    } = collectionData;
    const {
        beginRequest,
        isCurrentRequest,
        selectedGroupValue,
    } = controller;

    const fetchCollection = useCallback(async () => {
        const requestId = beginRequest();
        try {
            setIsLoading(true);

            const response = await loadCollectionPage({
                currentPage,
                groupBy,
                selectedGroupValue,
                loadPage,
                normalizeItems,
            });
            if (!isCurrentRequest(requestId)) {
                return;
            }
            applySuccess(response);
        } catch (error) {
            onLoadError?.(error);
            if (isCurrentRequest(requestId)) {
                applyFailure(error, {
                    clearOnNonForbidden,
                    fallbackErrorKey,
                    toErrorKey,
                });
            }
        } finally {
            if (isCurrentRequest(requestId)) {
                setIsLoading(false);
            }
        }
    }, [
        applyFailure,
        applySuccess,
        beginRequest,
        clearOnNonForbidden,
        currentPage,
        fallbackErrorKey,
        groupBy,
        isCurrentRequest,
        loadPage,
        normalizeItems,
        onLoadError,
        selectedGroupValue,
        setIsLoading,
        toErrorKey,
    ]);

    return {
        ...collectionData,
        ...controller,
        fetchCollection,
    };
}
