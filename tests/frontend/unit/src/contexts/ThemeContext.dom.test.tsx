import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';

function ThemeProbe() {
  const { setTheme } = useTheme();

  return (
    <div>
      <button type="button" onClick={() => setTheme('light')}>Light</button>
      <button type="button" onClick={() => setTheme('dark')}>Dark</button>
      <button type="button" onClick={() => setTheme('riskhub')}>RiskHub</button>
    </div>
  );
}

describe('ThemeProvider document contract', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    document.documentElement.style.colorScheme = '';
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((element) => element.remove());
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
    localStorage.clear();
    localStorage.setItem('riskhub-theme', 'riskhub');
  });

  it('synchronizes the root class, native color scheme, and single theme color', async () => {
    render(
      <AuthProvider>
        <ThemeProvider>
          <ThemeProbe />
        </ThemeProvider>
      </AuthProvider>,
    );

    const root = document.documentElement;
    const themeColor = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

    await waitFor(() => expect(root).toHaveClass('theme-riskhub'));
    expect(root.style.colorScheme).toBe('dark');
    expect(themeColor).toHaveAttribute('content', '#0f172a');
    expect(document.head.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    await waitFor(() => expect(root).toHaveClass('theme-light'));
    expect(root).not.toHaveClass('theme-riskhub', 'theme-dark');
    expect(root.style.colorScheme).toBe('light');
    expect(themeColor).toHaveAttribute('content', '#f8fafc');

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    await waitFor(() => expect(root).toHaveClass('theme-dark'));
    expect(root).not.toHaveClass('theme-riskhub', 'theme-light');
    expect(root.style.colorScheme).toBe('dark');
    expect(themeColor).toHaveAttribute('content', '#000000');
  });
});
