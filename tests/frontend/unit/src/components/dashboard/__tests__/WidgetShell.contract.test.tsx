import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WidgetShell } from '@/components/dashboard/WidgetShell';

describe('WidgetShell', () => {
    it('renders loading skeleton', () => {
        render(
            <WidgetShell title="Foo" isLoading>
                <div>data</div>
            </WidgetShell>,
        );

        expect(screen.getByTestId('widget-loading')).toBeInTheDocument();
    });

    it('renders error state', () => {
        render(
            <WidgetShell title="Foo" error={new Error('boom')}>
                <div>data</div>
            </WidgetShell>,
        );

        expect(screen.getByTestId('widget-error')).toBeInTheDocument();
    });

    it('renders empty state', () => {
        render(
            <WidgetShell title="Foo" isEmpty emptyLabel="No data">
                <div>data</div>
            </WidgetShell>,
        );

        expect(screen.getByText('No data')).toBeInTheDocument();
    });

    it('renders data when none of the branches match', () => {
        render(
            <WidgetShell title="Foo">
                <div data-testid="data">data</div>
            </WidgetShell>,
        );

        expect(screen.getByTestId('data')).toBeInTheDocument();
    });
});
