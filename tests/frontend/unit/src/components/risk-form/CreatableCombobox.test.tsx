import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CreatableCombobox } from '@/components/ui/CreatableCombobox';

function ComboboxHarness() {
    const [value, setValue] = useState('');

    return (
        <>
            <label id="main-process-label" htmlFor="main-process">Main Process</label>
            <CreatableCombobox
                id="main-process"
                aria-labelledby="main-process-label"
                aria-describedby={undefined}
                aria-invalid={undefined}
                aria-required
                value={value}
                suggestions={['Finance', 'Operations', 'Planning']}
                onValueChange={setValue}
                placeholder="Type or select existing..."
            />
            <button type="button">Outside control</button>
        </>
    );
}

describe('CreatableCombobox', () => {
    it('keeps input focus while keyboard users navigate and select ordered suggestions', async () => {
        const user = userEvent.setup();
        render(<ComboboxHarness />);

        const input = screen.getByRole('combobox', { name: 'Main Process' });
        expect(input).toHaveAttribute('aria-expanded', 'false');
        expect(input).not.toHaveAttribute('aria-controls');
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        await user.click(input);

        expect(input).toHaveFocus();
        expect(input).toHaveAttribute('aria-autocomplete', 'list');
        expect(input).toHaveAttribute('aria-expanded', 'true');
        expect(input.getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id);
        expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
            'Finance',
            'Operations',
            'Planning',
        ]);

        await user.keyboard('{ArrowUp}');
        expect(input.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Planning' }).id);

        await user.keyboard('{ArrowDown}{ArrowDown}');
        expect(input).toHaveFocus();
        expect(input.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Operations' }).id);

        const activeOptionId = input.getAttribute('aria-activedescendant');
        expect(fireEvent.keyDown(input, { key: 'Home' })).toBe(true);
        expect(input).toHaveAttribute('aria-activedescendant', activeOptionId);
        expect(fireEvent.keyDown(input, { key: 'End' })).toBe(true);
        expect(input).toHaveAttribute('aria-activedescendant', activeOptionId);

        await user.keyboard('{Enter}');
        expect(input).toHaveValue('Operations');
        expect(input).toHaveFocus();
        expect(input).toHaveAttribute('aria-expanded', 'false');
        expect(input).not.toHaveAttribute('aria-controls');
        expect(input).not.toHaveAttribute('aria-activedescendant');
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

        await user.click(input);
        expect(screen.getByRole('listbox')).toBeVisible();
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        expect(input).toHaveAttribute('aria-expanded', 'false');
        expect(input).not.toHaveAttribute('aria-controls');
        await user.click(input);
        expect(screen.getByRole('listbox')).toBeVisible();
        expect(input.getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id);
    });

    it('filters without reordering, preserves free text on Escape and Tab, and never tabs into options', async () => {
        const user = userEvent.setup();
        render(<ComboboxHarness />);

        const input = screen.getByRole('combobox', { name: 'Main Process' });
        await user.click(input);
        await user.type(input, 'AN');

        expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Finance', 'Planning']);
        for (const option of screen.getAllByRole('option')) {
            expect(option).toHaveAttribute('tabindex', '-1');
        }
        expect(input).not.toHaveAttribute('aria-activedescendant');

        await user.keyboard('{ArrowDown}');
        expect(input).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Finance' }).id);
        await user.keyboard('z');
        expect(input).toHaveValue('ANz');
        expect(input).not.toHaveAttribute('aria-activedescendant');
        expect(input).toHaveAttribute('aria-expanded', 'false');

        await user.clear(input);
        await user.type(input, 'an');
        await user.keyboard('{Escape}');
        expect(input).toHaveValue('an');
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

        await user.click(input);
        await user.tab();
        expect(screen.getByRole('button', { name: 'Outside control' })).toHaveFocus();
        expect(input).toHaveValue('an');
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

        await user.click(input);
        expect(screen.getByRole('listbox')).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Outside control' }));
        expect(input).toHaveValue('an');
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('selects a pointer suggestion without moving focus away from the input', async () => {
        const user = userEvent.setup();
        render(<ComboboxHarness />);

        const input = screen.getByRole('combobox', { name: 'Main Process' });
        await user.click(input);
        await user.click(screen.getByRole('option', { name: 'Finance' }));

        expect(input).toHaveValue('Finance');
        expect(input).toHaveFocus();
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('scrolls each Arrow-key active option into the visible popup region', async () => {
        const user = userEvent.setup();
        render(<ComboboxHarness />);

        const input = screen.getByRole('combobox', { name: 'Main Process' });
        await user.click(input);
        const finance = screen.getByRole('option', { name: 'Finance' });
        const operations = screen.getByRole('option', { name: 'Operations' });
        const financeScroll = vi.fn();
        const operationsScroll = vi.fn();
        finance.scrollIntoView = financeScroll;
        operations.scrollIntoView = operationsScroll;

        await user.keyboard('{ArrowDown}');
        expect(input).toHaveAttribute('aria-activedescendant', finance.id);
        expect(financeScroll).toHaveBeenCalledWith({ block: 'nearest' });
        expect(operationsScroll).not.toHaveBeenCalled();

        await user.keyboard('{ArrowDown}');
        expect(input).toHaveAttribute('aria-activedescendant', operations.id);
        expect(operationsScroll).toHaveBeenCalledWith({ block: 'nearest' });
    });
});
