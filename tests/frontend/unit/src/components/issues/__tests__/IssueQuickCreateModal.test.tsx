import { useState, type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { IssueQuickCreateModal } from '@/components/issues/IssueQuickCreateModal';

const createContextualMock = vi.fn();

vi.mock('@/services/issuesApi', () => ({
    issuesApi: {
        createContextual: (...args: unknown[]) => createContextualMock(...args),
    },
}));

function renderWithDataRouter(element: ReactNode) {
    const router = createMemoryRouter([{ path: '/', element }]);
    return { router, ...render(<RouterProvider router={router} />) };
}

function ControlledQuickCreateModal({ onCreated = () => {} }: { onCreated?: () => void }) {
    const [isOpen, setIsOpen] = useState(true);
    const [closeCount, setCloseCount] = useState(0);
    return (
        <>
            <button type="button" onClick={() => setIsOpen(true)}>Open modal</button>
            <output data-testid="close-count">{closeCount}</output>
            <IssueQuickCreateModal
                isOpen={isOpen}
                onClose={() => {
                    setCloseCount((current) => current + 1);
                    setIsOpen(false);
                }}
                onCreated={onCreated}
                contextEntityType="risk"
                contextEntityId={123}
                contextEntityLabel="Claims Settlement Risk"
            />
        </>
    );
}

function NavigateOnCreatedQuickCreateModal({
    onClose,
    onCreated,
}: {
    onClose: () => void;
    onCreated: () => void;
}) {
    const navigate = useNavigate();
    return (
        <IssueQuickCreateModal
            isOpen
            onClose={onClose}
            onCreated={(issue) => {
                onCreated();
                void navigate(`/issues/${issue.id}`);
            }}
            contextEntityType="control"
            contextEntityId={45}
            contextEntityLabel="Wire Transfer Reconciliation"
        />
    );
}

describe('IssueQuickCreateModal', () => {
    const onClose = vi.fn();
    const onCreated = vi.fn();

    beforeEach(() => {
        createContextualMock.mockReset();
        onClose.mockReset();
        onCreated.mockReset();
    });

    it('keeps a dirty draft on Stay and closes once on Leave from the header action', async () => {
        const user = userEvent.setup();
        renderWithDataRouter(<ControlledQuickCreateModal />);
        const title = await screen.findByPlaceholderText('Issue title');

        await user.clear(title);
        await user.type(title, 'Investigate contextual finding');
        await user.click(screen.getByRole('button', { name: 'Close quick create modal' }));

        expect(await screen.findByRole('alertdialog')).toHaveTextContent(
            'You have unsaved changes. Are you sure you want to leave?',
        );
        await user.click(screen.getByRole('button', { name: 'Stay' }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(title).toHaveValue('Investigate contextual finding');

        await user.click(screen.getByRole('button', { name: 'Close quick create modal' }));
        await user.click(await screen.findByRole('button', { name: 'Leave' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(screen.getByTestId('close-count')).toHaveTextContent('1');

        await user.click(screen.getByRole('button', { name: 'Open modal' }));
        await waitFor(() => expect(screen.getByPlaceholderText('Issue title')).toHaveValue(
            'Issue from: Claims Settlement Risk',
        ));
        await user.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(screen.getByTestId('close-count')).toHaveTextContent('2');
    });

    it('guards footer Cancel after the description changes', async () => {
        const user = userEvent.setup();
        renderWithDataRouter(<ControlledQuickCreateModal />);

        await user.type(await screen.findByLabelText('Description'), 'Context from the risk review');
        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Leave' }));
        expect(screen.getByTestId('close-count')).toHaveTextContent('1');
    });

    it('guards Escape after the due date changes', async () => {
        const user = userEvent.setup();
        renderWithDataRouter(<ControlledQuickCreateModal />);
        const dueDate = await screen.findByLabelText('Due date');

        fireEvent.change(dueDate, { target: { value: '2030-01-02T12:30' } });
        await user.keyboard('{Escape}');

        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Leave' }));
        expect(screen.getByTestId('close-count')).toHaveTextContent('1');
    });

    it('guards backdrop dismissal after the severity changes', async () => {
        const user = userEvent.setup();
        renderWithDataRouter(<ControlledQuickCreateModal />);
        const severity = await screen.findByRole('combobox', { name: 'Severity' });

        await user.click(severity);
        await user.click(await screen.findByRole('option', { name: 'High' }));
        const backdrop = document.querySelector<HTMLElement>('[data-dialog-backdrop="true"]');
        expect(backdrop).not.toBeNull();
        fireEvent.click(backdrop!);

        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Leave' }));
        expect(screen.getByTestId('close-count')).toHaveTextContent('1');
    });

    it('closes a pristine modal without prompting', async () => {
        const user = userEvent.setup();
        renderWithDataRouter(<ControlledQuickCreateModal />);

        await screen.findByPlaceholderText('Issue title');
        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(screen.getByTestId('close-count')).toHaveTextContent('1');
    });

    it('renders context label without exposing raw numeric ids', () => {
        renderWithDataRouter(
            <IssueQuickCreateModal
                isOpen
                onClose={onClose}
                onCreated={onCreated}
                contextEntityType="risk"
                contextEntityId={123}
                contextEntityLabel="Claims Settlement Risk"
            />
        );

        expect(screen.getByText('Claims Settlement Risk')).toBeInTheDocument();
        expect(screen.queryByText('#123')).not.toBeInTheDocument();
        expect(screen.queryByText(/ID\s*123/i)).not.toBeInTheDocument();
    });

    it('submits contextual payload and calls onCreated', async () => {
        createContextualMock.mockResolvedValueOnce({ id: 77, title: 'Issue from control' });

        renderWithDataRouter(
            <IssueQuickCreateModal
                isOpen
                onClose={onClose}
                onCreated={onCreated}
                contextEntityType="control"
                contextEntityId={45}
                contextEntityLabel="Wire Transfer Reconciliation"
            />
        );

        fireEvent.change(screen.getByPlaceholderText('Issue title'), { target: { value: 'Control finding issue' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create Issue' }));

        await waitFor(() => {
            expect(createContextualMock).toHaveBeenCalledTimes(1);
        });
        expect(createContextualMock.mock.calls[0]?.[0]).toMatchObject({
            entity_type: 'control',
            entity_id: 45,
            title: 'Control finding issue',
            severity: 'medium',
        });
        expect(onCreated).toHaveBeenCalledWith({ id: 77, title: 'Issue from control' });
        expect(onClose).toHaveBeenCalled();
    });

    it('accepts the submitted snapshot before onCreated navigates', async () => {
        const events: string[] = [];
        createContextualMock.mockResolvedValueOnce({ id: 77, title: 'Issue from control' });
        const router = createMemoryRouter([
            {
                path: '/',
                element: (
                    <NavigateOnCreatedQuickCreateModal
                        onCreated={() => events.push('created')}
                        onClose={() => events.push('closed')}
                    />
                ),
            },
            { path: '/issues/:issueId', element: <p>Created issue destination</p> },
        ]);
        render(<RouterProvider router={router} />);

        fireEvent.change(await screen.findByPlaceholderText('Issue title'), {
            target: { value: 'Control finding issue' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Create Issue' }));

        expect(await screen.findByText('Created issue destination')).toBeInTheDocument();
        expect(router.state.location.pathname).toBe('/issues/77');
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(events).toEqual(['created', 'closed']);
    });

    it('reopens clean after a successful create', async () => {
        const user = userEvent.setup();
        createContextualMock.mockResolvedValueOnce({ id: 77, title: 'Issue from risk' });
        renderWithDataRouter(<ControlledQuickCreateModal onCreated={onCreated} />);

        await user.type(await screen.findByLabelText('Description'), 'Review complete');
        await user.click(screen.getByRole('button', { name: 'Create Issue' }));
        await waitFor(() => expect(screen.getByTestId('close-count')).toHaveTextContent('1'));
        expect(onCreated).toHaveBeenCalledTimes(1);

        await user.click(screen.getByRole('button', { name: 'Open modal' }));
        await waitFor(() => expect(screen.getByLabelText('Description')).toHaveValue(''));
        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(screen.getByTestId('close-count')).toHaveTextContent('2');
    });

    it('shows localized error on create failure', async () => {
        createContextualMock.mockRejectedValueOnce(new Error('Context source not found'));

        renderWithDataRouter(
            <IssueQuickCreateModal
                isOpen
                onClose={onClose}
                onCreated={onCreated}
                contextEntityType="vendor"
                contextEntityId={55}
                contextEntityLabel="Cloud Hosting Partner"
            />
        );

        fireEvent.change(screen.getByPlaceholderText('Issue title'), {
            target: { value: 'Vendor follow-up issue' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Create Issue' }));

        expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
        expect(screen.queryByText('Context source not found')).not.toBeInTheDocument();
        expect(onCreated).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('locks submitted fields and all close actions while creation is pending', async () => {
        let resolveCreate!: (value: unknown) => void;
        createContextualMock.mockReturnValueOnce(new Promise((resolve) => {
            resolveCreate = resolve;
        }));

        renderWithDataRouter(
            <IssueQuickCreateModal
                isOpen
                onClose={onClose}
                onCreated={onCreated}
                contextEntityType="risk"
                contextEntityId={123}
                contextEntityLabel="Claims Settlement Risk"
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Create Issue' }));

        const submit = await screen.findByRole('button', { name: /Creating/ });
        expect(submit).toBeDisabled();
        expect(submit).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Close quick create modal' })).toBeDisabled();
        expect(screen.getByPlaceholderText('Issue title')).toBeDisabled();
        expect(screen.getByRole('combobox', { name: 'Severity' })).toBeDisabled();
        expect(screen.getByLabelText('Due date')).toBeDisabled();
        expect(screen.getByLabelText('Description')).toBeDisabled();

        fireEvent.keyDown(document, { key: 'Escape' });
        const backdrop = document.querySelector<HTMLElement>('[data-dialog-backdrop="true"]');
        expect(backdrop).not.toBeNull();
        fireEvent.click(backdrop!);
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

        await act(async () => {
            resolveCreate({ id: 77, title: 'Created issue' });
        });
        expect(onCreated).toHaveBeenCalledWith({ id: 77, title: 'Created issue' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
