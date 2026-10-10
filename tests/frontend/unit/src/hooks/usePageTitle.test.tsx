import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, type ReactNode } from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { usePageTitle, type PageTitleInput } from '@/hooks/usePageTitle';
import i18n from '@/i18n';

/** Audit 2026-09-30 §4.14 (D14, NAV-01): translated per-route `document.title`. */

const BASE_TITLE = 'RiskHub — Enterprise Risk Management';

beforeEach(() => {
    document.title = BASE_TITLE;
});

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('usePageTitle', () => {
    it('formats a translated string as "<page> · RiskHub" and restores the previous title', () => {
        const { unmount } = renderHook(() => usePageTitle('Approvals'));
        expect(document.title).toBe('Approvals · RiskHub');
        unmount();
        expect(document.title).toBe(BASE_TITLE);
    });

    it('translates a key input and follows language changes', async () => {
        renderHook(() => usePageTitle({ key: 'sidebar.settings', ns: 'navigation' }));
        expect(document.title).toBe('Settings · RiskHub');
        await act(async () => {
            await i18n.changeLanguage('cs');
        });
        expect(document.title).toBe('Nastavení · RiskHub');
    });

    it('updates when the title changes and ignores empty input', () => {
        const { rerender } = renderHook(({ title }: { title: PageTitleInput }) => usePageTitle(title), {
            initialProps: { title: 'Risk A' as PageTitleInput },
        });
        expect(document.title).toBe('Risk A · RiskHub');
        rerender({ title: 'Risk B' });
        expect(document.title).toBe('Risk B · RiskHub');
        rerender({ title: '   ' });
        expect(document.title).toBe(BASE_TITLE);
        rerender({ title: null });
        expect(document.title).toBe(BASE_TITLE);
    });

    it('lets the innermost caller win and restores the outer title when it unmounts', () => {
        function Titled({ title, children }: { title: string; children?: ReactNode }) {
            usePageTitle(title);
            return <>{children}</>;
        }
        // React runs the child's effect before the parent's; the child still owns the title.
        const { rerender, unmount } = render(<Titled title="Settings"><Titled title="Notifications" /></Titled>);
        expect(document.title).toBe('Notifications · RiskHub');

        rerender(<Titled title="Settings" />);
        expect(document.title).toBe('Settings · RiskHub');

        unmount();
        expect(document.title).toBe(BASE_TITLE);
    });

    it('survives the StrictMode double mount and restores the base title on unmount', () => {
        function Titled({ title }: { title: string }) {
            usePageTitle(title);
            return null;
        }
        const { rerender, unmount } = render(<StrictMode><Titled title="Risk A" /></StrictMode>);
        expect(document.title).toBe('Risk A · RiskHub');
        rerender(<StrictMode><Titled title="Risk B" /></StrictMode>);
        expect(document.title).toBe('Risk B · RiskHub');
        unmount();
        expect(document.title).toBe(BASE_TITLE);
    });

    it('follows route changes and falls back to the base title on a route without a title', async () => {
        const user = userEvent.setup();
        function Page({ title, next }: { title?: string; next: string }) {
            usePageTitle(title);
            return <Link to={next}>{`go ${next}`}</Link>;
        }
        render(
            <StrictMode>
                <MemoryRouter initialEntries={['/risks']}>
                    <Routes>
                        <Route path="/risks" element={<Page title="Risks" next="/controls" />} />
                        <Route path="/controls" element={<Page title="Controls" next="/plain" />} />
                        <Route path="/plain" element={<Page next="/risks" />} />
                    </Routes>
                </MemoryRouter>
            </StrictMode>,
        );
        expect(document.title).toBe('Risks · RiskHub');
        await user.click(screen.getByRole('link', { name: 'go /controls' }));
        expect(document.title).toBe('Controls · RiskHub');
        await user.click(screen.getByRole('link', { name: 'go /plain' }));
        expect(document.title).toBe(BASE_TITLE);
        await user.click(screen.getByRole('link', { name: 'go /risks' }));
        expect(document.title).toBe('Risks · RiskHub');
    });

    it('never restores the title of a page that already unmounted', () => {
        function Titled({ title }: { title: string }) {
            usePageTitle(title);
            return null;
        }
        const { rerender, unmount } = render(<Titled key="a" title="Risk A" />);
        rerender(<><Titled key="a" title="Risk A" /><Titled key="b" title="Risk B" /></>);
        expect(document.title).toBe('Risk B · RiskHub');

        // The older caller goes first: the newer one keeps the title.
        rerender(<Titled key="b" title="Risk B" />);
        expect(document.title).toBe('Risk B · RiskHub');

        unmount();
        expect(document.title).toBe(BASE_TITLE);
    });
});
