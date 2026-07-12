/**
 * FR-P2b-1/2/3/5 (spec N11–N13, findings C1/C4/C5, S11) — ProcessForm migrated
 * to `Field` with native `required` + `noValidate` + per-field JS validation.
 * The two previously-collapsed identity errors (l0_area, l1_process) are now
 * per-field, and focus moves to the first invalid control in DOM order.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import * as axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetClosedLists = vi.fn();
const mockCreateProcess = vi.fn();
const mockUpdateProcess = vi.fn();

vi.mock('@/services/processApi', () => ({
    processApi: {
        getClosedLists: (...args: unknown[]) => mockGetClosedLists(...args),
        createProcess: (...args: unknown[]) => mockCreateProcess(...args),
        updateProcess: (...args: unknown[]) => mockUpdateProcess(...args),
    },
}));
vi.mock('@/services/logger', () => ({ logError: vi.fn() }));

import { ProcessForm } from '@/pages/processes/ProcessForm';
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
                <ProcessForm onSaved={onSaved} />
            </MemoryRouter>
        </QueryClientProvider>,
    );
    return { onSaved, ...utils };
}

const l0Label = () => i18n.t('processes:form.l0_area');
const l1Label = () => i18n.t('processes:form.l1_process');

beforeEach(() => {
    vi.clearAllMocks();
    mockGetClosedLists.mockResolvedValue({});
});

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('ProcessForm — Field migration + per-field validation (#59)', () => {
    it('associates both required identity controls with distinct labels + aria-required', () => {
        renderForm();
        expect(screen.getByRole('textbox', { name: l0Label() })).toHaveAttribute('aria-required', 'true');
        expect(screen.getByRole('textbox', { name: l1Label() })).toHaveAttribute('aria-required', 'true');
    });

    it('on empty submit: both fields are aria-invalid with per-field errors, focus on the first (l0)', async () => {
        const user = userEvent.setup();
        renderForm();

        await user.click(screen.getByTestId('process-form-submit'));

        const l0 = screen.getByRole('textbox', { name: l0Label() });
        const l1 = screen.getByRole('textbox', { name: l1Label() });
        expect(l0).toHaveAttribute('aria-invalid', 'true');
        expect(l1).toHaveAttribute('aria-invalid', 'true');
        expect(l0).toHaveFocus();
        expect(screen.getByText(i18n.t('processes:form.errors.l0_area_required'))).toBeInTheDocument();
        expect(screen.getByText(i18n.t('processes:form.errors.l1_process_required'))).toBeInTheDocument();
        expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('moves focus to l1 when only l0 is filled', async () => {
        const user = userEvent.setup();
        renderForm();

        await user.type(screen.getByRole('textbox', { name: l0Label() }), 'Payments');
        await user.click(screen.getByTestId('process-form-submit'));

        const l1 = screen.getByRole('textbox', { name: l1Label() });
        expect(l1).toHaveAttribute('aria-invalid', 'true');
        expect(l1).toHaveFocus();
        expect(mockCreateProcess).not.toHaveBeenCalled();
    });

    it('submits successfully when both identity fields are filled', async () => {
        const user = userEvent.setup();
        mockCreateProcess.mockResolvedValue({ id: 3 });
        const { onSaved } = renderForm();

        await user.type(screen.getByRole('textbox', { name: l0Label() }), 'Payments');
        await user.type(screen.getByRole('textbox', { name: l1Label() }), 'Settlement');
        await user.click(screen.getByTestId('process-form-submit'));

        await waitFor(() => expect(mockCreateProcess).toHaveBeenCalledTimes(1));
        expect(onSaved).toHaveBeenCalledTimes(1);
    });

    it('surfaces the save-failed banner when the request rejects', async () => {
        const user = userEvent.setup();
        mockCreateProcess.mockRejectedValue(new Error('boom'));
        renderForm();

        await user.type(screen.getByRole('textbox', { name: l0Label() }), 'Payments');
        await user.type(screen.getByRole('textbox', { name: l1Label() }), 'Settlement');
        await user.click(screen.getByTestId('process-form-submit'));

        expect(await screen.findByText(i18n.t('processes:form.errors.save_failed'))).toBeInTheDocument();
    });

    it('reads .isError on the closed-lists fetch with a retry affordance', async () => {
        mockGetClosedLists.mockRejectedValue(new Error('down'));
        renderForm();

        expect(await screen.findByText(i18n.t('processes:form.errors.lists_failed'))).toBeInTheDocument();
        expect(screen.getByRole('button', { name: i18n.t('processes:actions.retry') })).toBeInTheDocument();
    });

    it('has no axe violations in the validation-error state (N10)', async () => {
        const user = userEvent.setup();
        const { container } = renderForm();

        await user.click(screen.getByTestId('process-form-submit'));
        expect(screen.getByRole('alert')).toBeInTheDocument();

        await expectNoAxeViolations(container);
    });
});
