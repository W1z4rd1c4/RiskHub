import { describe, expect, it, vi } from 'vitest';

import { ExportDialog } from '@/components/reports/ExportDialog';
import { render, screen, userEvent } from '@test/render';

describe('ExportDialog failure handling', () => {
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
