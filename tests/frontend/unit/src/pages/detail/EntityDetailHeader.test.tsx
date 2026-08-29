import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EntityDetailHeader } from '@/pages/detail/EntityDetailHeader';

describe('EntityDetailHeader', () => {
    it('keeps identifier, title, status, metadata, description, and actions in one semantic header', () => {
        render(
            <EntityDetailHeader
                backAction={<button type="button">Back</button>}
                identifier="RISK-WITH-A-VERY-LONG-UNBROKEN-IDENTIFIER"
                identifierSeparatorLabel="Identifier separator"
                title="A very long decision-record title"
                statuses={<span>Active</span>}
                metadata={<span>Operations</span>}
                description="A long description that must remain readable."
                actions={<button type="button">Edit</button>}
            />,
        );

        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('A very long decision-record title');
        expect(screen.getByText('RISK-WITH-A-VERY-LONG-UNBROKEN-IDENTIFIER')).toBeVisible();
        expect(screen.getByRole('separator', { name: 'Identifier separator' })).toBeVisible();
        expect(screen.getByText('Active')).toBeVisible();
        expect(screen.getByText('Operations')).toBeVisible();
        expect(screen.getByText('A long description that must remain readable.')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Edit' })).toBeVisible();
    });

    it('omits the optional identifier and separator together', () => {
        render(
            <EntityDetailHeader
                backAction={<button type="button">Back</button>}
                identifierSeparatorLabel="Identifier separator"
                title="Asset name"
            />,
        );

        expect(screen.queryByRole('separator')).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 1, name: 'Asset name' })).toBeVisible();
    });
});
