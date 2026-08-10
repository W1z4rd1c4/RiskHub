import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DesktopOnlyNotice } from '@/components/layout/DesktopOnlyNotice';
import i18n from '@/i18n';
import enLayout from '@/i18n/locales/en/layout.json';
import csLayout from '@/i18n/locales/cs/layout.json';

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('DesktopOnlyNotice (FR-P5-2 / finding C6, ADR-014)', () => {
    it('renders the desktop-first advisory as a below-`lg`-only notice', () => {
        render(<DesktopOnlyNotice />);

        const notice = screen.getByTestId('desktop-only-notice');
        // Shown only below `lg`: it is hidden from `lg` up (no reflow shell replaces it).
        expect(notice.className).toContain('lg:hidden');
        expect(screen.getByText(enLayout.desktop_only.title)).toBeInTheDocument();
        expect(screen.getByText(enLayout.desktop_only.body)).toBeInTheDocument();
    });

    it('offers a path to an accessible alternative (C6 is accepted, not a dead end)', () => {
        render(<DesktopOnlyNotice />);

        expect(
            screen.getByText(enLayout.desktop_only.accessible_alternative),
        ).toBeInTheDocument();
        // The path routes to human support rather than a self-service workaround.
        expect(enLayout.desktop_only.accessible_alternative.toLowerCase()).toContain('administrator');
    });

    it('never instructs users to reduce zoom (that would disable a low-vision aid)', () => {
        render(<DesktopOnlyNotice />);

        const notice = screen.getByTestId('desktop-only-notice');
        expect(notice.textContent ?? '').not.toMatch(/zoom/i);
    });

    it('keeps both locale bundles free of any zoom-reduction instruction', () => {
        const enCopy = Object.values(enLayout.desktop_only).join(' ');
        const csCopy = Object.values(csLayout.desktop_only).join(' ');

        expect(enCopy).not.toMatch(/zoom/i);
        // Czech equivalents of "zoom / zoom out / magnifier".
        expect(csCopy).not.toMatch(/zoom|přiblíž|oddal|lupa/i);
    });
});
