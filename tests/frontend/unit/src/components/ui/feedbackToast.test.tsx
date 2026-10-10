import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import * as axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    FEEDBACK_DANGER_DURATION_MS,
    FEEDBACK_DEFAULT_DURATION_MS,
    FEEDBACK_MAX_VISIBLE,
    FeedbackProvider,
} from '@/contexts/FeedbackContext';
import { useFeedback, type FeedbackApi } from '@/hooks/useFeedback';
import i18n from '@/i18n';

const THEMES: ReadonlyArray<{ name: string; className: string }> = [
    { name: 'default (:root)', className: '' },
    { name: 'true-dark (.theme-dark)', className: 'theme-dark' },
    { name: 'light (.theme-light)', className: 'theme-light' },
];

/** Renders the provider and hands the stable `useFeedback()` API back to the test. */
function renderFeedback(themeClassName = ''): { api: () => FeedbackApi } {
    let captured: FeedbackApi | null = null;
    function Capture() {
        captured = useFeedback();
        return null;
    }
    render(<div className={themeClassName}><FeedbackProvider><Capture /></FeedbackProvider></div>);
    return {
        api: () => {
            if (!captured) throw new Error('useFeedback() was not captured');
            return captured;
        },
    };
}

function toastItems(): HTMLElement[] {
    return within(screen.getByRole('region')).queryAllByRole('listitem');
}

function toastWithTitle(title: string): HTMLElement {
    const item = screen.getByText(title).closest('li');
    if (!item) throw new Error(`No toast titled "${title}"`);
    return item;
}

