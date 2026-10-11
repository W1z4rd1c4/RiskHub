import { describe, expect, it } from 'vitest';
import { governedReasonRequirement } from '@/lib/governedReasonRequirement';
import { processBusinessEditBlocked } from '@/pages/processes/processProtectedEdit';
import type { Process } from '@/types/process';

describe('backend reason facts', () => {
    it.each([true, false])('uses the capability even when displayed classification disagrees (%s)', (required) => {
        const process = { capabilities: { protected_change_requires_approval: required }, derived: { cif: required ? 'no' : 'yes' } } as Process;
        expect(governedReasonRequirement(process)).toBe(required ? 'required' : 'optional');
    });
    it('keeps missing projections unavailable and never infers mutation permission', () => {
        expect(governedReasonRequirement(undefined)).toBe('unavailable');
        expect(governedReasonRequirement({})).toBe('unavailable');
        expect(processBusinessEditBlocked(undefined)).toBe(false);
        expect(processBusinessEditBlocked({ capabilities: { business_edit_blocked: true } } as Process)).toBe(true);
    });
    it('requires reason if any participant says true, otherwise needs every actual participant', () => {
        const yes = { capabilities: { protected_change_requires_approval: true } };
        const no = { capabilities: { protected_change_requires_approval: false } };
        expect(governedReasonRequirement(no, yes, undefined)).toBe('required');
        expect(governedReasonRequirement(no, undefined)).toBe('unavailable');
        expect(governedReasonRequirement(no, no)).toBe('optional');
        expect(governedReasonRequirement()).toBe('unavailable');
    });
});
