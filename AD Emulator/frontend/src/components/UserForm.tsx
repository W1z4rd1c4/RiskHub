import { useState, useEffect } from 'react';
import { Mail, Shield, Building2, User, Key, X, RefreshCw, Edit2, UserPlus } from 'lucide-react';
import type { DirectoryUser, DirectoryUserCreate, DirectoryUserUpdate } from '../types/directory';

type UserFormProps = {
    user: DirectoryUser | null;
    onSave: (data: DirectoryUserCreate | DirectoryUserUpdate, isEdit: boolean) => Promise<void>;
    onCancel: () => void;
    isLoading: boolean;
};

const emptyForm = {
    external_id: '',
    display_name: '',
    email: '',
    user_principal_name: '',
    given_name: '',
    surname: '',
    department: '',
    job_title: '',
    manager_external_id: '',
    account_enabled: true,
    employee_type: 'employee',
    password: '',
};

export function UserForm({ user, onSave, onCancel, isLoading }: UserFormProps) {
    const [form, setForm] = useState(emptyForm);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (user) {
            setForm({
                external_id: user.external_id,
                display_name: user.display_name || '',
                email: user.email || '',
                user_principal_name: user.user_principal_name || '',
                given_name: user.given_name || '',
                surname: user.surname || '',
                department: user.department || '',
                job_title: user.job_title || '',
                manager_external_id: user.manager_external_id || '',
                account_enabled: user.account_enabled,
                employee_type: user.employee_type || 'employee',
                password: '',
            });
        } else {
            setForm(emptyForm);
        }
    }, [user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!form.display_name.trim()) {
            setError('Display name is required');
            return;
        }

        // Auto-generate external_id from email or UUID if not editing
        const autoExternalId = form.email.trim()
            ? form.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString(36)
            : 'user-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);

        try {
            const data: DirectoryUserCreate | DirectoryUserUpdate = user
                ? {
                    display_name: form.display_name.trim() || undefined,
                    email: form.email.trim() || undefined,
                    user_principal_name: form.user_principal_name.trim() || undefined,
                    given_name: form.given_name.trim() || undefined,
                    surname: form.surname.trim() || undefined,
                    department: form.department.trim() || undefined,
                    job_title: form.job_title.trim() || undefined,
                    manager_external_id: form.manager_external_id.trim() || undefined,
                    account_enabled: form.account_enabled,
                    employee_type: form.employee_type,
                    password: form.password.trim() || undefined,
                }
                : {
                    external_id: form.external_id.trim() || autoExternalId,
                    display_name: form.display_name.trim(),
                    email: form.email.trim() || undefined,
                    user_principal_name: form.user_principal_name.trim() || undefined,
                    given_name: form.given_name.trim() || undefined,
                    surname: form.surname.trim() || undefined,
                    department: form.department.trim() || undefined,
                    job_title: form.job_title.trim() || undefined,
                    manager_external_id: form.manager_external_id.trim() || undefined,
                    account_enabled: form.account_enabled,
                    employee_type: form.employee_type,
                    password: form.password.trim() || undefined,
                };

            await onSave(data, !!user);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save user');
        }
    };


    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onCancel} />
            <div className="relative w-full max-w-2xl glass-card animate-in zoom-in-95 duration-300">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        {user ? <Edit2 className="h-5 w-5 text-accent" /> : <UserPlus className="h-5 w-5 text-accent" />}
                        {user ? 'Edit Identity' : 'Provision New Identity'}
                    </h2>
                    <button onClick={onCancel} className="text-slate-400 hover:text-white">
                        <X className="h-6 w-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {user && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">External ID</label>
                                <div className="relative">
                                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                    <input
                                        type="text"
                                        value={form.external_id}
                                        disabled
                                        className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-50"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Display Name *</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                <input
                                    type="text"
                                    value={form.display_name}
                                    onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-accent/50"
                                    placeholder="John Doe"
                                />
                            </div>
                        </div>


                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Email Address</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                <input
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-accent/50"
                                    placeholder="john@example.com"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Department</label>
                            <div className="relative">
                                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                <input
                                    type="text"
                                    value={form.department}
                                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-accent/50"
                                    placeholder="IT"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Job Title</label>
                            <div className="relative">
                                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                <input
                                    type="text"
                                    value={form.job_title}
                                    onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-accent/50"
                                    placeholder="Developer"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Employee Type</label>
                            <select
                                value={form.employee_type}
                                onChange={(e) => setForm({ ...form, employee_type: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-4 text-white focus:outline-none focus:ring-2 focus:ring-accent/50"
                            >
                                <option value="employee" className="bg-slate-900">Employee</option>
                                <option value="head" className="bg-slate-900">Department Head</option>
                                <option value="contractor" className="bg-slate-900">Contractor</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Account Enabled</label>
                            <div className="flex items-center h-10">
                                <input
                                    type="checkbox"
                                    checked={form.account_enabled}
                                    onChange={(e) => setForm({ ...form, account_enabled: e.target.checked })}
                                    className="h-5 w-5 rounded border-white/10 bg-white/5 text-accent focus:ring-accent/50"
                                />
                                <span className="ml-2 text-slate-400">Authorized for Sync</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="bg-accent hover:bg-accent/80 text-white px-6 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-accent/20 transition-all active:scale-95 disabled:opacity-50"
                        >
                            {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : (user ? 'Save Changes' : 'Initialize')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

