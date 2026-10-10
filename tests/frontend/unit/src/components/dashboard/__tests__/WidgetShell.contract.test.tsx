import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { WidgetShell } from '@/components/dashboard/WidgetShell';
import i18n from '@/i18n';

/**
 * GAP-D-20 (audit 2026-09-30 §4.15): the default branches are the shared,
 * announced state primitives, translated reactively, and the error default
 * never shows the raw `error.message`.
 */
describe('WidgetShell', () => {
    afterEach(async () => {
        await i18n.changeLanguage('en');
    });

    it('renders an announced loading state named after the widget', () => {
        render(
            <WidgetShell title="Foo" isLoading>
                <div>data</div>
            </WidgetShell>,
        );

        const loading = screen.getByTestId('widget-loading');
        const status = screen.getByRole('status');
        expect(loading).toContainElement(status);
        expect(status).toHaveTextContent('Loading Foo…');
        // The live region is not busy (a busy region is not announced); the placeholder is.
        expect(status.closest('[aria-busy="true"]')).toBeNull();
        expect(loading.querySelector('[aria-busy="true"]')).toHaveAttribute('data-loading-placeholder');
    });

    it('renders a translated error alert without the raw error message', async () => {
        const { rerender } = render(
            <WidgetShell title="Foo" error={new Error('boom: SELECT * failed')}>
                <div>data</div>
            </WidgetShell>,
        );

        const error = screen.getByTestId('widget-error');
        expect(error).toHaveAttribute('role', 'alert');
        expect(error).toHaveTextContent('Foo');
        expect(error).toHaveTextContent('Failed to load data.');
        expect(error).not.toHaveTextContent('boom');

        await i18n.changeLanguage('cs');
        rerender(
            <WidgetShell title="Foo" error={new Error('boom')}>
                <div>data</div>
            </WidgetShell>,
        );
        expect(screen.getByTestId('widget-error')).toHaveTextContent('Nepodařilo se načíst data.');
    });

    it('renders an announced empty state', () => {
        render(
            <WidgetShell title="Foo" isEmpty emptyLabel="No data">
                <div>data</div>
            </WidgetShell>,
        );

        expect(screen.getByTestId('widget-empty')).toHaveAttribute('role', 'status');
        expect(screen.getByText('No data')).toBeInTheDocument();
    });

    it('keeps caller-supplied fallbacks', () => {
        render(
            <WidgetShell title="Foo" isLoading loadingFallback={<p>custom loading</p>}>
                <div>data</div>
            </WidgetShell>,
        );

        expect(screen.getByText('custom loading')).toBeInTheDocument();
        expect(screen.queryByTestId('widget-loading')).not.toBeInTheDocument();
    });

    it('renders data when none of the branches match', () => {
        render(
            <WidgetShell title="Foo">
                <div data-testid="data">data</div>
            </WidgetShell>,
        );

        expect(screen.getByTestId('data')).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Foo' })).toBeInTheDocument();
    });
});
