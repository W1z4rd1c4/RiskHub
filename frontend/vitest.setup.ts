import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';

class StorageMock {
    private store = new Map<string, string>();

    getItem(key: string) {
        return this.store.has(key) ? this.store.get(key)! : null;
    }

    setItem(key: string, value: string) {
        this.store.set(key, String(value));
    }

    removeItem(key: string) {
        this.store.delete(key);
    }

    clear() {
        this.store.clear();
    }
}

const ensureStorage = (name: 'localStorage' | 'sessionStorage') => {
    const target = typeof window !== 'undefined' ? window : globalThis;
    // Avoid reading `target[name]` directly: in newer Node versions this can trigger
    // the built-in WebStorage getter and emit warnings.
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    if (descriptor && descriptor.configurable === false) {
        return;
    }

    Object.defineProperty(target, name, {
        value: new StorageMock(),
        configurable: true,
    });
};

ensureStorage('localStorage');
ensureStorage('sessionStorage');

// Radix UI Select relies on Pointer Events + pointer capture APIs which are not
// implemented in JSDOM. Provide minimal no-op polyfills for test environment.
if (typeof HTMLElement !== 'undefined') {
    if (typeof HTMLElement.prototype.hasPointerCapture !== 'function') {
        HTMLElement.prototype.hasPointerCapture = () => false;
    }
    if (typeof HTMLElement.prototype.setPointerCapture !== 'function') {
        HTMLElement.prototype.setPointerCapture = () => {};
    }
    if (typeof HTMLElement.prototype.releasePointerCapture !== 'function') {
        HTMLElement.prototype.releasePointerCapture = () => {};
    }
}

// JSDOM doesn't implement scrollIntoView; Radix Select calls it when opening.
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = () => {};
}

afterEach(async () => {
    cleanup();
    if (typeof localStorage !== 'undefined') {
        localStorage.clear();
    }
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear();
    }
    const sessionStore = await import('./src/services/sessionStore');
    sessionStore.__resetSessionStoreForTests();
    // Clear auth config cache between tests to avoid cross-test leakage.
    const mod = await import('./src/services/authConfig');
    mod.clearAuthConfigCache();
    const queryClientMod = await import('../tests/frontend/unit/src/test/queryClient');
    await queryClientMod.cleanupTestQueryClients();
});

let mswServer:
    | {
        listen: (options?: unknown) => void;
        resetHandlers: () => void;
        close: () => void;
    }
    | null = null;

beforeAll(async () => {
    // Import MSW server lazily so our localStorage mock is installed first.
    const mod = await import('@test/mocks/server');
    mswServer = mod.server;
    mswServer.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => mswServer?.resetHandlers());
afterAll(() => mswServer?.close());
