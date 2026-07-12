/**
 * FR-P2b-1/2/3/5 (spec N11–N13, findings C1/C4/C5) — AssetForm migrated to the
 * accessible `Field` primitive with the locked validation model: native
 * `required` kept + `noValidate` on the form + per-field JS validation that
 * focuses the first invalid control, exposes `aria-invalid`, and renders a
 * `role="alert"` summary. Also covers reading `.isError` on the in-form
 * closed-lists fetch (C4) so a dropped request is not a silent empty dropdown.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import * as axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetClosedLists = vi.fn();
const mockCreateAsset = vi.fn();
const mockUpdateAsset = vi.fn();

vi.mock('@/services/assetApi', () => ({
    assetApi: {
        getClosedLists: (...args: unknown[]) => mockGetClosedLists(...args),
        createAsset: (...args: unknown[]) => mockCreateAsset(...args),
        updateAsset: (...args: unknown[]) => mockUpdateAsset(...args),
    },
}));
vi.mock('@/services/logger', () => ({ logError: vi.fn() }));

import { AssetForm } from '@/pages/assets/AssetForm';
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
                <AssetForm onSaved={onSaved} />
            </MemoryRouter>
        </QueryClientProvider>,
    );
    return { onSaved, ...utils };
}

const nameLabel = () => i18n.t('assets:form.name');

beforeEach(() => {
    vi.clearAllMocks();
    mockGetClosedLists.mockResolvedValue({});
});

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('AssetForm — Field migration + validation (#59)', () => {
    it('associates the required name control with its label and exposes aria-required', () => {
        renderForm();
        const name = screen.getByRole('textbox', { name: nameLabel() });
        expect(name).toHaveAttribute('aria-required', 'true');
        expect(name).not.toHaveAttribute('aria-invalid');
    });

    it('on invalid submit: focuses the first invalid field, sets aria-invalid, and shows a role=alert summary', async () => {
        const user = userEvent.setup();
        renderForm();

        await user.click(screen.getByTestId('asset-form-submit'));

        const name = screen.getByRole('textbox', { name: nameLabel() });
        expect(name).toHaveAttribute('aria-invalid', 'true');
        expect(name).toHaveFocus();

        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent(i18n.t('assets:form.errors.fix_fields'));
        expect(screen.getByText(i18n.t('assets:form.errors.name_required'))).toBeInTheDocument();
        expect(mockCreateAsset).not.toHaveBeenCalled();
    });

    it('submits successfully once the required field is filled', async () => {
        const user = userEvent.setup();
        mockCreateAsset.mockResolvedValue({ id: 7, name: 'Payroll DB' });
        const { onSaved } = renderForm();

        await user.type(screen.getByRole('textbox', { name: nameLabel() }), 'Payroll DB');
        await user.click(screen.getByTestId('asset-form-submit'));

        await waitFor(() => expect(mockCreateAsset).toHaveBeenCalledTimes(1));
        expect(onSaved).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('surfaces the save-failed banner when the request rejects', async () => {
        const user = userEvent.setup();
        mockCreateAsset.mockRejectedValue(new Error('boom'));
        renderForm();

        await user.type(screen.getByRole('textbox', { name: nameLabel() }), 'Payroll DB');
        await user.click(screen.getByTestId('asset-form-submit'));

        expect(await screen.findByText(i18n.t('assets:form.errors.save_failed'))).toBeInTheDocument();
    });

    it('reads .isError on the closed-lists fetch — a retryable notice, not a silent empty dropdown', async () => {
        mockGetClosedLists.mockRejectedValue(new Error('network down'));
        renderForm();

        expect(await screen.findByText(i18n.t('assets:form.errors.lists_failed'))).toBeInTheDocument();
        expect(screen.getByRole('button', { name: i18n.t('assets:actions.retry') })).toBeInTheDocument();
    });

    it('has no axe violations in the validation-error state (N10)', async () => {
        const user = userEvent.setup();
        const { container } = renderForm();

        await user.click(screen.getByTestId('asset-form-submit'));
        expect(screen.getByRole('alert')).toBeInTheDocument();

        await expectNoAxeViolations(container);
    });
});
