import { fireEvent, screen, userEvent, waitFor, within, renderWithoutProviders as render } from '@test/render';
import { server } from '@test/mocks/server';
import { HttpResponse, http } from 'msw';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAuthz, type PermissionChecker } from '@/authz/policy';
import { DestinationLauncher } from '@/components/layout/DestinationLauncher';
import i18n from '@/i18n';
import { getSidebarNavRoutes } from '@/routing';

const FULL_PERMISSIONS = [
    'activity_log:read',
    'assets:read',
    'controls:read',
    'departments:read',
    'ict_committee:read',
    'issues:read',
    'processes:read',
    'risks:read',
    'threats:read',
    'users:read',
    'users:write',
    'vendors:read',
];

function createContext(permissions = FULL_PERMISSIONS) {
    const allowed = new Set(permissions);
    const hasPermission: PermissionChecker = (resource, action) => allowed.has(`${resource}:${action}`);
    const authz = buildAuthz(
        { role: 'risk_manager', access_scope: 'global' },
        hasPermission,
        undefined,
        false,
    );
    return { authz, hasPermission };
}

function LocationProbe() {
    return <output data-testid="location">{useLocation().pathname}</output>;
}

function renderLauncher(permissions = FULL_PERMISSIONS) {
    const context = createContext(permissions);
    return render(
        <MemoryRouter>
            <DestinationLauncher routes={getSidebarNavRoutes(context)} />
            <LocationProbe />
        </MemoryRouter>,
    );
}

