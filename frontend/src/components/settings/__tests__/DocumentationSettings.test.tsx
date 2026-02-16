import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';

import { server } from '@/test/mocks/server';
import { AuthProvider } from '@/contexts/AuthContext';
import { DocumentationSettings } from '@/components/settings/DocumentationSettings';

const makeUser = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 123,
    email: 'test.user@riskhub.test',
    name: 'Test User',
    role: 'admin',
    role_display_name: 'Administrator',
    permissions: ['*:*'],
    effective_permissions: ['*:*'],
    access_scope: 'global',
    scope_label: 'all',
    ...overrides,
});

const makeDoc = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'admin_getting-started',
    slug: 'getting-started',
    title: 'Getting Started with RiskHub',
    summary: 'Admin onboarding guide.',
    version: '2.0',
    last_updated: '2026-02-16',
    source_of_truth: 'docs/BUSINESS_LOGIC.md',
    content: '# Getting Started with RiskHub\nAdmin onboarding guide.',
    audience: 'admin',
    tags: ['onboarding', 'basics'],
    ...overrides,
});

const adminDocsPayload = {
    documents: [
        makeDoc(),
        makeDoc({
            id: 'admin_reports',
            slug: 'reports',
            title: 'Reports & Exports',
            summary: 'Admin reporting guide.',
            content: '# Reports & Exports\nAdmin reporting guide.',
            tags: ['reports', 'exports'],
        }),
        makeDoc({
            id: 'admin_user-management',
            slug: 'user-management',
            title: 'User Management',
            summary: 'Admin users guide.',
            content: '# User Management\nAdmin users guide.',
            tags: ['users', 'access'],
        }),
    ],
};

const userDocsPayload = {
    documents: [
        makeDoc({
            id: 'user_getting-started',
            slug: 'getting-started',
            title: 'Getting Started with RiskHub',
            summary: 'User onboarding guide.',
            content: '# Getting Started with RiskHub\nUser onboarding guide.',
            audience: 'user',
            tags: ['onboarding', 'basics'],
        }),
    ],
};

const linkedDocsPayload = {
    documents: [
        makeDoc({
            id: 'admin_getting-started',
            slug: 'getting-started',
            title: 'Getting Started with RiskHub',
            summary: 'Guide with cross-document link.',
            content: '# Getting Started with RiskHub\nSee [User Management](./user-management.md) for access updates.',
            audience: 'admin',
            tags: ['onboarding'],
        }),
        makeDoc({
            id: 'admin_user-management',
            slug: 'user-management',
            title: 'User Management',
            summary: 'Detailed access governance guide.',
            content: '# User Management\nThis is the user management manual.',
            audience: 'admin',
            tags: ['users'],
        }),
    ],
};

function renderDocumentationSettings() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <AuthProvider>
                    <DocumentationSettings />
                </AuthProvider>
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

describe('DocumentationSettings', () => {
    beforeEach(() => {
        localStorage.setItem('access_token', 'test-token');
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('renders audience label and tags on document cards', async () => {
        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(makeUser({ role: 'admin' }))),
            http.get('*/api/v1/admin/docs', () => HttpResponse.json(adminDocsPayload)),
        );

        renderDocumentationSettings();

        await screen.findByTestId('settings-doc-card-admin_getting-started');
        expect(screen.getByTestId('settings-docs-audience')).toHaveTextContent('Admin documentation');
        expect(screen.getByTestId('settings-doc-tag-admin_getting-started-onboarding')).toBeInTheDocument();
        expect(screen.getByTestId('settings-doc-tag-admin_reports-reports')).toBeInTheDocument();
    });

    it('filters visible documents by selected tag', async () => {
        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(makeUser({ role: 'admin' }))),
            http.get('*/api/v1/admin/docs', () => HttpResponse.json(adminDocsPayload)),
        );

        renderDocumentationSettings();

        await screen.findByTestId('settings-doc-card-admin_getting-started');
        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByTestId('settings-docs-filter-reports'));

        expect(screen.getByTestId('settings-doc-card-admin_reports')).toBeInTheDocument();
        expect(screen.queryByTestId('settings-doc-card-admin_getting-started')).not.toBeInTheDocument();
        expect(screen.queryByTestId('settings-doc-card-admin_user-management')).not.toBeInTheDocument();
    });

    it('opens linked markdown documents in-reader', async () => {
        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(makeUser({ role: 'admin' }))),
            http.get('*/api/v1/admin/docs', () => HttpResponse.json(linkedDocsPayload)),
        );

        renderDocumentationSettings();

        const uiUser = userEvent.setup();
        await uiUser.click(await screen.findByTestId('settings-doc-card-admin_getting-started'));
        await uiUser.click(await screen.findByRole('link', { name: 'User Management' }));

        expect(await screen.findByRole('heading', { level: 2, name: 'User Management' })).toBeInTheDocument();
    });

    it('shows user audience label for non-admin docs payload', async () => {
        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(makeUser({ role: 'employee' }))),
            http.get('*/api/v1/admin/docs', () => HttpResponse.json(userDocsPayload)),
        );

        renderDocumentationSettings();

        await screen.findByTestId('settings-doc-card-user_getting-started');
        expect(screen.getByTestId('settings-docs-audience')).toHaveTextContent('User documentation');
    });
});
