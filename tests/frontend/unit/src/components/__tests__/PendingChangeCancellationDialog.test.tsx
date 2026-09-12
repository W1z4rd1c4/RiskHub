import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { render, screen, userEvent, waitFor } from '@test/render';
import { PendingChangeCancellationDialog } from '@/components/approvals/PendingChangeCancellationDialog';

function deferred() {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, reject, resolve };
}

function CancellationHarness({ cancel }: { cancel: () => Promise<void> }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [errorText, setErrorText] = useState<string | null>(null);

    const confirm = async () => {
        setIsLoading(true);
        setErrorText(null);
        try {
            await cancel();
            setIsOpen(false);
        } catch {
            setErrorText('The request could not be cancelled.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <button type="button" onClick={() => setIsOpen(true)}>Open cancellation</button>
            <PendingChangeCancellationDialog
                isOpen={isOpen}
                targetName="Payments platform"
                isLoading={isLoading}
                errorText={errorText}
                onClose={() => setIsOpen(false)}
                onConfirm={() => void confirm()}
            />
        </>
    );
}

describe('PendingChangeCancellationDialog', () => {
    it('sends no request on dismissal and retains the named target for a failed retry', async () => {
        const user = userEvent.setup();
        const firstAttempt = deferred();
        const cancel = vi.fn()
            .mockImplementationOnce(() => firstAttempt.promise)
            .mockResolvedValueOnce(undefined);

        render(<CancellationHarness cancel={cancel} />);

        await user.click(screen.getByRole('button', { name: 'Open cancellation' }));
        let dialog = screen.getByRole('alertdialog');
        expect(dialog).toHaveTextContent('Payments platform');
        expect(dialog).not.toHaveTextContent(/\b\d+\b/);
        await user.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(cancel).not.toHaveBeenCalled();

        await user.click(screen.getByRole('button', { name: 'Open cancellation' }));
        await user.click(screen.getByRole('button', { name: 'Cancel request' }));
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: /Loading/ })).toBeDisabled();

        firstAttempt.reject(new Error('denied'));
        expect(await screen.findByRole('alert')).toHaveTextContent('The request could not be cancelled.');
        dialog = screen.getByRole('alertdialog');
        expect(dialog).toHaveTextContent('Payments platform');

        await user.click(screen.getByRole('button', { name: 'Retry' }));
        expect(cancel).toHaveBeenCalledTimes(2);
        await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    });
});
