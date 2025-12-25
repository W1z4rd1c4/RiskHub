import { Outlet } from 'react-router-dom';
import { Sidebar, Header } from '@/components/layout';

export function MainLayout() {
    return (
        <div className="flex h-screen w-full bg-background overflow-hidden relative">
            {/* Subtle Background Glows */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[100px] pointer-events-none" />

            <Sidebar />
            <div className="flex flex-1 flex-col relative z-10 overflow-hidden">
                <Header />
                <main className="flex-1 overflow-y-auto p-6 md:p-8">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
