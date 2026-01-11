import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, FileText, ChevronLeft, ArrowRight, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { adminApi } from '@/services/adminApi';
import type { DocumentationEntry } from '@/services/adminApi';

export function DocumentationSettings() {
    const { user } = useAuth();
    const [selectedDoc, setSelectedDoc] = useState<DocumentationEntry | null>(null);

    const { data: docsData, isLoading } = useQuery({
        queryKey: ['settingsDocs'],
        queryFn: () => adminApi.getDocs(),
    });

    const docs = docsData?.documents || [];

    // Loading state
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin mb-4" />
                <p>Loading documentation...</p>
            </div>
        );
    }

    // Detail View (inline markdown)
    if (selectedDoc) {
        return (
            <div className="space-y-6">
                <button
                    onClick={() => setSelectedDoc(null)}
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-sm font-medium rounded-xl transition-all border border-white/10"
                >
                    <ChevronLeft className="h-4 w-4" />
                    Back to Documentation
                </button>

                <div className="glass-card min-h-[500px] flex flex-col overflow-hidden">
                    <div className="px-8 py-6 border-b border-white/10 flex items-center justify-between bg-white/[0.01]">
                        <div>
                            <h2 className="text-2xl font-bold text-white">{selectedDoc.title}</h2>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-wider rounded">
                                    User Guide
                                </span>
                                <span className="text-[10px] text-slate-500">v1.0.0</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 p-10 overflow-auto">
                        <article className="prose prose-invert prose-slate prose-headings:text-white prose-a:text-accent prose-pre:bg-slate-900/50 prose-pre:border prose-pre:border-white/10 prose-table:border prose-table:border-white/10 prose-th:bg-white/5 prose-th:p-2 prose-td:p-2 prose-td:border-t prose-td:border-white/10 max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedDoc.content || ''}</ReactMarkdown>
                        </article>
                    </div>
                </div>
            </div>
        );
    }

    // Grid View - Matching DocumentationPage style
    return (
        <div className="space-y-8">
            {/* Header */}
            <section>
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-accent" />
                    Documentation & Help
                </h3>
                <p className="text-slate-400 text-sm mb-6">
                    Access guides and documentation tailored to your role ({user?.role_display_name || 'User'}).
                </p>
            </section>

            {/* Empty State */}
            {docs.length === 0 ? (
                <div className="glass-card flex flex-col items-center justify-center py-16 text-slate-500">
                    <BookOpen className="h-12 w-12 mb-4 opacity-10" />
                    <h3 className="text-lg font-semibold text-white mb-2">No Documentation Available</h3>
                    <p className="text-sm">Documentation will be available in future updates.</p>
                </div>
            ) : (
                /* Documentation Cards Grid */
                <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {docs.map((doc) => (
                        <button
                            key={doc.id}
                            onClick={() => setSelectedDoc(doc)}
                            className="glass-card p-6 flex flex-col text-left group hover:border-accent/50 hover:bg-accent/5 transition-all duration-300"
                        >
                            {/* Icon */}
                            <div className="bg-white/5 p-3 rounded-xl w-fit mb-4 group-hover:bg-accent/20 transition-colors">
                                <FileText className="h-6 w-6 text-slate-400 group-hover:text-accent transition-colors" />
                            </div>

                            {/* Title */}
                            <h3 className="text-lg font-bold text-white mb-2 group-hover:text-accent transition-colors">
                                {doc.title}
                            </h3>

                            {/* Description/Preview */}
                            <p className="text-sm text-slate-500 mb-5 flex-1 line-clamp-3">
                                {doc.content.replace(/[#*`]/g, '').slice(0, 120)}...
                            </p>

                            {/* View Manual Link */}
                            <div className="flex items-center gap-2 text-accent text-sm font-semibold mt-auto">
                                View Manual
                                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                            </div>
                        </button>
                    ))}
                </section>
            )}

            {/* Quick Links */}
            <section className="bg-white/5 border border-white/10 rounded-xl p-4">
                <h4 className="font-semibold mb-3">Quick Links</h4>
                <div className="flex flex-wrap gap-2">
                    <a
                        href="mailto:support@riskhub.local"
                        className="px-3 py-1.5 bg-white/10 text-slate-300 text-sm rounded-lg hover:bg-white/20 transition-colors inline-flex items-center gap-1.5"
                    >
                        Contact Support
                        <ExternalLink className="h-3 w-3" />
                    </a>
                    <a
                        href="/activity-log"
                        className="px-3 py-1.5 bg-white/10 text-slate-300 text-sm rounded-lg hover:bg-white/20 transition-colors"
                    >
                        View Activity Log
                    </a>
                    <a
                        href="/notifications"
                        className="px-3 py-1.5 bg-white/10 text-slate-300 text-sm rounded-lg hover:bg-white/20 transition-colors"
                    >
                        Notifications
                    </a>
                </div>
            </section>

            {/* Version Info */}
            <section className="text-center">
                <p className="text-xs text-slate-500">
                    RiskHub v1.0 • Documentation will be expanded in future updates
                </p>
            </section>
        </div>
    );
}
