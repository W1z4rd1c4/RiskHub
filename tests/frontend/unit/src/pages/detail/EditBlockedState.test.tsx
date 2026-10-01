import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { DetailField, DetailFieldList } from '@/pages/detail/DetailField';
import { EditBlockedState } from '@/pages/detail/EditBlockedState';
import { renderWithoutProviders, screen } from '@test/render';

/**
 * Audit 2026-09-30 §4.14 / roadmap 1.10 (D7, D14, SM-05, AX-06): the blocked
 * edit route has one `h1`, a destination-labelled back link, breadcrumbs and a
 * warning-toned reason; detail fields are `dl`/`dt`/`dd` pairs.
 */

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('EditBlockedState', () => {
    it('renders one h1, the record name, a labelled back link and the default warning', () => {
        renderWithoutProviders(
            <MemoryRouter>
                <EditBlockedState
                    entityName="Ransomware"
                    back={{ label: 'Back to Ransomware', to: '/threats/7' }}
                    breadcrumbs={[{ label: 'Threats', to: '/threats' }, { label: 'Ransomware', to: '/threats/7' }, { label: 'Edit' }]}
                    notice={<p>Stale data</p>}
                    testId="blocked"
                >
                    <section data-testid="pending-panel">Pending change</section>
                </EditBlockedState>
            </MemoryRouter>,
        );

        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Editing is temporarily locked');
        expect(screen.getByText('Ransomware', { selector: 'div' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Back to Ransomware' })).toHaveAttribute('href', '/threats/7');
        expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
        const warning = screen.getByRole('status');
        expect(warning).toHaveAttribute('data-tone', 'warning');
        expect(warning).toHaveTextContent('A pending governed change must be resolved before this record can be edited.');
        expect(screen.getByTestId('pending-panel')).toBeInTheDocument();
        expect(screen.getByText('Stale data')).toBeInTheDocument();
        expect(document.title).toBe('Editing is temporarily locked · RiskHub');
    });

    it('localizes the defaults, accepts a custom title and hides the reason with null', async () => {
        await i18n.changeLanguage('cs');
        const { rerender } = renderWithoutProviders(
            <MemoryRouter>
                <EditBlockedState back={{ label: 'Zpět na Proces A', onClick: () => undefined }} documentTitle="Proces A" />
            </MemoryRouter>,
        );
        expect(screen.getByRole('heading', { level: 1, name: 'Úpravy jsou dočasně uzamčeny' })).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Před úpravou tohoto záznamu je nutné vyřešit čekající řízenou změnu.');
        expect(screen.getByRole('button', { name: 'Zpět na Proces A' })).toBeInTheDocument();
        expect(document.title).toBe('Proces A · RiskHub');

        rerender(
            <MemoryRouter>
                <EditBlockedState title="Locked" reason={null} back={{ label: 'Zpět', onClick: () => undefined }} />
            </MemoryRouter>,
        );
        expect(screen.getByRole('heading', { level: 1, name: 'Locked' })).toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
});

describe('DetailField', () => {
    it('renders dt/dd pairs inside one dl with the eyebrow label role', () => {
        const { container } = renderWithoutProviders(
            <DetailFieldList>
                <DetailField label="Category" value="Integrity" testId="category" />
                <DetailField label="Notes" value="Long text" className="md:col-span-2" />
            </DetailFieldList>,
        );

        const list = container.querySelector('dl');
        expect(list).not.toBeNull();
        expect(list?.querySelectorAll('dt')).toHaveLength(2);
        expect(screen.getByText('Category').tagName).toBe('DT');
        expect(screen.getByText('Category')).toHaveClass('text-eyebrow');
        const value = screen.getByTestId('category');
        expect(value.tagName).toBe('DD');
        expect(value).toHaveTextContent('Integrity');
        expect(screen.getByText('Long text').parentElement).toHaveClass('md:col-span-2');
        expect(container.querySelector('label')).toBeNull();
    });

    it.each([null, undefined, ''])('shows a hidden dash announced as "Not set" for %p', async (empty) => {
        renderWithoutProviders(<dl><DetailField label="Steward" value={empty} testId="steward" /></dl>);
        const value = screen.getByTestId('steward');
        expect(value.querySelector('[aria-hidden="true"]')).toHaveTextContent('—');
        expect(screen.getByText('Not set')).toHaveClass('sr-only');

        await i18n.changeLanguage('cs');
        expect(await screen.findByText('Nenastaveno')).toBeInTheDocument();
    });
});
