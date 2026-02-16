import { type ReactNode, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { DocumentationEntry } from '@/services/adminApi';

interface DocumentationMarkdownProps {
    content: string;
    currentDoc: DocumentationEntry;
    docs: DocumentationEntry[];
    onOpenDoc: (docId: string, anchor?: string) => void;
    onNavigateApp: (path: string) => void;
}

const EXTERNAL_PREFIXES = ['http://', 'https://', 'mailto:'];

function textFromChildren(children: ReactNode): string {
    if (typeof children === 'string') return children;
    if (typeof children === 'number') return String(children);
    if (Array.isArray(children)) return children.map(textFromChildren).join(' ');
    if (children && typeof children === 'object' && 'props' in children) {
        const childProps = (children as { props?: { children?: ReactNode } }).props;
        if (childProps?.children !== undefined) {
            return textFromChildren(childProps.children);
        }
    }
    return '';
}

function slugifyHeading(input: string): string {
    return input
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

function normalizeAnchor(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    const normalized = raw.replace(/^#/, '').trim();
    return normalized || undefined;
}

function isExternalHref(href: string): boolean {
    const lower = href.toLowerCase();
    return EXTERNAL_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function resolveDocTarget(href: string, docsBySlug: Map<string, DocumentationEntry>): DocumentationEntry | null {
    const base = href.split('#', 1)[0].split('?', 1)[0].trim();
    if (!base) return null;

    const normalized = base.replace(/\\/g, '/');
    const filename = normalized.split('/').pop() ?? '';
    if (!filename.toLowerCase().endsWith('.md')) {
        return null;
    }

    const slug = filename.slice(0, -3).toLowerCase();
    return docsBySlug.get(slug) ?? null;
}

function scrollToAnchor(anchor: string): void {
    const target = document.getElementById(anchor);
    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

export function DocumentationMarkdown({
    content,
    currentDoc,
    docs,
    onOpenDoc,
    onNavigateApp,
}: DocumentationMarkdownProps) {
    const docsBySlug = useMemo(() => {
        const map = new Map<string, DocumentationEntry>();
        for (const doc of docs) {
            map.set(doc.slug.toLowerCase(), doc);
        }
        return map;
    }, [docs]);

    const headingCounts = new Map<string, number>();
    const nextHeadingId = (text: string) => {
        const base = slugifyHeading(text) || 'section';
        const count = headingCounts.get(base) ?? 0;
        headingCounts.set(base, count + 1);
        return count === 0 ? base : `${base}-${count + 1}`;
    };

    const makeHeading =
        (tag: keyof Pick<JSX.IntrinsicElements, 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'>) =>
        ({ children }: { children?: ReactNode }) => {
            const headingText = textFromChildren(children).trim();
            const id = nextHeadingId(headingText);
            const Tag = tag;

            return (
                <Tag id={id}>
                    <a href={`#${id}`} className="no-underline" aria-label={`Anchor link for ${headingText}`}>
                        {children}
                    </a>
                </Tag>
            );
        };

    const components: Components = {
        h1: makeHeading('h1'),
        h2: makeHeading('h2'),
        h3: makeHeading('h3'),
        h4: makeHeading('h4'),
        h5: makeHeading('h5'),
        h6: makeHeading('h6'),
        a: ({ href, children, ...props }) => {
            if (!href) {
                return <span>{children}</span>;
            }

            const anchor = normalizeAnchor(href.includes('#') ? href.split('#')[1] : undefined);
            const docTarget = resolveDocTarget(href, docsBySlug);

            if (docTarget) {
                return (
                    <a
                        {...props}
                        href={href}
                        onClick={(event) => {
                            event.preventDefault();
                            if (docTarget.id === currentDoc.id && anchor) {
                                scrollToAnchor(anchor);
                                return;
                            }
                            onOpenDoc(docTarget.id, anchor);
                        }}
                    >
                        {children}
                    </a>
                );
            }

            if (href.startsWith('#')) {
                return (
                    <a
                        {...props}
                        href={href}
                        onClick={(event) => {
                            event.preventDefault();
                            const targetAnchor = normalizeAnchor(href);
                            if (targetAnchor) {
                                scrollToAnchor(targetAnchor);
                            }
                        }}
                    >
                        {children}
                    </a>
                );
            }

            if (href.startsWith('/')) {
                return (
                    <a
                        {...props}
                        href={href}
                        onClick={(event) => {
                            event.preventDefault();
                            onNavigateApp(href);
                        }}
                    >
                        {children}
                    </a>
                );
            }

            if (isExternalHref(href)) {
                return (
                    <a {...props} href={href} target="_blank" rel="noopener noreferrer">
                        {children}
                    </a>
                );
            }

            return <a {...props} href={href}>{children}</a>;
        },
    };

    return (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {content}
        </ReactMarkdown>
    );
}
