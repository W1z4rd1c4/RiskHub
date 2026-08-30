import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, describe, expect, it } from 'vitest';

import { RiskFormIdentityStep } from '@/components/risk-form/RiskFormIdentityStep';
import i18n from '@/i18n';
import type { Risk } from '@/types/risk';

const initialFormData: Partial<Risk> = {
    name: 'Payment disruption',
    risk_type: '',
    process: 'Operations',
    subprocess: 'Legacy subprocess',
    category: 'Operational',
    description: 'A sufficiently detailed risk description.',
};

function IdentityStepHarness({
    fieldErrors = {},
    initialData = initialFormData,
}: {
    fieldErrors?: Record<string, string>;
    initialData?: Partial<Risk>;
}) {
    const [formData, setFormData] = useState(initialData);

    return (
        <RiskFormIdentityStep
            t={i18n.t.bind(i18n)}
            formData={formData}
            fieldErrors={fieldErrors}
            riskTypes={[]}
            riskTypesLoading={false}
            existingProcesses={['Operations', 'Finance', 'Customer Service']}
            existingCategories={['Operational', 'Financial', 'Compliance']}
            subprocessesByProcess={{
                Operations: ['Legacy subprocess'],
                Finance: ['Accounts Payable', 'Treasury'],
            }}
            handleInputChange={(field, value) => setFormData((current) => ({ ...current, [field]: value }))}
        />
    );
}

describe('RiskFormIdentityStep creatable combobox fields', () => {
    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it.each([
        ['en', ['Main Process', 'Subprocess (Optional)', 'Category'], ['Process is required', 'Category is required']],
        ['cs', ['Hlavní proces', 'Podproces (volitelné)', 'Kategorie'], ['Proces je povinný', 'Kategorie je povinná']],
    ] as const)('associates localized visible labels and errors with all three comboboxes in %s', async (
        language,
        labels,
        errors,
    ) => {
        await i18n.changeLanguage(language);
        render(<IdentityStepHarness fieldErrors={{
            process: 'risks:form.errors.process_required',
            category: 'risks:form.errors.category_required',
        }} />);

        const controls = labels.map((label) => screen.getByRole('combobox', { name: label }));
        expect(controls[0]).toHaveAttribute('aria-required', 'true');
        expect(controls[1]).not.toHaveAttribute('aria-required');
        expect(controls[2]).toHaveAttribute('aria-required', 'true');

        for (const [control, error] of [[controls[0], errors[0]], [controls[2], errors[1]]] as const) {
            expect(control).toHaveAttribute('aria-invalid', 'true');
            const errorElement = screen.getByText(error);
            expect(control.getAttribute('aria-describedby')).toContain(errorElement.id);
        }
    });

    it('preserves the subprocess when process changes and offers suggestions only for the selected process', async () => {
        await i18n.changeLanguage('en');
        const user = userEvent.setup();
        render(<IdentityStepHarness />);

        const process = screen.getByRole('combobox', { name: 'Main Process' });
        const subprocess = screen.getByRole('combobox', { name: 'Subprocess (Optional)' });

        await user.clear(process);
        await user.click(screen.getByRole('option', { name: 'Finance' }));
        expect(process).toHaveValue('Finance');
        expect(subprocess).toHaveValue('Legacy subprocess');

        await user.clear(subprocess);
        expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
            'Accounts Payable',
            'Treasury',
        ]);
    });

    it.each([
        ['en', 'Create "Novel process"'],
        ['cs', 'Vytvořit "Novel process"'],
    ] as const)('shows a localized non-selectable free-entry hint in %s', async (language, createLabel) => {
        await i18n.changeLanguage(language);
        const user = userEvent.setup();
        render(<IdentityStepHarness />);

        const processLabel = language === 'en' ? 'Main Process' : 'Hlavní proces';
        const process = screen.getByRole('combobox', { name: processLabel });
        await user.clear(process);
        await user.type(process, 'Novel process');

        const hint = screen.getByText(createLabel);
        expect(hint).toBeVisible();
        expect(hint).not.toHaveAttribute('role', 'option');
        expect(hint).not.toHaveAttribute('tabindex');
        expect(screen.queryByRole('option', { name: createLabel })).not.toBeInTheDocument();
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        expect(process).toHaveAttribute('aria-expanded', 'false');
        expect(process).not.toHaveAttribute('aria-controls');
    });

    it('does not offer an unscoped subprocess free-entry hint before a process is selected', async () => {
        await i18n.changeLanguage('en');
        const user = userEvent.setup();
        render(<IdentityStepHarness initialData={{
            ...initialFormData,
            process: '',
            subprocess: 'Unscoped subprocess',
        }} />);

        const subprocess = screen.getByRole('combobox', { name: 'Subprocess (Optional)' });
        expect(subprocess).toHaveAttribute('placeholder', i18n.t('common:form.placeholders.select_process_first'));
        await user.click(subprocess);

        expect(screen.queryByText('Create "Unscoped subprocess"')).not.toBeInTheDocument();
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        expect(subprocess).toHaveAttribute('aria-expanded', 'false');
        expect(subprocess).not.toHaveAttribute('aria-controls');
    });
});
