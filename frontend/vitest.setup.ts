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
afterEach(() => {
    if (typeof localStorage !== 'undefined') {
        localStorage.clear();
    }
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
