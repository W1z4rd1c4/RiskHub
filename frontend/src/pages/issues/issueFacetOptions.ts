import type { CollectionFacetOption } from '@/types/collection';
import type { IssueSeverityFilter, IssueStatus } from '@/types/issue';

import { ISSUE_SEVERITIES, ISSUE_STATUSES } from './issuesPagePresentation';

function canonicalFacetOptions(
    options: CollectionFacetOption[] | undefined,
    values: readonly string[],
    selectedValue: string,
): CollectionFacetOption[] {
    const byValue = new Map((options ?? []).map((option) => [option.value, option]));
    return values.map((value) => {
        const option = byValue.get(value);
        const count = option?.count ?? 0;
        return {
            value,
            label: option?.label ?? value,
            count,
            selected: selectedValue === value || option?.selected === true,
            // Respect server authority and keep absent/zero-result values visible
            // but unavailable. A selected zero-result value remains represented
            // by its chip so the user can remove it or clear all filters.
            disabled: option?.disabled === true || count === 0,
        };
    });
}

export function issueStatusFacetOptions(
    options: CollectionFacetOption[] | undefined,
    selectedValue: IssueStatus | '',
): CollectionFacetOption[] {
    return canonicalFacetOptions(options, ISSUE_STATUSES, selectedValue);
}

export function issueSeverityFacetOptions(
    options: CollectionFacetOption[] | undefined,
    selectedValue: IssueSeverityFilter | '',
): CollectionFacetOption[] {
    return [
        ...canonicalFacetOptions(options, ISSUE_SEVERITIES, selectedValue),
        ...canonicalFacetOptions(options, ['high_critical'], selectedValue),
    ];
}
