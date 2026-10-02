import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { UserAvatar } from '@/components/access/UserAvatar';

describe('UserAvatar', () => {
    it('renders the first initial, upper-cased, as a decorative element (GAP-D-27)', () => {
        const { container } = render(<UserAvatar name="ada Lovelace" />);
        const avatar = container.firstElementChild as HTMLElement;

        expect(avatar).toHaveTextContent('A');
        expect(avatar).toHaveAttribute('aria-hidden', 'true');
    });

    it('does not split an astral first character or leave the avatar empty', () => {
        const astral = render(<UserAvatar name={'\u{1D4D0}da'} />);
        expect((astral.container.firstElementChild as HTMLElement).textContent).toHaveLength(2);
        astral.unmount();

        const empty = render(<UserAvatar name="   " />);
        expect(empty.container.firstElementChild).toHaveTextContent('?');
    });

    it('has one recipe with two sizes', () => {
        const md = render(<UserAvatar name="A" />);
        expect(md.container.firstElementChild).toHaveClass('h-10', 'w-10', 'rounded-full');
        md.unmount();

        const lg = render(<UserAvatar name="A" size="lg" />);
        expect(lg.container.firstElementChild).toHaveClass('h-16', 'w-16', 'rounded-full');
    });
});
