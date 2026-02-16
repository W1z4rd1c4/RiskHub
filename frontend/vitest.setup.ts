import '@testing-library/jest-dom/vitest';

class LocalStorageMock {
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

const ensureLocalStorage = () => {
    const target = typeof window !== 'undefined' ? window : globalThis;
    // Avoid reading `target.localStorage` directly: in newer Node versions this can trigger
    // the built-in WebStorage getter and emit warnings.
    const descriptor = Object.getOwnPropertyDescriptor(target, 'localStorage');
    if (descriptor && descriptor.configurable === false) {
        return;
    }

    Object.defineProperty(target, 'localStorage', {
        value: new LocalStorageMock(),
        configurable: true,
    });
};

ensureLocalStorage();

// Radix UI Select relies on Pointer Events + pointer capture APIs which are not
// implemented in JSDOM. Provide minimal no-op polyfills for test environment.
if (typeof HTMLElement !== 'undefined') {
    if (typeof HTMLElement.prototype.hasPointerCapture !== 'function') {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        HTMLElement.prototype.hasPointerCapture = () => false;
    }
    if (typeof HTMLElement.prototype.setPointerCapture !== 'function') {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        HTMLElement.prototype.setPointerCapture = () => {};
    }
    if (typeof HTMLElement.prototype.releasePointerCapture !== 'function') {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        HTMLElement.prototype.releasePointerCapture = () => {};
    }
}

// JSDOM doesn't implement scrollIntoView; Radix Select calls it when opening.
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    Element.prototype.scrollIntoView = () => {};
}

afterEach(async () => {
    if (typeof localStorage !== 'undefined') {
        localStorage.clear();
    }
    // Clear auth config cache between tests to avoid cross-test leakage.
    const mod = await import('./src/services/authConfig');
    mod.clearAuthConfigCache();
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
    const mod = await import('./src/test/mocks/server');
    mswServer = mod.server;
    mswServer.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => mswServer?.resetHandlers());
afterAll(() => mswServer?.close());
