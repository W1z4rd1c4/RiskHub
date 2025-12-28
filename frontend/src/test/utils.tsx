/**
 * Test utilities and custom render wrapper.
 */
import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { FilterProvider } from '@/contexts/FilterContext';

/**
 * All providers wrapper for tests.
 */
function AllProviders({ children }: { children: React.ReactNode }) {
    return (
        <BrowserRouter>
            <AuthProvider>
                <FilterProvider>
                    {children}
                </FilterProvider>
            </AuthProvider>
        </BrowserRouter>
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
