import { describe, expect, it } from 'vitest';

import { resolveCapability, resolveCapabilityFlag } from '@/lib/capabilities';

describe('capability resolution helpers', () => {
    it('lets backend capability metadata override local fallbacks', () => {
        expect(resolveCapability(false, true)).toBe(false);
        expect(resolveCapability(true, false)).toBe(true);
    });

    it('falls back to local permission logic only when metadata is absent', () => {
        expect(resolveCapability(undefined, true)).toBe(true);
        expect(resolveCapability(null, false)).toBe(false);
    });

    it('resolves named capability flags from optional capability objects', () => {
        expect(resolveCapabilityFlag({ can_update: false }, 'can_update', true)).toBe(false);
        expect(resolveCapabilityFlag(null, 'can_update', true)).toBe(true);
    });

    it('supports shaped capability interfaces without string index signatures', () => {
        interface ExampleCapabilities {
            can_update: boolean;
            can_restore?: boolean | null;
        }

        const capabilities: ExampleCapabilities = {
            can_update: false,
            can_restore: null,
        };

        expect(resolveCapabilityFlag(capabilities, 'can_update', true)).toBe(false);
        expect(resolveCapabilityFlag(capabilities, 'can_restore', true)).toBe(true);
    });

    it('falls back defensively when a capability field is not boolean', () => {
        expect(resolveCapabilityFlag({ can_update: 'yes' }, 'can_update', false)).toBe(false);
    });
});