describe('FeedbackProvider / useFeedback (audit §4.16, D9)', () => {
    afterEach(async () => {
        vi.useRealTimers();
        await act(async () => { await i18n.changeLanguage('en'); });
    });

    it('renders a named bottom-right viewport above every layer', () => {
        renderFeedback();
        const region = screen.getByRole('region', { name: 'Notifications (F8)' });
        expect(region.querySelector('ol')).toHaveClass('fixed', 'bottom-0', 'right-0', 'z-toast', 'pointer-events-none');
    });

    it('shows a success toast on the popover surface with a tone icon and a polite announcement', async () => {
        const { api } = renderFeedback();

        act(() => { api().success({ title: 'Risk restored', description: 'R-001 is active again.' }); });

        const toast = toastWithTitle('Risk restored');
        expect(toast).toHaveAttribute('data-tone', 'success');
        expect(toast).toHaveClass('bg-popover', 'text-popover-foreground', 'border-border', 'shadow-popover', 'rounded-xl');
        expect(toast.querySelector('svg[aria-hidden="true"]')).toHaveClass('text-success-text');
        expect(toast).toHaveTextContent('R-001 is active again.');
        const announcement = await screen.findByText(/Notification\s+Risk restored/);
        expect(announcement).toHaveAttribute('role', 'status');
        expect(announcement).toHaveAttribute('aria-live', 'polite');
    });

    it('translates errorKeys through translateUiMessage and announces errors assertively', async () => {
        const { api } = renderFeedback();

        act(() => { api().error({ title: 'Restore failed', messageKey: 'errorKeys.network' }); });

        const toast = toastWithTitle('Restore failed');
        expect(toast).toHaveAttribute('data-tone', 'danger');
        expect(toast).toHaveTextContent('Network error. Please check your connection.');
        const announcement = await screen.findByText(/Notification\s+Restore failed/);
        expect(announcement).toHaveAttribute('aria-live', 'assertive');
    });

    it('falls back to translated default titles per tone, in English and Czech', async () => {
        const { api } = renderFeedback();
        act(() => {
            api().success();
            api().error();
        });
        expect(toastWithTitle('Done')).toHaveAttribute('data-tone', 'success');
        expect(toastWithTitle('Something went wrong')).toHaveAttribute('data-tone', 'danger');

        await act(async () => { await i18n.changeLanguage('cs'); });
        act(() => { api().warning(); });
        expect(toastWithTitle('Zkontrolujte prosím')).toHaveAttribute('data-tone', 'warning');
        expect(screen.getByRole('region', { name: 'Oznámení (F8)' })).toBeInTheDocument();
        expect(within(toastWithTitle('Zkontrolujte prosím')).getByRole('button', { name: 'Zavřít oznámení' })).toBeInTheDocument();
    });

    it('auto-dismisses after 5 s, keeps danger for 8 s and never closes a toast that has an action', () => {
        vi.useFakeTimers();
        const { api } = renderFeedback();
        const onUndo = vi.fn();

        act(() => {
            api().info({ title: 'Saved' });
            api().error({ title: 'Failed' });
            api().success({ title: 'Archived', action: { label: 'Undo', onClick: onUndo } });
        });
        expect(toastItems()).toHaveLength(3);

        act(() => { vi.advanceTimersByTime(FEEDBACK_DEFAULT_DURATION_MS + 400); });
        expect(screen.queryByText('Saved')).not.toBeInTheDocument();
        expect(screen.getByText('Failed')).toBeInTheDocument();

        act(() => { vi.advanceTimersByTime(FEEDBACK_DANGER_DURATION_MS); });
        expect(screen.queryByText('Failed')).not.toBeInTheDocument();
        expect(screen.getByText('Archived')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
        expect(onUndo).toHaveBeenCalledTimes(1);
        act(() => { vi.advanceTimersByTime(400); });
        expect(screen.queryByText('Archived')).not.toBeInTheDocument();
    });

    it(`keeps at most ${FEEDBACK_MAX_VISIBLE} toasts open, closing the oldest first`, () => {
        vi.useFakeTimers();
        const { api } = renderFeedback();

        act(() => {
            ['First', 'Second', 'Third', 'Fourth'].forEach((title) => { api().info({ title }); });
        });
        act(() => { vi.advanceTimersByTime(400); });

        expect(toastItems()).toHaveLength(FEEDBACK_MAX_VISIBLE);
        expect(screen.queryByText('First')).not.toBeInTheDocument();
        expect(screen.getByText('Fourth')).toBeInTheDocument();
    });

    it('replaces a toast that reuses an id and closes toasts through dismiss() and the named close button', () => {
        vi.useFakeTimers();
        const { api } = renderFeedback();

        act(() => {
            api().info({ id: 'sync', title: 'Syncing' });
            api().success({ id: 'sync', title: 'Synced' });
            api().warning({ title: 'Stale data' });
        });
        expect(toastItems()).toHaveLength(2);
        expect(screen.queryByText('Syncing')).not.toBeInTheDocument();

        fireEvent.click(within(toastWithTitle('Stale data')).getByRole('button', { name: 'Dismiss notification' }));
        act(() => { vi.advanceTimersByTime(400); });
        expect(screen.queryByText('Stale data')).not.toBeInTheDocument();

        act(() => { api().dismiss('sync'); });
        act(() => { vi.advanceTimersByTime(400); });
        expect(toastItems()).toHaveLength(0);
    });

    it.each(THEMES)('has no structural axe violations with every tone open in the $name theme', async ({ className }) => {
        const { api } = renderFeedback(className);
        act(() => {
            api().success({ title: 'Saved' });
            api().warning({ title: 'Stale data', description: 'Refresh to see the latest values.' });
            api().error({ title: 'Failed', action: { label: 'Retry', onClick: () => undefined } });
        });

        // jsdom has no layout, so contrast is covered by the rendered-contrast gate.
        const results = await axe.run(document.body, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
            rules: { 'color-contrast': { enabled: false } },
        });
        const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`).join('\n');
        expect(summary, summary).toBe('');
    });

    it('returns a stable API so callers can list it in hook dependencies', () => {
        const { result, rerender } = renderHook(() => useFeedback(), { wrapper: FeedbackProvider });
        const first = result.current;
        rerender();
        expect(result.current).toBe(first);
    });

    it('does not crash outside the provider; the message is dropped and reported once', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { result } = renderHook(() => useFeedback());

        expect(result.current.success({ title: 'Lost' })).toBe('');
        expect(result.current.error({ title: 'Lost too' })).toBe('');
        expect(consoleError.mock.calls.filter(([message]) => String(message).includes('FeedbackProvider'))).toHaveLength(1);
        consoleError.mockRestore();
    });
});
