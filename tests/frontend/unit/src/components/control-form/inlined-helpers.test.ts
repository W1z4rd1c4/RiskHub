import { describe, expect, it } from 'vitest';

import { ApiClientError } from '@/services/apiClient';

describe('inlined formatFrequencyLabel (in ControlFormExecutionStep)', () => {
    it('keeps the execution step module loadable', async () => {
        const mod = await import('@/components/control-form/ControlFormExecutionStep');
        expect(typeof mod.ControlFormExecutionStep).toBe('function');
    });
});

describe('inlined getControlFormErrorKey (in useControlFormWorkflow & useControlFormLookups)', () => {
    it('preserves the ApiClientError messageKey contract used by the inlined helpers', () => {
        const err = new ApiClientError({
            status: 422,
            code: 'VALIDATION_ERROR',
            messageKey: 'errorKeys.validation',
            rawMessage: '...',
        });

        expect(err.messageKey).toBe('errorKeys.validation');
    });
});
