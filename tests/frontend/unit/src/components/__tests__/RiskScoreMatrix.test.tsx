import { useState, type ReactElement } from 'react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { RiskScoreMatrix } from '@/components/RiskScoreMatrix';
import i18n from '@/i18n';
import { riskHubKeys } from '@/lib/queryKeys';
import { createTestQueryClient } from '@test/queryClient';
import { renderWithQueryClient, screen, userEvent, within } from '@test/render';

const thresholds = {
    critical: 16,
    high: 10,
    medium: 5,
};

function renderMatrix(ui: ReactElement) {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(riskHubKeys.thresholdsPublic(), thresholds);
    return renderWithQueryClient(ui, { queryClient });
}

function ControlledMatrix({ onSelect }: { onSelect: (probability: number, impact: number) => void }) {
    const [selection, setSelection] = useState({ probability: 3, impact: 4 });

    function handleSelect(probability: number, impact: number) {
        setSelection({ probability, impact });
        onSelect(probability, impact);
    }

    return (
        <RiskScoreMatrix
            probability={selection.probability}
            impact={selection.impact}
            type="gross"
            thresholds={thresholds}
            onSelect={handleSelect}
        />
    );
}

describe('RiskScoreMatrix', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
    });

    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it('exposes every interactive score choice as one labelled native radio group', () => {
        renderMatrix(
            <RiskScoreMatrix
                probability={3}
                impact={4}
                type="net"
                thresholds={thresholds}
                onSelect={vi.fn()}
            />,
        );

        const group = screen.getByRole('group', { name: 'Net Risk' });
        const radios = within(group).getAllByRole('radio');
        expect(radios).toHaveLength(25);
        expect(radios[0]?.getAttribute('name')).toBeTruthy();
        expect(new Set(radios.map((radio) => radio.getAttribute('name'))).size).toBe(1);
        expect(
            within(group).getByRole('radio', {
                name: 'Probability 3, impact 4, score 12',
            }),
        ).toBeChecked();
    });

    it.each([
        [4, 4, 16],
        [3, 4, 12],
        [2, 3, 6],
        [2, 2, 4],
    ])('uses the theme foreground for selected score %s×%s=%s', (probability, impact, score) => {
        renderMatrix(
            <RiskScoreMatrix
                probability={probability}
                impact={impact}
                type="gross"
                thresholds={thresholds}
                onSelect={vi.fn()}
            />,
        );

        expect(screen.getByText(String(score), { exact: true })).toHaveClass('text-foreground');
    });

    it('uses native Tab, Arrow, and pointer interaction to update the controlled selection', async () => {
        const user = userEvent.setup();
        const onSelect = vi.fn();
        renderMatrix(<ControlledMatrix onSelect={onSelect} />);

        const currentChoice = screen.getByRole('radio', {
            name: 'Probability 3, impact 4, score 12',
        });
        await user.tab();
        expect(currentChoice).toHaveFocus();

        await user.keyboard('{ArrowRight}');
        expect(onSelect).toHaveBeenLastCalledWith(3, 5);
        expect(screen.getByRole('radio', {
            name: 'Probability 3, impact 5, score 15',
        })).toBeChecked();

        await user.click(screen.getByTitle('P:2 × I:2 = 4'));
        expect(onSelect).toHaveBeenLastCalledWith(2, 2);
        expect(screen.getByRole('radio', {
            name: 'Probability 2, impact 2, score 4',
        })).toBeChecked();
    });

    it('renders the selected score without any interactive affordance in read-only mode', () => {
        const { container } = renderMatrix(
            <RiskScoreMatrix
                probability={3}
                impact={4}
                type="net"
                thresholds={thresholds}
            />,
        );

        expect(screen.getByText('Score: 12')).toBeInTheDocument();
        expect(screen.queryAllByRole('radio')).toHaveLength(0);
        expect(screen.queryAllByRole('button')).toHaveLength(0);
        expect(container.querySelector('label')).not.toBeInTheDocument();
        expect(container.querySelectorAll('[title]')).toHaveLength(0);
    });

    it('gives each Czech choice a complete localized accessible name', async () => {
        await i18n.changeLanguage('cs');
        renderMatrix(
            <RiskScoreMatrix
                probability={2}
                impact={5}
                type="gross"
                thresholds={thresholds}
                onSelect={vi.fn()}
            />,
        );

        expect(screen.getByRole('group', { name: 'Hrubé riziko' })).toBeInTheDocument();
        expect(screen.getByRole('radio', {
            name: 'Pravděpodobnost 2, dopad 5, skóre 10',
        })).toBeChecked();
    });
});
