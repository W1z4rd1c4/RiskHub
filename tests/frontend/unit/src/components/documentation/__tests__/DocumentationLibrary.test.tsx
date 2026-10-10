import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { DocumentationLibrary, DocumentationReader } from '@/components/documentation';
import type { DocumentationEntry } from '@/services/admin/adminTypes';

const makeDoc = (overrides: Partial<DocumentationEntry> = {}): DocumentationEntry => ({
    id: 'admin_getting-started',
    slug: 'getting-started',
    title: 'Getting Started',
    summary: 'Onboarding guide.',
    version: '2.0',
    last_updated: '2026-02-16',
    source_of_truth: 'docs/BUSINESS_LOGIC.md',
    content: '# Getting Started\nSee [Policy](https://example.com).',
    audience: 'admin',
    tags: ['onboarding', 'Exports & Reports'],
    ...overrides,
});

describe('DocumentationLibrary (shared by the admin page and the Settings tab, SM-10)', () => {
    function renderLibrary(testIdPrefix: string, onOpenDoc = vi.fn(), onSelectTag = vi.fn()) {
        const docs = [makeDoc(), makeDoc({ id: 'admin_users', slug: 'users', title: 'Users', tags: ['access'] })];
        render(
            <DocumentationLibrary
                docs={docs}
                filteredDocs={docs}
                availableTags={['access', 'Exports & Reports', 'onboarding']}
                selectedTag="onboarding"
                onSelectTag={onSelectTag}
                onOpenDoc={onOpenDoc}
                testIdPrefix={testIdPrefix}
                emptyTitle="Nothing"
                emptyDescription="Nothing yet"
            />,
        );
        return { onOpenDoc, onSelectTag };
    }

    it.each(['admin', 'settings'])('prefixes its test ids with %s and exposes pressed-state tag filters', async (prefix) => {
        const { onOpenDoc, onSelectTag } = renderLibrary(prefix);
        const user = userEvent.setup();

        expect(screen.getByTestId(`${prefix}-docs-filter-all`)).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByTestId(`${prefix}-docs-filter-onboarding`)).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId(`${prefix}-docs-filter-exports-reports`)).toBeInTheDocument();
        expect(screen.getByTestId(`${prefix}-doc-tag-admin_getting-started-exports-reports`)).toBeInTheDocument();

        await user.click(screen.getByTestId(`${prefix}-docs-filter-access`));
        expect(onSelectTag).toHaveBeenCalledWith('access');

        // The card is one control named by the manual title, not a button wrapping the whole card.
        const card = screen.getByTestId(`${prefix}-doc-card-admin_users`);
        expect(card.tagName).toBe('BUTTON');
        expect(card).toHaveAccessibleName('Users');
        await user.click(card);
        expect(onOpenDoc).toHaveBeenCalledWith('admin_users');
    });

    it('tells "no manuals at all" from "no manual for this tag"', () => {
        const { rerender } = render(
            <DocumentationLibrary
                docs={[]}
                filteredDocs={[]}
                availableTags={[]}
                selectedTag="all"
                onSelectTag={() => {}}
                onOpenDoc={() => {}}
                testIdPrefix="admin"
                emptyTitle="Nothing"
                emptyDescription="Nothing yet"
            />,
        );
        expect(screen.getByText('Nothing')).toBeInTheDocument();

        rerender(
            <DocumentationLibrary
                docs={[makeDoc()]}
                filteredDocs={[]}
                availableTags={['onboarding']}
                selectedTag="onboarding"
                onSelectTag={() => {}}
                onOpenDoc={() => {}}
                testIdPrefix="admin"
                emptyTitle="Nothing"
                emptyDescription="Nothing yet"
            />,
        );
        expect(screen.queryByText('Nothing')).not.toBeInTheDocument();
        expect(screen.getByText('No matching documents')).toBeInTheDocument();
    });
});

describe('DocumentationReader (DS-32: theme tokens instead of docs-reader hex rules)', () => {
    it('renders the meta chips and the manual body on token classes only', () => {
        const doc = makeDoc();
        const { container } = render(
            <MemoryRouter>
                <DocumentationReader
                    doc={doc}
                    docs={[doc]}
                    content={'# Getting Started\n\nBody text.'}
                    audienceLabel="Admin documentation"
                    onOpenDoc={() => {}}
                    scrollRef={createRef<HTMLDivElement>()}
                    testIdPrefix="admin"
                />
            </MemoryRouter>,
        );

        expect(screen.getByTestId('admin-docs-audience')).toHaveTextContent('Admin documentation');
        expect(screen.getByText('v2.0')).toBeInTheDocument();
        expect(screen.getByText(/Maintainer reference:/)).toHaveTextContent('docs/BUSINESS_LOGIC.md');
        expect(screen.getByTestId('admin-doc-content-scroll')).toHaveAttribute('data-doc-scroll-container', 'true');
        expect(container.innerHTML).not.toMatch(/docs-reader-|docs-heading-anchor/);
        expect(container.querySelector('article')?.className).toContain('prose-headings:text-foreground');
    });
});
