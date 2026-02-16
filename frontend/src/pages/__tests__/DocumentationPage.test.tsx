import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';

import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { DocumentationPage } from '@/pages/DocumentationPage';
import { server } from '@/test/mocks/server';

const makeDoc = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'admin_getting-started',
    slug: 'getting-started',
    title: 'Getting Started with RiskHub',
    summary: 'Admin onboarding guide.',
    version: '2.0',
    last_updated: '2026-02-16',
    source_of_truth: 'docs/BUSINESS_LOGIC.md',
    content: '# Getting Started with RiskHub\nSee [Risk register](/risks), [External policy](https://example.com), and [Jump to details](#details).\n\n## Details\nAnchor target section.',
    audience: 'admin',
    tags: ['onboarding', 'basics'],
    ...overrides,
});

const originalScrollIntoView = Element.prototype.scrollIntoView;
let scrollIntoViewMock = vi.fn();

const docsPayload = {
    documents: [
        makeDoc(),
        makeDoc({
            id: 'admin_user-management',
            slug: 'user-management',
            title: 'User Management',
            summary: 'User governance guide.',
            content: '# User Management\nUse this guide for access governance.',
            tags: ['users'],
        }),
    ],
};

function renderDocumentationPage(initialRoute: string = '/admin/docs') {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[initialRoute]}>
                <AuthProvider>
                    <ThemeProvider>
                        <Routes>
                            <Route path="/admin/docs" element={<DocumentationPage />} />
                            <Route path="/risks" element={<div data-testid="risks-route">Risks Route</div>} />
                        </Routes>
                    </ThemeProvider>
                </AuthProvider>
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

describe('DocumentationPage', () => {
    beforeEach(() => {
        localStorage.clear();
        scrollIntoViewMock = vi.fn();
        Object.defineProperty(Element.prototype, 'scrollIntoView', {
            configurable: true,
            value: scrollIntoViewMock,
        });
    });

    afterEach(() => {
        localStorage.clear();
        Object.defineProperty(Element.prototype, 'scrollIntoView', {
            configurable: true,
            value: originalScrollIntoView,
        });
    });

    it('navigates app routes when markdown link targets app path', async () => {
        server.use(
            http.get('*/api/v1/admin/docs', () => HttpResponse.json(docsPayload)),
        );

        renderDocumentationPage();

        const uiUser = userEvent.setup();
        await uiUser.click(await screen.findByRole('button', { name: /Getting Started with RiskHub/i }));
        await uiUser.click(await screen.findByRole('link', { name: 'Risk register' }));

        expect(await screen.findByTestId('risks-route')).toBeInTheDocument();
    });

    it('renders external links with secure new-tab attributes', async () => {
        server.use(
            http.get('*/api/v1/admin/docs', () => HttpResponse.json(docsPayload)),
        );

        renderDocumentationPage();

        const uiUser = userEvent.setup();
        await uiUser.click(await screen.findByRole('button', { name: /Getting Started with RiskHub/i }));

        const externalLink = await screen.findByRole('link', { name: 'External policy' });
        expect(externalLink).toHaveAttribute('target', '_blank');
        expect(externalLink).toHaveAttribute('rel', expect.stringContaining('noopener'));
        expect(externalLink).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
    });

    it('scrolls to in-document anchor links', async () => {
        server.use(
            http.get('*/api/v1/admin/docs', () => HttpResponse.json(docsPayload)),
        );

        renderDocumentationPage();

        const uiUser = userEvent.setup();
        await uiUser.click(await screen.findByRole('button', { name: /Getting Started with RiskHub/i }));
        await uiUser.click(await screen.findByRole('link', { name: 'Jump to details' }));

        expect(scrollIntoViewMock).toHaveBeenCalled();
    });
});
