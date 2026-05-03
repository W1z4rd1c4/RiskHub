import type { CollectionGroup } from '@/types/collection';

export interface RegisterGroupPresentationDefinition {
    fallbackLabel?: string;
    groupLabel?: (group: CollectionGroup) => string;
    hideActive?: boolean;
    hideHighlighted?: boolean;
}

export interface RegisterGroupCardModel {
    activeCount: number | null;
    count: number;
    group: CollectionGroup;
    highlightedCount: number | null;
    label: string;
    showActive: boolean;
    showHighlighted: boolean;
    value: string;
}

export function buildRegisterGroupCards(
    groups: CollectionGroup[],
    definition: RegisterGroupPresentationDefinition = {},
): RegisterGroupCardModel[] {
    return groups.map((group) => buildRegisterGroupCard(group, definition));
}

function buildRegisterGroupCard(
    group: CollectionGroup,
    definition: RegisterGroupPresentationDefinition,
): RegisterGroupCardModel {
    const activeCount = group.active_count ?? null;
    const highlightedCount = group.highlighted_count ?? null;

    return {
        activeCount,
        count: group.count,
        group,
        highlightedCount,
        label: resolveGroupLabel(group, definition),
        showActive: !definition.hideActive && activeCount !== null,
        showHighlighted: !definition.hideHighlighted && highlightedCount !== null && highlightedCount > 0,
        value: group.value,
    };
}

function resolveGroupLabel(group: CollectionGroup, definition: RegisterGroupPresentationDefinition): string {
    const label = definition.groupLabel ? definition.groupLabel(group) : group.label;
    if (label.trim()) {
        return label;
    }
    if (/^\d+$/.test(group.value)) {
        return definition.fallbackLabel ?? 'Unknown group';
    }
    return group.value || definition.fallbackLabel || 'Unknown group';
}
