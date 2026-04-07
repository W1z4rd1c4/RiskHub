interface VendorSuggestionsProps {
    items: string[];
    onSelect: (value: string) => void;
}

export function VendorSuggestions({ items, onSelect }: VendorSuggestionsProps) {
    if (items.length === 0) {
        return null;
    }

    return (
        <div className="vendor-suggestion-box">
            {items.slice(0, 6).map((item) => (
                <button
                    type="button"
                    key={item}
                    onClick={() => onSelect(item)}
                    className="vendor-suggestion-button"
                >
                    {item}
                </button>
            ))}
        </div>
    );
}
