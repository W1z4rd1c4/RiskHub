import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { render, screen, userEvent } from '@/test/utils';
import { server } from '@/test/mocks/server';
import { DirectoryEmulatorPage } from '../DirectoryEmulatorPage';

describe('DirectoryEmulatorPage', () => {
    beforeAll(() => server.listen());

    afterEach(() => server.resetHandlers());

    afterAll(() => server.close());

    beforeEach(() => {
        localStorage.setItem('access_token', 'test-token');
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('renders and shows preview results', async () => {
        render(<DirectoryEmulatorPage />);

        expect(await screen.findByText('Directory Integration')).toBeInTheDocument();

        const previewButton = screen.getByRole('button', { name: /preview changes/i });
        const user = userEvent.setup();
        await user.click(previewButton);

        const matches = await screen.findAllByText('luka@directory.local');
        expect(matches.length).toBeGreaterThan(0);
    });
});
