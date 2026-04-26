import { describe, expect, it } from 'vitest';

import { resolveCapability, resolveCapabilityFlag } from '@/lib/capabilities';

describe('capability resolution helpers', () => {
    it('resolves backend boolean capability metadata strictly', () => {
        expect(resolveCapability(false)).toBe(false);
        expect(resolveCapability(true)).toBe(true);
    });

    it('denies when backend capability metadata is absent', () => {
        expect(resolveCapability(undefined)).toBe(false);
        expect(resolveCapability(null)).toBe(false);
    });

    it('resolves named capability flags from optional capability objects', () => {
        expect(resolveCapabilityFlag({ can_update: true }, 'can_update')).toBe(true);
        expect(resolveCapabilityFlag({ can_update: false }, 'can_update')).toBe(false);
        expect(resolveCapabilityFlag(null, 'can_update')).toBe(false);
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

        expect(resolveCapabilityFlag(capabilities, 'can_update')).toBe(false);
        expect(resolveCapabilityFlag(capabilities, 'can_restore')).toBe(false);
    });

    it('denies defensively when a capability field is not boolean', () => {
        expect(resolveCapabilityFlag({ can_update: 'yes' }, 'can_update')).toBe(false);
    });
});
