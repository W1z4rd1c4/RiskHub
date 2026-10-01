import { useState, type SVGProps } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TabList, TabPanel, type TabItem, type TabsVariant } from '@/components/ui/tabs';
import { renderWithoutProviders, screen, within } from '@test/render';

// lucide-react is not resolvable from the external test root; stub icons with
// the same props contract are enough for these assertions.
const FileText = (props: SVGProps<SVGSVGElement>) => <svg {...props} />;

/**
 * Audit 2026-09-30 §4.12 / roadmap 1.8 (D8, DS-12, AX-07): one Tabs primitive on
 * `useContentTabs` — tablist/tab/tabpanel roles and ids, a roving tab stop, and
 * ArrowLeft / ArrowRight / Home / End that skip disabled tabs.
 */

type View = 'overview' | 'history' | 'archive' | 'settings';

const TABS: ReadonlyArray<TabItem<View>> = [
    { id: 'overview', label: 'Overview', icon: FileText },
    { id: 'history', label: 'History', count: 3 },
    { id: 'archive', label: 'Archive', disabled: true },
    { id: 'settings', label: 'Settings', testId: 'settings-tab' },
];

function Harness({ variant, initial = 'overview', onChange }: { variant?: TabsVariant; initial?: View; onChange?: (tab: View) => void }) {
    const [active, setActive] = useState<View>(initial);
    return (
        <>
            <TabList
                tabs={TABS}
                activeTab={active}
                onChange={(tab) => {
                    onChange?.(tab);
                    setActive(tab);
                }}
                idPrefix="demo"
                ariaLabel="Demo sections"
                variant={variant}
                data-testid="demo-tabs"
            />
            {TABS.map((tab) => (
                <TabPanel key={tab.id} tab={tab.id} activeTab={active} idPrefix="demo">
                    {`${tab.id} content`}
                </TabPanel>
            ))}
        </>
    );
}

describe('TabList / TabPanel', () => {
    it('exposes a named tablist with linked tabs and panels', () => {
        renderWithoutProviders(<Harness />);
        const tablist = screen.getByRole('tablist', { name: 'Demo sections' });
        expect(tablist).toHaveAttribute('data-testid', 'demo-tabs');
        const tabs = within(tablist).getAllByRole('tab');
        expect(tabs).toHaveLength(4);

        const overview = screen.getByRole('tab', { name: 'Overview' });
        expect(overview).toHaveAttribute('id', 'demo-tab-overview');
        expect(overview).toHaveAttribute('aria-controls', 'demo-panel-overview');
        expect(overview).toHaveAttribute('aria-selected', 'true');
        expect(overview).toHaveAttribute('type', 'button');
        expect(overview.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

        const panel = screen.getByRole('tabpanel', { name: 'Overview' });
        expect(panel).toHaveAttribute('id', 'demo-panel-overview');
        expect(panel).toHaveTextContent('overview content');
        expect(screen.getByText('history content')).not.toBeVisible();
        expect(screen.getByTestId('settings-tab')).toHaveAttribute('aria-selected', 'false');
        expect(screen.getByRole('tab', { name: /History/ })).toHaveTextContent('3');
    });

    it('keeps exactly one tab in the Tab order (roving tabindex)', async () => {
        const user = userEvent.setup();
        renderWithoutProviders(<Harness />);
        const tabs = screen.getAllByRole('tab');
        expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);

        await user.tab();
        expect(screen.getByRole('tab', { name: 'Overview' })).toHaveFocus();
        await user.tab();
        // Tab leaves the tablist for the active panel.
        expect(screen.getByRole('tabpanel', { name: 'Overview' })).toHaveFocus();
    });

    it('moves and activates with arrows, Home and End, skipping disabled tabs', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        renderWithoutProviders(<Harness onChange={onChange} />);

        screen.getByRole('tab', { name: 'Overview' }).focus();
        await user.keyboard('{ArrowRight}');
        expect(screen.getByRole('tab', { name: /History/ })).toHaveFocus();
        expect(screen.getByRole('tab', { name: /History/ })).toHaveAttribute('aria-selected', 'true');

        await user.keyboard('{ArrowRight}');
        // "Archive" is disabled and skipped.
        expect(screen.getByRole('tab', { name: 'Settings' })).toHaveFocus();
        expect(screen.getByRole('tab', { name: 'Archive' })).toBeDisabled();

        await user.keyboard('{ArrowRight}');
        expect(screen.getByRole('tab', { name: 'Overview' })).toHaveFocus();

        await user.keyboard('{ArrowLeft}');
        expect(screen.getByRole('tab', { name: 'Settings' })).toHaveFocus();

        await user.keyboard('{Home}');
        expect(screen.getByRole('tab', { name: 'Overview' })).toHaveFocus();

        await user.keyboard('{End}');
        expect(screen.getByRole('tab', { name: 'Settings' })).toHaveFocus();
        expect(screen.getByText('settings content')).toBeVisible();
        expect(onChange.mock.calls.map(([tab]) => tab)).toEqual(['history', 'settings', 'overview', 'settings', 'overview', 'settings']);
    });

    it('activates on click', async () => {
        const user = userEvent.setup();
        renderWithoutProviders(<Harness />);
        await user.click(screen.getByRole('tab', { name: /History/ }));
        expect(screen.getByRole('tabpanel', { name: /History/ })).toHaveTextContent('history content');
        expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('tabindex', '-1');
    });

    it('keeps the tablist reachable when the active tab is unavailable', () => {
        renderWithoutProviders(<Harness initial="archive" />);
        expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('tabindex', '0');
        expect(screen.getByRole('tab', { name: 'Archive' })).toHaveAttribute('tabindex', '-1');
    });

    it('renders the underline and pill recipes on tokens', () => {
        const { unmount } = renderWithoutProviders(<Harness />);
        expect(screen.getByRole('tablist')).toHaveClass('border-b', 'border-border');
        expect(screen.getByRole('tab', { name: 'Overview' })).toHaveClass('aria-selected:border-accent', 'aria-selected:text-accent-text', 'focus-ring');
        unmount();

        renderWithoutProviders(<Harness variant="pill" />);
        expect(screen.getByRole('tablist')).toHaveClass('rounded-xl', 'bg-nested/60');
        const tab = screen.getByRole('tab', { name: 'Overview' });
        expect(tab).toHaveClass('rounded-lg', 'aria-selected:bg-accent', 'aria-selected:text-accent-foreground');
        expect(tab.className).not.toMatch(/\b(?:bg|text)-(?:white|slate)/);
    });
});
