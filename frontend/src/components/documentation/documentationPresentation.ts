import type { DocumentationEntry } from '@/services/admin/adminTypes';

export function isUserManual(doc: DocumentationEntry | null | undefined): boolean {
    return doc?.audience === 'user';
}

export function getMaintainerReference(doc: DocumentationEntry | null | undefined): string | null {
    if (!doc || isUserManual(doc)) {
        return null;
    }
    return doc.source_of_truth || null;
}

export function shouldShowRawVersion(doc: DocumentationEntry | null | undefined): boolean {
    return Boolean(doc && !isUserManual(doc) && doc.version);
}

export function formatDocumentationTag(tag: string): string {
    return tag
        .split(/[-_]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

/** Test-id / id safe form of a documentation tag (`Exports & Reports` -> `exports-reports`). */
export function sanitizeDocumentationTag(tag: string): string {
    return tag.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Reading typography for rendered manuals (DS-32): the `prose` recipe bound to the
 * theme tokens, so a manual follows dark, riskhub and light without per-theme CSS.
 * Replaces the hex-based `.docs-reader-prose` rules in `index.css`.
 */
export const DOCUMENTATION_PROSE_CLASS = [
    'prose max-w-none text-base leading-[1.8] text-foreground',
    'prose-headings:text-foreground prose-strong:font-bold prose-strong:text-foreground',
    'prose-p:text-foreground prose-li:text-foreground prose-blockquote:text-foreground',
    'prose-li:marker:text-muted-foreground',
    'prose-a:text-accent-text prose-a:decoration-[1.5px]',
    'prose-code:text-foreground',
    'prose-pre:border prose-pre:border-border prose-pre:bg-nested prose-pre:text-foreground',
    'prose-table:border prose-table:border-border',
    'prose-th:bg-muted prose-th:p-2 prose-th:text-foreground prose-th:border-border',
    'prose-td:border-t prose-td:border-border prose-td:p-2 prose-td:text-foreground',
].join(' ');
