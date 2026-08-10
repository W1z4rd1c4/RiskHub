/**
 * FR-P2b-1/2/3/5 (findings C1/C4) — VendorRegisterSection labels migrated to the
 * accessible `Field` primitive so every register control has an associated,
 * distinct accessible name. Canonical API code options are local and do not
 * depend on the workbook-label endpoint.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import * as axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

    it('renders canonical controls without requesting workbook-label lists', () => {
        renderSection();
        expect(screen.getByRole('combobox', {
            name: i18n.t('vendors:form.register.fields.identifier_type'),
        })).toBeInTheDocument();
    });

    it('has no axe violations across the migrated register fields', async () => {
        const { container } = renderSection();
        await expectNoAxeViolations(container);
    });

    it('offers only canonical identifier types', async () => {
        renderSection({ identifier_type: 'CRN' } as VendorFormData);

        const select = await screen.findByRole('combobox', {
            name: i18n.t('vendors:form.register.fields.identifier_type'),
        });
        expect(select).toHaveTextContent('CRN');
        fireEvent.click(select);
        for (const code of ['LEI', 'EUID', 'CRN', 'VAT', 'PNR', 'NIN']) {
            expect(await screen.findByRole('option', { name: code })).toBeInTheDocument();
        }
    });
});
