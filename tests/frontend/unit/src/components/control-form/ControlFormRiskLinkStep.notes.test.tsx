import { describe, expect, it, vi } from 'vitest';

import { ControlFormRiskLinkStep } from '@/components/control-form/ControlFormRiskLinkStep';
import {
    ControlRiskLinkStepProvider,
    type ControlRiskLinkStepContextValue,
} from '@/components/control-form/controlRiskLinkStepContext';
import type { RiskSummary } from '@/types/risk';
import { renderWithoutProviders, screen, userEvent } from '@test/render';

/**
 * PG-37 (audit 2026-09-30 §6.8, roadmap 1.5): the link-notes field is a
 * labelled `Textarea` marked "(optional)" through `Field`, not "Notes (None)".
 */

const RISK = {
    id: 7,
    name: 'Payment outage',
    process: 'Payments',
    category: 'Operational',
    description: 'Card processing stops.',
    department_name: 'Ops',
} as unknown as RiskSummary;

function contextValue(overrides: Partial<ControlRiskLinkStepContextValue> = {}): ControlRiskLinkStepContextValue {
    return {
        selectedRisk: RISK,
        setSelectedRiskId: vi.fn(),
        riskEffectiveness: 'medium',
        setRiskEffectiveness: vi.fn(),
        linkNotes: '',
        setLinkNotes: vi.fn(),
        selectedDept: '',
        setSelectedDept: vi.fn(),
        selectedProcess: '',
        setSelectedProcess: vi.fn(),
        selectedCategory: '',
        setSelectedCategory: vi.fn(),
        uniqueDepartments: [],
        uniqueProcesses: [],
        uniqueCategories: [],
        riskSearch: '',
        setRiskSearch: vi.fn(),
        isLoadingRisks: false,
        risks: [RISK],
        filteredRisks: [RISK],
        ...overrides,
    };
}

const t = (key: string) => key;

describe('ControlFormRiskLinkStep link notes (PG-37)', () => {
    it('labels the notes textarea "(optional)" and forwards typed text', async () => {
        const user = userEvent.setup();
        const setLinkNotes = vi.fn();
        renderWithoutProviders(
            <ControlRiskLinkStepProvider value={contextValue({ setLinkNotes })}>
                <ControlFormRiskLinkStep t={t} />
            </ControlRiskLinkStepProvider>,
        );

        const notes = screen.getByRole('textbox', { name: 'common:labels.notes (optional)' });
        expect(notes.tagName).toBe('TEXTAREA');
        expect(notes).not.toHaveAttribute('aria-required');
        expect(screen.queryByText(/common:labels\.none/)).not.toBeInTheDocument();

        await user.type(notes, 'x');
        expect(setLinkNotes).toHaveBeenCalledWith('x');
    });
});
