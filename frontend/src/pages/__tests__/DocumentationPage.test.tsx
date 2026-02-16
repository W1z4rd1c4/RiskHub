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
const originalScrollTo = HTMLElement.prototype.scrollTo;
let scrollToMock = vi.fn();

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

const linkedDocsPayload = {
    documents: [
        makeDoc({
            id: 'admin_getting-started',
            slug: 'getting-started',
            title: 'Getting Started with RiskHub',
            content: '# Getting Started with RiskHub\nSee [User Management](./user-management.md).',
            tags: ['onboarding'],
        }),
        makeDoc({
            id: 'admin_user-management',
            slug: 'user-management',
            title: 'User Management',
            content: '# User Management\nDetails.',
            tags: ['users'],
        }),
    ],
};

const tocDocsPayload = {
    documents: [
        makeDoc({
            id: 'admin_getting-started',
            slug: 'getting-started',
            title: 'Getting Started with RiskHub',
            content: '**On this page**\n- [Where To Find It](#where-to-find-it)\n\n## Where To Find It\nSection.',
            tags: ['onboarding'],
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
        scrollToMock = vi.fn();
        Object.defineProperty(Element.prototype, 'scrollIntoView', {
            configurable: true,
            value: scrollIntoViewMock,
        });
        Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
            configurable: true,
            value: scrollToMock,
        });
    });

    afterEach(() => {
        localStorage.clear();
        Object.defineProperty(Element.prototype, 'scrollIntoView', {
            configurable: true,
            value: originalScrollIntoView,
        });
        Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
            configurable: true,
            value: originalScrollTo,
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

    it('resets reader scroll to top when opening linked markdown documents', async () => {
        server.use(
            http.get('*/api/v1/admin/docs', () => HttpResponse.json(linkedDocsPayload)),
        );

        renderDocumentationPage();

        const uiUser = userEvent.setup();
        await uiUser.click(await screen.findByRole('button', { name: /Getting Started with RiskHub/i }));
        await screen.findByTestId('admin-doc-content-scroll');
        scrollToMock.mockClear();

        await uiUser.click(await screen.findByRole('link', { name: 'User Management' }));

        expect(await screen.findByRole('heading', { level: 2, name: 'User Management' })).toBeInTheDocument();
        expect(scrollToMock).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
        expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
    });

    it('scrolls to toc target when clicking in-document toc link', async () => {
        server.use(
            http.get('*/api/v1/admin/docs', () => HttpResponse.json(tocDocsPayload)),
        );

        renderDocumentationPage();

        const uiUser = userEvent.setup();
        await uiUser.click(await screen.findByRole('button', { name: /Getting Started with RiskHub/i }));
        scrollToMock.mockClear();
        scrollIntoViewMock.mockClear();

        await uiUser.click(await screen.findByRole('link', { name: 'Where To Find It' }));

        expect(scrollToMock).toHaveBeenCalledWith({ top: expect.any(Number), left: 0, behavior: 'smooth' });
        expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    });
});
