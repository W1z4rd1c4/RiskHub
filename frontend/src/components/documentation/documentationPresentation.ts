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
