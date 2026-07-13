import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LinkSearchResultItem } from '@/components/linking/LinkSearchResultItem';
import { StepIndicator } from '@/components/ui/StepIndicator';

const TestIcon = ({ className }: { className?: string }) => <span aria-hidden="true" className={className}>*</span>;

describe('shared native interaction semantics', () => {
  it('uses native step buttons with current and disabled semantics', async () => {
    const user = userEvent.setup();
    const onStepClick = vi.fn();
    render(
      <StepIndicator
        steps={[
          { id: 'details', title: 'Details', icon: TestIcon },
          { id: 'review', title: 'Review', icon: TestIcon },
        ]}
        currentStep={0}
        isStepClickable={(index) => index === 0}
        onStepClick={onStepClick}
      />,
    );

    const current = screen.getByRole('button', { name: 'Details' });
    const future = screen.getByRole('button', { name: 'Review' });
    expect(current).toHaveAttribute('aria-current', 'step');
    expect(current).toHaveAttribute('type', 'button');
    expect(future).toBeDisabled();
    current.focus();
    await user.keyboard('{Enter}');
    expect(onStepClick).toHaveBeenCalledWith(0);
  });

  it('renders select and unarchive as sibling native buttons', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onUnarchive = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <LinkSearchResultItem
        mode="risk-to-control"
        result={{
          id: 7,
          name: 'Archived access review',
          is_archived: true,
          capabilities: { can_restore: true },
          risk_level: 3,
          frequency: 'quarterly',
        } as never}
        onSelect={onSelect}
        onUnarchive={onUnarchive}
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.contains(buttons[1]!)).toBe(false);
    expect(container.querySelector('[role="button"]')).toBeNull();

    await user.click(buttons[1]!);
    expect(onUnarchive).toHaveBeenCalledWith(7);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
