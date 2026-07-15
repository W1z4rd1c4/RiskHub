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
const mockGetAssetOwners = vi.fn();
const mockGetAssetDepartments = vi.fn();

vi.mock('@/services/assetApi', () => ({
    assetApi: {
        getClosedLists: (...args: unknown[]) => mockGetClosedLists(...args),
        createAsset: (...args: unknown[]) => mockCreateAsset(...args),
        updateAsset: (...args: unknown[]) => mockUpdateAsset(...args),
    },
}));
vi.mock('@/services/logger', () => ({ logError: vi.fn() }));
vi.mock('@/services/lookupApi', () => ({
    lookupApi: {
        getAssetOwners: (...args: unknown[]) => mockGetAssetOwners(...args),
        getAssetDepartments: (...args: unknown[]) => mockGetAssetDepartments(...args),
    },
}));

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

async function renderForm() {
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
    await waitFor(() => {
        expect(mockGetClosedLists).toHaveBeenCalledTimes(1);
        expect(mockGetAssetOwners).toHaveBeenCalledTimes(2);
        expect(mockGetAssetDepartments).toHaveBeenCalledTimes(1);
    });
    return { onSaved, ...utils };
}

const nameLabel = () => i18n.t('assets:form.name');

beforeEach(() => {
    vi.clearAllMocks();
    mockGetClosedLists.mockResolvedValue({});
    mockGetAssetOwners.mockResolvedValue([{
        id: 11, name: 'Alex Owner', email: 'alex@example.test', role_name: 'business_owner',
        department_id: 4, department_name: 'Operations',
    }]);
    mockGetAssetDepartments.mockResolvedValue([{ id: 4, name: 'Operations', code: 'OPS' }]);
});

