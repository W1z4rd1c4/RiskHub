import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LinkSearchResultItem } from '@/components/linking/LinkSearchResultItem';
import { RiskDistributionMatrix } from '@/components/dashboard/RiskDistributionMatrix';
import { StepIndicator } from '@/components/ui/StepIndicator';

vi.mock('@/hooks/useRiskHubConfig', () => ({
  useRiskThresholds: () => ({ thresholds: { criticalMin: 16, highMin: 10, mediumMin: 5 } }),
}));

vi.mock('@/hooks/useStatusTheme', () => ({
  useStatusTheme: () => ({
    matrix: {
      emptyCell: 'bg-empty',
      low: 'bg-low',
      medium: 'bg-medium',
      high: 'bg-high',
      critical: 'bg-critical',
    },
  }),
}));

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
    expect(screen.getByText('Level')).toBeVisible();
    expect(screen.getByText('3/5')).toBeVisible();
    expect(screen.getByText('Freq')).toBeVisible();
    expect(screen.getByText('quarterly')).toBeVisible();

    await user.click(buttons[1]!);
    expect(onUnarchive).toHaveBeenCalledWith(7);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('uses a native button for an actionable risk-matrix cell', async () => {
    const user = userEvent.setup();
    const onCellClick = vi.fn();
    const { container } = render(
      <RiskDistributionMatrix
        distribution={[{ probability: 4, impact: 4, count: 1 }]}
        onCellClick={onCellClick}
      />,
    );

    const cell = screen.getByRole('button', { name: /1.*probability.*4.*impact.*4/i });
    expect(cell).toHaveAttribute('type', 'button');
    expect(container.querySelector('[role="button"]')).toBeNull();
    cell.focus();
    await user.keyboard(' ');
    expect(onCellClick).toHaveBeenCalledWith(4, 4);
  });
});
