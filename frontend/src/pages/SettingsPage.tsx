import { User, Bell, Lock, Globe } from 'lucide-react';

export function SettingsPage() {
    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-black text-white mb-2">Platform Settings</h2>
                <p className="text-slate-500 font-medium">Manage your personal preferences and enterprise configurations.</p>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
                <div className="w-full lg:w-64 space-y-2">
                    {[
                        { name: 'Profile', icon: User, active: true },
                        { name: 'Notifications', icon: Bell, active: false },
                        { name: 'Security', icon: Lock, active: false },
                        { name: 'Localization', icon: Globe, active: false },
                    ].map((item) => (
                        <button
                            key={item.name}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${item.active
                                ? 'bg-accent text-white'
                                : 'text-slate-500 hover:bg-white/5 hover:text-white'
                                }`}
                        >
                            <item.icon className="h-4 w-4" />
                            {item.name}
                        </button>
                    ))}
                </div>

                <div className="flex-1 glass-card">
                    <div className="flex items-center gap-4 mb-10 pb-6 border-b border-white/5">
                        <div className="h-16 w-16 rounded-2xl bg-accent flex items-center justify-center">
                            <User className="h-8 w-8 text-white" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white leading-none mb-1">Jan Novák</h3>
                            <p className="text-sm font-medium text-slate-500">Chief Risk Officer • Prague Office</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="grid gap-6 md:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Full Name</label>
                                <input type="text" defaultValue="Jan Novák" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent outline-none" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Email Address</label>
                                <input type="text" defaultValue="jan.novak@riskhub.local" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent outline-none" />
                            </div>
                        </div>

                        <div className="pt-6">
                            <button className="btn-primary">
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
