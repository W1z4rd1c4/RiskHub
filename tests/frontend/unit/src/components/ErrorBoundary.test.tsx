import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { Outlet } from 'react-router-dom';

type RouteDef = {
    key: string;
    path?: string;
    index?: boolean;
    element: ReactElement;
};

function ThrowingChild() {
    throw new Error('route crashed');
}

function HealthyChild() {
    return <div>Healthy route</div>;
}

async function renderAppAt(
    path: string,
    routes: {
        publicRoutes?: RouteDef[];
        protectedAppRoutes?: RouteDef[];
    },
) {
    window.history.pushState({}, '', path);
    vi.resetModules();
    vi.doMock('@/contexts/AuthContext', () => ({
        AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
        useAuth: () => ({
            isAuthenticated: true,
            isLoading: false,
            isPreferencesHydrated: true,
            bootstrapStatus: 'ready',
        }),
    }));
    vi.doMock('@/contexts/ThemeContext', () => ({
        ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
    }));
    vi.doMock('@/contexts/DashboardFilterContext', () => ({
        DashboardFilterProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
    }));
    vi.doMock('@/components/layout', () => ({
        MainLayout: () => (
            <main data-testid="app-layout">
                <Outlet />
            </main>
        ),
    }));
    vi.doMock('@/i18n/hooks', () => ({
        useTranslation: () => ({
            t: (key: string) => key,
        }),
    }));
    vi.doMock('@/routing', () => ({
        publicRoutes: routes.publicRoutes ?? [],
        protectedAppRoutes: routes.protectedAppRoutes ?? [],
    }));

    const { default: App } = await import('@/App');
    return render(<App />);
}

describe('ErrorBoundary', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
        window.history.pushState({}, '', '/');
    });

    it('renders_fallback_when_child_route_throws', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { ErrorBoundary } = await import('@/components/ErrorBoundary');

        render(
            <ErrorBoundary resetKey="stable">
                <ThrowingChild />
            </ErrorBoundary>,
        );

        expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i);
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('renders_fallback_when_public_route_throws', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await renderAppAt('/login', {
            publicRoutes: [{ key: 'login', path: 'login', element: <ThrowingChild /> }],
        });

        expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i);
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('renders_fallback_when_protected_child_route_throws', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await renderAppAt('/controls', {
            protectedAppRoutes: [{ key: 'controls', path: 'controls', element: <ThrowingChild /> }],
        });

        expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i);
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('resets_error_on_location_change', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await renderAppAt('/broken', {
            publicRoutes: [
                { key: 'broken', path: 'broken', element: <ThrowingChild /> },
                { key: 'healthy', path: 'healthy', element: <HealthyChild /> },
            ],
        });

        expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i);

        act(() => {
            window.history.pushState({}, '', '/healthy');
            window.dispatchEvent(new PopStateEvent('popstate'));
        });

        expect(await screen.findByText('Healthy route')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});
