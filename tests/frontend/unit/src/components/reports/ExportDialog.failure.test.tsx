import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ExportDialog } from '@/components/reports/ExportDialog';
import { render, screen, userEvent } from '@test/render';

describe('ExportDialog failure handling', () => {
    it('restores focus to the export action after a failed busy submission', async () => {
        let rejectExport!: (reason: Error) => void;
        const exportResult = new Promise<void>((_resolve, reject) => {
            rejectExport = reject;
        });

        function BusyExportDialog() {
            const [isSubmitting, setIsSubmitting] = useState(false);
            return (
                <ExportDialog
                    isOpen
                    isSubmitting={isSubmitting}
                    onClose={() => undefined}
                    onSubmit={async () => {
                        setIsSubmitting(true);
                        try {
                            await exportResult;
                        } finally {
                            setIsSubmitting(false);
                        }
                    }}
                />
            );
        }

        render(<BusyExportDialog />);
        const submit = screen.getByTestId('export-submit-button');
        await userEvent.click(submit);
        expect(submit).toBeDisabled();
        // Browsers evict focus when the active submitter becomes disabled. Move
        // it to the remaining enabled field to model that public transition in
        // JSDOM, which does not consistently blur disabled buttons itself.
        screen.getByTestId('export-date-input').focus();

        rejectExport(new Error('download failed'));

        expect(await screen.findByRole('alert')).toHaveTextContent('Export failed. Try again.');
        expect(submit).toBeEnabled();
        expect(submit).toHaveFocus();
    });

    it('defaults a dual-purpose dialog to current-view export without a date field', async () => {
        const onCurrentViewSubmit = vi.fn().mockResolvedValue(undefined);
        const onSubmit = vi.fn().mockResolvedValue(undefined);

        render(
            <ExportDialog
                isOpen
                onClose={() => undefined}
                onCurrentViewSubmit={onCurrentViewSubmit}
                onSubmit={onSubmit}
            />,
        );

        expect(screen.getByTestId('export-purpose-current-view')).toBeChecked();
        expect(screen.queryByTestId('export-date-input')).not.toBeInTheDocument();
        await userEvent.click(screen.getByTestId('export-submit-button'));

        expect(onCurrentViewSubmit).toHaveBeenCalledOnce();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('requires an explicit point-in-time choice before submitting the selected date', async () => {
        const onCurrentViewSubmit = vi.fn().mockResolvedValue(undefined);
        const onSubmit = vi.fn().mockResolvedValue(undefined);

        render(
            <ExportDialog
                isOpen
                onClose={() => undefined}
                onCurrentViewSubmit={onCurrentViewSubmit}
                onSubmit={onSubmit}
            />,
        );
        await userEvent.click(screen.getByTestId('export-purpose-point-in-time'));
        await userEvent.clear(screen.getByTestId('export-date-input'));
        await userEvent.type(screen.getByTestId('export-date-input'), '2025-01-15');
        await userEvent.click(screen.getByTestId('export-submit-button'));

        expect(onSubmit).toHaveBeenCalledWith({ format: 'csv', asOfDate: '2025-01-15' });
        expect(onCurrentViewSubmit).not.toHaveBeenCalled();
    });

    it('describes the Issue date as evaluation of current rows, not reconstruction', async () => {
        render(
            <ExportDialog
                dateMode="evaluation"
                isOpen
                onClose={() => undefined}
                onCurrentViewSubmit={vi.fn().mockResolvedValue(undefined)}
                onSubmit={vi.fn().mockResolvedValue(undefined)}
            />,
        );

        await userEvent.click(screen.getByTestId('export-purpose-evaluation'));

        expect(screen.getByText('Current register evaluated on a date')).toBeInTheDocument();
        expect(screen.getByText(/selected date affects age and overdue only/i)).toBeInTheDocument();
        expect(screen.getByText('Evaluation date')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Export evaluated current rows' })).toBeInTheDocument();
        expect(screen.queryByTestId('export-purpose-point-in-time')).not.toBeInTheDocument();
        expect(screen.queryByText(/snapshot|reconstruct/i)).not.toBeInTheDocument();
    });

    it('preserves the selected purpose when parent callbacks are recreated', async () => {
        const { rerender } = render(
            <ExportDialog
                isOpen
                onClose={() => undefined}
                onCurrentViewSubmit={async () => undefined}
                onSubmit={async () => undefined}
            />,
        );
        await userEvent.click(screen.getByTestId('export-purpose-point-in-time'));

        rerender(
            <ExportDialog
                isOpen
                onClose={() => undefined}
                onCurrentViewSubmit={async () => undefined}
                onSubmit={async () => undefined}
            />,
        );

        expect(screen.getByTestId('export-purpose-point-in-time')).toBeChecked();
        expect(screen.getByTestId('export-date-input')).toBeVisible();
    });

    it('keeps the dialog open and announces a rejected download', async () => {
        const onClose = vi.fn();
        const onSubmit = vi.fn().mockRejectedValue(new Error('download failed'));

        render(<ExportDialog isOpen onClose={onClose} onSubmit={onSubmit} dataTestId="failed-export-dialog" />);
        await userEvent.click(screen.getByTestId('export-submit-button'));

        expect(await screen.findByRole('alert')).toHaveTextContent('Export failed. Try again.');
        expect(screen.getByTestId('failed-export-dialog')).toBeVisible();
        expect(onClose).not.toHaveBeenCalled();
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ format: 'csv' }));
        expect(onSubmit.mock.calls[0][0].asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('clears the announced error before a retry succeeds', async () => {
        const onSubmit = vi.fn()
            .mockRejectedValueOnce(new Error('download failed'))
            .mockResolvedValueOnce(undefined);

        render(<ExportDialog isOpen onClose={() => undefined} onSubmit={onSubmit} />);
        await userEvent.click(screen.getByTestId('export-submit-button'));
        expect(await screen.findByRole('alert')).toBeVisible();

        await userEvent.click(screen.getByTestId('export-submit-button'));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(onSubmit).toHaveBeenCalledTimes(2);
    });

    it('keeps a dual-purpose dialog open when current-view export fails', async () => {
        const onClose = vi.fn();

        render(
            <ExportDialog
                isOpen
                onClose={onClose}
                onCurrentViewSubmit={vi.fn().mockRejectedValue(new Error('current export failed'))}
                onSubmit={vi.fn().mockResolvedValue(undefined)}
            />,
        );
        await userEvent.click(screen.getByTestId('export-submit-button'));

        expect(await screen.findByRole('alert')).toBeVisible();
        expect(onClose).not.toHaveBeenCalled();
    });
});
