import { Outlet } from 'react-router-dom';
import { DesktopOnlyNotice, Sidebar } from '@/components/layout';

export function MainLayout() {
    return (
        <>
            {/* FR-P5-2 / finding C6 (ADR-014): below `lg` the desktop-only shell has no
                usable navigation, so replace it with a neutral desktop-first advisory.
                Desktop-only stands — this is a notice, not a reflow shell. */}
            <DesktopOnlyNotice />
            <div className="hidden lg:flex h-screen w-full bg-background overflow-hidden relative">
                {/* Subtle Background Glows */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[100px] pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[100px] pointer-events-none" />

                <Sidebar />
                <div className="flex-1 flex flex-col lg:pl-72 overflow-hidden">
                    <main className="flex-1 overflow-y-auto p-6 md:p-8">
                        <Outlet />
                    </main>
                </div>
            </div>
        </>
    );
}
