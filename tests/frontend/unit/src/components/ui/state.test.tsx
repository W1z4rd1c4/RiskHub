import * as axe from 'axe-core';
import userEvent from '@testing-library/user-event';
import type { LucideIcon } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    AccessDeniedState,
    EmptyState,
    ErrorState,
    LoadingState,
    Skeleton,
    Spinner,
} from '@/components/ui/state';
import i18n from '@/i18n';
import { ReadAccessDeniedState } from '@/pages/shared/ReadAccessDeniedState';
import { renderWithoutProviders, screen } from '@test/render';

// lucide-react is not forwarded to the test tree; any SVG component stands in for an icon.
const Building2 = ((props: Record<string, unknown>) => <svg data-testid="test-icon" {...props} />) as unknown as LucideIcon;

/**
 * Audit 2026-09-30 §4.15 / roadmap 1.11 (DS-17, GAP-C-11, GAP-D-20): page and
 * region states are announced (status / alert), translated, token-only, and
 * there is one access-denied implementation.
 */

const RAW_COLOUR = /(?:^|\s)(?:text|bg|border)-(?:white|black|slate|gray|red|rose|amber|emerald)(?:-\d{2,3})?(?:\/|\s|$)/;

function expectTokenOnly(root: ParentNode): void {
    const classes = Array.from(root.querySelectorAll<HTMLElement>('[class]')).map((el) => el.getAttribute('class') ?? '');
    expect(classes.filter((value) => RAW_COLOUR.test(value))).toEqual([]);
}

