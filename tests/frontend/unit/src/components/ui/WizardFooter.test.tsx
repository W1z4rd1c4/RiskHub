import type { ComponentProps } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WizardFooter } from '@/components/ui/WizardFooter';
import { renderWithoutProviders, screen } from '@test/render';

/**
 * Audit §4.8 "Wizard footer" (DS-10, PG-11): the Risk, Control and KRI wizards
 * share one footer — Cancel / Back on the left (secondary), Next or the submit
 * (accent, `type="submit"`) on the right; inert but focusable while submitting.
 */
function renderFooter(props: Partial<ComponentProps<typeof WizardFooter>> = {}) {
    const handlers = { onCancel: vi.fn(), onBack: vi.fn(), onNext: vi.fn() };
    renderWithoutProviders(
        <form onSubmit={(event) => event.preventDefault()}>
            <WizardFooter stepIndex={0} stepCount={3} submitLabel="Create risk" {...handlers} {...props} />
        </form>,
    );
    return handlers;
}

describe('WizardFooter', () => {
    it('offers Cancel and Next on the first step', async () => {
        const user = userEvent.setup();
        const { onCancel, onNext } = renderFooter({ cancelLabel: 'Back to Risks', nextTestId: 'next' });

        await user.click(screen.getByRole('button', { name: 'Back to Risks' }));
        expect(onCancel).toHaveBeenCalledTimes(1);

        const next = screen.getByTestId('next');
        expect(next).toHaveAttribute('type', 'button');
        expect(next).toHaveAccessibleName('Next');
        await user.click(next);
        expect(onNext).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', { name: 'Create risk' })).not.toBeInTheDocument();
    });

    it('offers Back and a submit button on the last step', async () => {
        const user = userEvent.setup();
        const { onBack } = renderFooter({ stepIndex: 2, submitTestId: 'submit' });

        await user.click(screen.getByRole('button', { name: 'Back' }));
        expect(onBack).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('submit')).toHaveAttribute('type', 'submit');
        expect(screen.getByTestId('submit')).toHaveAccessibleName('Create risk');
    });

    it('keeps the actions focusable but inert while submitting', async () => {
        const user = userEvent.setup();
        const { onBack } = renderFooter({ stepIndex: 2, isSubmitting: true, submitTestId: 'submit' });

        const back = screen.getByRole('button', { name: 'Back' });
        expect(back).toHaveAttribute('aria-disabled', 'true');
        expect(back).not.toBeDisabled();
        await user.click(back);
        expect(onBack).not.toHaveBeenCalled();

        const submit = screen.getByTestId('submit');
        expect(submit).toHaveAttribute('aria-busy', 'true');
        expect(submit).toHaveTextContent('Loading...');
    });
});
