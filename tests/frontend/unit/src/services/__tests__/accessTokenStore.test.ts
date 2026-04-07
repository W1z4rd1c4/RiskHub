import { afterEach, describe, expect, it } from 'vitest';

import { clearAccessToken, getAccessToken, setAccessToken, subscribeAccessToken } from '@test/accessTokenStoreHarness';

type TokenWindow = Window & {
    __RISKHUB_ACCESS_TOKEN__?: string | null;
};

function hasLegacyWindowToken(): boolean {
    return Object.prototype.hasOwnProperty.call(window, '__RISKHUB_ACCESS_TOKEN__');
}

afterEach(() => {
    clearAccessToken();
    delete (window as TokenWindow).__RISKHUB_ACCESS_TOKEN__;
});

describe('accessTokenStore', () => {
    it('keeps RiskHub access tokens module-scoped instead of exposing them on window', () => {
        clearAccessToken();
        delete (window as TokenWindow).__RISKHUB_ACCESS_TOKEN__;

        expect(getAccessToken()).toBeNull();
        expect(hasLegacyWindowToken()).toBe(false);

        setAccessToken('riskhub-jwt');

        expect(getAccessToken()).toBe('riskhub-jwt');
        expect(hasLegacyWindowToken()).toBe(false);
        expect((window as TokenWindow).__RISKHUB_ACCESS_TOKEN__).toBeUndefined();

        clearAccessToken();

        expect(getAccessToken()).toBeNull();
        expect(hasLegacyWindowToken()).toBe(false);
        expect((window as TokenWindow).__RISKHUB_ACCESS_TOKEN__).toBeUndefined();
    });

    it('notifies subscribers when the token changes', () => {
        const seen: Array<string | null> = [];
        const unsubscribe = subscribeAccessToken((token) => {
            seen.push(token);
        });

        setAccessToken('riskhub-jwt');
        clearAccessToken();
        unsubscribe();
        setAccessToken('ignored-after-unsubscribe');

        expect(seen).toEqual(['riskhub-jwt', null]);
    });
});