async function expectNoAxeViolations(node: Element): Promise<void> {
    const results = await axe.run(node, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
        rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('Spinner and Skeleton', () => {
    it('is decorative without a label and announced with one', () => {
        const { container } = renderWithoutProviders(
            <>
                <Spinner />
                <Spinner size="lg" label="Saving" />
            </>,
        );
        const icons = container.querySelectorAll('svg');
        expect(icons[0]).toHaveAttribute('aria-hidden', 'true');
        expect(icons[0]).toHaveClass('animate-spin', 'text-accent-text', 'size-5');
        expect(icons[1]).toHaveClass('size-8');
        expect(screen.getByRole('status')).toHaveTextContent('Saving');
    });

    it('renders a hidden tint placeholder', () => {
        const { container } = renderWithoutProviders(<Skeleton className="h-6" />);
        const block = container.firstElementChild;
        expect(block).toHaveAttribute('aria-hidden', 'true');
        expect(block).toHaveClass('animate-pulse', 'bg-tint/10', 'h-6');
    });
});

/** The live region must not be busy itself nor sit inside a busy element, or it is not announced. */
function expectAnnouncedNotBusy(status: HTMLElement): void {
    expect(status).not.toHaveAttribute('aria-busy');
    expect(status.closest('[aria-busy="true"]')).toBeNull();
}

describe('LoadingState', () => {
    it('announces the translated default label in a polite live region that is never busy', () => {
        renderWithoutProviders(<LoadingState testId="loading" />);
        const status = screen.getByRole('status');
        expect(status).toHaveAttribute('aria-live', 'polite');
        expect(status).toHaveTextContent('Loading...');
        expectAnnouncedNotBusy(status);
        expect(screen.getByTestId('loading')).toContainElement(status);
    });

    it('marks the spinner placeholder for the loading content as busy, outside the live region', () => {
        renderWithoutProviders(<LoadingState testId="loading" />);
        const placeholder = screen.getByTestId('loading').querySelector('[aria-busy="true"]');
        expect(placeholder).toHaveAttribute('data-loading-placeholder');
        expect(placeholder?.querySelector('svg')).toHaveClass('animate-spin');
        expect(placeholder).not.toContainElement(screen.getByRole('status'));
    });

    it('localizes the default label for Czech', async () => {
        await i18n.changeLanguage('cs');
        renderWithoutProviders(<LoadingState />);
        expect(screen.getByRole('status')).toHaveTextContent('Načítání...');
    });

    it('uses the page footprint for layout="page"', () => {
        renderWithoutProviders(<LoadingState layout="page" label="Loading risks" testId="page-loading" />);
        expect(screen.getByTestId('page-loading')).toHaveClass('min-h-[60vh]');
        expect(screen.getByRole('status')).toHaveTextContent('Loading risks');
    });

    it('keeps the label for screen readers when a skeleton replaces the spinner', () => {
        renderWithoutProviders(
            <LoadingState label="Loading department" skeleton={<Skeleton className="h-40" />} testId="skeleton-loading" />,
        );
        const status = screen.getByRole('status');
        expect(status).toHaveTextContent('Loading department');
        expect(status).toHaveClass('sr-only');
        expectAnnouncedNotBusy(status);
        const placeholder = screen.getByTestId('skeleton-loading').querySelector('[aria-busy="true"]');
        expect(placeholder).toHaveAttribute('aria-hidden', 'true');
        expect(placeholder?.querySelector('.animate-pulse')).not.toBeNull();
        expect(screen.getByTestId('skeleton-loading').querySelector('.animate-spin')).toBeNull();
    });
});

describe('EmptyState', () => {
    it('announces the title and description with a decorative kind icon', () => {
        const { container } = renderWithoutProviders(
            <EmptyState title="No risks yet" description="Create the first risk." kind="no-data" action={<button type="button">Create risk</button>} />,
        );
        const status = screen.getByRole('status');
        expect(status).toHaveAttribute('data-kind', 'no-data');
        expect(status).toHaveTextContent('No risks yet');
        expect(status).toHaveTextContent('Create the first risk.');
        expect(screen.getByRole('button', { name: 'Create risk' })).toBeInTheDocument();
        expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
        expectTokenOnly(container);
    });

    it('supports no-results, a custom icon and no icon', () => {
        const { container, rerender } = renderWithoutProviders(<EmptyState title="No matches" kind="no-results" />);
        expect(screen.getByRole('status')).toHaveAttribute('data-kind', 'no-results');
        const noResultsIcon = container.querySelector('svg')?.innerHTML;
        rerender(<EmptyState title="No matches" kind="no-data" />);
        expect(container.querySelector('svg')?.innerHTML).not.toBe(noResultsIcon);
        rerender(<EmptyState title="No departments" icon={Building2} />);
        expect(container.querySelector('svg')).toHaveClass('size-12');
        rerender(<EmptyState title="Nothing" icon={null} layout="inline" />);
        expect(container.querySelector('svg')).toBeNull();
    });
});

describe('ErrorState', () => {
    it('is an alert with the translated default message and a working retry', async () => {
        const user = userEvent.setup();
        const onRetry = vi.fn();
        const { container } = renderWithoutProviders(<ErrorState onRetry={onRetry} testId="err" />);
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('Failed to load data.');
        expect(alert).toHaveAttribute('data-testid', 'err');
        await user.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onRetry).toHaveBeenCalledTimes(1);
        expectTokenOnly(container);
    });

    it('localizes the default message and retry label for Czech', async () => {
        await i18n.changeLanguage('cs');
        renderWithoutProviders(<ErrorState onRetry={vi.fn()} />);
        expect(screen.getByRole('alert')).toHaveTextContent('Nepodařilo se načíst data.');
        expect(screen.getByRole('button', { name: 'Zkusit znovu' })).toBeInTheDocument();
    });

    it('translates messageKey (including errorKeys.*) and lets message win', () => {
        const { rerender } = renderWithoutProviders(<ErrorState messageKey="errors.network" />);
        expect(screen.getByRole('alert')).toHaveTextContent('Network error. Please check your connection.');
        rerender(<ErrorState messageKey="errors.network" message="Custom failure" title="Sessions" />);
        expect(screen.getByRole('alert')).toHaveTextContent('SessionsCustom failure');
    });

    it('keeps retry focusable but inert while retrying and omits it without a handler', () => {
        const onRetry = vi.fn();
        const { rerender } = renderWithoutProviders(<ErrorState onRetry={onRetry} isRetrying />);
        const retry = screen.getByRole('button', { name: 'Retry' });
        expect(retry).not.toBeDisabled();
        expect(retry).toHaveAttribute('aria-disabled', 'true');
        expect(retry).toHaveAttribute('aria-busy', 'true');
        retry.click();
        expect(onRetry).not.toHaveBeenCalled();
        rerender(<ErrorState />);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('renders the banner variant as a danger InlineMessage for stale data', () => {
        renderWithoutProviders(<ErrorState variant="banner" onRetry={vi.fn()} testId="stale" />);
        const banner = screen.getByTestId('stale');
        expect(banner).toHaveAttribute('role', 'alert');
        expect(banner).toHaveAttribute('data-tone', 'danger');
        expect(screen.getByRole('button', { name: 'Retry' })).toHaveClass('h-8');
    });

    it('renders extra actions next to retry', () => {
        renderWithoutProviders(<ErrorState onRetry={vi.fn()} actions={<a href="/departments">Back to Departments</a>} layout="page" />);
        expect(screen.getByRole('alert')).toHaveClass('min-h-[60vh]');
        expect(screen.getByRole('link', { name: 'Back to Departments' })).toBeInTheDocument();
    });
});

describe('AccessDeniedState', () => {
    it('is the one access-denied implementation (ReadAccessDeniedState aliases it)', () => {
        expect(ReadAccessDeniedState).toBe(AccessDeniedState);
    });

    it('renders a translated h2 heading and description on text tokens', () => {
        const { container } = renderWithoutProviders(<AccessDeniedState />);
        const heading = screen.getByRole('heading', { level: 2, name: 'Access Denied' });
        expect(heading).toHaveClass('text-foreground');
        expect(screen.getByText('Access denied.')).toHaveClass('text-muted-foreground');
        expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
        expectTokenOnly(container);
    });

    it('honours descriptionKey with a namespace and the heading level', async () => {
        await i18n.changeLanguage('cs');
        renderWithoutProviders(<AccessDeniedState headingLevel={1} descriptionKey="access.denied_activity_log" ns="common" layout="section" />);
        expect(screen.getByRole('heading', { level: 1, name: 'Přístup zamítnut' })).toBeInTheDocument();
        expect(screen.getByText('Nemáte oprávnění zobrazit záznamy aktivit.')).toBeInTheDocument();
    });

    it('stays silent by default and announces itself as an alert when live', () => {
        const { rerender } = renderWithoutProviders(<AccessDeniedState layout="section" />);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        rerender(<AccessDeniedState layout="section" live />);
        const alert = screen.getByRole('alert');
        expect(alert).toContainElement(screen.getByRole('heading', { level: 2, name: 'Access Denied' }));
    });
});

describe('state primitives axe sweep', () => {
    it('has no structural axe violations', async () => {
        const { container } = renderWithoutProviders(
            <main>
                <LoadingState />
                <EmptyState title="No data" />
                <ErrorState onRetry={vi.fn()} />
                <ErrorState variant="banner" onRetry={vi.fn()} />
                <AccessDeniedState layout="section" />
            </main>,
        );
        await expectNoAxeViolations(container);
    });
});
