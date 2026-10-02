import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import '@/i18n';
import { DetailField, DetailFieldList } from '@/pages/detail/DetailField';
import { DetailSection } from '@/pages/detail/DetailSection';

describe('DetailSection', () => {
    it('renders a titled card whose title is the section h2 and keeps its field list', () => {
        render(
            <DetailSection title="Ownership" testId="ownership-section">
                <DetailFieldList>
                    <DetailField label="Owner" value="Alice" />
                    <DetailField label="Department" value={null} />
                </DetailFieldList>
            </DetailSection>,
        );

        const section = screen.getByTestId('ownership-section');
        expect(section.tagName).toBe('SECTION');
        expect(screen.getByRole('heading', { level: 2, name: 'Ownership' })).toBeInTheDocument();
        expect(screen.getByText('Owner').tagName).toBe('DT');
        expect(screen.getByText('Alice').tagName).toBe('DD');
        // Empty values read "Not set" to assistive technology.
        expect(screen.getByText('Not set')).toHaveClass('sr-only');
    });
});
