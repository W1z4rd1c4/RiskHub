/**
 * Test utilities and custom render wrapper.
 */
import React, { ReactElement, useState } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/contexts/AuthContext';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';
import { createTestQueryClient } from './queryClient';

/**
 * All providers wrapper for tests.
 */
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

/**
 * Custom render with all providers.
 */
function customRender(
    ui: ReactElement,
    options?: Omit<RenderOptions, 'wrapper'>
) {
    return render(ui, { wrapper: AllProviders, ...options });
}

// Re-export everything from testing-library
export * from '@testing-library/react';
export { userEvent } from '@testing-library/user-event';

// Override default render with custom render
export { customRender as render };
