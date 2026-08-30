import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';

import type { FieldControlProps } from './field';
import { Input } from './input';

interface CreatableComboboxProps extends FieldControlProps {
    value: string;
    suggestions: string[];
    onValueChange: (value: string) => void;
    placeholder?: string;
    createValueLabel?: string;
}

export function CreatableCombobox({
    value,
    suggestions,
    onValueChange,
    placeholder,
    createValueLabel,
    ...field
}: CreatableComboboxProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const listboxId = `${field.id}-listbox`;
    const filteredSuggestions = useMemo(() => {
        const query = value.toLocaleLowerCase();
        return suggestions.filter((suggestion) => suggestion.toLocaleLowerCase().includes(query));
    }, [suggestions, value]);
    const renderedActiveIndex = activeIndex != null && activeIndex < filteredSuggestions.length
        ? activeIndex
        : null;
    const hasFreeEntryHint = Boolean(value && createValueLabel && !suggestions.includes(value));
    const suggestionListIsVisible = isOpen && filteredSuggestions.length > 0;
    const freeEntryHintIsVisible = isOpen && hasFreeEntryHint;
    const overlayIsVisible = suggestionListIsVisible || freeEntryHintIsVisible;

    useEffect(() => {
        if (!suggestionListIsVisible || renderedActiveIndex == null) return;
        const activeOption = document.getElementById(`${field.id}-option-${renderedActiveIndex}`);
        activeOption?.scrollIntoView?.({ block: 'nearest' });
    }, [field.id, suggestionListIsVisible, renderedActiveIndex]);

    function closeList() {
        setIsOpen(false);
        setActiveIndex(null);
    }

    function selectSuggestion(suggestion: string) {
        onValueChange(suggestion);
        closeList();
    }

    function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === 'Escape') {
            closeList();
            return;
        }
        if (event.key === 'Tab') {
            closeList();
            return;
        }
        if (filteredSuggestions.length === 0) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((current) => current == null ? 0 : (current + 1) % filteredSuggestions.length);
            return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((current) => current == null
                ? filteredSuggestions.length - 1
                : (current - 1 + filteredSuggestions.length) % filteredSuggestions.length);
            return;
        }
        if (event.key === 'Enter' && suggestionListIsVisible && renderedActiveIndex != null) {
            event.preventDefault();
            selectSuggestion(filteredSuggestions[renderedActiveIndex]);
        }
    }

    function handleOptionMouseDown(event: MouseEvent<HTMLButtonElement>) {
        event.preventDefault();
    }

    return (
        <div className="relative">
            <Input
                {...field}
                type="text"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={suggestionListIsVisible}
                aria-controls={suggestionListIsVisible ? listboxId : undefined}
                aria-activedescendant={suggestionListIsVisible && renderedActiveIndex != null
                    ? `${field.id}-option-${renderedActiveIndex}`
                    : undefined}
                value={value}
                onChange={(event) => {
                    onValueChange(event.target.value);
                    setIsOpen(true);
                    setActiveIndex(null);
                }}
                onFocus={() => setIsOpen(true)}
                onClick={() => setIsOpen(true)}
                onBlur={closeList}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
            />
            {overlayIsVisible ? (
                <div
                    id={suggestionListIsVisible ? listboxId : undefined}
                    role={suggestionListIsVisible ? 'listbox' : undefined}
                    tabIndex={suggestionListIsVisible ? 0 : undefined}
                    className="absolute z-20 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-md"
                >
                    {suggestionListIsVisible ? (
                        <div>
                            {filteredSuggestions.map((suggestion, index) => (
                                <button
                                    id={`${field.id}-option-${index}`}
                                    key={suggestion}
                                    type="button"
                                    role="option"
                                    tabIndex={-1}
                                    aria-selected={renderedActiveIndex === index}
                                    onMouseDown={handleOptionMouseDown}
                                    onClick={() => selectSuggestion(suggestion)}
                                    className="block w-full px-4 py-2.5 text-left text-sm hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    ) : null}
                    {freeEntryHintIsVisible ? (
                        <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
                            {createValueLabel}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
