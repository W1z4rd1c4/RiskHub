/**
 * FR-P2b-1/2/4/5 (spec N11–N13, findings C1/C5/S11) — ThreatForm migrated to
 * `Field` with native `required` + `noValidate` + per-field validation, plus
 * regained submit feedback (button disables while pending). The name field is
 * required with a per-field error, aria-invalid, focus-first-invalid and a
 * `role="alert"` summary.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import * as axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetClosedLists = vi.fn();
const mockCreateThreat = vi.fn();
const mockUpdateThreat = vi.fn();

vi.mock('@/services/processApi', () => ({
    processApi: {
        getClosedLists: (...args: unknown[]) => mockGetClosedLists(...args),
    },
}));
vi.mock('@/services/threatApi', () => ({
    threatApi: {
        createThreat: (...args: unknown[]) => mockCreateThreat(...args),
        updateThreat: (...args: unknown[]) => mockUpdateThreat(...args),
    },
}));
vi.mock('@/services/logger', () => ({ logError: vi.fn() }));

import { ThreatForm } from '@/pages/threats/ThreatForm';
import i18n from '@/i18n';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoAxeViolations(node: Element): Promise<void> {
    const results = await axe.run(node, {
        runOnly: { type: 'tag', values: AXE_TAGS },
        rules: { 'color-contrast': { enabled: false } },
    });
    const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`).join('\n');
    expect(summary, summary).toBe('');
}

function renderForm() {
    const onSaved = vi.fn();
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const utils = render(
        <QueryClientProvider client={client}>
            <MemoryRouter>
                <ThreatForm onSaved={onSaved} />
            </MemoryRouter>
        </QueryClientProvider>,
    );
    return { onSaved, ...utils };
}

const nameLabel = () => i18n.t('threats:form.name');

beforeEach(() => {
    vi.clearAllMocks();
    mockGetClosedLists.mockResolvedValue({});
});

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('ThreatForm — Field migration + validation + submit feedback (#59)', () => {
    it('associates the required name control with its label and exposes aria-required', () => {
        renderForm();
        const name = screen.getByRole('textbox', { name: nameLabel() });
        expect(name).toHaveAttribute('aria-required', 'true');
    });

    it('on invalid submit: focuses the name field, sets aria-invalid, shows role=alert + per-field error', async () => {
        const user = userEvent.setup();
        renderForm();

        await user.click(screen.getByTestId('threat-form-submit'));

        const name = screen.getByRole('textbox', { name: nameLabel() });
        expect(name).toHaveAttribute('aria-invalid', 'true');
        expect(name).toHaveFocus();
        expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('threats:form.errors.fix_fields'));
        expect(screen.getByText(i18n.t('threats:form.errors.name_required'))).toBeInTheDocument();
        expect(mockCreateThreat).not.toHaveBeenCalled();
    });

    it('submits successfully and reports back through onSaved', async () => {
        const user = userEvent.setup();
        mockCreateThreat.mockResolvedValue({ id: 9, name: 'Phishing' });
        const { onSaved } = renderForm();

        await user.type(screen.getByRole('textbox', { name: nameLabel() }), 'Phishing');
        await user.click(screen.getByTestId('threat-form-submit'));

        await waitFor(() => expect(mockCreateThreat).toHaveBeenCalledTimes(1));
        expect(onSaved).toHaveBeenCalledTimes(1);
    });

    it('gives submit feedback and surfaces the save-failed banner on rejection', async () => {
        const user = userEvent.setup();
        let rejectSave: (reason?: unknown) => void = () => {};
        mockCreateThreat.mockReturnValue(
            new Promise((_resolve, reject) => {
                rejectSave = reject;
            }),
        );
        renderForm();

        await user.type(screen.getByRole('textbox', { name: nameLabel() }), 'Phishing');
        const submit = screen.getByTestId('threat-form-submit');
        await user.click(submit);

        // Submit feedback (S11): the button disables while the request is pending.
        await waitFor(() => expect(submit).toBeDisabled());

        rejectSave(new Error('boom'));
        expect(await screen.findByText(i18n.t('threats:form.errors.save_failed'))).toBeInTheDocument();
    });

    it('reads .isError on the closed-lists fetch with a retry affordance', async () => {
        mockGetClosedLists.mockRejectedValue(new Error('down'));
        renderForm();

        expect(await screen.findByText(i18n.t('threats:form.errors.lists_failed'))).toBeInTheDocument();
        expect(screen.getByRole('button', { name: i18n.t('threats:actions.retry') })).toBeInTheDocument();
    });

    it('has no axe violations in the validation-error state (N10)', async () => {
        const user = userEvent.setup();
        const { container } = renderForm();

        await user.click(screen.getByTestId('threat-form-submit'));
        expect(screen.getByRole('alert')).toBeInTheDocument();

        await expectNoAxeViolations(container);
    });
});
