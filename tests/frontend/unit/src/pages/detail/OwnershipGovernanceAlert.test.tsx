import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import '@/i18n';
import { OwnershipGovernanceAlert } from '@/pages/detail/OwnershipGovernanceAlert';

describe('OwnershipGovernanceAlert (SM-05)', () => {
    it('announces the blocking ownership state assertively on warning tokens', () => {
        render(<OwnershipGovernanceAlert message="The owner left the company." testId="ownership-alert" />);

        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('The owner left the company.');
        expect(alert).toHaveAttribute('data-testid', 'ownership-alert');
        expect(alert).toHaveAttribute('data-tone', 'warning');
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('offers the governance action only when a handler is supplied', async () => {
        const user = userEvent.setup();
        const onAction = vi.fn();
        render(
            <OwnershipGovernanceAlert
                message="Assign a new owner."
                actionLabel="Resolve in Governance"
                actionTestId="resolve-action"
                onAction={onAction}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Resolve in Governance' }));
        expect(onAction).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('resolve-action')).toBe(screen.getByRole('button', { name: 'Resolve in Governance' }));
    });

    it('hides the action for users without governance access', () => {
        render(<OwnershipGovernanceAlert message="Ask a CRO." actionLabel="Resolve in Governance" />);

        expect(screen.queryByRole('button', { name: 'Resolve in Governance' })).not.toBeInTheDocument();
    });
});
