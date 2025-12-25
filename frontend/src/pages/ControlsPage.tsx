import { Plus, Search, Filter } from 'lucide-react';

export function ControlsPage() {
    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-black text-white mb-2">Control Catalog</h2>
                    <p className="text-slate-500 font-medium">Manage and audit organizational risk controls.</p>
                </div>
                <button className="btn-primary">
                    <Plus className="h-5 w-5" />
                    Add Control
                </button>
            </div>

            <div className="glass-card">
                <div className="flex items-center gap-4 mb-8">
                    <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 flex items-center gap-3">
                        <Search className="h-4 w-4 text-slate-500" />
                        <input type="text" placeholder="Search by ID, name or department..." className="bg-transparent border-none outline-none text-sm text-white w-full" />
                    </div>
                    <button className="p-2.5 glass rounded-xl text-slate-400 hover:text-white transition-colors">
                        <Filter className="h-5 w-5" />
                    </button>
                </div>

                <div className="h-64 border-2 border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center text-slate-500 gap-2">
                    <p className="font-bold text-white/20 text-lg uppercase tracking-widest">Repository Locked</p>
                    <p className="text-sm">Control catalog logic will be unlocked in Phase 2</p>
                </div>
            </div>
        </div>
    );
}
