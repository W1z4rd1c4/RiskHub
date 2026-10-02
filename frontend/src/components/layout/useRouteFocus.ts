import { useEffect, useRef, useState, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';

/** Marker on the page `h1` (`PageHeader`, `EntityDetailHeader`). */
const PAGE_TITLE_SELECTOR = '[data-page-title]';
/** How long a route may take to render its `h1` (lazy chunk + first query). */
const SETTLE_TIMEOUT_MS = 5000;
/** `usePageTitle` writes `document.title` in a passive effect; read it after that has run. */
const ANNOUNCE_DELAY_MS = 50;

/**
 * Route-change focus and announcement for the app shell (audit 2026-09-30
 * §4.14, D14, NAV-01; `AuthFrame` is the public-page reference).
 *
 * After a **pathname** change (not a search-param or in-page tab change) it
 * waits for the new page's `h1` (`[data-page-title]`, `tabIndex={-1}`) inside
 * `mainRef`, moves focus to it, and returns the new `document.title` for a
 * polite live region. Focus is left alone when the user has already moved it
 * into the page while it was loading. A page that swaps its state-shell `h1`
 * (loading / denied) for the loaded record's `h1` within the settle window
 * gets the focus moved to the replacement, but only when the swap dropped the
 * focus to the document body. The first render is not announced.
 */
export function useRouteFocus(mainRef: RefObject<HTMLElement | null>): string {
    const { pathname } = useLocation();
    const previousPathname = useRef(pathname);
    const [announcement, setAnnouncement] = useState('');

    useEffect(() => {
        if (previousPathname.current === pathname) return undefined;
        previousPathname.current = pathname;
        const main = mainRef.current;
        if (!main) return undefined;

        let observer: MutationObserver | null = null;
        let announceTimer: number | undefined;
        let focusedHeading: HTMLElement | null = null;
        let settled = false;

        const focusIsInsidePage = () => {
            const active = document.activeElement;
            return active instanceof HTMLElement && active !== main && main.contains(active);
        };

        const focusWasDropped = () => {
            const active = document.activeElement;
            return active === null || active === document.body;
        };

        const announce = () => {
            window.clearTimeout(announceTimer);
            announceTimer = window.setTimeout(() => setAnnouncement(document.title), ANNOUNCE_DELAY_MS);
        };

        const settle = () => {
            const heading = main.querySelector<HTMLElement>(PAGE_TITLE_SELECTOR);
            if (!heading || heading === focusedHeading) return;
            if (!settled) {
                settled = true;
                if (focusIsInsidePage()) {
                    // The user is already working in the page: never move focus.
                    observer?.disconnect();
                    announce();
                    return;
                }
            } else if (focusedHeading?.isConnected || !focusWasDropped()) {
                // The focused heading is still there, or the user moved on.
                observer?.disconnect();
                return;
            }
            heading.focus();
            focusedHeading = heading;
            announce();
        };

        setAnnouncement('');
        observer = new MutationObserver(settle);
        observer.observe(main, { childList: true, subtree: true });
        settle();
        const timeout = window.setTimeout(() => {
            observer?.disconnect();
            if (!settled) announce();
        }, SETTLE_TIMEOUT_MS);

        return () => {
            observer?.disconnect();
            window.clearTimeout(timeout);
            window.clearTimeout(announceTimer);
        };
    }, [mainRef, pathname]);

    return announcement;
}
