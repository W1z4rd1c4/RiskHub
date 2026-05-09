/**
 * Shared React Testing Library render helpers.
 */
// One-time i18n singleton init for the unit-test process. Tests that call
// i18n.changeLanguage should reset it to "en" in their own afterAll hook.
import '@/i18n';

import React, { ReactElement, useState } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/contexts/AuthContext';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';
import { createTestQueryClient } from './queryClient';

function AllProviders({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(createTestQueryClient);

    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <AuthProvider>
                    <DashboardFilterProvider>
                        {children}
                    </DashboardFilterProvider>
                </AuthProvider>
            </BrowserRouter>
        </QueryClientProvider>
    );
}

function customRender(
    ui: ReactElement,
    options?: Omit<RenderOptions, 'wrapper'>,
) {
    return render(ui, { wrapper: AllProviders, ...options });
}

function renderWithQueryClient(
    ui: ReactElement,
    {
        queryClient = createTestQueryClient(),
        ...options
    }: Omit<RenderOptions, 'wrapper'> & { queryClient?: QueryClient } = {},
) {
    function QueryClientWrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    return render(ui, { wrapper: QueryClientWrapper, ...options });
}

function renderWithoutProviders(
    ui: ReactElement,
    options?: RenderOptions,
) {
    return render(ui, options);
}

export * from '@testing-library/react';
export { userEvent } from '@testing-library/user-event';
export { customRender as render };
export { renderWithoutProviders };
export { renderWithQueryClient };
