import { afterEach, describe, expect, it } from 'vitest';

import { clearAuthConfigCache } from '@/services/authConfig';
import { isStrictCapabilitiesEnabled, setStrictCapabilitiesEnabled } from '@/services/capabilityFlags';

describe('auth config strict capability cache state', () => {
    afterEach(() => {
        clearAuthConfigCache();
    });

    it('resets strict capabilities when clearing cached auth config', () => {
        setStrictCapabilitiesEnabled(true);

        clearAuthConfigCache();

        expect(isStrictCapabilitiesEnabled()).toBe(false);
    });
});
