import { Building2, Plus, Users, ShieldAlert } from 'lucide-react';

export function DepartmentsPage() {
    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-black text-white mb-2">Organizational Units</h2>
                    <p className="text-slate-500 font-medium">Define and manage department hierarchies and ownership.</p>
                </div>
                <button className="btn-primary">
                    <Plus className="h-5 w-5" />
                    Create Dept
                </button>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {[
                    { name: 'Operations', icon: Building2, users: 42, risks: 12 },
                    { name: 'Finance', icon: Building2, users: 18, risks: 4 },
                    { name: 'IT & Security', icon: Building2, users: 24, risks: 7 },
                ].map((dept) => (
                    <div key={dept.name} className="glass-card hover:border-accent/40 group cursor-pointer">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="bg-white/5 p-3 rounded-xl group-hover:bg-accent/10 transition-colors">
                                <dept.icon className="h-6 w-6 text-slate-500 group-hover:text-accent" />
                            </div>
                            <h3 className="text-lg font-bold text-white">{dept.name}</h3>
                        </div>

                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2 text-slate-500">
                                <Users className="h-4 w-4" />
                                <span className="text-xs font-bold">{dept.users}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-500">
                                <ShieldAlert className="h-4 w-4" />
                                <span className="text-xs font-bold">{dept.risks}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="glass-card p-12 flex flex-col items-center justify-center text-center opacity-50">
                <Building2 className="h-12 w-12 text-slate-600 mb-4" />
                <p className="text-sm font-medium text-slate-500 max-w-sm">
                    More granular department management and SII mapping available in Phase 2.
                </p>
            </div>
        </div>
    );
}