async function fillRequiredOwnership(user: ReturnType<typeof userEvent.setup>) {
    await waitFor(() => expect(mockGetAssetOwners).toHaveBeenCalledTimes(2));
    await user.click(screen.getByTestId('asset-form-business-owner'));
    await user.click(await screen.findByRole('option', { name: /Alex Owner/ }));
    await user.click(screen.getByTestId('asset-form-ict-owner'));
    await user.click(await screen.findByRole('option', { name: /Alex Owner/ }));
}

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('AssetForm — Field migration + validation (#59)', () => {
    it('associates the required name control with its label and exposes aria-required', async () => {
        await renderForm();
        const name = screen.getByRole('textbox', { name: nameLabel() });
        expect(name).toHaveAttribute('aria-required', 'true');
        expect(name).not.toHaveAttribute('aria-invalid');
    });

    it('on invalid submit: focuses the first invalid field, sets aria-invalid, and shows a role=alert summary', async () => {
        const user = userEvent.setup();
        await renderForm();

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
        const { onSaved } = await renderForm();

        await user.type(screen.getByRole('textbox', { name: nameLabel() }), 'Payroll DB');
        await fillRequiredOwnership(user);
        await user.click(screen.getByTestId('asset-form-submit'));

        await waitFor(() => expect(mockCreateAsset).toHaveBeenCalledTimes(1));
        expect(onSaved).toHaveBeenCalledTimes(1);
        expect(mockCreateAsset).toHaveBeenCalledWith(expect.objectContaining({
            business_owner_user_id: 11,
            ict_owner_user_id: 11,
            owning_department_id: 4,
        }));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('surfaces the save-failed banner when the request rejects', async () => {
        const user = userEvent.setup();
        mockCreateAsset.mockRejectedValue(new Error('boom'));
        await renderForm();

        await user.type(screen.getByRole('textbox', { name: nameLabel() }), 'Payroll DB');
        await fillRequiredOwnership(user);
        await user.click(screen.getByTestId('asset-form-submit'));

        expect(await screen.findByText(i18n.t('assets:form.errors.save_failed'))).toBeInTheDocument();
    });

    it('reads .isError on the closed-lists fetch — a retryable notice, not a silent empty dropdown', async () => {
        mockGetClosedLists.mockRejectedValue(new Error('network down'));
        await renderForm();

        expect(await screen.findByText(i18n.t('assets:form.errors.lists_failed'))).toBeInTheDocument();
        expect(screen.getByRole('button', { name: i18n.t('assets:actions.retry') })).toBeInTheDocument();
    });

    it('has no axe violations in the validation-error state (N10)', async () => {
        const user = userEvent.setup();
        const { container } = await renderForm();

        await user.click(screen.getByTestId('asset-form-submit'));
        expect(screen.getByRole('alert')).toBeInTheDocument();

        await expectNoAxeViolations(container);
    });
});

describe('AssetForm — ownership acceptance (#75)', () => {
    beforeEach(() => {
        mockGetAssetOwners.mockResolvedValue([
            {
                id: 11, name: 'Alex Owner', email: 'alex@example.test', role_name: 'business_owner',
                department_id: 4, department_name: 'Operations',
            },
            {
                id: 22, name: 'Taylor Owner', email: 'taylor@example.test', role_name: 'ict_owner',
                department_id: 9, department_name: 'IT',
            },
            {
                id: 33, name: 'Casey Owner', email: 'casey@example.test', role_name: 'asset_owner',
                department_id: 8, department_name: 'Finance',
            },
        ]);
        mockGetAssetDepartments.mockResolvedValue([
            { id: 4, name: 'Operations', code: 'OPS' },
            { id: 8, name: 'Finance', code: 'FIN' },
            { id: 9, name: 'IT', code: 'IT' },
        ]);
    });

    it('fills an empty Department from Business Owner while ICT Owner changes remain independent', async () => {
        const user = userEvent.setup();
        mockCreateAsset.mockResolvedValue({ id: 75, name: 'Cross-department service' });
        await renderForm();
        await user.type(screen.getByRole('textbox', { name: nameLabel() }), 'Cross-department service');

        const department = screen.getByTestId('asset-form-owner-department');
        await user.click(screen.getByTestId('asset-form-business-owner'));
        const operationsOwner = await screen.findByRole('option', { name: /Alex Owner.*Operations/ });
        expect(operationsOwner).toHaveTextContent('Operations');
        await user.click(operationsOwner);
        expect(department).toHaveTextContent('Operations (OPS)');

        await user.click(screen.getByTestId('asset-form-ict-owner'));
        const itOwner = await screen.findByRole('option', { name: /Taylor Owner.*IT/ });
        expect(itOwner).toHaveTextContent('IT');
        await user.click(itOwner);
        expect(department).toHaveTextContent('Operations (OPS)');

        await user.click(screen.getByTestId('asset-form-ict-owner'));
        const financeOwner = await screen.findByRole('option', { name: /Casey Owner.*Finance/ });
        expect(financeOwner).toHaveTextContent('Finance');
        await user.click(financeOwner);
        expect(department).toHaveTextContent('Operations (OPS)');

        await user.click(screen.getByTestId('asset-form-submit'));
        await waitFor(() => expect(mockCreateAsset).toHaveBeenCalledTimes(1));
        expect(mockCreateAsset).toHaveBeenCalledWith(expect.objectContaining({
            business_owner_user_id: 11,
            ict_owner_user_id: 33,
            owning_department_id: 4,
        }));
    });

    it('preserves a manually selected Department across Business Owner changes', async () => {
        const user = userEvent.setup();
        mockCreateAsset.mockResolvedValue({ id: 76, name: 'Manual-department service' });
        await renderForm();
        await user.type(screen.getByRole('textbox', { name: nameLabel() }), 'Manual-department service');

        const department = screen.getByTestId('asset-form-owner-department');
        await user.click(department);
        await user.click(await screen.findByRole('option', { name: 'Finance (FIN)' }));

        await user.click(screen.getByTestId('asset-form-business-owner'));
        const operationsOwner = await screen.findByRole('option', { name: /Alex Owner.*Operations/ });
        expect(operationsOwner).toHaveTextContent('Operations');
        await user.click(operationsOwner);
        expect(department).toHaveTextContent('Finance (FIN)');

        await user.click(screen.getByTestId('asset-form-business-owner'));
        const itOwner = await screen.findByRole('option', { name: /Taylor Owner.*IT/ });
        expect(itOwner).toHaveTextContent('IT');
        await user.click(itOwner);
        expect(department).toHaveTextContent('Finance (FIN)');

        await user.click(screen.getByTestId('asset-form-ict-owner'));
        const financeOwner = await screen.findByRole('option', { name: /Casey Owner.*Finance/ });
        expect(financeOwner).toHaveTextContent('Finance');
        await user.click(financeOwner);
        expect(department).toHaveTextContent('Finance (FIN)');

        await user.click(screen.getByTestId('asset-form-submit'));
        await waitFor(() => expect(mockCreateAsset).toHaveBeenCalledTimes(1));
        expect(mockCreateAsset).toHaveBeenCalledWith(expect.objectContaining({
            business_owner_user_id: 22,
            ict_owner_user_id: 33,
            owning_department_id: 8,
        }));
    });
});
