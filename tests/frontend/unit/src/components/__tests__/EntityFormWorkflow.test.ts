import { describe, expect, it } from 'vitest';

import {
    nextEntityFormStep,
    previousEntityFormStep,
    resolveSubmitOutcome,
} from '@/components/forms/entityFormWorkflow';

describe('entity form workflow', () => {
    it('keeps wizard steps within bounds', () => {
        expect(nextEntityFormStep({ currentStep: 1, maxStep: 3 })).toBe(2);
        expect(nextEntityFormStep({ currentStep: 3, maxStep: 3 })).toBe(3);
        expect(previousEntityFormStep({ currentStep: 1 })).toBe(0);
        expect(previousEntityFormStep({ currentStep: 3 })).toBe(2);
        expect(previousEntityFormStep({ currentStep: 3, minStep: 2 })).toBe(2);
    });

    it('maps approval queued submit outcomes without changing modal state', () => {
        expect(resolveSubmitOutcome({ approvalQueued: true })).toEqual({
            shouldClose: false,
            shouldRefresh: true,
            approvalQueued: true,
        });
    });

});
