import { render, screen } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ArchiveConfirmDialog } from '@/components/ArchiveConfirmDialog';
import { SortableTable, type Column } from '@/components/tables/SortableTable';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { ReadAccessDeniedState } from '@/pages/shared/ReadAccessDeniedState';

vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    motion: {
        div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    },
}));

// DS-01 / DS-03 (Phase 0.11): shared shells render text through theme tokens so it
// stays readable in the light, dark and riskhub themes. Raw `text-white` and
// `text-slate-*` shades are only legitimate on coloured fills, which these shells
// no longer use for text.
const RAW_TEXT_CLASS = /(?:^|[\s:])text-(?:white|slate-\d{2,3})(?=[\s"]|$)/;

function StepIcon({ className }: { className?: string }) {
    return <svg className={className} aria-hidden="true" />;
}

function rawTextClasses(root: ParentNode): string[] {
    return Array.from(root.querySelectorAll<HTMLElement>('[class]'))
        .map((element) => element.getAttribute('class') ?? '')
        .filter((className) => RAW_TEXT_CLASS.test(className));
}

describe('shared shell text tokens', () => {
    it('StepIndicator labels and icons use text tokens', () => {
        const { container } = render(
            <StepIndicator
                steps={[
                    { id: 'details', title: 'Details', icon: StepIcon },
                    { id: 'review', title: 'Review', icon: StepIcon },
                ]}
                currentStep={0}
                isStepClickable={(index) => index === 0}
                onStepClick={vi.fn()}
            />,
        );

        expect(rawTextClasses(container)).toEqual([]);
        expect(screen.getByText('Details')).toHaveClass('text-foreground');
        expect(screen.getByText('Review')).toHaveClass('text-muted-foreground');
    });

    it('ReadAccessDeniedState heading and description use text tokens', () => {
        const { container } = render(<ReadAccessDeniedState />);

        expect(rawTextClasses(container)).toEqual([]);
        expect(screen.getByRole('heading', { level: 2 })).toHaveClass('text-foreground');
    });

    it('ArchiveConfirmDialog title, labels and reason field use text tokens', () => {
        render(
            <ArchiveConfirmDialog
                isOpen
                onClose={vi.fn()}
                onConfirm={vi.fn(async () => undefined)}
                resourceType="risk"
                resourceName="Vendor outage"
            />,
        );

        const dialog = screen.getByRole('alertdialog');
        // DS-08: the sections carry their own p-6, so the glass-card surface must not pad again.
        expect(dialog).toHaveClass('glass-card', '!p-0');
        expect(rawTextClasses(dialog)).toEqual([]);
        expect(screen.getByText('Vendor outage')).toHaveClass('text-foreground');
        expect(screen.getByRole('textbox')).toHaveClass('text-foreground', 'placeholder:text-muted-foreground');
    });

    it('SortableTable empty message uses the muted text token', () => {
        const columns: Column<{ id: number }>[] = [{ key: 'id', label: 'ID', render: (row) => row.id }];
        render(
            <MemoryRouter>
                <SortableTable data={[]} columns={columns} keyExtractor={(row) => row.id} emptyMessage="Nothing here" />
            </MemoryRouter>,
        );

        expect(screen.getByText('Nothing here')).toHaveClass('text-muted-foreground');
    });
});
