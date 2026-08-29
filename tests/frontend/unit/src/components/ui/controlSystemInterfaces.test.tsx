import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '@/components/ui/button';

describe('Button public interaction contract', () => {
    it('is a non-submitting button by default and still permits an explicit submit action', () => {
        const onSubmit = vi.fn<(event: React.FormEvent<HTMLFormElement>) => void>((event) => {
            event.preventDefault();
        });
        render(
            <form onSubmit={onSubmit}>
                <Button>Open filters</Button>
                <Button type="submit">Save</Button>
            </form>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Open filters' }));
        expect(onSubmit).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(onSubmit).toHaveBeenCalledOnce();
    });

    it('exposes a busy disabled state while preserving its accessible name', () => {
        render(<Button isLoading>Save changes</Button>);

        const button = screen.getByRole('button', { name: 'Save changes' });
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('aria-busy', 'true');
    });

    it('supports a named keyboard-focusable icon action', () => {
        render(<Button size="icon" aria-label="Refresh data" />);
        const iconButton = screen.getByRole('button', { name: 'Refresh data' });
        expect(iconButton).toHaveAttribute('type', 'button');
        iconButton.focus();
        expect(iconButton).toHaveFocus();
    });
});
