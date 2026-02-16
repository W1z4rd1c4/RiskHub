import { type ComponentPropsWithoutRef, type ReactNode, useMemo } from 'react';
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

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

interface MarkdownNodeWithPosition {
    position?: {
        start?: {
            line?: number;
        };
    };
}

type HeadingComponentProps = ComponentPropsWithoutRef<'h1'> & {
    children?: ReactNode;
    node?: MarkdownNodeWithPosition;
};

const EXTERNAL_PREFIXES = ['http://', 'https://', 'mailto:'];
const MARKDOWN_HEADING_PATTERN = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const MARKDOWN_FENCE_PATTERN = /^\s{0,3}(```+|~~~+)/;

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

function buildHeadingIdMap(content: string): Map<number, string> {
    const lines = content.split(/\r?\n/);
    const headingIdByLine = new Map<number, string>();
    const slugCounts = new Map<string, number>();

    let inFrontmatter = false;
    let frontmatterHandled = false;
    let inFence = false;
    let fenceMarker = '';

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const lineNumber = index + 1;
        const trimmed = line.trim();

        if (!frontmatterHandled && index === 0 && trimmed === '---') {
            inFrontmatter = true;
            continue;
        }
        if (inFrontmatter) {
            if (trimmed === '---') {
                inFrontmatter = false;
                frontmatterHandled = true;
            }
            continue;
        }
        frontmatterHandled = true;

        const fenceMatch = trimmed.match(MARKDOWN_FENCE_PATTERN);
        if (fenceMatch) {
            const marker = fenceMatch[1][0];
            if (!inFence) {
                inFence = true;
                fenceMarker = marker;
            } else if (marker === fenceMarker) {
                inFence = false;
                fenceMarker = '';
            }
            continue;
        }
        if (inFence) {
            continue;
        }

        const headingMatch = line.match(MARKDOWN_HEADING_PATTERN);
        if (!headingMatch) {
            continue;
        }

        const headingText = headingMatch[2].trim();
        const baseSlug = slugifyHeading(headingText) || 'section';
        const nextCount = (slugCounts.get(baseSlug) ?? 0) + 1;
        slugCounts.set(baseSlug, nextCount);

        const id = nextCount === 1 ? baseSlug : `${baseSlug}-${nextCount}`;
        headingIdByLine.set(lineNumber, id);
    }

    return headingIdByLine;
}

function normalizeAnchor(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    const normalized = raw.replace(/^#/, '').trim();
    if (!normalized) return undefined;
    try {
        const decoded = decodeURIComponent(normalized);
        return slugifyHeading(decoded) || slugifyHeading(normalized) || decoded || normalized;
    } catch {
        return slugifyHeading(normalized) || normalized;
    }
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

function resolveSameDocumentAnchor(href: string): string | undefined {
    if (!href) return undefined;
    if (href.startsWith('#')) {
        return normalizeAnchor(href);
    }

    try {
        const parsed = new URL(href, window.location.href);
        const current = new URL(window.location.href);
        if (parsed.origin === current.origin && parsed.pathname === current.pathname && parsed.hash) {
            return normalizeAnchor(parsed.hash);
        }
    } catch {
        // Ignore malformed URL-like values and let other handlers process them.
    }

    return undefined;
}

function resolveAnchorCandidates(anchor: string): string[] {
    const candidates = new Set<string>();
    const trimmed = anchor.trim();
    if (!trimmed) return [];

    candidates.add(trimmed);
    try {
        const decoded = decodeURIComponent(trimmed);
        if (decoded) {
            candidates.add(decoded);
            const sluggedDecoded = slugifyHeading(decoded);
            if (sluggedDecoded) candidates.add(sluggedDecoded);
        }
    } catch {
        // Keep best-effort behavior for partially encoded anchors.
    }

    const slugged = slugifyHeading(trimmed);
    if (slugged) candidates.add(slugged);
    return Array.from(candidates);
}

function scrollToAnchor(anchor: string): void {
    const target = resolveAnchorCandidates(anchor)
        .map((candidate) => document.getElementById(candidate))
        .find((element): element is HTMLElement => Boolean(element));

    if (target) {
        const scrollContainer = target.closest<HTMLElement>('[data-doc-scroll-container="true"]');
        if (scrollContainer) {
            const targetTop = target.offsetTop - scrollContainer.offsetTop - 12;
            scrollContainer.scrollTo({
                top: Math.max(0, targetTop),
                left: 0,
                behavior: 'smooth',
            });
        }
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
    const headingIdByLine = useMemo(() => buildHeadingIdMap(content), [content]);

    const docsBySlug = useMemo(() => {
        const map = new Map<string, DocumentationEntry>();
        for (const doc of docs) {
            map.set(doc.slug.toLowerCase(), doc);
        }
        return map;
    }, [docs]);

    const makeHeading = (tag: HeadingTag) => ({ children, node }: HeadingComponentProps) => {
            const headingText = textFromChildren(children).trim();
            const sourceLine = node?.position?.start?.line;
            const id = (typeof sourceLine === 'number' ? headingIdByLine.get(sourceLine) : undefined)
                ?? (slugifyHeading(headingText) || 'section');
            const Tag = tag;
            const anchorLabel = headingText
                ? `Anchor link for ${headingText}`
                : 'Anchor link for section';

            return (
                <Tag id={id} className="group scroll-mt-24">
                    <span>{children}</span>
                    <a
                        href={`#${id}`}
                        className="docs-heading-anchor"
                        aria-label={anchorLabel}
                        onClick={(event) => {
                            event.preventDefault();
                            scrollToAnchor(id);
                        }}
                    >
                        <span aria-hidden="true">#</span>
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

            const sameDocumentAnchor = resolveSameDocumentAnchor(href);
            if (sameDocumentAnchor) {
                return (
                    <a
                        {...props}
                        href={href}
                        onClick={(event) => {
                            event.preventDefault();
                            scrollToAnchor(sameDocumentAnchor);
                        }}
                    >
                        {children}
                    </a>
                );
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
