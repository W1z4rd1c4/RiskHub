/**
 * FR-P2b-1/2/3/5 (findings C1/C4) — VendorRegisterSection labels migrated to the
 * accessible `Field` primitive so every register control has an associated,
 * distinct accessible name, and a dropped closed-lists fetch surfaces a
 * retryable notice instead of silently-empty dropdowns.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import * as axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetClosedLists = vi.fn();

vi.mock('@/services/assetApi', () => ({
    assetApi: {
        getClosedLists: (...args: unknown[]) => mockGetClosedLists(...args),
    },
}));

import { VendorRegisterSection } from '@/components/vendor-form/VendorRegisterSection';
import type { VendorFormData } from '@/components/vendor-form/vendorForm.types';
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

function renderSection(formData: VendorFormData = {} as VendorFormData) {
    const onChange = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const utils = render(
        <QueryClientProvider client={client}>
            <VendorRegisterSection formData={formData} onChange={onChange} />
        </QueryClientProvider>,
    );
    return { onChange, ...utils };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockGetClosedLists.mockResolvedValue({});
});

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('VendorRegisterSection — label association (#59)', () => {
    it('associates a text register control with its visible label', () => {
        renderSection();
        expect(
            screen.getByRole('textbox', { name: i18n.t('vendors:form.register.fields.latin_name') }),
        ).toBeInTheDocument();
    });

    it('reads .isError on the closed-lists fetch with a refresh affordance', async () => {
        mockGetClosedLists.mockRejectedValue(new Error('network down'));
        renderSection();

        expect(await screen.findByText(i18n.t('vendors:form.register.lists_failed'))).toBeInTheDocument();
        expect(screen.getByRole('button', { name: i18n.t('vendors:actions.refresh') })).toBeInTheDocument();
    });

    it('has no axe violations across the migrated register fields', async () => {
        const { container } = renderSection();
        await expectNoAxeViolations(container);
    });

    it('offers only canonical identifier types while preserving a stored legacy selection', async () => {
        mockGetClosedLists.mockResolvedValue({
            TypKodu: ['LEI', 'EUID', 'CRN', 'VAT', 'PNR', 'NIN'],
        });
        renderSection({ identifier_type: 'IČO (CRN)' } as VendorFormData);

        const select = await screen.findByRole('combobox', {
            name: i18n.t('vendors:form.register.fields.identifier_type'),
        });
        expect(select).toHaveTextContent('IČO (CRN)');
        fireEvent.click(select);
        expect(screen.getByRole('option', { name: 'IČO (CRN)' })).toBeInTheDocument();
        expect(screen.queryByRole('option', { name: 'Jiný' })).not.toBeInTheDocument();
        for (const code of ['LEI', 'EUID', 'CRN', 'VAT', 'PNR', 'NIN']) {
            expect(await screen.findByRole('option', { name: code })).toBeInTheDocument();
        }
    });
});
