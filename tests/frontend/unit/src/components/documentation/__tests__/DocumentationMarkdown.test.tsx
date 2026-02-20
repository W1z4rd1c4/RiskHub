import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DocumentationMarkdown } from '@/components/documentation';
import { stripDuplicateLeadingTitle } from '@/components/documentation/contentFormatting';
import type { DocumentationEntry } from '@/services/adminApi';

const originalScrollIntoView = Element.prototype.scrollIntoView;
let scrollIntoViewMock = vi.fn();

const makeDoc = (overrides: Partial<DocumentationEntry> = {}): DocumentationEntry => ({
    id: 'doc-1',
    slug: 'doc-1',
    title: 'Test Doc',
    summary: null,
    version: null,
    last_updated: null,
    source_of_truth: null,
    content: '',
    audience: 'user',
    tags: [],
    ...overrides,
});

describe('DocumentationMarkdown', () => {
    beforeEach(() => {
        scrollIntoViewMock = vi.fn();
        Object.defineProperty(Element.prototype, 'scrollIntoView', {
            configurable: true,
            value: scrollIntoViewMock,
        });
    });

    afterEach(() => {
        Object.defineProperty(Element.prototype, 'scrollIntoView', {
            configurable: true,
            value: originalScrollIntoView,
        });
    });

    it('renders heading text without making the heading itself a link', () => {
        render(
            <DocumentationMarkdown
                content="# Přehled"
                currentDoc={makeDoc()}
                docs={[makeDoc()]}
                onOpenDoc={vi.fn()}
                onNavigateApp={vi.fn()}
            />,
        );

        const heading = screen.getByRole('heading', { level: 1 });
        expect(heading).toHaveTextContent('Přehled');
        expect(within(heading).queryByRole('link', { name: 'Přehled' })).not.toBeInTheDocument();
        expect(within(heading).getByRole('link', { name: 'Anchor link for Přehled' })).toBeInTheDocument();
    });

    it('keeps anchor link affordance and in-document scroll behavior', async () => {
        render(
            <DocumentationMarkdown
                content={'# Details\n\nSee [Jump](#details).'}
                currentDoc={makeDoc()}
                docs={[makeDoc()]}
                onOpenDoc={vi.fn()}
                onNavigateApp={vi.fn()}
            />,
        );

        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByRole('link', { name: 'Anchor link for Details' }));
        await uiUser.click(screen.getByRole('link', { name: 'Jump' }));

        expect(scrollIntoViewMock).toHaveBeenCalled();
    });

    it('supports diacritic anchors by normalizing to heading ids', async () => {
        render(
            <DocumentationMarkdown
                content={'# Přehled\n\nSee [Jump](#Přehled).'}
                currentDoc={makeDoc()}
                docs={[makeDoc()]}
                onOpenDoc={vi.fn()}
                onNavigateApp={vi.fn()}
            />,
        );

        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByRole('link', { name: 'Jump' }));

        expect(scrollIntoViewMock).toHaveBeenCalled();
    });

    it('generates unsuffixed id for first heading occurrence', () => {
        render(
            <DocumentationMarkdown
                content={'## Přehled'}
                currentDoc={makeDoc()}
                docs={[makeDoc()]}
                onOpenDoc={vi.fn()}
                onNavigateApp={vi.fn()}
            />,
        );

        const heading = screen.getByRole('heading', { level: 2 });
        expect(heading).toHaveAttribute('id', 'prehled');
        expect(heading).not.toHaveAttribute('id', 'prehled-2');
    });

    it('resolves toc hash links against generated heading ids', async () => {
        render(
            <DocumentationMarkdown
                content={'**On this page**\n- [Přehled](#prehled)\n\n## Přehled'}
                currentDoc={makeDoc()}
                docs={[makeDoc()]}
                onOpenDoc={vi.fn()}
                onNavigateApp={vi.fn()}
            />,
        );

        const uiUser = userEvent.setup();
        scrollIntoViewMock.mockClear();
        await uiUser.click(screen.getByRole('link', { name: 'Přehled' }));

        expect(scrollIntoViewMock).toHaveBeenCalled();
    });

    it('generates deterministic suffixes for duplicate headings', () => {
        render(
            <DocumentationMarkdown
                content={'## Troubleshooting\n\nText\n\n## Troubleshooting'}
                currentDoc={makeDoc()}
                docs={[makeDoc()]}
                onOpenDoc={vi.fn()}
                onNavigateApp={vi.fn()}
            />,
        );

        const headings = document.querySelectorAll('h2');
        expect(headings[0]).toHaveAttribute('id', 'troubleshooting');
        expect(headings[1]).toHaveAttribute('id', 'troubleshooting-2');
    });
});

describe('stripDuplicateLeadingTitle', () => {
    it('strips the first markdown H1 when it matches the document title', () => {
        const content = '# Activity Log\n\nBody paragraph.\n\n## Details';
        expect(stripDuplicateLeadingTitle(content, 'Activity Log')).toBe('Body paragraph.\n\n## Details');
    });

    it('keeps markdown content when first H1 does not match title', () => {
        const content = '# Activity Log\n\nBody paragraph.';
        expect(stripDuplicateLeadingTitle(content, 'Controls Guide')).toBe(content);
    });

    it('matches title comparison in a diacritic-insensitive way', () => {
        const content = '# Přehled změn\n\nObsah.';
        expect(stripDuplicateLeadingTitle(content, 'Prehled zmen')).toBe('Obsah.');
    });
});
