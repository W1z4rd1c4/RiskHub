import userEvent from '@testing-library/user-event';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { InlineMessage, type InlineMessageTone } from '@/components/ui/inline-message';
import i18n from '@/i18n';
import { renderWithoutProviders, screen } from '@test/render';

/**
 * Audit 2026-09-30 §4.10 / roadmap 1.6 (AX-05, D9): inline messages are
 * announced by tone (danger → alert, others → status), take their colours from
 * the semantic tones, and a dismissible message has a named close button.
 */

describe('InlineMessage', () => {
    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it('announces danger assertively', () => {
        renderWithoutProviders(<InlineMessage tone="danger">Could not save</InlineMessage>);
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('Could not save');
        expect(alert).toHaveClass('bg-destructive/10', 'text-destructive', 'border-destructive/20');
    });

    it.each<InlineMessageTone>(['info', 'success', 'warning', 'neutral'])('announces %s politely', (tone) => {
        renderWithoutProviders(<InlineMessage tone={tone}>Note</InlineMessage>);
        expect(screen.getByRole('status')).toHaveTextContent('Note');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('lets `live` override the tone-derived role', () => {
        renderWithoutProviders(
            <>
                <InlineMessage tone="warning" live="assertive">Urgent</InlineMessage>
                <InlineMessage tone="danger" live="off" data-testid="static">Static</InlineMessage>
            </>,
        );
        expect(screen.getByRole('alert')).toHaveTextContent('Urgent');
        expect(screen.getByTestId('static')).not.toHaveAttribute('role');
    });

    it('uses token colours only and hides its icon from assistive technology', () => {
        renderWithoutProviders(
            <InlineMessage tone="warning" title="Pending approval">
                Waiting for review
            </InlineMessage>,
        );
        const status = screen.getByRole('status');
        expect(status).toHaveClass('bg-warning/10', 'text-warning-text');
        expect(status.className).not.toMatch(/\b(?:bg|text|border)-(?:amber|rose|emerald|slate|white)/);
        expect(status.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
        expect(screen.getByText('Pending approval')).toHaveClass('font-semibold');
    });

    it('renders actions and can hide the icon', () => {
        renderWithoutProviders(
            <InlineMessage tone="info" icon={null} action={<button type="button">Retry</button>}>
                Offline
            </InlineMessage>,
        );
        expect(screen.getByRole('status').querySelector('svg')).toBeNull();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('renders a named, keyboard-operable dismiss button', async () => {
        const onDismiss = vi.fn();
        const user = userEvent.setup();
        renderWithoutProviders(
            <InlineMessage tone="success" onDismiss={onDismiss}>
                Saved
            </InlineMessage>,
        );
        const dismiss = screen.getByRole('button', { name: 'Dismiss message' });
        expect(dismiss).toHaveAttribute('type', 'button');
        expect(dismiss.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
        await user.tab();
        expect(dismiss).toHaveFocus();
        await user.keyboard('{Enter}');
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('translates the dismiss name and accepts a custom one', async () => {
        await i18n.changeLanguage('cs');
        renderWithoutProviders(
            <>
                <InlineMessage tone="info" onDismiss={vi.fn()}>A</InlineMessage>
                <InlineMessage tone="info" onDismiss={vi.fn()} dismissLabel="Skrýt upozornění">B</InlineMessage>
            </>,
        );
        expect(screen.getByRole('button', { name: 'Zavřít zprávu' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Skrýt upozornění' })).toBeInTheDocument();
    });
});