describe('DestinationLauncher', () => {
    beforeEach(async () => {
        server.use(
            http.get('*/api/v1/go-to/records', () => HttpResponse.json([])),
        );
        await i18n.changeLanguage('en');
    });

    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it('opens from the visible control or document shortcut and initially focuses search', async () => {
        const user = userEvent.setup();
        renderLauncher();

        const launcher = screen.getByRole('button', { name: 'Go to' });
        expect(launcher).toBeVisible();

        await user.click(launcher);
        const dialog = screen.getByRole('dialog', { name: 'Go to' });
        expect(dialog).toHaveAccessibleDescription('Search the destinations and records available to you.');
        expect(screen.getByRole('combobox', { name: 'Search destinations and records' })).toHaveFocus();

        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        fireEvent.keyDown(document, { key: 'k', metaKey: true });
        expect(screen.getByRole('dialog', { name: 'Go to' })).toBeVisible();
        await waitFor(() => {
            expect(screen.getByRole('combobox', { name: 'Search destinations and records' })).toHaveFocus();
        });
    });

    it('requests one trimmed record search after two characters without fanning out', async () => {
        const queries: string[] = [];
        const fanOut = vi.fn();
        const registerPaths = [
            'risks',
            'controls',
            'kris',
            'issues',
            'vendors',
            'processes',
            'assets',
            'threats',
        ];
        server.use(
            http.get('*/api/v1/go-to/records', ({ request }) => {
                queries.push(new URL(request.url).searchParams.get('q') ?? '');
                return HttpResponse.json([]);
            }),
            ...registerPaths.map((path) => http.get(`*/api/v1/${path}`, () => {
                fanOut(path);
                return HttpResponse.json([]);
            })),
        );
        const user = userEvent.setup();
        renderLauncher();

        await user.click(screen.getByRole('button', { name: 'Go to' }));
        const search = screen.getByRole('combobox', { name: 'Search destinations and records' });

        await user.type(search, 'a');
        await new Promise((resolve) => setTimeout(resolve, 350));
        expect(queries).toEqual([]);

        await user.clear(search);
        await user.type(search, '  risk  ');
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(queries).toEqual([]);
        await waitFor(() => expect(queries).toEqual(['risk']), { timeout: 1_500 });
        await new Promise((resolve) => setTimeout(resolve, 350));

        expect(queries).toEqual(['risk']);
        expect(fanOut).not.toHaveBeenCalled();
        expect(screen.getByText('No records found.')).toBeVisible();

        queries.length = 0;
        await user.clear(search);
        await user.type(search, 'risk');
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(queries).toEqual([]);
        await waitFor(() => expect(queries).toEqual(['risk']), { timeout: 1_500 });
    });

    it.each([
        ['en', 'Risk', 'Vendor outage', 'Active'],
        ['cs', 'Riziko', 'Výpadek dodavatele', 'Aktivní'],
    ])('groups safe %s record results without exposing route IDs or unknown status codes', async (
        language,
        riskLabel,
        displayName,
        activeLabel,
    ) => {
        await i18n.changeLanguage(language);
        server.use(
            http.get('*/api/v1/go-to/records', () => HttpResponse.json([
                {
                    entity_type: 'risk',
                    business_identifier: 'RSK-007',
                    display_name: displayName,
                    status: 'active',
                    destination: '/risks/84',
                },
                {
                    entity_type: 'control',
                    business_identifier: null,
                    display_name: language === 'en' ? 'Access review' : 'Kontrola přístupu',
                    status: 'future_backend_code',
                    destination: '/controls/91',
                },
            ])),
        );
        const user = userEvent.setup();
        renderLauncher();

        await user.click(screen.getByRole('button', {
            name: language === 'en' ? 'Go to' : 'Přejít na',
        }));
        await user.type(screen.getByRole('combobox'), language === 'en' ? 'risk' : 'rizik');

        const listbox = await screen.findByRole('listbox', {
            name: language === 'en' ? 'Go to results' : 'Výsledky navigace',
        });
        expect(within(listbox).getByRole('group', {
            name: language === 'en' ? 'Destinations' : 'Cíle navigace',
        })).toBeVisible();
        expect(await screen.findByRole('option', {
            name: `${riskLabel} RSK-007 ${displayName} ${activeLabel}`,
        })).toBeVisible();
        const records = within(listbox).getByRole('group', {
            name: language === 'en' ? 'Records' : 'Záznamy',
        });
        expect(within(records).getByRole('option', {
            name: language === 'en'
                ? 'Control Access review Unknown status'
                : 'Kontrola Kontrola přístupu Neznámý stav',
        })).toBeVisible();

        const dialog = screen.getByRole('dialog');
        expect(dialog).not.toHaveTextContent('future_backend_code');
        expect(dialog).not.toHaveTextContent('/risks/84');
        expect(dialog).not.toHaveTextContent('/controls/91');
        expect(dialog).not.toHaveTextContent('84');
        expect(dialog).not.toHaveTextContent('91');
    });

    it('flattens destination and record options for keyboard and pointer navigation', async () => {
        server.use(
            http.get('*/api/v1/go-to/records', () => HttpResponse.json([
                {
                    entity_type: 'risk',
                    business_identifier: 'RSK-007',
                    display_name: 'Vendor outage',
                    status: 'active',
                    destination: '/risks/84',
                },
                {
                    entity_type: 'control',
                    business_identifier: 'CTL-010',
                    display_name: 'Access review',
                    status: 'draft',
                    destination: '/controls/91',
                },
            ])),
        );
        const user = userEvent.setup();
        renderLauncher();

        await user.click(screen.getByRole('button', { name: 'Go to' }));
        const search = screen.getByRole('combobox');
        await user.type(search, 'risk');
        const firstRecord = await screen.findByRole('option', {
            name: 'Risk RSK-007 Vendor outage Active',
        });
        const secondRecord = screen.getByRole('option', {
            name: 'Control CTL-010 Access review Draft',
        });
        const risksDestination = screen.getByRole('option', { name: 'Risks' });
        expect(risksDestination).toHaveAttribute('aria-selected', 'true');
        expect(search).toHaveAttribute('aria-activedescendant', risksDestination.id);

        await user.keyboard('{ArrowDown}{ArrowDown}');
        expect(firstRecord).toHaveAttribute('aria-selected', 'true');
        expect(search).toHaveAttribute('aria-activedescendant', firstRecord.id);
        await user.keyboard('{ArrowDown}{Enter}');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent('/controls/91');

        await user.click(screen.getByRole('button', { name: 'Go to' }));
        await user.type(screen.getByRole('combobox'), 'risk');
        await user.click(await screen.findByRole('option', {
            name: 'Risk RSK-007 Vendor outage Active',
        }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent('/risks/84');
        expect(secondRecord).not.toBeInTheDocument();
    });

    it('clears short-query records immediately and ignores an older late response', async () => {
        let releaseOld: (() => void) | undefined;
        let oldStarted = false;
        const oldPending = new Promise<void>((resolve) => {
            releaseOld = resolve;
        });
        const queries: string[] = [];
        server.use(
            http.get('*/api/v1/go-to/records', async ({ request }) => {
                const requestQuery = new URL(request.url).searchParams.get('q') ?? '';
                queries.push(requestQuery);
                if (requestQuery === 'old') {
                    oldStarted = true;
                    await oldPending;
                    return HttpResponse.json([{
                        entity_type: 'risk',
                        business_identifier: 'RSK-OLD',
                        display_name: 'Old result',
                        status: 'active',
                        destination: '/risks/84',
                    }]);
                }
                return HttpResponse.json([{
                    entity_type: 'risk',
                    business_identifier: 'RSK-NEW',
                    display_name: 'New result',
                    status: 'active',
                    destination: '/risks/85',
                }]);
            }),
        );
        const user = userEvent.setup();
        renderLauncher();

        await user.click(screen.getByRole('button', { name: 'Go to' }));
        const search = screen.getByRole('combobox');
        await user.type(search, 'old');
        await waitFor(() => expect(oldStarted).toBe(true), { timeout: 1_500 });
        await user.clear(search);
        await user.type(search, 'new');
        expect(await screen.findByRole('option', {
            name: 'Risk RSK-NEW New result Active',
        })).toBeVisible();

        releaseOld?.();
        await waitFor(() => expect(queries).toEqual(['old', 'new']));
        expect(screen.queryByText('Old result')).not.toBeInTheDocument();

        await user.clear(search);
        await user.type(search, 'n');
        expect(screen.queryByText('New result')).not.toBeInTheDocument();
        await new Promise((resolve) => setTimeout(resolve, 350));
        expect(queries).toEqual(['old', 'new']);
    });

    it('announces record failure distinctly and retries the retained query once', async () => {
        const requestedQueries: string[] = [];
        server.use(
            http.get('*/api/v1/go-to/records', ({ request }) => {
                requestedQueries.push(new URL(request.url).searchParams.get('q') ?? '');
                if (requestedQueries.length === 1) {
                    return HttpResponse.json({ detail: 'temporary' }, { status: 500 });
                }
                return HttpResponse.json([{
                    entity_type: 'issue',
                    business_identifier: 'ISS-014',
                    display_name: 'Evidence gap',
                    status: 'open',
                    destination: '/issues/14',
                }]);
            }),
        );
        const user = userEvent.setup();
        renderLauncher();

        await user.click(screen.getByRole('button', { name: 'Go to' }));
        await user.type(screen.getByRole('combobox'), 'gap');

        const unavailable = await screen.findByText('Records unavailable.');
        expect(unavailable).toBeVisible();
        expect(unavailable).toHaveAttribute('role', 'status');
        expect(screen.queryByText('No records found.')).not.toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(requestedQueries).toEqual(['gap']);

        await user.click(screen.getByRole('button', { name: 'Retry record search' }));
        expect(await screen.findByRole('option', {
            name: 'Issue ISS-014 Evidence gap Open',
        })).toBeVisible();
        expect(requestedQueries).toEqual(['gap', 'gap']);
    });

    it('treats capability-hidden records as backend absence without client-side register requests', async () => {
        const fanOut = vi.fn();
        let recordRequestCount = 0;
        server.use(
            http.get('*/api/v1/go-to/records', () => {
                recordRequestCount += 1;
                return HttpResponse.json([{
                    entity_type: 'risk',
                    business_identifier: 'RSK-007',
                    display_name: 'Visible risk',
                    status: 'active',
                    destination: '/risks/84',
                }]);
            }),
            http.get('*/api/v1/controls', () => {
                fanOut();
                return HttpResponse.json([]);
            }),
        );
        const user = userEvent.setup();
        renderLauncher(['risks:read']);

        await user.click(screen.getByRole('button', { name: 'Go to' }));
        await user.type(screen.getByRole('combobox'), 'visible');

        expect(await screen.findByRole('option', {
            name: 'Risk RSK-007 Visible risk Active',
        })).toBeVisible();
        expect(screen.queryByRole('option', { name: /Control/ })).not.toBeInTheDocument();
        expect(recordRequestCount).toBe(1);
        expect(fanOut).not.toHaveBeenCalled();
    });

    it.each([
        ['en', 'Go to', 'Search destinations and records', 'Destinations', 'appetite', 'KRIs', 'Risk appetite monitoring'],
        ['cs', 'Přejít na', 'Hledat cíle navigace a záznamy', 'Cíle navigace', 'apetitu', 'KRI', 'Sledování rizikového apetitu'],
    ])('uses canonical %s labels and supporting terms from the route map', async (
        language,
        triggerLabel,
        searchLabel,
        groupLabel,
        query,
        destinationLabel,
        supportingTerm,
    ) => {
        await i18n.changeLanguage(language);
        const user = userEvent.setup();
        renderLauncher();

        await user.click(screen.getByRole('button', { name: triggerLabel }));
        expect(screen.getByText(language === 'en'
            ? 'Type at least one character to search destinations.'
            : 'Pro vyhledání zadejte alespoň jeden znak.')).toBeVisible();

        await user.type(screen.getByRole('combobox', { name: searchLabel }), query);

        const group = screen.getByRole('group', { name: groupLabel });
        expect(group).toBeVisible();
        expect(screen.getByRole('listbox', {
            name: language === 'en' ? 'Go to results' : 'Výsledky navigace',
        })).toBeVisible();
        const option = screen.getByRole('option', {
            name: `${destinationLabel} ${supportingTerm}`,
        });
        expect(option).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText(supportingTerm)).toBeVisible();
    });

    it('starts searching at one character and omits destinations outside the capability set', async () => {
        const user = userEvent.setup();
        renderLauncher(['risks:read']);

        await user.click(screen.getByRole('button', { name: 'Go to' }));
        const search = screen.getByRole('combobox', { name: 'Search destinations and records' });
        await user.type(search, 'r');

        expect(screen.getByRole('option', { name: 'Risks' })).toBeVisible();
        expect(screen.queryByRole('option', { name: 'Controls' })).not.toBeInTheDocument();

        await user.clear(search);
        await user.type(search, 'Controls');
        const emptyStatus = screen.getByText('No available destinations match your search.');
        expect(emptyStatus).toHaveAttribute('role', 'status');
        expect(emptyStatus).toHaveTextContent('No available destinations match your search.');
        expect(search.getAttribute('aria-describedby')).toContain(emptyStatus.id);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.queryAllByRole('option')).toHaveLength(0);
    });

    it('bounds broad results to the viewport and scrolls Arrow navigation into view', async () => {
        const user = userEvent.setup();
        const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
        const scrollIntoView = vi.fn();
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
            configurable: true,
            value: scrollIntoView,
        });

        try {
            renderLauncher();
            await user.click(screen.getByRole('button', { name: 'Go to' }));
            const dialog = screen.getByRole('dialog');
            const search = screen.getByRole('combobox', { name: 'Search destinations and records' });
            await user.type(search, 'i');

            const listbox = screen.getByRole('listbox', { name: 'Go to results' });
            expect(screen.getAllByRole('option').length).toBeGreaterThan(5);
            expect(dialog).toHaveClass('max-h-[calc(100dvh-2rem)]');
            expect(listbox).toHaveClass('overflow-y-auto');

            scrollIntoView.mockClear();
            await user.keyboard('{ArrowDown}');
            await waitFor(() => {
                expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
            });
        } finally {
            Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
                configurable: true,
                value: originalScrollIntoView,
            });
        }
    });

    it('supports listbox keyboard selection and pointer navigation', async () => {
        const user = userEvent.setup();
        renderLauncher();

        await user.click(screen.getByRole('button', { name: 'Go to' }));
        const search = screen.getByRole('combobox', { name: 'Search destinations and records' });
        await user.type(search, 'risk');

        const risks = screen.getByRole('option', { name: 'Risks' });
        const kris = screen.getByRole('option', { name: 'KRIs Risk appetite monitoring' });
        expect(risks).toHaveAttribute('aria-selected', 'true');
        expect(search).toHaveAttribute('aria-activedescendant', risks.id);

        await user.keyboard('{ArrowDown}');
        expect(kris).toHaveAttribute('aria-selected', 'true');
        expect(search).toHaveAttribute('aria-activedescendant', kris.id);
        await user.keyboard('{ArrowUp}{ArrowDown}{Enter}');

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent('/kris');

        await user.click(screen.getByRole('button', { name: 'Go to' }));
        await user.type(screen.getByRole('combobox', { name: 'Search destinations and records' }), 'Settings');
        await user.click(screen.getByRole('option', { name: 'Settings' }));

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent('/settings');
    });

    it('traps focus and restores it to the opener when Escape closes the dialog', async () => {
        const user = userEvent.setup();
        renderLauncher();

        const launcher = screen.getByRole('button', { name: 'Go to' });
        launcher.focus();
        await user.click(launcher);

        const search = screen.getByRole('combobox', { name: 'Search destinations and records' });
        await user.type(search, 'risk');
        expect(screen.getAllByRole('option')).toHaveLength(2);
        const close = screen.getByRole('button', { name: 'Close' });
        close.focus();
        await user.tab({ shift: true });
        expect(search).toHaveFocus();
        await user.tab();
        expect(close).toHaveFocus();

        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        await waitFor(() => expect(launcher).toHaveFocus());

        fireEvent.keyDown(document, { key: 'K', ctrlKey: true });
        expect(screen.getByRole('dialog', { name: 'Go to' })).toBeVisible();
    });
});
