import { useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { DesktopOnlyNotice, Sidebar } from '@/components/layout';
import { useTranslation } from '@/i18n/hooks';

export function MainLayout() {
    const { t } = useTranslation('layout');
    const mainRef = useRef<HTMLElement>(null);

    return (
        <>
            {/* FR-P5-2 / finding C6 (ADR-014): below `lg` the desktop-only shell has no
                usable navigation, so replace it with a neutral desktop-first advisory.
                Desktop-only stands — this is a notice, not a reflow shell. */}
            <DesktopOnlyNotice />
            <div className="hidden lg:flex h-screen w-full bg-background overflow-hidden relative">
                <a
                    href="#main-content"
                    onClick={(event) => {
                        event.preventDefault();
                        mainRef.current?.focus();
                    }}
                    className="fixed left-4 top-4 z-[60] -translate-y-24 rounded-lg bg-accent px-4 py-2 font-bold text-accent-foreground shadow-lg transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-ring"
                >
                    {t('skip_to_main')}
                </a>
                {/* Subtle Background Glows */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[100px] pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[100px] pointer-events-none" />

                <Sidebar />
                <div className="flex-1 flex flex-col lg:pl-72 overflow-hidden">
                    <main
                        id="main-content"
                        ref={mainRef}
                        tabIndex={-1}
                        className="flex-1 overflow-y-auto p-6 md:p-8"
                    >
                        <Outlet />
                    </main>
                </div>
            </div>
        </>
    );
}
