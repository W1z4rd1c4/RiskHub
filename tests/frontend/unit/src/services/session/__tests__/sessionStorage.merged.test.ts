import { beforeEach, describe, expect, it } from 'vitest';

import {
    clearExplicitLogoutSuppressed,
    clearRefreshSessionHint,
    hasRefreshSessionHint,
    isExplicitLogoutSuppressed,
    setExplicitLogoutSuppressed,
} from '@/services/session/sessionStorage';

beforeEach(() => clearExplicitLogoutSuppressed());

describe('sessionStorage merged module', () => {
    it('exposes refreshHint helpers', () => {
        expect(typeof hasRefreshSessionHint).toBe('function');
        expect(typeof clearRefreshSessionHint).toBe('function');
    });

    it('exposes logoutSuppression helpers', () => {
        setExplicitLogoutSuppressed();
        expect(isExplicitLogoutSuppressed()).toBe(true);
        clearExplicitLogoutSuppressed();
        expect(isExplicitLogoutSuppressed()).toBe(false);
    });
});
