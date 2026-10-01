import { render, screen, userEvent } from '@test/render';
import { describe, expect, it, vi } from 'vitest';

import { QuestionnaireHistoryTable } from '@/components/risks/QuestionnaireHistoryTable';
import type { RiskQuestionnaireListItem } from '@/types/riskQuestionnaire';

/**
 * AX-02: questionnaire history rows must be operable without a mouse. The row's
 * first cell carries a named native button (Enter/Space), and the row click stays
 * a mouse convenience that does not double-fire.
 */

const t = (key: string, options?: string | Record<string, unknown>) =>
    typeof options === 'object' && typeof options.date === 'string' ? `${key} ${options.date}` : key;

function item(id: number, sentAt: string): RiskQuestionnaireListItem {
    return {
        id,
        status: 'submitted',
        sent_at: sentAt,
        due_at: null,
        submitted_at: null,
        sent_by_user_name: 'Anna',
        submitted_by_user_name: null,
        submitted_by_user_id: null,
    } as unknown as RiskQuestionnaireListItem;
}

function renderTable(onSelect = vi.fn()) {
    render(
        <QuestionnaireHistoryTable
            items={[item(11, '2026-01-05T10:00:00Z'), item(12, '2026-02-05T10:00:00Z')]}
            loading={false}
            locale="en"
            onSelect={onSelect}
            t={t}
        />,
    );
    return onSelect;
}

describe('QuestionnaireHistoryTable keyboard activation', () => {
    it('exposes one named, focusable button per row', () => {
        renderTable();

        const buttons = screen.getAllByRole('button', { name: /risks:questionnaires\.open_row/ });
        expect(buttons).toHaveLength(2);
        for (const button of buttons) {
            expect(button).toHaveAttribute('type', 'button');
        }
    });

    it('reaches the row by Tab and opens it with Enter and Space', async () => {
        const user = userEvent.setup();
        const onSelect = renderTable();

        await user.tab();
        const [first, second] = screen.getAllByRole('button', { name: /risks:questionnaires\.open_row/ });
        expect(first).toHaveFocus();
        await user.keyboard('{Enter}');
        expect(onSelect).toHaveBeenLastCalledWith(11);

        await user.tab();
        expect(second).toHaveFocus();
        await user.keyboard(' ');
        expect(onSelect).toHaveBeenLastCalledWith(12);
        expect(onSelect).toHaveBeenCalledTimes(2);
    });

    it('keeps the row click for mouse users without double-firing from the button', async () => {
        const user = userEvent.setup();
        const onSelect = renderTable();

        const [firstRowSender] = screen.getAllByText('Anna', { selector: 'td' });
        await user.click(firstRowSender);
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect).toHaveBeenLastCalledWith(11);

        const [firstRowButton] = screen.getAllByRole('button', { name: /risks:questionnaires\.open_row/ });
        await user.click(firstRowButton);
        expect(onSelect).toHaveBeenCalledTimes(2);
    });
});
