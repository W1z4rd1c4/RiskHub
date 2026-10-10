import { useEffect, useState } from 'react';

import { useTranslation } from '@/i18n/hooks';
import type { Namespace } from '@/i18n/types';

/** A translated page name, or a key the hook translates itself. */
export type PageTitleInput =
    | string
    | { key: string; ns?: Namespace; values?: Record<string, unknown> }
    | null
    | undefined;

/**
 * Every mounted caller with a title, keyed by its render order. React runs a
 * child's effects before its parent's and does not unmount siblings in mount
 * order, so "remember the previous title and restore it" lets a parent
 * overwrite its child and can restore the title of a page that is already
 * gone. Instead the caller that rendered last (the most deeply nested, or
 * the most recently mounted route) owns `document.title`, and the title that
 * was showing before any caller mounted comes back when the last one unmounts.
 */
const activeTitles = new Map<number, string>();
let renderSequence = 0;
let baseTitle: string | null = null;

function applyDocumentTitle(): void {
    let owner = -1;
    activeTitles.forEach((_title, order) => {
        if (order > owner) owner = order;
    });
    const next = owner === -1 ? baseTitle : activeTitles.get(owner);
    if (next !== null && next !== undefined && document.title !== next) {
        document.title = next;
    }
    if (owner === -1) baseTitle = null;
}

/**
 * Per-route `document.title` (audit 2026-09-30 §4.14, D14, NAV-01).
 *
 * Writes `common:page_title.template` ("{{page}} · RiskHub") while the calling
 * page is mounted. When several callers are mounted at once, the one rendered
 * last (the innermost) wins; when the last one unmounts, the title from before
 * the first one mounted (the static `index.html` title) is restored. Pass an
 * already translated string (`t('title')`) or `{ key, ns }`; both follow
 * language changes because the formatted title is recomputed on every render.
 * `PageHeader`, `EntityDetailHeader` and `AuthFrame` call it for you; call it
 * directly only from a route that renders none of them.
 */
export function usePageTitle(title: PageTitleInput): void {
    const { t } = useTranslation('common');
    const [order] = useState(() => {
        renderSequence += 1;
        return renderSequence;
    });
    let page: string | null = null;
    if (typeof title === 'string') {
        page = title.trim() || null;
    } else if (title) {
        page = t(title.key, { ...(title.values ?? {}), ...(title.ns ? { ns: title.ns } : {}) });
    }
    const documentTitle = page ? t('page_title.template', { page }) : null;

    useEffect(() => {
        if (!documentTitle) return undefined;
        if (activeTitles.size === 0) baseTitle = document.title;
        activeTitles.set(order, documentTitle);
        applyDocumentTitle();
        return () => {
            activeTitles.delete(order);
            applyDocumentTitle();
        };
    }, [documentTitle, order]);
}
