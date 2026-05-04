import { getLinkedTargetId } from './linkModes';
import type { ExistingLinkItem, LinkMode } from './linkTypes';

export const LINK_SEARCH_DEBOUNCE_MS = 300;

export interface LinkManagementSearchState {
    includeArchived: boolean;
    searchQuery: string;
    selectedCategory: string;
    selectedDeptId: number | null;
    selectedProcess: string;
    selectedTargetId: number | null;
}

export const emptyLinkManagementSearchState: LinkManagementSearchState = {
    includeArchived: false,
    searchQuery: '',
    selectedCategory: '',
    selectedDeptId: null,
    selectedProcess: '',
    selectedTargetId: null,
};

export function buildLinkedTargetIdSet(existingLinks: ExistingLinkItem[], mode: LinkMode): Set<number | undefined> {
    return new Set(existingLinks.map((link) => getLinkedTargetId(link, mode)));
}

export function shouldResetLinkSearchState(wasOpen: boolean, isOpen: boolean): boolean {
    return wasOpen && !isOpen;
}

export function resetLinkPaginationOnSearch({ page }: { page: number }): { page: number } {
    void page;
    return { page: 1 };
}

export function resolveLinkActionOutcome({ ok }: { action: 'link' | 'unlink' | 'unarchive'; ok: boolean }) {
    return {
        shouldClose: ok,
        shouldRefresh: ok,
    };
}
