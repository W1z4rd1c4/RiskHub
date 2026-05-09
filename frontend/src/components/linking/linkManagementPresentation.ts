import { resolveCapabilityFlag } from '@/lib/capabilities';

import {
    getExistingLinkDisplayName,
    getExistingLinkTargetId,
    getMetadataBadgeClassName,
} from './existingLinksPresentation';
import { getResultMeta, getResultTitle } from './linkSearchPresentation';
import type { ExistingLinkItem, LinkMode, SearchResultItem } from './linkTypes';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export interface LinkSearchResultPresentation {
    canUnarchive: boolean;
    isArchived: boolean;
    primaryMeta: string | null | undefined;
    secondaryMeta: string | null | undefined;
    title: string | null | undefined;
    unarchiveLabel: string;
}

export interface ExistingLinkPresentation {
    displayName: string;
    metadataBadgeClassName: string;
    targetId: number;
}

export function buildLinkSearchResultPresentation(
    mode: LinkMode,
    result: SearchResultItem,
    t: TranslateFn,
): LinkSearchResultPresentation {
    const meta = getResultMeta(mode, result, t);
    const isArchived = result.is_archived === true;

    return {
        canUnarchive: isArchived && resolveCapabilityFlag(result.capabilities, 'can_restore'),
        isArchived,
        primaryMeta: meta.primary,
        secondaryMeta: meta.secondary,
        title: getResultTitle(mode, result),
        unarchiveLabel: t('actions.unarchive'),
    };
}

export function buildExistingLinkPresentation(
    link: ExistingLinkItem,
    mode: LinkMode,
    t: TranslateFn,
): ExistingLinkPresentation {
    return {
        displayName: getExistingLinkDisplayName(link, mode, t),
        metadataBadgeClassName: getMetadataBadgeClassName(link.effectiveness),
        targetId: getExistingLinkTargetId(link, mode),
    };
}
