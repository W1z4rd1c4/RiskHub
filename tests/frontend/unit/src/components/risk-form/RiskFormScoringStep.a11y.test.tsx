import { afterAll, describe, expect, it, vi } from 'vitest';

import { RiskFormScoringStep } from '@/components/risk-form/RiskFormScoringStep';
import i18n from '@/i18n';
import type { Risk } from '@/types/risk';
import { renderWithQueryClient, screen } from '@test/render';

const formData: Partial<Risk> = {
    gross_probability: 3,
    gross_impact: 4,
    net_probability: 2,
    net_impact: 5,
    acceptance_approver: 'Risk Committee',
    acceptance_date: '2026-08-29',
    acceptance_justification: 'Accepted within the approved tolerance.',
};

function renderScoringStep() {
    return renderWithQueryClient(
        <RiskFormScoringStep
            t={i18n.t.bind(i18n)}
            formData={formData}
            totalAssets={10_000_000_000}
            handleInputChange={vi.fn()}
            getScoreTextColor={() => 'text-foreground'}
            getSliderAccent={() => 'accent-primary'}
        />,
    );
}

function expectVisibleDescription(control: HTMLElement, expectedText: string) {
    const descriptionId = control.getAttribute('aria-describedby');
    expect(descriptionId).toBeTruthy();
    const description = document.getElementById(descriptionId!);
    expect(description).toBeVisible();
    expect(description).toHaveTextContent(expectedText);
}

describe('RiskFormScoringStep field associations', () => {
    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it.each([
        [
            'en',
            ['Gross probability', 'Gross impact', 'Net probability', 'Net impact'],
            ['Medium', 'High', 'Low', 'Extreme'],
            ['Acceptance approver', 'Acceptance date', 'Acceptance justification'],
        ],
        [
            'cs',
            ['Hrubá pravděpodobnost', 'Hrubý dopad', 'Čistá pravděpodobnost', 'Čistý dopad'],
            ['Střední', 'Vysoký', 'Nízká', 'Extrémní'],
            ['Akceptace: schvalovatel', 'Akceptace: datum', 'Akceptace: odůvodnění'],
        ],
    ] as const)(
        'associates all scoring and acceptance controls with localized visible names and help in %s',
        async (language, scoringLabels, scoringHelp, acceptanceLabels) => {
            await i18n.changeLanguage(language);
            renderScoringStep();

            scoringLabels.forEach((label, index) => {
                const slider = screen.getByRole('slider', { name: label });
                expect(slider).toHaveAttribute('min', '1');
                expect(slider).toHaveAttribute('max', '5');
                expect(slider).toHaveAttribute('step', '1');
                expectVisibleDescription(slider, scoringHelp[index]);
            });

            const acceptanceControls = acceptanceLabels.map((label) => screen.getByLabelText(label));
            const acceptanceHint = screen.getByText(i18n.t('risks:acceptance.hint'));
            expect(acceptanceHint).toBeVisible();
            for (const control of acceptanceControls) {
                expect(control).toHaveAttribute('aria-describedby', acceptanceHint.id);
            }
        },
    );
});
