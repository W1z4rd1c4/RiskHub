/** Advisory backend facts only: no local CIF, criticality or tier inference. */
export type GovernedReasonRequirement = 'required' | 'optional' | 'unavailable';
export interface GovernedReasonRecord {
    capabilities?: { protected_change_requires_approval?: boolean } | null;
}

export function governedReasonRequirement(...records: Array<GovernedReasonRecord | null | undefined>): GovernedReasonRequirement {
    return governedReasonRequirementFromFlags(...records.map((record) => record?.capabilities?.protected_change_requires_approval));
}

export function governedReasonRequirementFromFlags(...flags: Array<boolean | undefined>): GovernedReasonRequirement {
    if (flags.some((flag) => flag === true)) return 'required';
    if (!flags.length || flags.some((flag) => flag !== false)) return 'unavailable';
    return 'optional';
}
