import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import '@/i18n';
import {
    FormActions,
    FormErrorSummary,
    FormLoadFailedNotice,
    FormSection,
} from '@/pages/shared/EntityFormChrome';

describe('EntityFormChrome', () => {
    it('renders a section card with an h2 title and optional description', () => {
        render(
            <FormSection title="Identity" description="Who and what.">
                <p>fields</p>
            </FormSection>,
        );

        expect(screen.getByRole('heading', { level: 2, name: 'Identity' })).toBeInTheDocument();
        expect(screen.getByText('Who and what.')).toBeInTheDocument();
        expect(screen.getByText('fields')).toBeInTheDocument();
    });

    it('announces the form-top error as an alert and the lookup failure as a status with retry', async () => {
        const user = userEvent.setup();
        const onRetry = vi.fn();
        render(
            <>
                <FormErrorSummary message="Fix the highlighted fields." />
                <FormLoadFailedNotice message="Lists failed to load." retryLabel="Retry" onRetry={onRetry} />
            </>,
        );

        expect(screen.getByRole('alert')).toHaveTextContent('Fix the highlighted fields.');
        expect(screen.getByRole('status')).toHaveTextContent('Lists failed to load.');
        await user.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('puts Cancel before the submit button and routes both through the shared Button', async () => {
        const user = userEvent.setup();
        const onCancel = vi.fn();
        render(
            <form onSubmit={(event) => event.preventDefault()}>
                <FormActions
                    submitLabel="Save"
                    submitTestId="form-submit"
                    isSubmitting={false}
                    onCancel={onCancel}
                    cancelLabel="Cancel"
                    cancelTestId="form-cancel"
                />
            </form>,
        );

        const buttons = screen.getAllByRole('button');
        expect(buttons.map((button) => button.textContent)).toEqual(['Cancel', 'Save']);
        expect(screen.getByTestId('form-submit')).toHaveAttribute('type', 'submit');
        expect(screen.getByTestId('form-cancel')).toHaveAttribute('type', 'button');
        await user.click(screen.getByTestId('form-cancel'));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('disables the submit button with a busy state while submitting, and when blocked', () => {
        const { rerender } = render(<FormActions submitLabel="Save" submitTestId="form-submit" isSubmitting />);
        expect(screen.getByTestId('form-submit')).toBeDisabled();
        expect(screen.getByTestId('form-submit')).toHaveAttribute('aria-busy', 'true');
        expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

        rerender(<FormActions submitLabel="Save" submitTestId="form-submit" isSubmitting={false} submitDisabled />);
        expect(screen.getByTestId('form-submit')).toBeDisabled();
        expect(screen.getByTestId('form-submit')).not.toHaveAttribute('aria-busy');
    });
});
