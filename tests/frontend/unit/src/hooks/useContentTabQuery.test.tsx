import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { useContentTabs } from '@/hooks/useContentTabs';
import { useContentTabQuery } from '@/hooks/useContentTabQuery';

const tabs = ['overview', 'history'] as const;

function TabHarness() {
    const location = useLocation();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useContentTabQuery({
        tabs,
        defaultTab: 'overview',
    });
    const { getPanelProps, getTabProps } = useContentTabs({
        tabs,
        activeTab,
        onChange: setActiveTab,
        idPrefix: 'query-harness',
    });

    return (
        <>
            <div role="tablist" aria-label="Detail sections">
                {tabs.map((tab, index) => (
                    <button key={tab} {...getTabProps(tab, index)}>{tab}</button>
                ))}
            </div>
            {tabs.map((tab) => (
                <div key={tab} {...getPanelProps(tab)}>
                    {activeTab === tab ? `${tab} content` : null}
                </div>
            ))}
            <output data-testid="location">{location.pathname}{location.search}</output>
            <button type="button" onClick={() => navigate(-1)}>History back</button>
            <button type="button" onClick={() => navigate(1)}>History forward</button>
        </>
    );
}

describe('useContentTabQuery', () => {
    it('pushes discrete tab choices, omits the default, preserves unrelated params, and follows Back/Forward', async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter initialEntries={['/risks/42?tab=history&return_to=%2Frisks%3Fpage%3D3&source=audit']}>
                <TabHarness />
            </MemoryRouter>,
        );

        const tablist = screen.getByRole('tablist', { name: 'Detail sections' });
        expect(within(tablist).getByRole('tab', { name: 'history' })).toHaveAttribute('aria-selected', 'true');

        await user.click(within(tablist).getByRole('tab', { name: 'overview' }));
        expect(screen.getByTestId('location')).toHaveTextContent(
            '/risks/42?return_to=%2Frisks%3Fpage%3D3&source=audit',
        );

        await user.click(screen.getByRole('button', { name: 'History back' }));
        expect(within(tablist).getByRole('tab', { name: 'history' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByTestId('location')).toHaveTextContent(
            '/risks/42?tab=history&return_to=%2Frisks%3Fpage%3D3&source=audit',
        );

        await user.click(screen.getByRole('button', { name: 'History forward' }));
        expect(within(tablist).getByRole('tab', { name: 'overview' })).toHaveAttribute('aria-selected', 'true');
    });

    it('normalizes invalid and explicit-default values with replace', async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter
                initialEntries={['/before', '/settings?tab=invalid&keep=1']}
                initialIndex={1}
            >
                <TabHarness />
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(screen.getByTestId('location')).toHaveTextContent('/settings?keep=1');
        });
        await user.click(screen.getByRole('button', { name: 'History back' }));
        expect(screen.getByTestId('location')).toHaveTextContent('/before');
    });
});
